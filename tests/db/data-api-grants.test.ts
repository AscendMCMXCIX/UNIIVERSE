import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { createDb, type DbHandle } from "@/server/db/create";
import { runMigrations } from "@/server/db/migrator";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { createUser, getUser } from "@/server/repositories/users";
import { createSession, findSession } from "@/server/auth/sessions";
import { accessReport } from "@/server/jobs/access-audit";

/*
  SUPABASE'S DATA API GRANTS (30 October 2026). From that date a table created in public gets no
  privileges for anon, authenticated or service_role, in existing projects, new projects and
  recreated schemas alike. UNIIVERSE needs none of them (docs/DATABASE_PERMISSIONS.md); only the
  read-only backup role (docs/BACKUPS.md) must read every table.

  Each test replays every migration on an empty database where Supabase's roles and the backup
  role exist, as a non-superuser that owns what it creates (as Supabase's postgres does), all in a
  transaction that rolls back:
  - after 30 October: no default privileges at all, so nothing is granted unless a migration says
    so. The app still works, the Data API roles get nothing, and the backup role reads every table
    and sequence from the migrations' own explicit grants;
  - before 30 October: Supabase's old defaults (everything to the three API roles, and the backup
    role's own defaults). The migrations still leave anon and authenticated with nothing;
  - a future table on top of both: with the documented template it is closed and backed up either
    way; without it, what it gets depends on the defaults, and the audit says what is wrong.
*/

type Tx = DbHandle["db"];
type Row = Record<string, unknown>;

/** The app's database user in these tests: no superuser, owner of everything it creates. */
const OWNER = "uniiverse_grants_test_owner";
const API_ROLES = ["anon", "authenticated", "service_role"] as const;
const BACKUP = "uniiverse_backup";

const rowsOf = (result: unknown): Row[] => ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[];
const pgMessage = (err: unknown) => String((err as { cause?: { message?: string } }).cause?.message ?? (err as Error).message);

/** A later migration adding a table with a serial id, as drizzle-kit writes it, with the documented template. */
function templateMigration(): string {
  const doc = readFileSync(path.join(__dirname, "../../docs/DATABASE_PERMISSIONS.md"), "utf8");
  const block = /<!-- template: new table -->\s*```sql\n([\s\S]*?)```/.exec(doc)?.[1];
  if (!block) throw new Error("docs/DATABASE_PERMISSIONS.md has lost its new-table template");
  return `CREATE TABLE "example_items" (\n\t"id" serial PRIMARY KEY NOT NULL,\n\t"name" text NOT NULL\n);\n--> statement-breakpoint\n${block}`;
}

let adminUrl: string | undefined;
let admin: { unsafe: (q: string) => Promise<unknown>; end: (o?: { timeout?: number }) => Promise<void> } | null = null;
let handle: DbHandle | null = null;
let name = "";

/** Runs a statement in a savepoint: null when it succeeds, else Postgres's error message. */
async function attempt(tx: Tx, statement: SQL): Promise<string | null> {
  try {
    await tx.transaction(async (sp) => {
      await sp.execute(statement);
    });
    return null;
  } catch (err) {
    return pgMessage(err);
  }
}

/** Runs `body` in a transaction that always rolls back (roles, grants and tables included). */
async function rolledBack<T>(body: (tx: Tx) => Promise<T>): Promise<T> {
  return handle!.db
    .transaction(async (tx) => {
      const value = await body(tx as unknown as Tx);
      throw Object.assign(new Error("rollback"), { value });
    })
    .catch((err: Error & { value?: T }) => {
      if (!("value" in err)) throw err;
      return err.value as T;
    });
}

/**
 * Every migration replayed on the empty database (then `later`, as migrations still to come), and
 * what each role may do with what they made.
 */
async function replay(defaults: "none" | "supabase-before-30-october", later: string[] = []) {
  return rolledBack(async (tx) => {
    const [me] = rowsOf(await tx.execute(sql`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`));
    if (!me?.rolsuper) throw new Error("TEST_DATABASE_URL must connect as a superuser: this test creates Supabase's roles.");
    await tx.execute(
      sql.raw(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${BACKUP}') THEN CREATE ROLE ${BACKUP} NOLOGIN BYPASSRLS; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${OWNER}') THEN CREATE ROLE ${OWNER} NOLOGIN NOSUPERUSER; END IF;
      END $$`),
    );
    // As docs/BACKUPS.md sets it up (minus its default privileges: those come below, or not at all).
    await tx.execute(sql.raw(`ALTER ROLE ${BACKUP} BYPASSRLS`));
    await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, ${BACKUP}`));
    await tx.execute(sql.raw(`GRANT USAGE, CREATE ON SCHEMA public TO ${OWNER}`));
    if (defaults === "supabase-before-30-october") {
      for (const kind of ["TABLES", "SEQUENCES", "FUNCTIONS"]) await tx.execute(sql.raw(`ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER} IN SCHEMA public GRANT ALL ON ${kind} TO anon, authenticated, service_role`));
      for (const kind of ["TABLES", "SEQUENCES"]) await tx.execute(sql.raw(`ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER} IN SCHEMA public GRANT SELECT ON ${kind} TO ${BACKUP}`));
    }

    // The deployment: every migration, as the app's database user.
    await tx.execute(sql.raw(`SET LOCAL ROLE ${OWNER}`));
    const { applied } = await runMigrations(tx, { useAdvisoryLock: false });
    for (const migration of later) for (const statement of migration.split("--> statement-breakpoint")) await tx.execute(sql.raw(statement));
    // The app at work: an account with a profile, signing in, and reading itself back.
    const team = await getOrCreateTeam(tx);
    const player = await createPlayer(tx, team.id, { displayName: "Grants Player", primaryRole: "MID", primaryPool: [] });
    const user = await createUser(tx, { username: "grantsplayer", password: "Password-123", role: "player", playerId: player.id });
    const session = await createSession(tx, user.id);
    const signedIn = (await findSession(tx, session.token))?.userId === user.id && (await getUser(tx, user.id))?.playerId === player.id;
    const report = await accessReport(tx);
    await tx.execute(sql`RESET ROLE`);

    const objects = rowsOf(
      await tx.execute(sql`
        SELECT c.relname AS name, c.relkind AS kind, c.relrowsecurity AS rls, pg_get_userbyid(c.relowner) AS owner,
          ${sql.join(
            API_ROLES.map((r) => sql`CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(${r}, c.oid, 'USAGE,SELECT,UPDATE') ELSE has_table_privilege(${r}, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END AS ${sql.raw(`"${r}"`)}`),
            sql`, `,
          )},
          CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(${BACKUP}, c.oid, 'SELECT') ELSE has_table_privilege(${BACKUP}, c.oid, 'SELECT') END AS backup_reads,
          CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(${BACKUP}, c.oid, 'USAGE,UPDATE') ELSE has_table_privilege(${BACKUP}, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END AS backup_writes
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S') ORDER BY c.relname`),
    );
    // The Data API's way in: denied outright, not merely empty.
    const asRole: Record<string, string | null> = {};
    for (const role of ["anon", "authenticated"]) {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
      asRole[role] = await attempt(tx, sql`SELECT count(*) FROM users`);
      await tx.execute(sql`RESET ROLE`);
    }
    await tx.execute(sql.raw(`SET LOCAL ROLE ${BACKUP}`));
    const backupUsers = Number(rowsOf(await tx.execute(sql`SELECT count(*)::int AS n FROM users`))[0]!.n);
    const backupWrite = await attempt(tx, sql`UPDATE users SET display_name = display_name`);
    await tx.execute(sql`RESET ROLE`);
    return { applied, signedIn, report, objects, asRole, backupUsers, backupWrite };
  });
}

beforeAll(async () => {
  adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) return;
  const { default: postgres } = await import("postgres");
  name = `uniiverse_grants_${randomBytes(6).toString("hex")}`;
  admin = postgres(adminUrl, { max: 1, prepare: false, ssl: adminUrl.includes("localhost") || adminUrl.includes("127.0.0.1") ? false : "require", onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  // Empty: the tests replay the migrations themselves.
  handle = await createDb({ mode: "postgres", databaseUrl: url.toString(), migrate: false });
});
afterAll(async () => {
  await handle?.close();
  if (admin) {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }
});

describe.runIf(!!process.env.TEST_DATABASE_URL)("Supabase's Data API grants", () => {
  it("after 30 October (no automatic grants): every migration runs, the app works, the API roles get nothing and the backup role reads everything", async () => {
    const r = await replay("none");
    expect(r.applied).toEqual(EMBEDDED_MIGRATIONS.map((m) => m.tag));
    expect(r.signedIn).toBe(true);
    const tables = r.objects.filter((o) => o.kind !== "S");
    expect(tables.length).toBeGreaterThan(40);
    expect(r.objects.filter((o) => o.owner !== OWNER).map((o) => o.name)).toEqual([]);
    expect(tables.filter((o) => !o.rls).map((o) => o.name), "tables without Row Level Security").toEqual([]);
    for (const role of API_ROLES) expect(r.objects.filter((o) => o[role]).map((o) => o.name), `${role} holds privileges on`).toEqual([]);
    expect(r.objects.filter((o) => !o.backup_reads).map((o) => o.name), "the backup role cannot read").toEqual([]);
    expect(r.objects.filter((o) => o.backup_writes).map((o) => o.name), "the backup role could change").toEqual([]);
    expect(r.asRole.anon).toMatch(/permission denied/);
    expect(r.asRole.authenticated).toMatch(/permission denied/);
    expect(r.backupUsers).toBe(1);
    expect(r.backupWrite).toMatch(/permission denied/);
    // The production audit agrees, and says new tables get nothing automatically.
    expect(r.report.problems).toEqual([]);
    expect(r.report.summary.newTablesGrantedTo).toEqual([]);
    expect(r.report.summary.backupRole).toEqual({ unreadable: [] });
  });

  it("before 30 October (Supabase's old automatic grants): anon and authenticated still end with nothing", async () => {
    const r = await replay("supabase-before-30-october");
    expect(r.signedIn).toBe(true);
    for (const role of ["anon", "authenticated"] as const) expect(r.objects.filter((o) => o[role]).map((o) => o.name), `${role} holds privileges on`).toEqual([]);
    expect(r.objects.filter((o) => !o.backup_reads).map((o) => o.name)).toEqual([]);
    expect(r.asRole.anon).toMatch(/permission denied/);
    expect(r.report.problems).toEqual([]);
    // The audit shows what the old defaults still hand to a new table.
    expect(r.report.summary.newTablesGrantedTo).toEqual(["anon", "authenticated", "service_role"]);
  });

  it("a future table: the documented template closes it and backs it up under both; without it, the audit names what is wrong", async () => {
    const bare = `CREATE TABLE "bare_items" ("id" serial PRIMARY KEY NOT NULL);--> statement-breakpoint\nALTER TABLE "bare_items" ENABLE ROW LEVEL SECURITY;`;
    for (const defaults of ["none", "supabase-before-30-october"] as const) {
      const r = await replay(defaults, [templateMigration(), bare]);
      const of = (name: string) => r.objects.find((o) => o.name === name)!;
      for (const name of ["example_items", "example_items_id_seq"]) {
        for (const role of API_ROLES.filter((x) => x !== "service_role")) expect(of(name)[role], `${defaults}: ${role} on ${name}`).toBe(false);
        expect(of(name).backup_reads, `${defaults}: the backup role reads ${name}`).toBe(true);
        expect(of(name).backup_writes).toBe(false);
      }
      expect(of("example_items").rls).toBe(true);
      if (defaults === "none") {
        // Nothing automatic: closed, but missing from every backup.
        expect(of("bare_items").anon).toBe(false);
        expect(of("bare_items").backup_reads).toBe(false);
        expect(r.report.problems).toEqual(["the backup role cannot read 2 table(s) or sequence(s), so a backup would fail: bare_items, bare_items_id_seq"]);
      } else {
        // The old defaults: backed up, but granted to the Data API's roles.
        expect(of("bare_items").anon).toBe(true);
        expect(of("bare_items").backup_reads).toBe(true);
        expect(r.report.problems).toEqual(["anon", "authenticated"].map((role) => `${role} holds privileges on 1 table(s) and 1 sequence(s), which UNIIVERSE never needs`));
      }
    }
  });
});
