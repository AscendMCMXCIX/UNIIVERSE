import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { runJob } from "@/server/jobs";

/* The database usage report lists table sizes and query statistics, holds no data values and changes nothing. */

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  const team = await getOrCreateTeam(handle.db);
  await createPlayer(handle.db, team.id, { displayName: "Secret Name", primaryRole: "TOP", primaryPool: [] });
});
afterAll(async () => {
  await handle.close();
});

describe("db-usage", () => {
  it("reports the tables by size, works without pg_stat_statements, and contains no stored values", async () => {
    const result = await runJob(handle.db, "db-usage", "cli");
    expect(result.ok).toBe(true);
    const summary = result.summary as { databaseMb: number | null; tables: Array<{ name: string; liveRows: number | null; totalMb: number }>; statements: { available: boolean } };
    expect(summary.tables.length).toBeGreaterThan(5);
    expect(summary.tables.map((t) => t.name)).toContain("players");
    for (let i = 1; i < summary.tables.length; i++) expect(summary.tables[i - 1]!.totalMb).toBeGreaterThanOrEqual(summary.tables[i]!.totalMb);
    expect(typeof summary.statements.available).toBe("boolean");
    expect(JSON.stringify(summary)).not.toContain("Secret Name");
  });

  it("lists what the held cleanup migrations drop, and finds anything outside them that depends on them", async () => {
    type Retired = {
      tables: Array<{ name: string; gone: boolean }>;
      columns: Array<{ name: string; gone: boolean; rowsWithValue?: number | null }>;
      enums: Array<{ name: string; gone: boolean }>;
      opponentAccounts: number | null;
      dependents: { foreignKeys: Array<{ name: string; from: string; to: string }>; views: string[]; enumColumns: string[]; publications: string[] };
    };
    const read = async () => ((await runJob(handle.db, "db-usage", "cli")).summary as { retired: Retired }).retired;
    const retired = await read();
    expect(retired.tables).toHaveLength(21);
    expect(retired.tables.filter((t) => t.gone)).toEqual([]);
    expect(retired.columns).toEqual([
      { name: "riot_accounts.opponent_player_id", gone: false, rowsWithValue: 0 },
      { name: "teams.engine_config", gone: false, rowsWithValue: 0 },
    ]);
    expect(retired.enums.filter((e) => e.gone)).toEqual([]);
    expect(retired.opponentAccounts).toBe(0);
    // Only the foreign key that goes with its own column.
    expect(retired.dependents).toEqual({ foreignKeys: [{ name: "riot_accounts_opponent_player_id_opponent_players_id_fk", from: "riot_accounts", to: "opponent_players" }], views: [], enumColumns: [], publications: [] });

    // Anything else is found: a view on a retired table, a kept table's column of a retired type.
    await handle.db.execute(sql`CREATE VIEW retired_check_view AS SELECT id FROM drafts`);
    await handle.db.execute(sql`CREATE TABLE retired_check_table (mode competition_mode)`);
    try {
      const found = (await read()).dependents;
      expect(found.views).toEqual(["retired_check_view"]);
      expect(found.enumColumns).toEqual(["retired_check_table.mode"]);
    } finally {
      await handle.db.execute(sql`DROP VIEW retired_check_view`);
      await handle.db.execute(sql`DROP TABLE retired_check_table`);
    }
  });
});
