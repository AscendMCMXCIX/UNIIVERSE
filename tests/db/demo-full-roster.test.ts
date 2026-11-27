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
import { demoFullRoster } from "@/server/bootstrap";

/*
  The full-roster demo (UNIIVERSE_DEMO_FULL_ROSTER=1 on the in-memory demo, Release 19; src/server/demo/seed.ts,
  applyFullRosterFixture, and bootstrap's demoFullRoster): the two members still in setup get a demo account and
  a season of games, and the substitutes' games all carry multikill counts, so Leaderboards ranks nine on both
  boards (e2e/leaderboards-full-roster.spec.ts holds the one screen with them). The default demo is unchanged:
  seven active players, five on the multikill board. Both halves are decided once, by bootstrap, for the
  in-memory demo alone: the flag in the environment never reaches the seed (a file or Postgres demo seeded with
  it kept half a full roster after it was removed: the review of Release 19).
*/

/** A demo as bootstrap seeds it, with the flag set in the environment (`flag`) and the full roster passed in (`full`). */
async function demo(full: boolean, flag = full): Promise<DbHandle> {
  const was = process.env.UNIIVERSE_DEMO_FULL_ROSTER;
  if (flag) process.env.UNIIVERSE_DEMO_FULL_ROSTER = "1";
  else delete process.env.UNIIVERSE_DEMO_FULL_ROSTER;
  try {
    const handle = await testDb();
    await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
    await seedDemoRoster(handle.db);
    await seedDemoAccounts(handle.db, { fullRoster: full });
    if (full) await applyFullRosterFixture(handle.db);
    return handle;
  } finally {
    if (was === undefined) delete process.env.UNIIVERSE_DEMO_FULL_ROSTER;
    else process.env.UNIIVERSE_DEMO_FULL_ROSTER = was;
  }
}

/** Leaderboards' active players, Recent form's rows and the multikill board's rows, as the page builds them. */
async function boards(handle: DbHandle): Promise<[number, number, number]> {
  invalidateLeaderboardCache();
  const team = await getOrCreateTeam(handle.db);
  // As the page builds it (src/app/(app)/leaderboards/page.tsx).
  const data = await loadLeaderboardData(handle.db, team.id);
  const query = parseLeaderboardsQuery({});
  const multikillBaseline = await loadMultikillBaseline(handle.db, team.id, data, recordsSeason(data, query));
  const view = buildLeaderboardsView(data, query, null, { multikillBaseline });
  return [view.playerCount, view.form.rows.length, view.records.multikills.rows.length];
}

describe("the full-roster demo", () => {
  let base: DbHandle;
  let full: DbHandle;
  let flagOnly: DbHandle;
  beforeAll(async () => {
    base = await demo(false);
    full = await demo(true);
    // The flag set, but not the in-memory demo (`pnpm dev`'s ./.data, a Postgres demo): bootstrap passes no full roster.
    flagOnly = await demo(false, true);
  }, 360_000);
  afterAll(async () => {
    await base?.close();
    await full?.close();
    await flagOnly?.close();
  });

  it("ranks nine active players on Recent form and on the multikill board; the default demo keeps seven and five", async () => {
    expect(await boards(base)).toEqual([7, 7, 5]);
    expect(await boards(full)).toEqual([9, 9, 9]);
  });

  it("is the default demo wherever bootstrap passes no full roster, the flag set or not: no half of it (seven players, the substitutes' counts still few)", async () => {
    expect(await boards(flagOnly)).toEqual([7, 7, 5]);
  });

  it("is decided by bootstrap for the in-memory demo alone", () => {
    expect(demoFullRoster("pglite-memory", { UNIIVERSE_DEMO_FULL_ROSTER: "1" })).toBe(true);
    expect(demoFullRoster("pglite-file", { UNIIVERSE_DEMO_FULL_ROSTER: "1" })).toBe(false);
    expect(demoFullRoster("postgres", { UNIIVERSE_DEMO_FULL_ROSTER: "1" })).toBe(false);
    expect(demoFullRoster("pglite-memory", {})).toBe(false);
    expect(demoFullRoster("pglite-memory", { UNIIVERSE_DEMO_FULL_ROSTER: "true" })).toBe(false);
  });

  it("is idempotent: run again, it adds no account and no game", async () => {
    expect(await applyFullRosterFixture(full.db)).toEqual({ created: 0 });
  });
});
