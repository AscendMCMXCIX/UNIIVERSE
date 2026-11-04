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

  it("reports everything the cleanup migrations dropped as gone, and still finds what depends on a retired name", async () => {
    type Retired = {
      tables: Array<{ name: string; gone: boolean }>;
      columns: Array<{ name: string; gone: boolean; rowsWithValue?: number | null }>;
      enums: Array<{ name: string; gone: boolean }>;
      opponentAccounts: number | null;
      dependents: { foreignKeys: Array<{ name: string; from: string; to: string }>; views: string[]; enumColumns: string[]; publications: string[] };
    };
    const read = async () => ((await runJob(handle.db, "db-usage", "cli")).summary as { retired: Retired }).retired;
    const retired = await read();
    expect(retired.tables).toHaveLength(28);
    // The Meta & Trends and Draft tables are gone. Clash Scout's saved scouts and what the retired
    // Ranked Development kept stay until their own drops (their keys point only at each other,
    // players and Riot accounts).
    const kept = ["clash_scouts", "clash_scout_accounts", "ranked_profiles", "ranked_blocks", "ranked_games", "development_objectives", "development_plans"];
    expect(retired.tables.filter((t) => !t.gone).map((t) => t.name).sort()).toEqual([...kept].sort());
    expect(retired.columns).toEqual([
      { name: "riot_accounts.opponent_player_id", gone: true },
      { name: "teams.engine_config", gone: true },
    ]);
    expect(retired.enums.filter((e) => !e.gone)).toEqual([]);
    expect(retired.opponentAccounts).toBe(0);
    expect(retired.dependents).toEqual({ foreignKeys: [], views: [], enumColumns: [], publications: [] });

    // One brought back (a table restored from the backup, say) is reported again, with anything
    // built on it: a view on the table, another table's column of a retired type.
    await handle.db.execute(sql`CREATE TABLE drafts (id uuid PRIMARY KEY)`);
    await handle.db.execute(sql`CREATE VIEW retired_check_view AS SELECT id FROM drafts`);
    await handle.db.execute(sql`CREATE TYPE competition_mode AS ENUM ('restored')`);
    await handle.db.execute(sql`CREATE TABLE retired_check_table (mode competition_mode)`);
    try {
      const again = await read();
      expect(again.tables.filter((t) => !t.gone && !kept.includes(t.name)).map((t) => t.name)).toEqual(["drafts"]);
      expect(again.dependents.views).toEqual(["retired_check_view"]);
      expect(again.dependents.enumColumns).toEqual(["retired_check_table.mode"]);
    } finally {
      await handle.db.execute(sql`DROP VIEW retired_check_view`);
      await handle.db.execute(sql`DROP TABLE retired_check_table`);
      await handle.db.execute(sql`DROP TABLE drafts`);
      await handle.db.execute(sql`DROP TYPE competition_mode`);
    }
  });
});
