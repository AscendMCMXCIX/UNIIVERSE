import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { runJob } from "@/server/jobs";
import { lastKnownRanks, matchDetails } from "@/server/db/schema";

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
    expect(retired.tables).toHaveLength(34);
    // 12 Meta & Trends tables, the Draft's and Clash Scout's are gone (0062, 0063, 0064). The rest of
    // Meta & Trends (and the period tables' enum type) and what the retired Ranked Development kept
    // stay until their own drop: their keys point only at each other, players and Riot accounts.
    const kept = ["ranked_profiles", "ranked_blocks", "ranked_games", "development_objectives", "development_plans", "tracked_summoners", "region_status", "stat_periods", "stat_region_periods", "stat_rank_periods", "champion_change_points"];
    expect(retired.tables.filter((t) => !t.gone).map((t) => t.name).sort()).toEqual([...kept].sort());
    expect(retired.columns).toEqual([
      { name: "riot_accounts.opponent_player_id", gone: true },
      { name: "teams.engine_config", gone: true },
    ]);
    expect(retired.enums.filter((e) => !e.gone)).toEqual([{ name: "stat_source", gone: false }]);
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

  it("counts the last known ranks by source, and those of players no stored game names (counts only)", async () => {
    const part = (puuid: string) => ({ puuid, riotId: "Hidden Name#TAG" }) as never;
    await handle.db.insert(matchDetails).values({ matchId: "OC1_LKR", gameCreation: Date.now(), gameDuration: 1800, teams: [], participants: [part("in-game-lookup"), part("in-game-ladder")] });
    const at = new Date();
    await handle.db.insert(lastKnownRanks).values([
      { puuid: "in-game-lookup", tier: "GOLD", division: "II", leaguePoints: 40, observedAt: at, source: "match lookup" },
      { puuid: "in-game-ladder", tier: "MASTER", observedAt: at, source: "ranked ladder" },
      { puuid: "ladder-only", tier: "DIAMOND", observedAt: at, source: "ranked ladder" },
      { puuid: "scouted-only", tier: "SILVER", observedAt: at, source: "draft scouting" },
    ]);
    const summary = (await runJob(handle.db, "db-usage", "cli")).summary as { retired: { lastKnownRanks: Array<{ source: string; rows: number; notInAStoredGame: number }> } };
    expect(summary.retired.lastKnownRanks).toEqual([
      { source: "draft scouting", rows: 1, notInAStoredGame: 1 },
      { source: "match lookup", rows: 1, notInAStoredGame: 0 },
      { source: "ranked ladder", rows: 2, notInAStoredGame: 1 },
    ]);
    // Counts only: no PUUID or name leaves the database.
    const text = JSON.stringify(summary);
    for (const value of ["in-game-lookup", "ladder-only", "scouted-only", "Hidden Name"]) expect(text).not.toContain(value);
  });
});
