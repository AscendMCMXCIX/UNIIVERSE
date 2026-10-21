/**
 * The explicit-grants convention for migrations (docs/DATABASE_PERMISSIONS.md), checked from the
 * SQL alone. Until 30 October 2026 Supabase gave its Data API roles every privilege on each new
 * table in public; from then on it gives them none. A migration therefore says itself, next to each
 * table it creates, what every role gets, so the result is the same whatever the environment's
 * defaults: Row Level Security on, nothing for anon and authenticated, SELECT for the read-only
 * backup role. tests/db/data-api-grants.test.ts checks the outcome on PostgreSQL by replaying every
 * migration; this names the migration and the object, without a database.
 */

/** The first migration the convention applies to. Earlier ones are history: 0052 closes them all. */
export const EXPLICIT_GRANTS_FROM = 52;

/** The read-only role the weekly backup signs in as (docs/BACKUPS.md). */
const BACKUP_ROLE = "uniiverse_backup";
/** Supabase's Data API roles, reachable with the project's public keys. UNIIVERSE grants them nothing. */
const DATA_API_ROLES = ["anon", "authenticated"] as const;

type Kind = "table" | "sequence";
const NAME = "[a-z_][a-z0-9_]*";

/** Lower case, comments and double quotes removed and white space collapsed, so the patterns stay simple. */
function normalise(statement: string): string {
  return statement
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/"/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** An object list (`public.a, b`) that includes `name`, schema-qualified or not. */
const listWith = (name: string) => `(?:${NAME}(?:\\.${NAME})?, ?)*(?:public\\.)?${name}(?:, ?${NAME}(?:\\.${NAME})?)*`;
/** GRANT and REVOKE take TABLE optionally and SEQUENCE always. */
const on = (kind: Kind) => (kind === "table" ? "(?:table )?" : "sequence ");

const revokesAll = (sql: string, kind: Kind, name: string, role: string) => new RegExp(`\\brevoke all(?: privileges)? on ${on(kind)}${listWith(name)} from [^;]*\\b${role}\\b`).test(sql);
const grantsBackupSelect = (sql: string, kind: Kind, name: string) => new RegExp(`\\bgrant select on ${on(kind)}${listWith(name)} to [^;]*\\b${BACKUP_ROLE}\\b`).test(sql);

const SERIAL = "(?:small|big)?serial\\b";
const IDENTITY = `[a-z0-9_ ]*?generated (?:always|by default) as identity(?: ?\\(sequence name (?:public\\.)?(${NAME}))?`;

/** The sequences a CREATE TABLE statement makes for its serial and identity columns. */
function sequencesOf(table: string, createStatement: string): string[] {
  const body = createStatement.slice(createStatement.indexOf("(") + 1);
  const found: string[] = [];
  for (const m of body.matchAll(new RegExp(`(?:^|[(,]) ?(${NAME}) ${SERIAL}`, "g"))) found.push(`${table}_${m[1]}_seq`);
  for (const m of body.matchAll(new RegExp(`(?:^|[(,]) ?(${NAME}) ${IDENTITY}`, "g"))) found.push(m[2] ?? `${table}_${m[1]}_seq`);
  return found;
}

/**
 * What a migration leaves unsaid or gets wrong, one line each; empty when it follows the
 * convention. `statements` is the migration's SQL: its statements, or the whole file.
 */
export function migrationGrantProblems(statements: string | readonly string[]): string[] {
  const parts = (typeof statements === "string" ? [statements] : [...statements]).map(normalise);
  const sql = parts.join(" ; ");
  const problems: string[] = [];

  // Tables it creates, and sequences it creates for serial or identity columns (on new tables or
  // on columns added to existing ones).
  const objects: Array<{ kind: Kind; name: string }> = [];
  for (const part of parts) {
    for (const m of part.matchAll(new RegExp(`\\bcreate (?:unlogged )?table (?:if not exists )?(?:public\\.)?(${NAME}) ?\\(`, "g"))) {
      const table = m[1]!;
      if (!new RegExp(`\\balter table (?:if exists )?(?:only )?(?:public\\.)?${table} enable row level security\\b`).test(sql)) {
        problems.push(`table ${table}: Row Level Security is not turned on (ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY)`);
      }
      objects.push({ kind: "table", name: table }, ...sequencesOf(table, part.slice(m.index)).map((name) => ({ kind: "sequence" as const, name })));
    }
  }
  for (const m of sql.matchAll(new RegExp(`\\balter table (?:if exists )?(?:only )?(?:public\\.)?(${NAME}) add (?:column )?(?:if not exists )?(${NAME}) (?:${SERIAL}|${IDENTITY})`, "g"))) {
    objects.push({ kind: "sequence", name: m[3] ?? `${m[1]}_${m[2]}_seq` });
  }
  for (const o of objects) {
    for (const role of DATA_API_ROLES) {
      if (!revokesAll(sql, o.kind, o.name, role)) problems.push(`${o.kind} ${o.name}: no REVOKE ALL ON ${o.kind.toUpperCase()} public.${o.name} FROM ${role}, so what ${role} gets depends on the project's default privileges`);
    }
    if (!grantsBackupSelect(sql, o.kind, o.name)) problems.push(`${o.kind} ${o.name}: no GRANT SELECT ON ${o.kind.toUpperCase()} public.${o.name} TO ${BACKUP_ROLE}, so a backup would fail where no default privileges cover it`);
  }

  // Views and materialized views: closed to the Data API too, and a view runs as its caller.
  for (const m of sql.matchAll(new RegExp(`\\bcreate (?:or replace )?(?:temp |temporary )?(?:recursive )?(materialized )?view (?:if not exists )?(?:public\\.)?(${NAME})\\b([^;]*)`, "g"))) {
    const [, materialized, name, rest] = m;
    const what = materialized ? "materialized view" : "view";
    if (!materialized && !/\bwith ?\([^)]*\bsecurity_invoker(?: ?= ?'?(?:true|on|1|yes)'?)? ?[,)]/.test(rest!)) problems.push(`view ${name}: not WITH (security_invoker = true), so it would read as its owner, round Row Level Security`);
    for (const role of DATA_API_ROLES) {
      if (!revokesAll(sql, "table", name!, role)) problems.push(`${what} ${name}: no REVOKE ALL ON TABLE public.${name} FROM ${role}`);
    }
  }

  // Functions in public: Postgres lets PUBLIC execute a new function, and Supabase's old defaults
  // let the Data API roles too. A trigger function cannot be called on its own.
  for (const m of sql.matchAll(new RegExp(`\\bcreate (?:or replace )?(function|procedure) (?:public\\.)?(${NAME}) ?\\(([^;]*)`, "g"))) {
    const [, kind, name, rest] = m;
    if (/\breturns trigger\b/.test(rest!)) continue;
    for (const role of ["public", ...DATA_API_ROLES]) {
      if (!new RegExp(`\\brevoke all(?: privileges)? on (?:function|procedure|routine) (?:public\\.)?${name} ?\\([^)]*\\) from [^;]*\\b${role}\\b`).test(sql)) {
        problems.push(`${kind} ${name}: no REVOKE ALL ON ${kind!.toUpperCase()} public.${name}(…) FROM ${role === "public" ? "PUBLIC" : role}`);
      }
    }
  }

  // Never: anything for the Data API roles or PUBLIC, more than SELECT for the backup role,
  // schema-wide grants, default privileges, policies, SECURITY DEFINER, or Row Level Security off.
  for (const m of sql.matchAll(/\bgrant ([^;]*?) to ([^;]*)/g)) {
    for (const role of ["anon", "authenticated", "service_role", "public"]) {
      if (new RegExp(`\\b${role}\\b`).test(m[2]!)) problems.push(`grants to ${role === "public" ? "PUBLIC" : role}: the Data API's roles and PUBLIC get nothing`);
    }
    if (new RegExp(`\\b${BACKUP_ROLE}\\b`).test(m[2]!) && !/^select on (?:table |sequence )?/.test(m[1]!)) problems.push(`grants ${BACKUP_ROLE} more than SELECT on a table or sequence: it is read-only`);
  }
  if (/\bon all (?:tables|sequences|functions|routines|procedures) in schema\b/.test(sql)) problems.push("a schema-wide grant or revoke (ON ALL … IN SCHEMA): name each object instead");
  if (/\balter default privileges\b/.test(sql)) problems.push("changes default privileges: say what each new object gets in its own migration instead");
  if (/\bdisable row level security\b/.test(sql)) problems.push("turns Row Level Security off");
  if (/\bcreate policy\b/.test(sql)) problems.push("creates a policy: UNIIVERSE has none, since only the app's own database user reads its tables");
  if (/\bsecurity definer\b/.test(sql)) problems.push("a SECURITY DEFINER function: it would run as its owner, round Row Level Security");
  return [...new Set(problems)];
}
