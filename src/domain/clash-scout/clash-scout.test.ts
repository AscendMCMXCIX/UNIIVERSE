import { describe, expect, it } from "vitest";
import { cleanName, hasNonLatin, isLabelOrFigure, nameSimilarity, parseGames, parseKda, parseMasteryLevel, parseMasteryPoints, parseRank, parseWinRate } from "./text";
import { readScreenshot, type OcrWord } from "./layout";
import { mergeScreenshot, clearKind, pairColumns } from "./merge";
import { applyVerification, formatPoints, formatRank, needsCheck, removeVerification, setPlatform, setPlayerName } from "./edit";
import { multiSearchText, riotIdDraft, verifiedProfileUrl } from "./links";
import { parseScoutContent } from "./schema";
import { decodePrints, encodePrints, matchChampion, printOf, type Rgba } from "./champion-print";
import { rereadName, type OcrEngine } from "./recognize";
import { emptyContent, type ScoutContent } from "./types";

/*
  Clash Scout's recognition logic without OCR (fast, in CI): reading figures and names from text,
  laying words out into five players, pairing the two screenshots, the member's corrections and
  the account rules. Real OCR on synthetic screenshots is tests/clash/recognition.test.ts.
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
    expect(parseRank("Golden Owls")).toBeNull();
  });

  it("reads a figure only from text that clearly is one, never guessing", () => {
    expect(parseWinRate("63% · 41 games")).toBe(63);
    expect(parseWinRate("63 games")).toBeNull();
    expect(parseWinRate("163%")).toBeNull();
    expect(parseGames("63% · 41 games")).toBe(41);
    expect(parseGames("25W 16L")).toBe(41);
    expect(parseGames("41")).toBeNull();
    expect(parseKda("3.21 KDA")).toBe(3.21);
    expect(parseKda("KDA 2,40")).toBe(2.4);
    expect(parseKda("321 KDA")).toBeNull();
  });

  it("reads mastery points without the level's digit", () => {
    expect(parseMasteryPoints("Mastery 7 512,345 pts")).toBe(512345);
    expect(parseMasteryPoints("Mastery 7")).toBeNull();
    expect(parseMasteryPoints("1,204,400 pts")).toBe(1204400);
    expect(parseMasteryPoints("843K")).toBe(843000);
    expect(parseMasteryPoints("1.2M")).toBe(1200000);
    expect(parseMasteryLevel("Mastery 7 512,345 pts")).toBe(7);
    expect(parseMasteryLevel("Lv. 12")).toBe(12);
    expect(parseMasteryLevel("512,345 pts")).toBeNull();
  });

  it("tells labels and figures from names", () => {
    expect(isLabelOrFigure("CLASH · RANKED")).toBe(true);
    expect(isLabelOrFigure("Ranked Solo/Duo")).toBe(true);
    expect(isLabelOrFigure("63% · 41 games")).toBe(true);
    expect(isLabelOrFigure("Пётр Пустота")).toBe(false);
    expect(isLabelOrFigure("xX_Sn1per_Xx")).toBe(false);
  });
});

describe("names", () => {
  it("keeps every script exactly, removing only OCR artefacts", () => {
    expect(cleanName("  “Пётр Пустота”  ")).toBe("Пётр Пустота");
    expect(cleanName("我 是 大 魔王")).toBe("我是大魔王");
    expect(cleanName("ドラ ゴン の 心")).toBe("ドラゴンの心");
    expect(cleanName("오징어 게임")).toBe("오징어게임");
    expect(cleanName("Mr Fox |")).toBe("Mr Fox");
    expect(cleanName("éclair")).toBe("éclair");
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

  it("reads a name again in other scripts when English is unsure, keeping the reading the others agree with", async () => {
    const answers: Record<string, { text: string; confidence: number }> = {
      eng: { text: "XX_Snlper Xx", confidence: 85 },
      rus: { text: "хХ_$5п1рег_Хх", confidence: 45 },
      kor: { text: "×× 50100 ××", confidence: 33 },
      jpn: { text: "xX_Sn1per_Xx", confidence: 81 },
      chi_sim: { text: "XxX_Sn1per_Xx", confidence: 58 },
    };
    const engine: OcrEngine = { words: async () => [], line: async (_r, _s, lang) => answers[lang]! };
    const box = { x: 0, y: 0, width: 100, height: 20 };
    expect(await rereadName(engine, { text: "XX", confidence: 50, box })).toEqual({ text: "xX_Sn1per_Xx", confidence: 81 });
    // A confident English reading stands without trying the others.
    const tried: string[] = [];
    const sure: OcrEngine = { words: async () => [], line: async (_r, _s, lang) => (tried.push(lang), { text: "Night Owls Gaming", confidence: 94 }) };
    expect(await rereadName(sure, { text: "Night", confidence: 60, box })).toEqual({ text: "Night Owls Gaming", confidence: 94 });
    expect(tried).toEqual(["eng"]);
  });
});

/** OCR words for a synthetic ranked screen: five columns 300 px wide. */
function rankedWords(names: string[]): OcrWord[] {
  const w = (text: string, x: number, y: number, confidence = 90): OcrWord => ({ text, confidence, box: { x, y, width: text.length * 9, height: 18 } });
  const out: OcrWord[] = [w("CLASH", 60, 20), w("RANKED", 130, 20), w("Night", 60, 50, 95), w("Owls", 120, 50, 95)];
  // The title is the tallest header line.
  out[2]!.box.height = out[3]!.box.height = 30;
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
const portraitsFor = (n: number) => Array.from({ length: n }, (_, i) => [0, 1].map((row) => ({ box: { x: 60 + i * 300, y: 236 + row * 90, width: 58, height: 58 }, match: { championId: row ? "Akali" : "Ahri", score: 0.95, confident: true } }))).flat();

describe("laying a screenshot out into five players", () => {
  it("finds the screen's kind, the opponent, and each column's name, rank and champions", () => {
    const names = ["Пётр", "오징어게임", "ドラゴンの心", "我是大魔王", "Sniper"];
    const read = readScreenshot({ width: 1600, height: 900, words: rankedWords(names), portraits: portraitsFor(5) });
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
    expect(read.columns.every((c) => c.ranked.length === 0 && c.mastery.length === 0 && c.rank === null)).toBe(true);
  });
});

const content5 = (names: string[]): ScoutContent => {
  const c = emptyContent("oc1");
  return { ...c, players: c.players.map((p, i) => ({ ...p, name: names[i] ?? "", nameCertainty: names[i] ? "high" : "manual" })) };
};
const readOf = (names: Array<string | null>, kind: "ranked" | "mastery") =>
  ({
    kind,
    kindSure: true,
    opponent: null,
    columns: names.map((n, slot) => ({ slot, name: n ? { text: n, confidence: 90, box: { x: 0, y: 0, width: 1, height: 1 } } : null, rank: null, ranked: kind === "ranked" ? [{ championId: "Ahri", games: 10, winRate: 50, kda: 2, certainty: "high" as const }] : [], mastery: kind === "mastery" ? [{ championId: "Ahri", level: 7, points: 1000 + slot, certainty: "high" as const }] : [] })),
  }) as const;

describe("pairing the two screenshots", () => {
  it("fills an empty scout from the first screenshot", () => {
    const r = mergeScreenshot(emptyContent("oc1"), readOf(["A1", "B2", "C3", "D4", "E5"], "ranked"), "ranked");
    expect(r.notes).toEqual([]);
    expect(r.content.players.map((p) => [p.name, p.nameCertainty, p.ranked.length])).toEqual([
      ["A1", "high", 1],
      ["B2", "high", 1],
      ["C3", "high", 1],
      ["D4", "high", 1],
      ["E5", "high", 1],
    ]);
  });

  it("pairs players by name when the second screenshot lists them in another order", () => {
    const base = content5(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
    const read = readOf(["Bravo", "Alpha", "Charlie", "Delta", "Echo"], "mastery");
    expect(pairColumns(base.players, read)).toEqual([1, 0, 2, 3, 4]);
    const merged = mergeScreenshot(base, read, "mastery").content;
    expect(merged.players[0]!.mastery[0]!.points).toBe(1001);
    expect(merged.players[1]!.mastery[0]!.points).toBe(1000);
  });

  it("flags a name the two screenshots disagree on, keeping the first reading", () => {
    const base = content5(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
    const r = mergeScreenshot(base, readOf(["Alpha", "Bravo", "Zzzzzz", "Delta", "Echo"], "mastery"), "mastery");
    expect(r.notes).toEqual([{ slot: 2, message: "The mastery screenshot reads this name as “Zzzzzz”." }]);
    expect(r.content.players[2]).toMatchObject({ name: "Charlie", nameCertainty: "low" });
  });

  it("replaces one screenshot's data without touching the other's or the member's corrections", () => {
    let c = mergeScreenshot(emptyContent("oc1"), readOf(["A1", "B2", "C3", "D4", "E5"], "ranked"), "ranked").content;
    c = mergeScreenshot(c, readOf(["A1", "B2", "C3", "D4", "E5"], "mastery"), "mastery").content;
    c = setPlayerName(c, 0, "Corrected");
    c = mergeScreenshot(clearKind(c, "mastery"), readOf(["A1", "B2", "C3", "D4", "E5"], "mastery"), "mastery").content;
    expect(c.players[0]!.name).toBe("Corrected");
    expect(c.players.every((p) => p.ranked.length === 1 && p.mastery.length === 1)).toBe(true);
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
    expect(multiSearchText(verified.players)).toBe("Пётр Пустота#RU1, B, C, D, E");
  });

  it("drops a verification when the name changes, the server changes, or the member says it is not the account", () => {
    expect(setPlayerName(verified, 0, "Someone else").players[0]).toMatchObject({ verification: "unverified", riotId: null, puuid: null });
    expect(setPlayerName(verified, 0, "Пётр Пустота").players[0]!.verification).toBe("verified");
    const moved = setPlatform(verified, "euw1");
    expect(moved.cleared).toBe(1);
    expect(moved.content.players[0]!.verification).toBe("unverified");
    expect(removeVerification(verified, 0).players[0]!.puuid).toBeNull();
  });

  it("marks what deserves a check", () => {
    const c = content5(["A", "B", "C", "D", "E"]);
    c.players[0] = { ...c.players[0]!, nameCertainty: "low", ranked: [{ championId: null, games: 1, winRate: 50, kda: null, certainty: "low" }] };
    expect(needsCheck(c.players[0]!)).toEqual({ name: true, champions: 1 });
    expect(needsCheck(c.players[1]!)).toEqual({ name: false, champions: 0 });
  });

  it("formats ranks and points compactly", () => {
    expect(formatRank({ tier: "GOLD", division: "II", lp: 54 })).toBe("Gold II · 54 LP");
    expect(formatRank({ tier: "UNRANKED", division: null, lp: null })).toBe("Unranked");
    expect(formatPoints(98120)).toBe("98.1k");
    expect(formatPoints(512345)).toBe("512k");
    expect(formatPoints(1204400)).toBe("1.20M");
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
});

describe("champion portraits", () => {
  const picture = (seed: number): Rgba => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) data.set([(i * seed) % 255, (i * 7 + seed * 40) % 255, (seed * 90 + (i >> 6) * 3) % 255, 255], i * 4);
    return { width: 64, height: 64, data };
  };

  it("matches a portrait to its champion and survives encoding for the browser", () => {
    const prints = decodePrints(encodePrints({ version: "t", ids: ["A", "B", "C"], prints: [1, 2, 3].map((s) => printOf(picture(s))) }));
    expect(matchChampion(printOf(picture(2)), prints)).toMatchObject({ championId: "B", confident: true });
  });
});
