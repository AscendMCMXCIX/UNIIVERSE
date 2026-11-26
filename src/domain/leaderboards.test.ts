import { describe, expect, it } from "vitest";
import { isActivePlayer, lastCountedGame, LEADERBOARD_ACTIVE_DAYS, longestWinStreak, type LeaderboardGame } from "./leaderboards";
import { canOpen, NAV_LINKS } from "@/lib/nav";
import { STANDARD_PLAYER, type Session } from "@/server/auth/permissions";

/*
  The Leaderboards' shared helpers, on small synthetic games (not real players). The boards' own
  rules are tested in leaderboard-recent.test.ts and leaderboard-records.test.ts.
*/

let n = 0;
function game(playerId: string, over: Partial<LeaderboardGame> = {}): LeaderboardGame {
  n += 1;
  return {
    matchId: `M${n}`,
    playerId,
    championId: "Ahri",
    role: "MID",
    queueId: 420,
    patch: "16.10",
    win: true,
    gameCreation: 1_700_000_000_000 + n * 3_600_000,
    durationS: 1800,
    kills: 5,
    deaths: 2,
    assists: 7,
    cs: 240,
    damage: 24000,
    vision: 24,
    gold: 12000,
    wardsPlaced: 10,
    teamKills: 24,
    teamDamage: 96000,
    extra: null,
    ...over,
  };
}

describe("records' building blocks", () => {
  it("the longest win streak follows the order games were played", () => {
    const base = 1_700_000_000_000;
    const results = [true, true, false, true, true, true, null, true, false];
    const games = results.map((win, i) => game("a", { win, gameCreation: base + i * 1000 }));
    // The game without a result is skipped: W W L W W W (·) W L → 4.
    expect(longestWinStreak([...games].reverse())).toMatchObject({ length: 4, games: 8 });
  });
});

describe("who can open Leaderboards", () => {
  const base = { userId: "u", label: "U", playerId: "p", username: "u", hasPassword: true, mustChangePassword: false, setupComplete: true };
  const link = NAV_LINKS.find((l) => l.href === "/leaderboards")!;
  it("team members yes; personal-use accounts no; the Owner yes", () => {
    expect(canOpen({ ...base, role: "player", capabilities: STANDARD_PLAYER, teamMember: true } as Session, link)).toBe(true);
    expect(canOpen({ ...base, role: "player", capabilities: STANDARD_PLAYER, teamMember: false } as Session, link)).toBe(false);
    expect(canOpen({ ...base, role: "owner" } as Session, link)).toBe(true);
    // It sits in the Team group, between Players and Matches.
    const hrefs = NAV_LINKS.map((l) => l.href);
    expect(hrefs.indexOf("/leaderboards")).toBe(hrefs.indexOf("/players") + 1);
    expect(hrefs.indexOf("/matches")).toBe(hrefs.indexOf("/leaderboards") + 1);
  });
});

describe("who the boards show: active players (a counted game and a successful data update within 30 days)", () => {
  const NOW = Date.UTC(2026, 10, 25, 12);
  const DAY = 86_400_000;
  const at = (daysAgo: number) => NOW - daysAgo * DAY;

  it("needs both: a game and a sync within 30 days; either alone is not enough", () => {
    expect(LEADERBOARD_ACTIVE_DAYS).toBe(30);
    expect(isActivePlayer({ lastGameAt: at(2), lastSyncedAt: at(1) }, NOW)).toBe(true);
    // Games, but no successful read for 31 days (a failing account: last_sync_at moves, the cursor does not).
    expect(isActivePlayer({ lastGameAt: at(2), lastSyncedAt: at(31) }, NOW)).toBe(false);
    expect(isActivePlayer({ lastGameAt: at(2), lastSyncedAt: null }, NOW)).toBe(false);
    // Read yesterday, but no game in 30 days: a sync without new games never makes a player active.
    expect(isActivePlayer({ lastGameAt: at(31), lastSyncedAt: at(1) }, new Date(NOW))).toBe(false);
    expect(isActivePlayer({ lastGameAt: null, lastSyncedAt: at(1) }, NOW)).toBe(false);
    // The edges: exactly 30 days counts, a game after now does not.
    expect(isActivePlayer({ lastGameAt: at(30), lastSyncedAt: at(30) }, NOW)).toBe(true);
    expect(isActivePlayer({ lastGameAt: NOW + 60_000, lastSyncedAt: at(1) }, NOW)).toBe(false);
  });

  it("is worked out from the given time, so a returning player is active again with their next game and its sync", () => {
    const away = { lastGameAt: at(45), lastSyncedAt: at(44) };
    expect(isActivePlayer(away, NOW)).toBe(false);
    // Back: a game yesterday, read today.
    expect(isActivePlayer({ lastGameAt: at(1), lastSyncedAt: at(0) }, NOW)).toBe(true);
    // The same facts were active 20 days after them.
    expect(isActivePlayer(away, at(25))).toBe(true);
  });

  it("counts only games the boards count: a supported queue, not a remake, not after now", () => {
    const games = [game("a", { gameCreation: at(40) }), game("a", { gameCreation: at(5), durationS: 200 }), game("a", { gameCreation: at(4), queueId: 450 }), game("a", { gameCreation: at(3), queueId: null }), game("a", { gameCreation: NOW + DAY })];
    expect(lastCountedGame(games, NOW)).toBe(at(40));
    expect(lastCountedGame([...games, game("a", { gameCreation: at(6), durationS: null })], new Date(NOW))).toBe(at(6));
    expect(lastCountedGame([], NOW)).toBeNull();
  });
});
