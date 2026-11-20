import { describe, expect, it } from "vitest";
import { arrangeOpponents, opponentFootLine, opponentSentence, type OpponentTally } from "./champion-preview";
import { viewerWords } from "./viewer-words";

const o = (championId: string, games: number, wins: number, lastPlayedAt = 0): OpponentTally => ({ championId, games, wins, lastPlayedAt });

describe("the preview's lane opponents", () => {
  const all = [o("Nasus", 7, 1, 5), o("Garen", 2, 2, 9), o("Darius", 3, 3, 1), o("Sett", 1, 0, 3), o("Teemo", 5, 4, 2), o("Fiora", 4, 1, 4)];

  it("lists opponents from 3 games, folds 1–2, and sorts by most games by default", () => {
    const a = arrangeOpponents(all, "games");
    expect(a.listed.map((x) => x.championId)).toEqual(["Nasus", "Teemo", "Fiora", "Darius"]);
    expect(a.folded.map((x) => x.championId)).toEqual(["Garen", "Sett"]);
    expect(a.noneEstablished).toBe(false);
  });

  it("ranks 5+ games first for Best and Worst, then 3–4", () => {
    expect(arrangeOpponents(all, "best").listed.map((x) => x.championId)).toEqual(["Teemo", "Nasus", "Darius", "Fiora"]);
    expect(arrangeOpponents(all, "worst").listed.map((x) => x.championId)).toEqual(["Nasus", "Teemo", "Fiora", "Darius"]);
  });

  it("with no opponent at 3 games, lists them all (W/L only) and says so", () => {
    const a = arrangeOpponents([o("Garen", 2, 1, 1), o("Sett", 1, 0, 2)], "best");
    expect(a).toMatchObject({ noneEstablished: true, folded: [] });
    expect(a.listed.map((x) => x.championId)).toEqual(["Garen", "Sett"]);
    expect(arrangeOpponents([], "games").noneEstablished).toBe(false);
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
