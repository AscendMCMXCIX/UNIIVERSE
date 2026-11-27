import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { invalidateLeaderboardCache } from "@/server/leaderboards/service";
import * as recentView from "@/server/leaderboards/recent-view";
import { readAuditMembers } from "@/server/leaderboards/audit";
import type { LeaderboardAuditSummary } from "@/domain/leaderboard-audit";
import { runJob } from "@/server/jobs";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  The leaderboard audit (Release 19) on stored rows: its own SQL reading of who is active equals the
  page's own view; the 30-day rule holds at its boundary by views at shifted times; a member back
  after more than 30 days is counted as an observed return; and a page that broke the rule would be
  caught. Counts and p-labels only, nothing written. Synthetic accounts and games.
*/

let handle: DbHandle;
let teamId: string;
const NOW = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const seconds = (ms: number) => Math.floor(ms / 1000);
const id: Record<string, string> = {};

async function games(accountId: string, prefix: string, n: number, newestDaysAgo: number, o: Partial<typeof accountMatches.$inferInsert> = {}) {
  await handle.db.insert(accountMatches).values(
    Array.from({ length: n }, (_, i) => ({ accountId, matchId: `${prefix}_${i}`, gameCreation: NOW - newestDaysAgo * DAY - i * 20 * HOUR, queueId: 420, championId: "Riven", role: "TOP", win: i % 2 === 0, patch: "16.20", gameDuration: 1800, kills: 5, deaths: 3, assists: 6, cs: 200, damage: 20_000, visionScore: 18, extraStats: { doubleKills: i % 2, tripleKills: 0, quadraKills: 0, pentaKills: 0, largestMultiKill: i % 2 ? 2 : 1 }, ...o })),
  );
}
async function account(player: string, puuid: string, o: Partial<typeof riotAccounts.$inferInsert> = {}) {
  const [row] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: id[player]!, gameName: puuid, tagLine: "TEST", platform: "euw1", puuid, label: "main", syncStatus: "ok", lastSyncAt: new Date(NOW - HOUR), syncCursor: seconds(NOW - HOUR), ...o }).returning({ id: riotAccounts.id });
  return row!.id;
}

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(db)).id;
  for (const name of ["Ace", "Bea", "Cal", "Dot", "Eve", "Fay", "Gus"]) id[name] = (await createPlayer(db, teamId, { displayName: name, primaryRole: "TOP", primaryPool: ["Riven"] })).id;
  // Ace: active, 24 games.
  await games(await account("Ace", "p-ace"), "ACE", 24, 0.5);
  // Bea: her last game 31 days ago, read an hour ago.
  await games(await account("Bea", "p-bea"), "BEA", 24, 31);
  // Cal: recent games, the account failing for 40 days (the cursor 40 days old).
  await games(await account("Cal", "p-cal", { syncStatus: "failed", syncCursor: seconds(NOW - 40 * DAY) }), "CAL", 22, 1);
  // Dot: back after 60 days: games long ago, then three games in the last few days.
  const dot = await account("Dot", "p-dot");
  await games(dot, "DOT_OLD", 20, 70);
  await games(dot, "DOT_NEW", 3, 2);
  // Eve: a demo account, its seeded time standing for an update.
  await games(await account("Eve", "demo-eve", { label: "demo", syncStatus: "demo", syncCursor: null, lastSyncAt: new Date(NOW - 2 * DAY) }), "EVE", 21, 1);
  // Fay: remakes only (under five minutes), and a game dated after now.
  const fay = await account("Fay", "p-fay");
  await games(fay, "FAY", 5, 1, { gameDuration: 200 });
  await games(fay, "FAY_AHEAD", 1, -2);
  // Gus: no account (setup not finished).
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("leaderboard-audit", () => {
  it("reads each member's newest counted game and update in its own query, in the team's order", async () => {
    const members = await readAuditMembers(handle.db, teamId, NOW);
    expect(members.map((m) => m.id)).toEqual(["Ace", "Bea", "Cal", "Dot", "Eve", "Fay", "Gus"].map((n) => id[n]));
    const by = Object.fromEntries(members.map((m, i) => [["Ace", "Bea", "Cal", "Dot", "Eve", "Fay", "Gus"][i]!, m]));
    expect(by.Ace!.lastGameAt).toBe(NOW - 0.5 * DAY);
    expect(by.Cal!.lastSyncedAt).toBe(seconds(NOW - 40 * DAY) * 1000);
    expect(by.Eve!.lastSyncedAt).toBe(NOW - 2 * DAY);
    expect(by.Dot!.returnedAt).toBe(NOW - 2 * DAY - 2 * 20 * HOUR);
    // Fay: remakes do not count, and the game after now is not her newest; it is counted apart.
    expect(by.Fay).toMatchObject({ lastGameAt: null, futureGames: 1 });
    expect(by.Gus).toMatchObject({ accounts: 0, lastGameAt: null, lastSyncedAt: null });
  });

  it("finds the page's own view equal to the rule, checks the boundary, observes Dot's return, and writes nothing", async () => {
    const count = async () => {
      const r = (await handle.db.execute(sql`SELECT (SELECT count(*) FROM account_matches) + (SELECT count(*) FROM riot_accounts) + (SELECT count(*) FROM players) AS n`)) as unknown as { rows?: Array<{ n: string }> };
      return Number((r.rows ?? (r as unknown as Array<{ n: string }>))[0]!.n);
    };
    const before = await count();
    invalidateLeaderboardCache();
    const result = await runJob(handle.db, "leaderboard-audit", "test");
    expect(result.ok, JSON.stringify(result.summary)).toBe(true);
    const s = result.summary as unknown as LeaderboardAuditSummary;
    expect(s).toMatchObject({ members: 7, active: 3, activeCount: 3, violations: [], inactive: { total: 4, noRecentGame: 2, noRecentSync: 1, noAccount: 1 } });
    expect(s.shown.scopeCount).toBe(3);
    // Ace, Dot and Eve absent a minute past their game's 30 days; Bea and Cal checked a day after their last game.
    expect(s.rule.absentAfter30Days).toEqual({ checked: 3, absent: 3, skipped: 0 });
    expect(s.rule.presentWithinWindow).toMatchObject({ checked: 2, present: 1, expectedPresent: 1 });
    expect(s.returnedRecently).toMatchObject({ players: 1, shown: 1, observed: true });
    const text = JSON.stringify(result.summary);
    for (const name of ["Ace", "Bea", "Cal", "Dot", "Eve", "Fay", "Gus", "p-ace", ...Object.values(id)]) expect(text).not.toContain(name);
    expect(await count()).toBe(before);
  }, 60_000);

  it("fails, with the label of each difference, when the page's view breaks the rule", async () => {
    const real = recentView.buildLeaderboardsView;
    const spy = vi.spyOn(recentView, "buildLeaderboardsView").mockImplementation((...args) => {
      const view = real(...args);
      // A page that also shows Bea, whose last game is 31 days old.
      return { ...view, players: { ...view.players, [id.Bea!]: { id: id.Bea!, name: "Bea", profileHref: null, avatarUrl: null, look: Object.values(view.players)[0]!.look } }, playerCount: view.playerCount + 1 };
    });
    try {
      invalidateLeaderboardCache();
      const result = await runJob(handle.db, "leaderboard-audit", "test");
      expect(result.ok).toBe(false);
      const s = result.summary as { violations: string[] };
      expect(s.violations).toEqual(expect.arrayContaining(["p2: shown, but the rule does not show them", "the page counts 4 active players, the rule 3"]));
      expect(result.error).toMatch(/differences? between the 30-day rule and the boards/);
      expect(result.error).not.toMatch(/Bea/);
    } finally {
      spy.mockRestore();
    }
  }, 60_000);
});
