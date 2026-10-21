import { describe, expect, it } from "vitest";
import { cleanName, hasNonLatin, isLabelOrFigure, isTimer, nameShape, nameSimilarity, parseGames, parseKda, parseMasteryLevel, parseMasteryPoints, parseRank, parseWinRate } from "./text";
import { readScreenshot, type ColumnRead, type OcrWord, type ScreenshotRead } from "./layout";
import { mergeScreenshot, clearKind, nameFromReads, pairColumns } from "./merge";
import { applyVerification, confirmPlayerName, formatPoints, formatRank, nameAlternatives, nameSource, needsCheck, removeVerification, setPlatform, setPlayerName, setRank, setRankedChampions } from "./edit";
import { riotIdDraft, verifiedProfileUrl } from "./links";
import { parseScoutContent } from "./schema";
import { decodePrints, encodePrints, matchCertainty, matchChampion, printOf, type Rgba } from "./champion-print";
import { readName, type OcrEngine, type OcrLanguage } from "./recognize";
import { emptyContent, type ScoutContent } from "./types";

/*
  Clash Scout's recognition logic without OCR (fast, in CI): reading figures and names from text,
  laying words out into five players, pairing the two screenshots and deciding each name from
  their readings, the member's corrections and the account rules. The layout on real client
  screenshots is layout.test.ts; real OCR is tests/clash.
*/

describe("figures read from text", () => {
  it("reads ranks, including OCR's usual confusions in the division", () => {
    expect(parseRank("Gold II · 54 LP")).toEqual({ tier: "GOLD", division: "II", lp: 54 });
    expect(parseRank("Platinum | 87 LP")).toEqual({ tier: "PLATINUM", division: "I", lp: 87 });
    expect(parseRank("Diamond Ill - 3 LP")).toEqual({ tier: "DIAMOND", division: "III", lp: 3 });
    expect(parseRank("EMERALD 4 12LP")).toEqual({ tier: "EMERALD", division: "IV", lp: 12 });
    expect(parseRank("Grandmaster 512 LP")).toEqual({ tier: "GRANDMASTER", division: null, lp: 512 });
    expect(parseRank("Master · 213 LP")).toEqual({ tier: "MASTER", division: null, lp: 213 });
    expect(parseRank("Unranked")).toEqual({ tier: "UNRANKED", division: null, lp: null });
    expect(parseRank("PLATINUM 11")).toEqual({ tier: "PLATINUM", division: "II", lp: null });
    expect(parseRank("Golden Owls")).toBeNull();
  });

  it("reads a figure only from text that clearly is one, never guessing", () => {
    expect(parseWinRate("63% · 41 games")).toBe(63);
    expect(parseWinRate("63 games")).toBeNull();
    expect(parseWinRate("163%")).toBeNull();
    // A misread "%" ("52%" read as "529%" or "5296") gives nothing rather than a wrong figure.
    expect(parseWinRate("529% - 33 games")).toBeNull();
    expect(parseWinRate("5296 - 52 games")).toBeNull();
    expect(parseGames("63% · 41 games")).toBe(41);
    expect(parseGames("25W 16L")).toBe(41);
    // The client's own way: the games in brackets after the win rate.
    expect(parseGames("50% (2)")).toBe(2);
    expect(parseGames("41")).toBeNull();
    expect(parseKda("3.21 KDA")).toBe(3.21);
    expect(parseKda("KDA 2,40")).toBe(2.4);
    expect(parseKda("321 KDA")).toBeNull();
  });

  it("reads mastery points without the level's digit, and levels past 100", () => {
    expect(parseMasteryPoints("Mastery 7 512,345 pts")).toBe(512345);
    expect(parseMasteryPoints("Mastery 7")).toBeNull();
    expect(parseMasteryPoints("1,204,400 pts")).toBe(1204400);
    expect(parseMasteryPoints("843K")).toBe(843000);
    expect(parseMasteryPoints("1.2M")).toBe(1200000);
    // The client's "175.4 k pts", also when OCR loses the decimal point.
    expect(parseMasteryPoints("175.4 k pts")).toBe(175400);
    expect(parseMasteryPoints("122 9 k pts")).toBe(122900);
    expect(parseMasteryLevel("Mastery 7 512,345 pts")).toBe(7);
    expect(parseMasteryLevel("Lv. 12")).toBe(12);
    expect(parseMasteryLevel("Lv 105")).toBe(105);
    // The crest before "Lv" read as letters.
    expect(parseMasteryLevel("WF oLv 11")).toBe(11);
    expect(parseMasteryLevel("512,345 pts")).toBeNull();
  });

  it("tells labels, timers and figures from names", () => {
    expect(isLabelOrFigure("CLASH · RANKED")).toBe(true);
    expect(isLabelOrFigure("Ranked Solo/Duo")).toBe(true);
    expect(isLabelOrFigure("TOTAL MASTERY")).toBe(true);
    expect(isLabelOrFigure("TIER III")).toBe(true);
    expect(isLabelOrFigure("TIER 111")).toBe(true);
    expect(isLabelOrFigure("63% · 41 games")).toBe(true);
    expect(isLabelOrFigure("GENERAL (7/31)")).toBe(true);
    expect(isTimer("4m 37s")).toBe(true);
    expect(isTimer("4M 12S")).toBe(true);
    expect(isTimer("12:34")).toBe(true);
    expect(nameShape("4m 37s")).toBe(0);
    expect(isLabelOrFigure("Пётр Пустота")).toBe(false);
    expect(isLabelOrFigure("xX_Sn1per_Xx")).toBe(false);
    expect(isLabelOrFigure("Jettos")).toBe(false);
    expect(nameShape("Kye")).toBe(1);
  });
});

describe("names", () => {
  it("keeps every script exactly, removing only OCR artefacts", () => {
    expect(cleanName("  “Пётр Пустота”  ")).toBe("Пётр Пустота");
    expect(cleanName("我 是 大 魔王")).toBe("我是大魔王");
    expect(cleanName("ドラ ゴン の 心")).toBe("ドラゴンの心");
    expect(cleanName("오징어 게임")).toBe("오징어게임");
    expect(cleanName("Mr Fox |")).toBe("Mr Fox");
    expect(cleanName("éclair")).toBe("éclair");
  });

  it("knows when a name needs more than English to read", () => {
    expect(hasNonLatin("Пётр")).toBe(true);
    expect(hasNonLatin("我是")).toBe(true);
    expect(hasNonLatin("Zoë")).toBe(false);
    expect(hasNonLatin("xX_Sn1per_Xx")).toBe(false);
  });

  it("compares names for pairing only (case and spaces aside)", () => {
    expect(nameSimilarity("xX_Sn1per_Xx", "XX_Sn1per_Xx")).toBe(1);
    expect(nameSimilarity("Пётр Пустота", "Пётр Пустота")).toBe(1);
    expect(nameSimilarity("Пётр Пустота", "오징어게임")).toBe(0);
  });

  /** An OCR engine answering a name's crop with fixed readings per language. */
  const engineFor = (answers: Partial<Record<OcrLanguage, { text: string; confidence: number }>>, tried: string[] = []): OcrEngine => ({
    words: async () => [],
    read: async (_image, _mode, lang) => {
      tried.push(lang);
      const a = answers[lang];
      return a ? { ...a, lines: [], words: [] } : null;
    },
  });
  const crop: Rgba = { width: 1, height: 1, data: new Uint8ClampedArray(4) };

  it("reads a name again in other scripts when English is unsure, keeping the reading the others agree with", async () => {
    const engine = engineFor({
      eng: { text: "XX_Snlper Xx", confidence: 85 },
      rus: { text: "хХ_$5п1рег_Хх", confidence: 45 },
      kor: { text: "×× 50100 ××", confidence: 33 },
      jpn: { text: "xX_Sn1per_Xx", confidence: 81 },
      chi_sim: { text: "XxX_Sn1per_Xx", confidence: 58 },
    });
    expect(await readName(engine, crop, null)).toMatchObject({ text: "xX_Sn1per_Xx" });
  });

  it("keeps a confident English reading without trying the other scripts", async () => {
    const tried: string[] = [];
    expect(await readName(engineFor({ eng: { text: "Jettos", confidence: 95 } }, tried), crop, null)).toEqual({ text: "Jettos", confidence: 95 });
    expect(tried).toEqual(["eng"]);
  });

  it("keeps a name in another script exactly, even when English reads a lookalike", async () => {
    const engine = engineFor({ eng: { text: "Netp", confidence: 70 }, rus: { text: "Пётр", confidence: 93 } });
    expect(await readName(engine, crop, null)).toEqual({ text: "Пётр", confidence: 93 });
  });

  it("invents nothing when no reading looks like a name", async () => {
    expect(await readName(engineFor({ eng: { text: "4m 37s", confidence: 91 } }), crop, null)).toBeNull();
    expect(await readName(engineFor({}), crop, null)).toBeNull();
  });
});

/** OCR words for a synthetic ranked screen: five columns 300 px wide, with a banner, a timer and a friends list around them. */
function rankedWords(names: string[]): OcrWord[] {
  const w = (text: string, x: number, y: number, confidence = 90): OcrWord => ({ text, confidence, box: { x, y, width: text.length * 9, height: 18 } });
  // The team's name is the header's largest text.
  const title = (text: string, x: number): OcrWord => ({ text, confidence: 95, box: { x, y: 50, width: text.length * 20, height: 30 } });
  const out: OcrWord[] = [w("CLASH", 60, 20), w("RANKED", 130, 20), title("Night", 60), title("Owls", 170)];
  // Around the columns: a banner, the Clash schedule's timer and a friend in the friends list.
  out.push(w("SHOWTIME", 700, 20), w("4m", 1560, 50), w("37s", 1590, 50), w("Fennwick", 1560, 150), w("Online", 1560, 172));
  names.forEach((name, i) => {
    const x = 60 + i * 300;
    out.push(w(name, x, 150), w("Gold", x, 180), w("II", x + 45, 180), w("54", x + 70, 180), w("LP", x + 95, 180));
    [0, 1].forEach((row) => {
      const y = 240 + row * 90;
      out.push(w(`${60 + row}%`, x + 70, y), w("41", x + 120, y), w("games", x + 145, y), w("3.21", x + 70, y + 22), w("KDA", x + 110, y + 22));
    });
  });
  return out;
}
const portraitsFor = (n: number) => Array.from({ length: n }, (_, i) => [0, 1].map((row) => ({ box: { x: 60 + i * 300, y: 236 + row * 90, width: 58, height: 58 }, match: { championId: row ? "Akali" : "Ahri", score: 0.95, runnerUp: 0.5, certainty: "high" as const } }))).flat();

describe("laying a screenshot out into five players", () => {
  it("finds the screen's kind, the opponent, and each column's name, rank and champions; nothing around the columns is a player", () => {
    const names = ["Пётр", "오징어게임", "ドラゴンの心", "我是大魔王", "Sniper"];
    const read = readScreenshot({ width: 1700, height: 900, words: rankedWords(names), portraits: portraitsFor(5) });
    expect(read.kind).toBe("ranked");
    expect(read.kindSure).toBe(true);
    expect(read.opponent?.text).toBe("Night Owls");
    expect(read.columns.map((c) => c.name?.text)).toEqual(names);
    for (const c of read.columns) {
      expect(c.rank).toEqual({ tier: "GOLD", division: "II", lp: 54 });
      expect(c.ranked.map((r) => [r.championId, r.winRate, r.games, r.kda])).toEqual([
        ["Ahri", 60, 41, 3.21],
        ["Akali", 61, 41, 3.21],
      ]);
    }
  });

  it("gives nothing for an image without Clash's screens (no kind, no invented players)", () => {
    const read = readScreenshot({ width: 800, height: 600, words: [{ text: "Hello", confidence: 90, box: { x: 10, y: 10, width: 50, height: 20 } }], portraits: [] });
    expect(read.kind).toBeNull();
    expect(read.layout).toBeNull();
    expect(read.columns.every((c) => c.name === null && c.ranked.length === 0 && c.mastery.length === 0 && c.rank === null)).toBe(true);
  });
});

const content5 = (names: string[]): ScoutContent => {
  const c = emptyContent("oc1");
  return { ...c, players: c.players.map((p, i) => ({ ...p, name: names[i] ?? "", nameCertainty: names[i] ? "high" : "manual" })) };
};
const column = (slot: number, name: string | null, kind: "ranked" | "mastery", confidence = 90): ColumnRead => ({
  slot,
  name: name ? { text: name, confidence, box: { x: 0, y: 0, width: 1, height: 1 } } : null,
  rank: kind === "ranked" ? { tier: "GOLD", division: "II", lp: null } : null,
  rankLine: null,
  rankSure: true,
  totalMastery: kind === "mastery" ? 500 + slot : null,
  ranked: kind === "ranked" ? [{ championId: "Ahri", games: 10, winRate: 50, kda: 2, certainty: "high" }] : [],
  mastery: kind === "mastery" ? [{ championId: "Ahri", level: 7, points: 1000 + slot, certainty: "high" }] : [],
});
const readOf = (names: Array<string | null>, kind: "ranked" | "mastery", confidence = 90): ScreenshotRead => ({
  kind,
  kindSure: true,
  opponent: null,
  layout: null,
  rows: [],
  columns: names.map((n, slot) => column(slot, n, kind, confidence)),
});

describe("pairing the two screenshots and deciding each name", () => {
  it("fills an empty scout from the first screenshot, keeping each reading", () => {
    const r = mergeScreenshot(emptyContent("oc1"), readOf(["A1", "B2", "C3", "D4", "E5"], "ranked"), "ranked");
    expect(r.disagreements).toBe(0);
    expect(r.content.players.map((p) => [p.name, p.nameCertainty, p.ranked.length, p.rankCertainty])).toEqual([
      ["A1", "high", 1, "high"],
      ["B2", "high", 1, "high"],
      ["C3", "high", 1, "high"],
      ["D4", "high", 1, "high"],
      ["E5", "high", 1, "high"],
    ]);
    expect(r.content.players[0]!.nameReads).toEqual({ ranked: { text: "A1", confidence: 90 } });
  });

  it("pairs players by name when the second screenshot lists them in another order", () => {
    const base = content5(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
    const read = readOf(["Bravo", "Alpha", "Charlie", "Delta", "Echo"], "mastery");
    expect(pairColumns(base.players, read)).toEqual([1, 0, 2, 3, 4]);
    const merged = mergeScreenshot(base, read, "mastery");
    expect(merged.order).toEqual([1, 0, 2, 3, 4]);
    expect(merged.content.players[0]!.mastery[0]!.points).toBe(1001);
    expect(merged.content.players[1]!.mastery[0]!.points).toBe(1000);
    expect(merged.content.players[0]!.totalMastery).toBe(501);
  });

  it("trusts a name both screenshots read the same, even when each reading alone was unsure", () => {
    let c = mergeScreenshot(emptyContent("oc1"), readOf(["Jettos", "Kye", "Hai", "Green", "Oliver"], "ranked", 72), "ranked").content;
    expect(c.players.every((p) => p.nameCertainty === "low")).toBe(true);
    c = mergeScreenshot(c, readOf(["Jettos", "Kye", "Hai", "Green", "Oliver"], "mastery", 75), "mastery").content;
    expect(c.players.map((p) => [p.name, p.nameCertainty])).toEqual([
      ["Jettos", "high"],
      ["Kye", "high"],
      ["Hai", "high"],
      ["Green", "high"],
      ["Oliver", "high"],
    ]);
  });

  it("marks a name the two screenshots disagree on, keeping the surer reading and offering the other", () => {
    let c = mergeScreenshot(emptyContent("oc1"), readOf(["Alpha", "Bravo", "Charlie", "Delta", "xX_Sn1per_Xx"], "ranked", 70), "ranked").content;
    const mastery = readOf(["Alpha", "Bravo", "Charlie", "Delta", "xX_Snlper_Xx"], "mastery", 70);
    mastery.columns[4]!.name!.confidence = 88;
    const r = mergeScreenshot(c, mastery, "mastery");
    c = r.content;
    expect(r.disagreements).toBe(0); // a letter apart: the same player, read differently
    expect(c.players[4]).toMatchObject({ name: "xX_Snlper_Xx", nameCertainty: "low" });
    expect(nameSource(c.players[4]!)).toBe("check");
    expect(nameAlternatives(c.players[4]!)).toEqual(["xX_Sn1per_Xx"]);
    // The member picks the other reading: it stands, and counts as confirmed (a screenshot read it so).
    c = setPlayerName(c, 4, "xX_Sn1per_Xx");
    expect(nameSource(c.players[4]!)).toBe("confirmed");
  });

  it("notices when most names differ: the screenshots may show different teams", () => {
    const c = mergeScreenshot(emptyContent("oc1"), readOf(["Alpha", "Bravo", "Charlie", "Delta", "Echo"], "ranked"), "ranked").content;
    expect(mergeScreenshot(c, readOf(["Zulu", "Yankee", "Xray", "Whiskey", "Victor"], "mastery"), "mastery").disagreements).toBe(5);
  });

  it("never overwrites what a member set: a corrected name, a chosen rank, an edited row", () => {
    let c = mergeScreenshot(emptyContent("oc1"), readOf(["A1", "B2", "C3", "D4", "E5"], "ranked"), "ranked").content;
    c = setPlayerName(c, 0, "Corrected");
    c = setRank(c, 1, { tier: "DIAMOND", division: "I", lp: null });
    c = setRankedChampions(c, 2, [{ ...c.players[2]!.ranked[0]!, winRate: 55 }]);
    // The ranked screenshot again (replaced by a newer one), then the mastery one.
    c = mergeScreenshot(c, readOf(["Other", "B2", "C3", "D4", "E5"], "ranked"), "ranked").content;
    c = mergeScreenshot(c, readOf(["A-one", "B2", "C3", "D4", "E5"], "mastery"), "mastery").content;
    expect(c.players[0]).toMatchObject({ name: "Corrected", nameCertainty: "manual" });
    expect(nameSource(c.players[0]!)).toBe("corrected");
    expect(c.players[1]).toMatchObject({ rank: { tier: "DIAMOND", division: "I", lp: null }, rankCertainty: "manual" });
    expect(c.players[2]!.ranked).toEqual([{ championId: "Ahri", games: 10, winRate: 55, kda: 2, certainty: "manual" }]);
    expect(c.players.every((p) => p.mastery.length === 1)).toBe(true);
  });

  it("replacing a screenshot replaces only its own readings; removing it removes them", () => {
    let c = mergeScreenshot(emptyContent("oc1"), readOf(["A1", "B2", "C3", "D4", "E5"], "ranked"), "ranked").content;
    c = mergeScreenshot(c, readOf(["A1", "B2", "C3", "D4", "E5"], "mastery"), "mastery").content;
    // A newer ranked screenshot that reads the first name differently: the name follows the surer reading, marked.
    c = mergeScreenshot(c, readOf(["A7", "B2", "C3", "D4", "E5"], "ranked", 95), "ranked").content;
    expect(c.players[0]).toMatchObject({ name: "A7", nameCertainty: "low" });
    // Removing it: back to the mastery screenshot's reading, and no rank or ranked rows left.
    c = clearKind(c, "ranked");
    expect(c.players[0]).toMatchObject({ name: "A1", nameCertainty: "high", rank: null, ranked: [] });
    expect(c.players[0]!.mastery).toHaveLength(1);
    // And removing the other: nothing read is left, and the names go with it.
    c = clearKind(c, "mastery");
    expect(c.players.map((p) => [p.name, p.mastery.length, p.totalMastery])).toEqual(Array(5).fill(["", 0, null]));
  });

  it("decides the opponent's name from both screenshots like a player's", () => {
    const ranked = { ...readOf(["A", "B", "C", "D", "E"], "ranked"), opponent: { text: "WTF", confidence: 83, box: { x: 0, y: 0, width: 1, height: 1 } } };
    const mastery = { ...readOf(["A", "B", "C", "D", "E"], "mastery"), opponent: { text: "WTF", confidence: 80, box: { x: 0, y: 0, width: 1, height: 1 } } };
    let c = mergeScreenshot(emptyContent("oc1"), ranked, "ranked").content;
    expect(c).toMatchObject({ opponentName: "WTF", opponentCertainty: "low" });
    c = mergeScreenshot(c, mastery, "mastery").content;
    expect(c).toMatchObject({ opponentName: "WTF", opponentCertainty: "high" });
  });

  it("keeps names in every script exactly as read", () => {
    const names = ["Пётр Пустота", "오징어게임", "ドラゴンの心", "我是大魔王", "Zoë"];
    const c = mergeScreenshot(emptyContent("oc1"), readOf(names, "ranked"), "ranked").content;
    expect(c.players.map((p) => p.name)).toEqual(names);
  });

  it("decides a name from its readings", () => {
    expect(nameFromReads(undefined)).toEqual({ name: "", certainty: "manual" });
    expect(nameFromReads({ ranked: { text: "Kye", confidence: 91 } })).toEqual({ name: "Kye", certainty: "high" });
    expect(nameFromReads({ ranked: { text: "Kye", confidence: 70 } })).toEqual({ name: "Kye", certainty: "low" });
    expect(nameFromReads({ ranked: { text: "Kye", confidence: 78 }, mastery: { text: "kye", confidence: 66 } })).toEqual({ name: "Kye", certainty: "high" });
    // Agreeing but both unsure: the same OCR repeats its own confusions, so it stays marked.
    expect(nameFromReads({ ranked: { text: "xX_Sn1per_Xx", confidence: 62 }, mastery: { text: "xX_Sn1per_Xx", confidence: 62 } })).toEqual({ name: "xX_Sn1per_Xx", certainty: "low" });
    expect(nameFromReads({ ranked: { text: "Kye", confidence: 96 }, mastery: { text: "Kve", confidence: 60 } })).toEqual({ name: "Kye", certainty: "low" });
  });
});

describe("corrections in the cards", () => {
  it("labels where each name comes from", () => {
    let c = mergeScreenshot(emptyContent("oc1"), readOf(["Sure", "Unsure", null, "C", "D"], "ranked"), "ranked").content;
    c = mergeScreenshot(c, readOf(["Sure", "Unsure", null, "C", "D"], "ranked", 70), "ranked").content;
    expect(nameSource(c.players[0]!)).toBe("check");
    c = confirmPlayerName(c, 0);
    expect(nameSource(c.players[0]!)).toBe("confirmed");
    c = setPlayerName(c, 1, "Fixed");
    expect(nameSource(c.players[1]!)).toBe("corrected");
    expect(nameAlternatives(c.players[1]!)).toEqual(["Unsure"]);
    expect(nameSource(c.players[2]!)).toBe("none");
    c = setPlayerName(c, 2, "Typed");
    expect(nameSource(c.players[2]!)).toBe("entered");
    c = applyVerification(c, 3, { riotId: "C#OCE", puuid: "p", proof: "s" });
    expect(nameSource(c.players[3]!)).toBe("verified");
  });

  it("makes only the rows a member changed theirs", () => {
    const c = mergeScreenshot(emptyContent("oc1"), { ...readOf(["A", "B", "C", "D", "E"], "ranked"), columns: readOf(["A", "B", "C", "D", "E"], "ranked").columns.map((col) => ({ ...col, ranked: [...col.ranked, { ...col.ranked[0]!, championId: "Annie" }] })) }, "ranked").content;
    const rows = c.players[0]!.ranked;
    const next = setRankedChampions(c, 0, [rows[0]!, { ...rows[1]!, kda: 3.5 }]).players[0]!.ranked;
    expect(next.map((r) => r.certainty)).toEqual(["high", "manual"]);
  });

  it("marks what deserves a check", () => {
    const c = content5(["A", "B", "C", "D", "E"]);
    c.players[0] = { ...c.players[0]!, nameCertainty: "low", rank: { tier: "GOLD", division: "I", lp: null }, rankCertainty: "low", ranked: [{ championId: null, games: 1, winRate: 50, kda: null, certainty: "low" }] };
    expect(needsCheck(c.players[0]!)).toEqual({ name: true, rank: true, rows: 1, champions: 1 });
    expect(needsCheck(c.players[1]!)).toEqual({ name: false, rank: false, rows: 0, champions: 0 });
  });
});

describe("accounts, verification and links", () => {
  const verified = applyVerification(content5(["Пётр", "B", "C", "D", "E"]), 0, { riotId: "Пётр Пустота#RU1", puuid: "p-1", proof: "sig" });

  it("verifies only with Riot's answer, and uses Riot's spelling of the name", () => {
    expect(verified.players[0]).toMatchObject({ name: "Пётр Пустота", verification: "verified", riotId: "Пётр Пустота#RU1", puuid: "p-1" });
  });

  it("links a profile only for a verified account, never from a name", () => {
    expect(verifiedProfileUrl(verified.players[0]!, "ru")).toBe("https://op.gg/lol/summoners/ru/%D0%9F%D1%91%D1%82%D1%80%20%D0%9F%D1%83%D1%81%D1%82%D0%BE%D1%82%D0%B0-RU1");
    expect(verifiedProfileUrl(verified.players[1]!, "ru")).toBeNull();
    expect(verifiedProfileUrl({ verification: "unverified", riotId: "Name#TAG" }, "ru")).toBeNull();
  });

  it("never guesses a tag", () => {
    expect(riotIdDraft({ name: "Пётр", riotId: null })).toBe("Пётр#");
  });

  it("drops a verification when the name changes, the server changes, or the member says it is not the account", () => {
    expect(setPlayerName(verified, 0, "Someone else").players[0]).toMatchObject({ verification: "unverified", riotId: null, puuid: null });
    expect(setPlayerName(verified, 0, "Пётр Пустота").players[0]!.verification).toBe("verified");
    const moved = setPlatform(verified, "euw1");
    expect(moved.cleared).toBe(1);
    expect(moved.content.players[0]!.verification).toBe("unverified");
    expect(removeVerification(verified, 0).players[0]!.puuid).toBeNull();
  });

  it("a screenshot never verifies anyone", () => {
    const c = mergeScreenshot(emptyContent("oc1"), readOf(["A", "B", "C", "D", "E"], "ranked"), "ranked").content;
    expect(c.players.every((p) => p.verification === "unverified" && p.riotId === null && p.puuid === null)).toBe(true);
  });

  it("formats ranks and points compactly", () => {
    expect(formatRank({ tier: "GOLD", division: "II", lp: 54 })).toBe("Gold II · 54 LP");
    expect(formatRank({ tier: "UNRANKED", division: null, lp: null })).toBe("Unranked");
    expect(formatPoints(98120)).toBe("98.1k");
    expect(formatPoints(175400)).toBe("175.4k");
    expect(formatPoints(95000)).toBe("95k");
    expect(formatPoints(512345)).toBe("512.3k");
    expect(formatPoints(1204400)).toBe("1.2M");
  });
});

describe("what a browser may send", () => {
  it("accepts a well-formed scout and bounds everything else", () => {
    expect(parseScoutContent(emptyContent("oc1")).ok).toBe(true);
    expect(parseScoutContent({ ...emptyContent("oc1"), players: [] }).ok).toBe(false);
    expect(parseScoutContent({ ...emptyContent("oc1"), opponentName: "x".repeat(500) }).ok).toBe(false);
    expect(parseScoutContent({ ...emptyContent("oc1"), platform: "../etc" }).ok).toBe(false);
    const c = emptyContent("oc1");
    c.players[0] = { ...c.players[0]!, ranked: Array.from({ length: 50 }, () => ({ championId: "Ahri", games: 1, winRate: 1, kda: 1, certainty: "high" as const })) };
    expect(parseScoutContent(c).ok).toBe(false);
  });

  it("keeps the readings, rank certainty and total mastery, bounded; scouts saved before them still read", () => {
    const merged = mergeScreenshot(emptyContent("oc1"), readOf(["A", "B", "C", "D", "E"], "mastery"), "mastery").content;
    merged.players[0]!.mastery[0]!.level = 150;
    const parsed = parseScoutContent(JSON.parse(JSON.stringify(merged)));
    expect(parsed.ok && parsed.content.players[0]).toMatchObject({ nameReads: { mastery: { text: "A", confidence: 90 } }, totalMastery: 500, mastery: [{ level: 150 }] });
    const long = { ...merged, players: merged.players.map((p, i) => (i ? p : { ...p, nameReads: { ranked: { text: "x".repeat(200), confidence: 50 } } })) };
    expect(parseScoutContent(long).ok).toBe(false);
    // A scout saved before these fields existed.
    const old = emptyContent("oc1") as unknown as Record<string, unknown>;
    expect(parseScoutContent(old).ok).toBe(true);
    // Anything unknown is dropped, never stored.
    const extra = parseScoutContent({ ...emptyContent("oc1"), screenshot: "data:image/png;base64,AAAA" });
    expect(extra.ok && "screenshot" in extra.content).toBe(false);
  });
});

describe("champion portraits", () => {
  const picture = (seed: number): Rgba => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) data.set([(i * seed) % 255, (i * 7 + seed * 40) % 255, (seed * 90 + (i >> 6) * 3) % 255, 255], i * 4);
    return { width: 64, height: 64, data };
  };

  it("matches a portrait to its champion and survives encoding for the browser", () => {
    const prints = decodePrints(encodePrints({ version: "t", ids: ["A", "B", "C"], prints: [1, 2, 3].map((s) => printOf(picture(s))) }));
    expect(matchChampion(printOf(picture(2)), prints)).toMatchObject({ championId: "B", certainty: "high" });
  });

  it("refuses prints of another format (a browser's cached prints from before a change)", () => {
    const encoded = encodePrints({ version: "t", ids: ["A"], prints: [printOf(picture(1))] });
    expect(() => decodePrints({ ...encoded, format: 1 })).toThrow(/another format/);
    expect(() => decodePrints({ ...encoded, format: undefined })).toThrow(/another format/);
  });

  it("calls a match sure, a suggestion to check, or nothing, from its score and the runner-up's", () => {
    expect(matchCertainty(0.95, 0.6)).toBe("high");
    expect(matchCertainty(0.95, 0.85)).toBe("low");
    expect(matchCertainty(0.8, 0.6)).toBe("low");
    expect(matchCertainty(0.8, 0.75)).toBeNull();
    expect(matchCertainty(0.7, 0.2)).toBeNull();
  });
});
