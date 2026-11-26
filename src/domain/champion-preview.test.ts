import { describe, expect, it } from "vitest";
import { OPPONENT_SEARCH_FROM, arrangeOpponents, opponentFootLine, opponentSentence, pairingKda, searchOpponents, smallSample, type OpponentTally } from "./champion-preview";
import { viewerWords } from "./viewer-words";

const o = (championId: string, games: number, wins: number, lastPlayedAt = 0): OpponentTally => ({ championId, games, wins, lastPlayedAt });

describe("the preview's lane opponents: one table, every opponent (the owner's request of 25 Nov 2026)", () => {
  const all = [o("Nasus", 7, 1, 5), o("Garen", 2, 2, 9), o("Darius", 3, 3, 1), o("Sett", 1, 0, 3), o("Teemo", 5, 4, 2), o("Fiora", 4, 1, 4)];
  const ids = (a: { rows: OpponentTally[] }) => a.rows.map((x) => x.championId);

  it("lists every opponent, 1–2 games included, most games first (ties to the most recent), with no divider", () => {
    const a = arrangeOpponents(all, "games");
    expect(ids(a)).toEqual(["Nasus", "Teemo", "Fiora", "Darius", "Garen", "Sett"]);
    expect(a.divider).toBeNull();
    expect(ids(arrangeOpponents([o("Ahri", 2, 1, 1), o("Zed", 2, 0, 7)], "games"))).toEqual(["Zed", "Ahri"]);
  });

  it("ranks by win rate only opponents with 3+ games; the small samples follow after the divider, in the same direction", () => {
    const high = arrangeOpponents(all, "high");
    // Garen 2–0 (100%) never tops the list: it follows the ranked opponents.
    expect(ids(high)).toEqual(["Darius", "Teemo", "Fiora", "Nasus", "Garen", "Sett"]);
    expect(high.divider).toBe(4);
    const low = arrangeOpponents(all, "low");
    expect(ids(low)).toEqual(["Nasus", "Fiora", "Teemo", "Darius", "Sett", "Garen"]);
    expect(low.divider).toBe(4);
  });

  it("breaks win-rate ties by more games, then the most recent", () => {
    const a = arrangeOpponents([o("Ahri", 4, 2, 1), o("Zed", 6, 3, 2), o("Lux", 4, 2, 9)], "high");
    expect(ids(a)).toEqual(["Zed", "Lux", "Ahri"]);
  });

  it("draws no divider when every opponent is on one side of the line, and keeps an empty list empty", () => {
    const small = arrangeOpponents([o("Garen", 2, 1, 1), o("Sett", 1, 0, 2)], "high");
    expect(ids(small)).toEqual(["Garen", "Sett"]);
    expect(small.divider).toBeNull();
    expect(arrangeOpponents([o("Nasus", 3, 1, 1), o("Darius", 4, 4, 1)], "low").divider).toBeNull();
    expect(arrangeOpponents([], "games")).toEqual({ rows: [], divider: null });
  });

  it("calls under 3 games a small sample", () => {
    expect([1, 2, 3, 5].map((games) => smallSample({ games }))).toEqual([true, true, false, false]);
  });
});

describe("the opponents' search", () => {
  const top = [o("Nasus", 7, 1), o("Garen", 2, 2), o("Darius", 3, 3), o("Sett", 1, 0), o("Teemo", 5, 4), o("Fiora", 4, 1)];
  const name = (x: OpponentTally) => x.championId.toLowerCase();
  const ids = (rows: OpponentTally[]) => rows.map((x) => x.championId);

  it("keeps the opponents whose name holds the words, in the position they were typed in", () => {
    expect(ids(searchOpponents(top, { words: "ar", typedIn: "TOP", role: "TOP", name }))).toEqual(["Garen", "Darius"]);
    expect(searchOpponents(top, { words: "zz", typedIn: "TOP", role: "TOP", name })).toEqual([]);
    expect(ids(searchOpponents(top, { words: "", typedIn: "TOP", role: "TOP", name }))).toEqual(ids(top));
  });

  it("never hides an opponent of another position: words typed in Top leave Jungle's table whole (25 Nov 2026 review)", () => {
    // Sion as Top has six opponents; the search typed there must not filter Mid's (four, a search of its own) ...
    const mid = [o("Ahri", 2, 1), o("Zed", 1, 0), o("Syndra", 1, 1), o("Orianna", 1, 0)];
    expect(ids(searchOpponents(mid, { words: "ar", typedIn: "TOP", role: "MID", name }))).toEqual(ids(mid));
    // ... nor Jungle's two, whose table draws no search field to clear it with.
    const jungle = [o("LeeSin", 1, 1), o("Vi", 1, 0)];
    expect(ids(searchOpponents(jungle, { words: "zz", typedIn: "TOP", role: "JUNGLE", name }))).toEqual(["LeeSin", "Vi"]);
  });

  it("applies only where the table offers its field: under four opponents the words are ignored", () => {
    expect(OPPONENT_SEARCH_FROM).toBe(4);
    const three = top.slice(0, 3);
    expect(ids(searchOpponents(three, { words: "zz", typedIn: "TOP", role: "TOP", name }))).toEqual(ids(three));
    expect(ids(searchOpponents(top.slice(0, 4), { words: "zz", typedIn: "TOP", role: "TOP", name }))).toEqual([]);
  });
});

describe("wording follows the viewer", () => {
  const ten = { games: 6, ahead: 5, goldMean: 623.4 };

  it("says you on one's own profile, the champion's name on a teammate's", () => {
    expect(opponentSentence(ten, { isOwn: true, champion: "Gwen", opponent: "Nasus" })).toBe("At 10:00 you had more gold than Nasus in 5 of 6 games with a timeline (+623 on average).");
    expect(opponentSentence(ten, { isOwn: false, champion: "Gwen", opponent: "Nasus" })).toBe("At 10:00 Gwen had more gold than Nasus in 5 of 6 games with a timeline (+623 on average).");
    expect(opponentFootLine({ isOwn: true, known: 14, games: 14 })).toBe("Lane opponent: the enemy Riot placed in your position.");
    expect(opponentFootLine({ isOwn: false, known: 12, games: 14 })).toBe("Lane opponent: the enemy Riot placed in their position. Known in 12 of 14 games.");
    expect(viewerWords(false)).toEqual({ subject: "they", possessive: "their" });
  });

  it("gives no sentence below 5 games with a timeline", () => {
    expect(opponentSentence({ games: 4, ahead: 4, goldMean: 300 }, { isOwn: true, champion: "Gwen", opponent: "Nasus" })).toBeNull();
    expect(opponentSentence(null, { isOwn: true, champion: "Gwen", opponent: "Nasus" })).toBeNull();
  });
});

describe("an opponent's KDA over its games", () => {
  it("adds up each game's K/D/A, averages a game beside it, and skips games without figures", () => {
    const k = pairingKda([
      { kills: 4, deaths: 2, assists: 9 },
      { kills: 7, deaths: 4, assists: 7 },
      { kills: null, deaths: null, assists: null },
    ])!;
    expect(k.games).toBe(2);
    expect(k.ratio).toBeCloseTo(27 / 6, 6);
    expect([k.kills, k.deaths, k.assists]).toEqual([5.5, 3, 8]);
    expect(k.perfect).toBe(false);
  });
  it("is perfect without a death, the kills and assists a game", () => {
    expect(pairingKda([{ kills: 3, deaths: 0, assists: 5 }, { kills: 1, deaths: 0, assists: 1 }])).toMatchObject({ perfect: true, ratio: 5 });
  });
  it("is null, never zero, when no game has its figures", () => {
    expect(pairingKda([])).toBeNull();
    expect(pairingKda([{ kills: 2, deaths: null, assists: 1 }])).toBeNull();
  });
});
