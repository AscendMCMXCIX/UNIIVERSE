import { describe, expect, it } from "vitest";
import { buildBoard, chaseText, formatMetric, gamesInScope, longestWinStreak, METRIC_BY_ID, METRICS, MIN_CHAMPION_GAMES, MIN_GAMES, MIN_ROLE_GAMES, metricsFor, unitFor, type LeaderboardGame, type PlayerData } from "./leaderboards";
import { canOpen, NAV_LINKS } from "@/lib/nav";
import { STANDARD_PLAYER, type Session } from "@/server/auth/permissions";

/*
  Every figure checked against a hand calculation on small synthetic games (not real players).
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
const player = (id: string, games: LeaderboardGame[], mastery: PlayerData["mastery"] = []): PlayerData => ({ playerId: id, games, mastery });
const value = (id: string, p: PlayerData, minGames = MIN_GAMES) => METRIC_BY_ID.get(id)!.compute(p, { minGames });
const many = (count: number, playerId: string, over: (i: number) => Partial<LeaderboardGame> = () => ({})) => Array.from({ length: count }, (_, i) => game(playerId, over(i)));

describe("figures, checked by hand", () => {
  it("win rate, KDA, kills, deaths and assists per game", () => {
    // 10 games: 6 wins; 5/2/7 each except two deathless games.
    const games = many(10, "a", (i) => ({ win: i < 6, deaths: i < 2 ? 0 : 2 }));
    const p = player("a", games);
    expect(value("win-rate", p).value).toBeCloseTo(0.6, 10);
    // KDA = (50 + 70) / (8 × 2) = 7.5 (total over total, not an average of game ratios).
    expect(value("kda", p).value).toBeCloseTo(120 / 16, 10);
    expect(value("kills-per-game", p).value).toBe(5);
    expect(value("deaths-per-game", p).value).toBeCloseTo(16 / 10, 10);
    expect(value("assists-per-game", p).value).toBe(7);
    expect(value("wins", p).value).toBe(6);
    expect(value("games", p).value).toBe(10);
  });

  it("per-minute figures are total ÷ total minutes, and remakes are left out", () => {
    const games = [game("a", { cs: 300, damage: 30000, vision: 30, gold: 15000, durationS: 1800 }), game("a", { cs: 100, damage: 5000, vision: 5, gold: 4000, durationS: 600 }), game("a", { cs: 10, damage: 900, vision: 1, gold: 500, durationS: 200 /* remake */ })];
    const p = player("a", games);
    // 400 CS over 40 minutes = 10 CS/min (the 200-second remake does not count).
    expect(value("cs-per-minute", p, 1).value).toBeCloseTo(400 / 40, 10);
    expect(value("cs-per-minute", p, 1).sample).toBe(2);
    expect(value("damage-per-minute", p, 1).value).toBeCloseTo(35000 / 40, 10);
    expect(value("vision-per-minute", p, 1).value).toBeCloseTo(35 / 40, 10);
    expect(value("gold-per-minute", p, 1).value).toBeCloseTo(19000 / 40, 10);
    // Per game uses every game that has the figure, remake included.
    expect(value("cs-per-game", p, 1).value).toBeCloseTo(410 / 3, 10);
  });

  it("kill participation and damage share are summed over the games with match details", () => {
    const games = [game("a", { kills: 4, assists: 6, teamKills: 20, damage: 20000, teamDamage: 80000 }), game("a", { kills: 2, assists: 2, teamKills: 10, damage: 10000, teamDamage: 40000 }), game("a", { teamKills: null, teamDamage: null })];
    const p = player("a", games);
    expect(value("kill-participation", p, 1).value).toBeCloseTo(14 / 30, 10);
    expect(value("kill-participation", p, 1).sample).toBe(2);
    expect(value("damage-share", p, 1).value).toBeCloseTo(30000 / 120000, 10);
  });

  it("missing figures are left out, never counted as zero", () => {
    const games = [game("a", { vision: null, extra: null }), game("a", { vision: 40, extra: { pentaKills: 1, wardsKilled: 3 } }), game("a", { kills: null, deaths: null, assists: null })];
    const p = player("a", games);
    // (40 + 24) / 2: the game with no vision score is skipped, not averaged in as 0 (which would give 21.3).
    expect(value("vision-per-game", p, 1)).toMatchObject({ value: 32, sample: 2 });
    expect(value("penta-kills", p)).toMatchObject({ value: 1, sample: 1 });
    expect(value("wards-cleared", p, 1)).toMatchObject({ value: 3, sample: 1 });
    // No extra data at all: no value (not 0), so nobody "leads" with zero pentakills.
    expect(value("penta-kills", player("b", [game("b")])).value).toBeNull();
    // K/D/A missing on one game: averages use the two that have it.
    expect(value("kills-per-game", p, 1).sample).toBe(2);
  });

  it("the longest win streak follows the order games were played", () => {
    const base = 1_700_000_000_000;
    const results = [true, true, false, true, true, true, null, true, false];
    const games = results.map((win, i) => game("a", { win, gameCreation: base + i * 1000 }));
    // The game without a result is skipped: W W L W W W (·) W L → 4.
    expect(longestWinStreak([...games].reverse())).toMatchObject({ length: 4, games: 8 });
  });

  it("champion specialists: most games, best win rate with a minimum, real experience and share", () => {
    const games = [...many(12, "a", (i) => ({ championId: "Ahri", win: i < 9 })), ...many(9, "a", () => ({ championId: "Zed", win: true })), ...many(10, "a", (i) => ({ championId: "Syndra", win: i < 5 }))];
    const p = player("a", games);
    expect(value("games-one-champion", p).value).toBe(12);
    expect(value("games-one-champion", p).context?.championId).toBe("Ahri");
    // Zed is 9-0 but below the minimum of ten games, so Ahri's 75% is the best eligible.
    expect(MIN_CHAMPION_GAMES).toBe(10);
    expect(value("best-champion-win-rate", p)).toMatchObject({ value: 0.75, context: { championId: "Ahri" } });
    expect(value("experienced-champions", p).value).toBe(2);
    expect(value("specialist-share", p).value).toBeCloseTo(12 / 31, 10);
    expect(value("distinct-champions", p).value).toBe(3);
  });

  it("mastery adds up across linked accounts, per champion and in total", () => {
    const p = player("a", [], [
      { playerId: "a", championId: "Ahri", points: 300_000 },
      { playerId: "a", championId: "Ahri", points: 50_000 },
      { playerId: "a", championId: "Zed", points: 320_000 },
    ]);
    expect(value("mastery-one-champion", p)).toMatchObject({ value: 350_000, context: { championId: "Ahri" } });
    expect(value("mastery-total", p).value).toBe(670_000);
  });

  it("single-game records keep the game they came from", () => {
    const games = [game("a", { kills: 9, deaths: 1, assists: 3 }), game("a", { kills: 14, deaths: 6, assists: 2, championId: "Zed" }), game("a", { kills: 3, deaths: 0, assists: 20 })];
    const p = player("a", games);
    expect(value("max-kills", p)).toMatchObject({ value: 14, context: { championId: "Zed", note: "14/6/2" } });
    // KDA in one game: (3 + 20) / max(1, 0) = 23.
    expect(value("max-kda", p).value).toBe(23);
    expect(value("max-assists", p).value).toBe(20);
  });
});

describe("rankings", () => {
  it("averages and rates need the minimum games; totals and records do not", () => {
    const veteran = player("vet", many(MIN_GAMES, "vet", (i) => ({ win: i % 2 === 0 })));
    const rookie = player("new", many(3, "new", () => ({ win: true })));
    const winRate = buildBoard(METRIC_BY_ID.get("win-rate")!, [veteran, rookie], { role: null });
    expect(winRate.ranked.map((r) => r.playerId)).toEqual(["vet"]);
    expect(winRate.unranked).toEqual([{ playerId: "new", sample: 3, needed: MIN_GAMES, value: 1 }]);
    const wins = buildBoard(METRIC_BY_ID.get("wins")!, [veteran, rookie], { role: null });
    expect(wins.ranked.map((r) => [r.playerId, r.value])).toEqual([["vet", 5], ["new", 3]]);
  });

  it("role boards count only games played in that role, with their own minimum", () => {
    const flex = player("flex", [...many(6, "flex", () => ({ role: "JUNGLE", assists: 12 })), ...many(20, "flex", () => ({ role: "TOP", assists: 1 }))]);
    const jungle = gamesInScope(flex.games, { season: 16, queue: "ranked", role: "JUNGLE" });
    expect(jungle).toHaveLength(6);
    const board = buildBoard(METRIC_BY_ID.get("assists-per-game")!, [{ ...flex, games: jungle }], { role: "JUNGLE" });
    expect(MIN_ROLE_GAMES).toBe(5);
    expect(board.ranked[0]).toMatchObject({ playerId: "flex", value: 12 });
  });

  it("season and queue filters never mix populations", () => {
    const games = [game("a", { patch: "16.4", queueId: 420 }), game("a", { patch: "15.20", queueId: 420 }), game("a", { patch: "16.4", queueId: 440 }), game("a", { patch: "16.4", queueId: 400 })];
    expect(gamesInScope(games, { season: 16, queue: "ranked", role: null })).toHaveLength(2);
    expect(gamesInScope(games, { season: 16, queue: "solo", role: null })).toHaveLength(1);
    expect(gamesInScope(games, { season: 16, queue: "all", role: null })).toHaveLength(3);
    expect(gamesInScope(games, { season: 15, queue: "ranked", role: null })).toHaveLength(1);
  });

  it("equal values share a rank; fewer deaths ranks higher; the gap to first is in the metric's unit", () => {
    const a = player("a", many(10, "a", () => ({ deaths: 2 })));
    const b = player("b", many(10, "b", () => ({ deaths: 2 })));
    const c = player("c", many(10, "c", () => ({ deaths: 5 })));
    const board = buildBoard(METRIC_BY_ID.get("deaths-per-game")!, [c, a, b], { role: null }, new Map([["a", "Ann"], ["b", "Bo"], ["c", "Cy"]]));
    expect(board.ranked.map((r) => [r.playerId, r.rank])).toEqual([["a", 1], ["b", 1], ["c", 3]]);
    expect(board.ranked[2]!.gap).toBe(3);
    expect(chaseText(board.metric, board.ranked[2]!)).toBe("3.00 deaths/game more than the leader's average");
    expect(chaseText(board.metric, board.ranked[1]!)).toBeNull();
  });

  it("chase text says what kind of gap it is", () => {
    const cs = METRIC_BY_ID.get("cs-per-minute")!;
    expect(chaseText(cs, { playerId: "b", rank: 2, value: 8.1, sample: 30, gap: 0.3 })).toBe("0.30 CS/min behind the leader's current average");
    expect(chaseText(METRIC_BY_ID.get("kills")!, { playerId: "b", rank: 2, value: 99, sample: 30, gap: 1 })).toBe("1 kill behind first place");
    expect(chaseText(METRIC_BY_ID.get("max-kills")!, { playerId: "b", rank: 2, value: 10, sample: 30, gap: 2 })).toBe("2 kills short of the record");
    expect(chaseText(METRIC_BY_ID.get("win-rate")!, { playerId: "b", rank: 2, value: 0.5, sample: 30, gap: 0.031 })).toBe("3.1 percentage points behind the leader's current average");
    expect(unitFor("wins in a row", 1)).toBe("win in a row");
    expect(formatMetric(METRIC_BY_ID.get("win-rate")!, 0.5234)).toBe("52.3%");
  });

  it("a role's natural strengths come first: Support sees vision, Jungle sees participation", () => {
    expect(metricsFor("vision", "SUPPORT")[0]!.roles).toContain("SUPPORT");
    expect(metricsFor("overview", "JUNGLE").slice(0, 3).map((m) => m.id)).toContain("kill-participation");
    // Every category has metrics a support can lead.
    const supportFriendly = new Set(METRICS.filter((m) => m.roles?.includes("SUPPORT")).map((m) => m.category));
    for (const c of ["overview", "vision", "records"]) expect(supportFriendly.has(c as never)).toBe(true);
  });
});

describe("who can open Leaderboards", () => {
  const base = { userId: "u", label: "U", playerId: "p", username: "u", hasPassword: true, mustChangePassword: false, setupComplete: true };
  const link = NAV_LINKS.find((l) => l.href === "/leaderboards")!;
  it("team members yes; personal-use accounts no; the Owner yes", () => {
    expect(canOpen({ ...base, role: "player", capabilities: STANDARD_PLAYER, teamMember: true } as Session, link)).toBe(true);
    expect(canOpen({ ...base, role: "player", capabilities: STANDARD_PLAYER, teamMember: false } as Session, link)).toBe(false);
    expect(canOpen({ ...base, role: "owner" } as Session, link)).toBe(true);
    // It sits in the Team group, between Players and Draft.
    const hrefs = NAV_LINKS.map((l) => l.href);
    expect(hrefs.indexOf("/leaderboards")).toBe(hrefs.indexOf("/players") + 1);
    expect(hrefs.indexOf("/draft")).toBe(hrefs.indexOf("/leaderboards") + 1);
  });
});
