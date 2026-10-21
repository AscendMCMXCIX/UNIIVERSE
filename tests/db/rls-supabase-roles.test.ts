import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { createUser } from "@/server/repositories/users";
import { createSession } from "@/server/auth/sessions";
import { accessReport } from "@/server/jobs/access-audit";

/*
  Row Level Security against Supabase's own roles and default grants, recreated in a transaction
  that rolls back (plain Postgres has none of them):
  - anon and authenticated: the Data API's roles (NOINHERIT), granted ALL on every table and
    sequence in public, as Supabase's default privileges did until 30 October 2026 (migration
    0052 takes those grants back in production; this checks Row Level Security without it);
  - service_role: the server key's role (BYPASSRLS), created only when this connection may;
  - authenticator: the Data API's login (NOINHERIT), which can switch into the three above.
  It runs as whatever TEST_DATABASE_URL connects as: a superuser, or a non-superuser that owns the
  tables, like Supabase's postgres role (it then needs CREATEROLE).
*/

type Tx = DbHandle["db"];
type Row = Record<string, unknown>;
let handle: DbHandle;
const rowsOf = (result: unknown): Row[] => ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[];
const pgMessage = (err: unknown) => String((err as { cause?: { message?: string } }).cause?.message ?? (err as Error).message);

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

async function rowCounts(tx: Tx, tables: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of tables) counts[t] = Number(rowsOf(await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM public."${t}"`)))[0]!.n);
  return counts;
}

/** Supabase's roles and grants. Returns whether service_role could be given BYPASSRLS. */
async function supabaseRoles(tx: Tx): Promise<boolean> {
  const [me] = rowsOf(await tx.execute(sql`SELECT rolsuper OR rolbypassrls AS can_bypass, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`));
  const canBypass = !!me!.can_bypass;
  await tx.execute(
    sql.raw(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT${canBypass ? " BYPASSRLS" : ""}; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator NOLOGIN NOINHERIT; END IF;
    END $$`),
  );
  await tx.execute(sql.raw(`GRANT anon, authenticated, service_role TO authenticator`));
  // A non-superuser needs membership to SET ROLE; INHERIT FALSE keeps their privileges apart.
  if (!me!.superuser) await tx.execute(sql.raw(`GRANT anon, authenticated, service_role, authenticator TO CURRENT_USER WITH INHERIT FALSE, SET TRUE`));
  await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role`));
  await tx.execute(sql.raw(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role`));
  await tx.execute(sql.raw(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role`));
  return canBypass;
}

/** Runs `body` in a transaction that always rolls back (roles and grants included) and returns its result. */
async function rolledBack<T>(body: (tx: Tx) => Promise<T>): Promise<T> {
  return handle.db
    .transaction(async (tx) => {
      const value = await body(tx as unknown as Tx);
      throw Object.assign(new Error("rollback"), { value });
    })
    .catch((err: Error & { value?: T }) => {
      if (!("value" in err)) throw err;
      return err.value as T;
    });
}

beforeAll(async () => {
  handle = await testDb();
  // Private rows worth protecting: a player, an account with a password hash, a session.
  const team = await getOrCreateTeam(handle.db);
  const player = await createPlayer(handle.db, team.id, { displayName: "Private Player", primaryRole: "MID", primaryPool: [] });
  const user = await createUser(handle.db, { username: "rlsowner", password: "Password-123", role: "owner", playerId: player.id });
  await createSession(handle.db, user.id);
});
afterAll(async () => {
  await handle.close();
});

describe.runIf(!!process.env.TEST_DATABASE_URL)("row level security with Supabase's roles", () => {
  it("gives the Data API's roles no rows and no writes on any table, despite Supabase's default grants", async () => {
    const result = await rolledBack(async (tx) => {
      await supabaseRoles(tx);
      const tables = rowsOf(await tx.execute(sql`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1`)).map((r) => String(r.name));
      const sequences = Number(rowsOf(await tx.execute(sql`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S'`))[0]!.n);
      const own = await rowCounts(tx, tables);
      const report = await accessReport(tx);
      const policies = Number(rowsOf(await tx.execute(sql`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`))[0]!.n);
      const roles: Record<string, { visible: string[]; updated: number; deleted: number; insert: string | null}> = {};
      for (const role of ["anon", "authenticated"]) {
        await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
        const counts = await rowCounts(tx, tables);
        const updated = rowsOf(await tx.execute(sql`UPDATE players SET display_name = 'changed' RETURNING id`)).length;
        const deleted = rowsOf(await tx.execute(sql`DELETE FROM sessions RETURNING id`)).length;
        const insert = await attempt(tx, sql`INSERT INTO teams (name) VALUES ('Intruder')`);
        await tx.execute(sql`RESET ROLE`);
        roles[role] = { visible: Object.entries(counts).filter(([, n]) => n > 0).map(([t]) => t), updated, deleted, insert };
      }
      return { tables, sequences, own, report, policies, roles };
    });

    expect(result.tables.length).toBeGreaterThan(40);
    // The app sees its private rows...
    expect(result.own.players).toBeGreaterThan(0);
    expect(result.own.users).toBeGreaterThan(0);
    expect(result.own.sessions).toBeGreaterThan(0);
    expect(result.own.uniiverse_migrations).toBeGreaterThan(0);
    // ...the grants are Supabase's (every table) and there are no policies. The audit names only
    // the grants themselves, which UNIIVERSE never needs: no table is readable without RLS.
    expect((result.report.summary.dataApiAccess.anon as { tablesSelect: number }).tablesSelect).toBe(result.tables.length);
    expect(result.policies).toBe(0);
    expect(result.report.problems).toEqual(
      ["anon", "authenticated"].map((role) => `${role} holds privileges on ${result.tables.length} table(s) and ${result.sequences} sequence(s), which UNIIVERSE never needs`),
    );
    for (const role of ["anon", "authenticated"]) {
      expect(result.roles[role]!.visible, `${role} sees rows in`).toEqual([]);
      expect(result.roles[role]!.updated).toBe(0);
      expect(result.roles[role]!.deleted).toBe(0);
      expect(result.roles[role]!.insert).toMatch(/row-level security/);
    }
  });

  it("gives the Data API's login role nothing of its own, and only the server key's role gets round it", async () => {
    const result = await rolledBack(async (tx) => {
      const canBypass = await supabaseRoles(tx);
      await tx.execute(sql.raw(`SET LOCAL ROLE authenticator`));
      const authenticator = await attempt(tx, sql`SELECT count(*) FROM users`);
      await tx.execute(sql`RESET ROLE`);
      await tx.execute(sql.raw(`SET LOCAL ROLE service_role`));
      const serviceUsers = Number(rowsOf(await tx.execute(sql`SELECT count(*)::int AS n FROM users`))[0]!.n);
      await tx.execute(sql`RESET ROLE`);
      return { canBypass, authenticator, serviceUsers };
    });
    expect(result.authenticator).toMatch(/permission denied/);
    // service_role is BYPASSRLS by design: its key is a server secret UNIIVERSE never uses or ships.
    expect(result.serviceUsers).toBe(result.canBypass ? 1 : 0);
  });

  it("is undone per table by the rollback statement, and the audit then names the exposed table", async () => {
    const result = await rolledBack(async (tx) => {
      await supabaseRoles(tx);
      await tx.execute(sql`ALTER TABLE players DISABLE ROW LEVEL SECURITY`);
      await tx.execute(sql.raw(`SET LOCAL ROLE anon`));
      const exposed = Number(rowsOf(await tx.execute(sql`SELECT count(*)::int AS n FROM players`))[0]!.n);
      await tx.execute(sql`RESET ROLE`);
      const problems = (await accessReport(tx)).problems;
      await tx.execute(sql`ALTER TABLE players ENABLE ROW LEVEL SECURITY`);
      await tx.execute(sql.raw(`SET LOCAL ROLE anon`));
      const closed = Number(rowsOf(await tx.execute(sql`SELECT count(*)::int AS n FROM players`))[0]!.n);
      await tx.execute(sql`RESET ROLE`);
      return { exposed, problems, closed };
    });
    expect(result.exposed).toBeGreaterThan(0);
    expect(result.problems.join("\n")).toMatch(/anon can read 1 table\(s\) that have no Row Level Security/);
    expect(result.closed).toBe(0);
  });
});
