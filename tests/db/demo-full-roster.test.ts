import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { applyFullRosterFixture, seedDemoAccounts, seedDemoRoster } from "@/server/demo/seed";
import { getOrCreateTeam } from "@/server/repositories/team";
import { invalidateLeaderboardCache, loadLeaderboardData } from "@/server/leaderboards/service";
import { buildLeaderboardsView, parseLeaderboardsQuery, recordsSeason } from "@/server/leaderboards/recent-view";
import { loadMultikillBaseline } from "@/server/leaderboards/multikill-baseline";

/*
  The full-roster demo (UNIIVERSE_DEMO_FULL_ROSTER=1, Release 19; src/server/demo/seed.ts,
  applyFullRosterFixture): the two members still in setup get a demo account and a season of games,
  and the substitutes' games all carry multikill counts, so Leaderboards ranks nine on both boards
  (e2e/leaderboards-full-roster.spec.ts holds the one screen with them). The default demo is unchanged:
  seven active players, five on the multikill board.
*/

async function demo(full: boolean): Promise<DbHandle> {
  const was = process.env.UNIIVERSE_DEMO_FULL_ROSTER;
  if (full) process.env.UNIIVERSE_DEMO_FULL_ROSTER = "1";
  else delete process.env.UNIIVERSE_DEMO_FULL_ROSTER;
  try {
    const handle = await testDb();
    await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
    await seedDemoRoster(handle.db);
    await seedDemoAccounts(handle.db);
    if (full) await applyFullRosterFixture(handle.db);
    return handle;
  } finally {
    if (was === undefined) delete process.env.UNIIVERSE_DEMO_FULL_ROSTER;
    else process.env.UNIIVERSE_DEMO_FULL_ROSTER = was;
  }
}

describe("the full-roster demo", () => {
  let base: DbHandle;
  let full: DbHandle;
  beforeAll(async () => {
    base = await demo(false);
    full = await demo(true);
  }, 240_000);
  afterAll(async () => {
    await base?.close();
    await full?.close();
  });

  it("ranks nine active players on Recent form and on the multikill board; the default demo keeps seven and five", async () => {
    for (const [handle, players, form, multikills] of [
      [base, 7, 7, 5],
      [full, 9, 9, 9],
    ] as const) {
      invalidateLeaderboardCache();
      const team = await getOrCreateTeam(handle.db);
      // As the page builds it (src/app/(app)/leaderboards/page.tsx).
      const data = await loadLeaderboardData(handle.db, team.id);
      const query = parseLeaderboardsQuery({});
      const multikillBaseline = await loadMultikillBaseline(handle.db, team.id, data, recordsSeason(data, query));
      const view = buildLeaderboardsView(data, query, null, { multikillBaseline });
      expect(view.playerCount).toBe(players);
      expect(view.form.rows).toHaveLength(form);
      expect(view.records.multikills.rows).toHaveLength(multikills);
    }
  });

  it("is idempotent: run again, it adds no account and no game", async () => {
    expect(await applyFullRosterFixture(full.db)).toEqual({ created: 0 });
  });
});
