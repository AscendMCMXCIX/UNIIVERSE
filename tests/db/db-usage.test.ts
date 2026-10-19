import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
});
