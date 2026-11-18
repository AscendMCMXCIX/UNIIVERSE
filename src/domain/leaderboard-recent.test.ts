import { describe, expect, it } from "vitest";
import type { LeaderboardGame } from "./leaderboards";
import { BOARD_FIGURES, eligibleGames, mainRoleOf, rankRecentBoard, recentEntry, recentSamples, statusOf, winRateAfterNextGame, type RecentScope } from "./leaderboard-recent";

const NOW = new Date(Date.UTC(2026, 10, 2, 12));
const DAY = 86_400_000;
let seq = 0;
function game(playerId: string, daysAgo: number, o: Partial<LeaderboardGame> = {}): LeaderboardGame {
  seq += 1;
  return {
    matchId: `OC1_${seq}`,
    playerId,
    championId: "Ahri",
    role: "MID",
    queueId: 420,
    patch: "16.21",
    win: true,
    gameCreation: NOW.getTime() - daysAgo * DAY - seq, // distinct times, newest first by daysAgo
    durationS: 1800,
    kills: 5,
    deaths: 5,
    assists: 5,
    cs: 210,
    damage: 21_000,
    vision: 30,
    gold: 12_000,
    wardsPlaced: 10,
    teamKills: 20,
    teamDamage: 84_000,
    extra: null,
    ...o,
  };
}
/** n games, one a day from `start` days ago, winning the first `wins` (newest first). */
const run = (playerId: string, n: number, wins: number, start = 0, o: Partial<LeaderboardGame> = {}) => Array.from({ length: n }, (_, i) => game(playerId, start + i, { win: i < wins, ...o }));
const scope = (board: RecentScope["board"] = "overall", mode: RecentScope["mode"] = "all"): RecentScope => ({ board, mode, now: NOW });

describe("the window: a player's latest 20 eligible games from the last 60 days", () => {
  it("keeps the mode's queues, the board's role, no remakes and nothing older than 60 days, newest first", () => {
    const games = [
      game("a", 1),
      game("a", 2, { queueId: 400 }), // Normal Draft: in All games, not in Ranked
      game("a", 3, { durationS: 200 }), // a remake
      game("a", 4, { role: "TOP" }),
      game("a", 61), // too old
    ];
    expect(eligibleGames(games, scope()).map((g) => g.matchId)).toEqual([games[0]!.matchId, games[1]!.matchId, games[3]!.matchId]);
    expect(eligibleGames(games, scope("overall", "ranked")).map((g) => g.matchId)).toEqual([games[0]!.matchId, games[3]!.matchId]);
    expect(eligibleGames(games, scope("MID")).map((g) => g.matchId)).toEqual([games[0]!.matchId, games[1]!.matchId]);
  });

  it("uses only the latest 20 decided games, and says how many it used", () => {
    const e = recentEntry("a", run("a", 30, 25), scope());
    expect(e.games).toBe(20);
    expect(e.wins).toBe(20); // the 20 newest are wins; the older losses are outside the window
    expect(e.status).toBe("established");
  });

  it("is established at 20 games, provisional from 10, and not enough below", () => {
    expect([statusOf(20), statusOf(19), statusOf(10), statusOf(9), statusOf(0)]).toEqual(["established", "provisional", "provisional", "insufficient", "insufficient"]);
  });

  it("lets a player who stopped playing age out after 60 days", () => {
    const e = recentEntry("a", run("a", 25, 15, 61), scope());
    expect(e.games).toBe(0);
    expect(e.status).toBe("insufficient");
  });
});

describe("the main role", () => {
  it("is the role of most games in the window; a tie goes to the member's own role, then Top to Support", () => {
    const games = [...run("a", 8, 4, 0, { role: "JUNGLE" }), ...run("a", 8, 4, 8, { role: "MID" }), ...run("a", 4, 2, 16, { role: "TOP" })];
    const e = recentEntry("a", games, scope());
    expect(e.roles).toEqual({ JUNGLE: 8, MID: 8, TOP: 4 });
    expect(mainRoleOf(e)).toEqual({ role: "JUNGLE", games: 8 });
    expect(mainRoleOf(e, "MID")).toEqual({ role: "MID", games: 8 });
    expect(mainRoleOf(e, "TOP")).toEqual({ role: "JUNGLE", games: 8 });
    expect(mainRoleOf(recentEntry("b", run("b", 12, 6, 0, { role: null }), scope()))).toBeNull();
  });
});

describe("figures come from the window's totals", () => {
  it("KDA is (kills + assists) over deaths in total, not an average of ratios, and no deaths counts as one", () => {
    const games = [game("a", 1, { kills: 10, deaths: 0, assists: 10 }), game("a", 2, { kills: 0, deaths: 10, assists: 0 })];
    const e = recentEntry("a", games, scope("MID"));
    expect(e.figures.kda!.value).toBeCloseTo(20 / 10); // an average of ratios would say (20 + 0) / 2 = 10
    expect(recentEntry("b", [game("b", 1, { kills: 3, deaths: 0, assists: 4 })], scope("MID")).figures.kda!.value).toBe(7);
  });

  it("per-minute figures divide the totals by the total minutes", () => {
    const games = [game("a", 1, { cs: 300, durationS: 1800 }), game("a", 2, { cs: 100, durationS: 600 })];
    expect(recentEntry("a", games, scope("MID")).figures.csPerMin!.value).toBeCloseTo(400 / 40);
  });

  it("a game without a figure is left out of that figure only, never counted as zero", () => {
    const games = [game("a", 1, { cs: null }), game("a", 2, { cs: 200, durationS: 1200 })];
    const e = recentEntry("a", games, scope("MID"));
    expect(e.figures.csPerMin).toEqual({ value: 10, games: 1 });
    expect(e.figures.winRate!.games).toBe(2);
  });

  it("the overall board ranks only win rate; role boards add the role's figures", () => {
    expect(BOARD_FIGURES.overall).toEqual(["winRate"]);
    expect(BOARD_FIGURES.SUPPORT).toContain("visionPerMin");
    expect(BOARD_FIGURES.TOP).not.toContain("visionPerMin");
  });
});

describe("ranking", () => {
  const names = new Map([["a", "Ash"], ["b", "Bo"], ["c", "Cy"], ["d", "Di"], ["e", "Ev"]]);

  it("never lets a small sample outrank a full window: 8 of 10 provisional sits below 11 of 20", () => {
    const entries = [recentEntry("a", run("a", 20, 11), scope()), recentEntry("b", run("b", 10, 8), scope())];
    const board = rankRecentBoard(entries, "overall", "winRate", names);
    expect(board.rows.map((r) => [r.entry.playerId, r.rank])).toEqual([["a", 1], ["b", null]]);
    expect(board.rows[1]!.note).toBe("Provisional · 10 of 20 games");
    expect(board.rows[1]!.gap).toEqual({ kind: "provisional", games: 10 });
  });

  it("playing more games never raises a place by itself: the same latest 20 rank the same", () => {
    const heavy = recentEntry("a", [...run("a", 20, 12), ...run("a", 180, 90, 20).map((g) => ({ ...g, gameCreation: g.gameCreation }))], scope());
    const light = recentEntry("b", run("b", 20, 12), scope());
    const board = rankRecentBoard([heavy, light], "overall", "winRate", names);
    expect(board.rows.map((r) => [r.entry.playerId, r.rank, r.tied])).toEqual([["a", 1, true], ["b", 1, true]]);
  });

  it("gives tied values the same place and lists players with too few games below the board", () => {
    const entries = [recentEntry("a", run("a", 20, 14), scope()), recentEntry("b", run("b", 20, 14), scope()), recentEntry("c", run("c", 20, 10), scope()), recentEntry("d", run("d", 4, 4), scope())];
    const board = rankRecentBoard(entries, "overall", "winRate", names);
    expect(board.rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(board.notEnough).toEqual([{ entry: entries[3], needed: 6 }]);
  });

  it("says when one win draws level with the place above, and otherwise the gap in wins to everyone sharing it", () => {
    // Every established window has 20 games and the next game replaces the oldest one: a win draws
    // level when the oldest game was a loss, and changes nothing when it was a win.
    const ash = recentEntry("a", run("a", 20, 13), scope()); // 13 of 20
    const bo = recentEntry("b", run("b", 20, 12), scope()); // 12 of 20, the oldest a loss
    const di = recentEntry("d", run("d", 20, 12).map((g, i) => ({ ...g, win: i >= 8 })), scope()); // 12 of 20, the oldest a win
    const cy = recentEntry("c", run("c", 20, 9), scope());
    const board = rankRecentBoard([ash, bo, cy, di], "overall", "winRate", names);
    expect(board.rows.map((r) => [r.entry.playerId, r.rank, r.note])).toEqual([
      ["a", 1, null],
      ["b", 2, "Win your next game to draw level with Ash"],
      ["d", 2, "1 win behind Ash"],
      ["c", 4, "3 wins behind Bo and Di"],
    ]);
    // The same notes in parts, for a board that shows the gap short ("Next win: 2=", "3 wins behind"):
    // the place a gap is to is the place of the rows the sentence names.
    expect(board.rows.map((r) => [r.entry.playerId, r.gap])).toEqual([
      ["a", null],
      ["b", { kind: "level", place: 1 }],
      ["d", { kind: "behind", wins: 1, place: 1 }],
      ["c", { kind: "behind", wins: 3, place: 2 }],
    ]);
  });

  it("ranks by the figure as shown, so figures that read the same share a place", () => {
    // 7.04 and 6.96 CS per minute both read 7.0; 6.5 is 0.5 behind them.
    const cs = (playerId: string, usual: number, last: number) => recentEntry(playerId, run(playerId, 20, 10).map((g, i) => ({ ...g, cs: i === 19 ? last : usual })), scope("MID"));
    const board = rankRecentBoard([cs("a", 211, 215), cs("b", 209, 205), cs("c", 195, 195)], "MID", "csPerMin", names);
    expect(board.rows.map((r) => [r.entry.playerId, r.rank, r.tied, r.note])).toEqual([
      ["a", 1, true, null],
      ["b", 1, true, null],
      ["c", 3, false, "0.5 CS/min behind Ash and Bo"],
    ]);
    // A gap in another figure's unit has no parts: only win rate's gaps are shown short.
    expect(board.rows.map((r) => r.gap)).toEqual([null, null, null]);
  });

  it("works out the next game exactly: a full window drops its oldest game", () => {
    const lostOldest = recentEntry("a", run("a", 20, 10), scope()); // newest 10 won, oldest lost
    expect(winRateAfterNextGame(lostOldest, true)).toBeCloseTo(11 / 20);
    const wonOldest = recentEntry("b", run("b", 20, 10).map((g, i) => ({ ...g, win: i >= 10 })), scope()); // oldest won
    expect(winRateAfterNextGame(wonOldest, true)).toBeCloseTo(10 / 20);
    const partial = recentEntry("c", run("c", 12, 6), scope());
    expect(winRateAfterNextGame(partial, true)).toBeCloseTo(7 / 13);
  });

  it("can rank a role board by another of its figures", () => {
    const entries = [recentEntry("a", run("a", 20, 10, 0, { role: "SUPPORT", vision: 60 }), scope("SUPPORT")), recentEntry("b", run("b", 20, 15, 0, { role: "SUPPORT", vision: 30 }), scope("SUPPORT"))];
    expect(rankRecentBoard(entries, "SUPPORT", "visionPerMin", names).rows.map((r) => r.entry.playerId)).toEqual(["a", "b"]);
    expect(rankRecentBoard(entries, "SUPPORT", "winRate", names).rows.map((r) => r.entry.playerId)).toEqual(["b", "a"]);
    expect(rankRecentBoard(entries, "SUPPORT", "visionPerMin", names).rows[1]!.note).toBe("1.00 vision/min behind Ash");
    expect(rankRecentBoard(entries, "SUPPORT", "visionPerMin", names).rows[1]!.gap).toBeNull();
  });

  it("the parts say what the sentence says, on a board of every kind of gap", () => {
    // Eight full windows (wins from 8 to 15 of 20, the oldest game won or lost) and a provisional
    // one, so the board has level and behind gaps, shared places above and below a row, gaps of
    // several wins and a sentence naming three members.
    const shapes: Array<[string, number, boolean]> = [["a", 15, false], ["b", 14, true], ["c", 14, false], ["d", 13, false], ["e", 11, true], ["f", 11, false], ["g", 11, true], ["h", 8, false]];
    const more = new Map([...names, ["f", "Fi"], ["g", "Gu"], ["h", "Hy"], ["i", "Io"]]);
    // The newest `wins` games won; the oldest game a win when `oldestWon` (one fewer win among the newest then).
    const entries = shapes.map(([id, wins, oldestWon]) => recentEntry(id, run(id, 20, oldestWon ? wins - 1 : wins).map((g, i) => (i === 19 ? { ...g, win: oldestWon } : g)), scope()));
    entries.push(recentEntry("i", run("i", 14, 9), scope()));
    const board = rankRecentBoard(entries, "overall", "winRate", more);
    expect(board.rows.map((r) => r.rank)).toEqual([1, 2, 2, 4, 5, 5, 5, 8, null]);
    const byName = new Map([...more].map(([id, name]) => [name, id]));
    for (const r of board.rows) {
      expect(r.note === null, `${r.entry.playerId}: a note exactly when there are parts`).toBe(r.gap === null);
      if (!r.gap || !r.note) continue;
      expect(r.gap.kind === "level", `${r.entry.playerId}: "level" exactly when one win draws level`).toBe(r.note.startsWith("Win your next game to draw level with "));
      if (r.gap.kind === "behind") expect(r.note.startsWith(`${r.gap.wins} ${r.gap.wins === 1 ? "win" : "wins"} behind `)).toBe(true);
      if (r.gap.kind === "provisional") {
        expect(r.note).toBe(`Provisional · ${r.gap.games} of 20 games`);
        continue;
      }
      // Every member the sentence names holds the place the parts give.
      const named = r.note.replace(/^(Win your next game to draw level with |\d+ wins? behind )/, "").split(/, | and /);
      expect(named.length).toBeGreaterThan(0);
      for (const name of named) expect(board.rows.find((o) => o.entry.playerId === byName.get(name))!.rank, `${r.entry.playerId}: ${name}`).toBe(r.gap.place);
    }
    expect(board.rows.map((r) => r.gap?.kind ?? null)).toEqual([null, "behind", "level", "level", "behind", "behind", "behind", "behind", "provisional"]);
    expect(board.rows.at(-2)!.note).toBe("3 wins behind Ev, Fi and Gu");
  });
});

describe("the data audit's summary of the team's samples", () => {
  it("counts established, provisional and not-enough members per board, and each member's eligible games", () => {
    const games = [...run("a", 25, 12), ...run("b", 12, 6, 0, { role: "SUPPORT" }), ...run("c", 3, 1)];
    const members = [{ id: "a", label: "p1" }, { id: "b", label: "p2" }, { id: "c", label: "p3" }, { id: "d", label: "p4" }];
    const s = recentSamples(games, members, NOW);
    expect(s.window).toEqual({ games: 20, provisionalFrom: 10, days: 60 });
    expect(s.modes.all.boards.overall).toEqual({ established: 1, provisional: 1, insufficient: 2, tenOrMore: 2, windowDaysMedian: 19, sharedPlaces: 0, establishedWinRates: [60] });
    expect(s.modes.all.boards.SUPPORT).toEqual({ established: 0, provisional: 1, insufficient: 3, tenOrMore: 1, windowDaysMedian: null, sharedPlaces: 0, establishedWinRates: [] });
    expect(s.modes.all.byMember).toEqual([
      { member: "p1", overall: 25, TOP: 0, JUNGLE: 0, MID: 25, ADC: 0, SUPPORT: 0 },
      { member: "p2", overall: 12, TOP: 0, JUNGLE: 0, MID: 0, ADC: 0, SUPPORT: 12 },
      { member: "p3", overall: 3, TOP: 0, JUNGLE: 0, MID: 3, ADC: 0, SUPPORT: 0 },
      { member: "p4", overall: 0, TOP: 0, JUNGLE: 0, MID: 0, ADC: 0, SUPPORT: 0 },
    ]);
    // One established member, against the five an overall board needs (and three a role board needs).
    expect(s.modes.all.acceptable).toEqual({ overall: false, TOP: false, JUNGLE: false, MID: false, ADC: false, SUPPORT: false });
    // Normal Draft counts in All games only.
    const draft = recentSamples(run("a", 20, 10, 0, { queueId: 400 }), members.slice(0, 1), NOW);
    expect([draft.modes.all.boards.overall.established, draft.modes.ranked.boards.overall.established]).toEqual([1, 0]);
  });

  it("says how often established members share a place, and their win rates as the page shows them", () => {
    // Two windows at 11 of 20 read 55% and share a place; a provisional member is not counted.
    const games = [...run("a", 20, 11), ...run("b", 20, 11), ...run("c", 20, 14), ...run("d", 12, 12)];
    const members = ["a", "b", "c", "d"].map((id, i) => ({ id, label: `p${i + 1}` }));
    const overall = recentSamples(games, members, NOW).modes.all.boards.overall;
    expect(overall).toMatchObject({ established: 3, provisional: 1, sharedPlaces: 2, establishedWinRates: [70, 55, 55] });
  });
});
