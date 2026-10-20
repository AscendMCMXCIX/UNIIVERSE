import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodePng } from "@/server/images/png";
import type { Rgba } from "./champion-print";
import { findDividerSets } from "./grid";
import { crop, fingerprint, prepareForOcr, resize } from "./image";
import { readScreenshot, type OcrWord, type ScreenshotRead } from "./layout";
import { nameSimilarity } from "./text";

/*
  The layout on real League client screenshots, without OCR (fast, in CI). The fixtures are the
  two Clash scouting screens a member pasted (the friends list and the member's own name replaced
  by invented ones); the words are what Tesseract read in each, recorded once
  (tests/fixtures/clash/*.words.json). The dividing lines are found from the pixels themselves.
  Around the five columns the screenshots show everything that used to be read as players: the
  client's top bar, the team's header, the Clash schedule with its timer ("4M 12S") and a friends
  list full of names. Reading each field again from its own crop is tested with real OCR in
  tests/clash.
*/

const dir = path.resolve(__dirname, "../../../tests/fixtures/clash");
const NAMES = ["Jettos", "Kye", "Hai", "Green", "Oliver"];
/** What the two screenshots show (tests/fixtures/clash/client-expected.json). */
const TRUTH = JSON.parse(readFileSync(path.join(dir, "client-expected.json"), "utf8")) as {
  opponent: string;
  names: string[];
  ranks: Array<[string, string] | null>;
  totals: number[];
  ranked: Array<Array<[number, number, number]>>;
  mastery: Array<Array<[number, number]>>;
};
const FRIENDS = ["Wayfarer", "Fennwick", "Larkspur", "Mossy", "Ridge", "Talvi", "Quillon", "Brae", "Ostrander"];

function load(name: string): { image: Rgba; words: OcrWord[] } {
  const image = decodePng(readFileSync(path.join(dir, `${name}.png`)))!;
  const recorded = JSON.parse(readFileSync(path.join(dir, `${name}.words.json`), "utf8")) as Array<{ t: string; c: number; b: [number, number, number, number] }>;
  return { image, words: recorded.map((w) => ({ text: w.t, confidence: w.c, box: { x: w.b[0], y: w.b[1], width: w.b[2], height: w.b[3] } })) };
}
const scaled = (words: OcrWord[], f: number, dx = 0, dy = 0): OcrWord[] => words.map((w) => ({ ...w, box: { x: (w.box.x - dx) * f, y: (w.box.y - dy) * f, width: w.box.width * f, height: w.box.height * f } }));
const readOf = (image: Rgba, words: OcrWord[]): ScreenshotRead => readScreenshot({ width: image.width, height: image.height, words, portraits: [], dividers: findDividerSets(image) });

/**
 * Each column's name, as the whole screen read it, is its own player's (perhaps imperfect: it is read
 * again from its own crop), or nothing: never a friend's, a timer or a label.
 */
function expectOwnNames(read: ScreenshotRead) {
  const names = read.columns.map((c) => c.name?.text ?? null);
  names.forEach((n, i) => {
    if (n !== null) expect(nameSimilarity(n, NAMES[i]!), `${n} in column ${i + 1}`).toBeGreaterThanOrEqual(0.6);
    expect(FRIENDS.some((f) => n?.includes(f))).toBe(false);
  });
  expect(names.filter(Boolean).length).toBeGreaterThanOrEqual(4);
}

const ranked = load("client-ranked-1080");
const mastery = load("client-mastery-1080");

describe("the client's own screenshots", () => {
  it("finds the five columns from the client's dividing lines", () => {
    const [best] = findDividerSets(ranked.image);
    [333, 636, 939, 1242].forEach((x, i) => expect(Math.abs(best!.xs[i]! - x)).toBeLessThanOrEqual(3));
    const read = readOf(ranked.image, ranked.words);
    expect(read.layout?.source).toBe("dividers");
    const columns = read.layout!.columns;
    expect(columns).toHaveLength(5);
    // Nothing right of the fifth column (the Clash schedule and the friends list) is a player's.
    expect(columns[4]!.x1).toBeLessThan(1584);
    expect(columns[0]!.x0).toBeGreaterThan(0);
  });

  it("finds the names' row under the team's header, and takes names from it only", () => {
    for (const shot of [ranked, mastery]) {
      const read = readOf(shot.image, shot.words);
      const band = read.layout!.nameBand;
      expect(band.found).toBe(true);
      expect(band.y0).toBeGreaterThan(355);
      expect(band.y1).toBeLessThan(395);
      expectOwnNames(read);
    }
  });

  it("tells the two screens apart, and reads the team's name from the header", () => {
    const r = readOf(ranked.image, ranked.words);
    const m = readOf(mastery.image, mastery.words);
    expect([r.kind, r.kindSure]).toEqual(["ranked", true]);
    expect([m.kind, m.kindSure]).toEqual(["mastery", true]);
    expect(r.opponent?.text).toBe("WTF");
    // The whole screen read the mastery screen's title as "W" and "F": no team name rather than a wrong one (its own crop reads it).
    expect([m.opponent?.text ?? null]).toEqual([null]);
  });

  it("keeps each figure with its own player: every figure read is that player's, none is another's", () => {
    const r = readOf(ranked.image, ranked.words);
    expect(r.rows).toHaveLength(5);
    // Ranks (Green has none: the client shows no rank for them).
    r.columns.forEach((c, i) => expect([TRUTH.ranks[i], null]).toContainEqual(c.rank ? [c.rank.tier, c.rank.division] : null));
    expect(r.columns.filter((c) => c.rank).length).toBeGreaterThanOrEqual(3);
    // Champion rows: every row the whole screen read is one of that player's own rows (a figure not
    // read is left empty: the column's own crop reads it again). A row read in several columns would be wrong.
    const fits = (row: Array<number | null>, truth: number[][]) => truth.some((t) => row.every((v, k) => v === null || v === t[k]));
    r.columns.forEach((c, i) => c.ranked.forEach((row) => expect(fits([row.winRate, row.games, row.kda], TRUTH.ranked[i]!), `${JSON.stringify(row)} for ${NAMES[i]}`).toBe(true)));
    expect(r.columns[4]!.ranked.length).toBe(5);
    const m = readOf(mastery.image, mastery.words);
    expect(m.rows).toHaveLength(5);
    m.columns.forEach((c, i) => expect([TRUTH.totals[i], null]).toContain(c.totalMastery));
    m.columns.forEach((c, i) => c.mastery.forEach((row) => expect(fits([row.points, row.level], TRUTH.mastery[i]!), `${JSON.stringify(row)} for ${NAMES[i]}`).toBe(true)));
  });

  it("finds the same columns in a smaller capture, and in one cropped to the game area", () => {
    const small = resize(ranked.image, 2 / 3);
    const a = readOf(small, scaled(ranked.words, 2 / 3));
    expect(a.layout?.source).toBe("dividers");
    expect(a.layout!.columns[4]!.x1).toBeLessThan(1584 * (2 / 3));
    expectOwnNames(a);
    // Cropped to the scouting panel: no top bar, no friends list.
    const area = { x: 20, y: 150, width: 1560, height: 900 };
    const cropped = crop(ranked.image, area);
    const b = readOf(cropped, scaled(ranked.words.filter((w) => w.box.x >= area.x && w.box.y >= area.y && w.box.x + w.box.width <= area.x + area.width), 1, area.x, area.y));
    expect(b.layout?.source).toBe("dividers");
    expectOwnNames(b);
  });
});

describe("pixels for OCR", () => {
  it("turns the client's light text on dark into dark text on white, with a margin", () => {
    // Jettos's name, as recognize.ts cuts it out.
    const out = prepareForOcr(ranked.image, { x: 40, y: 362, width: 280, height: 30 }, { textHeight: 44, sourceTextHeight: 17, margin: 16 });
    const grey = (x: number, y: number) => out.data[(y * out.width + x) * 4]!;
    expect(grey(2, 2)).toBe(255);
    let dark = 0;
    for (let i = 0; i < out.width * out.height; i++) if (out.data[i * 4]! < 100) dark++;
    // Mostly white, with the letters dark.
    expect(dark / (out.width * out.height)).toBeGreaterThan(0.01);
    expect(dark / (out.width * out.height)).toBeLessThan(0.3);
  });

  it("recognises the same picture again from its pixels, and only the same picture", () => {
    const again = decodePng(readFileSync(path.join(dir, "client-ranked-1080.png")))!;
    expect(fingerprint(again)).toBe(fingerprint(ranked.image));
    const changed = { ...again, data: new Uint8ClampedArray(again.data) };
    changed.data[1_000_000] = (changed.data[1_000_000]! + 1) % 256;
    expect(fingerprint(changed)).not.toBe(fingerprint(ranked.image));
    expect(fingerprint(mastery.image)).not.toBe(fingerprint(ranked.image));
  });
});
