import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { players } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { runJob } from "@/server/jobs";

/*
  Row Level Security (migration 0044): every application table has it on, with no policies. The
  app (the tables' owner) keeps full access; any other role, such as Supabase's Data API "anon"
  role, sees no rows even when granted SELECT.
*/

let handle: DbHandle;
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

describe("row level security", () => {
  it("is on for every table in the public schema, including the migration ledger", async () => {
    const tables = rowsOf<{ relname: string; on: boolean }>(
      await handle.db.execute(sql`SELECT c.relname, c.relrowsecurity AS on FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname`),
    );
    expect(tables.length).toBeGreaterThan(40);
    expect(tables.filter((t) => !t.on).map((t) => t.relname)).toEqual([]);
    expect(tables.map((t) => t.relname)).toContain("uniiverse_migrations");
  });

  it("leaves the app's own access untouched", async () => {
    const team = await getOrCreateTeam(handle.db);
    const p = await createPlayer(handle.db, team.id, { displayName: "RLS Check", primaryRole: "MID", primaryPool: [] });
    const [row] = await handle.db.select({ id: players.id, name: players.displayName }).from(players).where(sql`${players.id} = ${p.id}`);
    expect(row).toEqual({ id: p.id, name: "RLS Check" });
  });

  it.runIf(!!process.env.TEST_DATABASE_URL)("shows another role (like Supabase's anon) no rows, even with SELECT granted", async () => {
    const role = `rls_probe_${Math.random().toString(36).slice(2, 10)}`;
    const seen = await handle.db.transaction(async (tx) => {
      await tx.execute(sql.raw(`CREATE ROLE ${role} NOLOGIN`));
      // Lets a non-superuser owner (like Supabase's postgres role) switch to it, without inheriting it.
      await tx.execute(sql.raw(`GRANT ${role} TO CURRENT_USER WITH INHERIT FALSE, SET TRUE`));
      await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}`));
      await tx.execute(sql.raw(`GRANT SELECT, UPDATE ON players, users, sessions TO ${role}`));
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
      const counts = rowsOf<{ players: string; users: string; sessions: string }>(await tx.execute(sql`SELECT (SELECT count(*) FROM players) AS players, (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM sessions) AS sessions`))[0]!;
      const updated = rowsOf<{ id: string }>(await tx.execute(sql`UPDATE players SET display_name = 'changed' RETURNING id`));
      await tx.execute(sql`RESET ROLE`);
      // Undo the probe role and grants: the whole transaction rolls back.
      throw Object.assign(new Error("rollback"), { result: { counts, updated: updated.length } });
    }).catch((err: Error & { result?: { counts: Record<string, string>; updated: number } }) => {
      if (!err.result) throw err;
      return err.result;
    });
    expect(Number(seen.counts.players)).toBe(0);
    expect(Number(seen.counts.users)).toBe(0);
    expect(Number(seen.counts.sessions)).toBe(0);
    expect(seen.updated).toBe(0);
    // The app still sees its rows.
    const own = rowsOf<{ n: string }>(await handle.db.execute(sql`SELECT count(*) AS n FROM players`))[0]!;
    expect(Number(own.n)).toBeGreaterThan(0);
  });

  it("is checked by the read-only account audit, which names any table left without it", async () => {
    const clean = await runJob(handle.db, "auth-audit", "cli");
    expect((clean.summary as { tablesWithoutRowLevelSecurity: string[] }).tablesWithoutRowLevelSecurity).toEqual([]);
    await handle.db.execute(sql`CREATE TABLE rls_audit_probe (id int)`);
    try {
      const found = await runJob(handle.db, "auth-audit", "cli");
      expect((found.summary as { tablesWithoutRowLevelSecurity: string[] }).tablesWithoutRowLevelSecurity).toEqual(["rls_audit_probe"]);
      expect(found.error).toContain("1 table(s) without Row Level Security");
    } finally {
      await handle.db.execute(sql`DROP TABLE rls_audit_probe`);
    }
  });
});
