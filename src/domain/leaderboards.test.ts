import { describe, expect, it } from "vitest";
import { longestWinStreak, type LeaderboardGame } from "./leaderboards";
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
