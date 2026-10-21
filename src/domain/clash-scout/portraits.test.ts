import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodePng } from "@/server/images/png";
import { decodePrints, type Rgba } from "./champion-print";
import { findDividerSets } from "./grid";
import { resize } from "./image";
import { readScreenshot, type OcrWord } from "./layout";
import { GEOMETRY, matchPortraits, measureGeometry } from "./portraits";
import { figureStarts, portraitCells } from "./recognize";

/*
  Champion portraits on the League client's own scouting screenshots, without OCR (fast, in CI):
  the same steps the browser runs after reading the text (the portraits' grid, then each portrait
  compared with every champion), on the real pixels, with the words Tesseract read in them
  (recorded once) and the prints of Data Dragon 16.18.1, the version of the client in the
  screenshots (26.18): tests/fixtures/clash/prints-16.18.1.json, made from Data Dragon's champion
  squares the way the server makes them.

  The rule: every portrait is its own champion, or unknown; never another champion. Four of
  Green's ranked portraits show artwork that is not any champion's Data Dragon square (Data
  Dragon 16.18 and 16.21 alike): they must stay unknown, for the member to pick.
*/

const dir = path.resolve(__dirname, "../../../tests/fixtures/clash");
const TRUTH = JSON.parse(readFileSync(path.join(dir, "client-expected.json"), "utf8")) as { rankedChampions: Array<Array<string | null>>; masteryChampions: Array<Array<string | null>> };
const PRINTS = decodePrints(JSON.parse(readFileSync(path.join(dir, "prints-16.18.1.json"), "utf8")));

function load(name: string): { png: Buffer; image: Rgba; words: OcrWord[] } {
  const png = readFileSync(path.join(dir, `${name}.png`));
  const recorded = JSON.parse(readFileSync(path.join(dir, `${name}.words.json`), "utf8")) as Array<{ t: string; c: number; b: [number, number, number, number] }>;
  return { png, image: decodePng(png)!, words: recorded.map((w) => ({ text: w.t, confidence: w.c, box: { x: w.b[0], y: w.b[1], width: w.b[2], height: w.b[3] } })) };
}
const scaled = (words: OcrWord[], f: number): OcrWord[] => words.map((w) => ({ ...w, box: { x: w.box.x * f, y: w.box.y * f, width: w.box.width * f, height: w.box.height * f } }));
const jpeg = async (png: Buffer, quality: number): Promise<Rgba> => {
  const { data, info } = await sharp(await sharp(png).jpeg({ quality }).toBuffer()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
};

/** Each column's champions, top to bottom, as recognised: the champion when sure, "?id" when only suggested, null when unknown. */
function champions(image: Rgba, words: OcrWord[]): Array<Array<string | null>> {
  const read = readScreenshot({ width: image.width, height: image.height, words, portraits: [], dividers: findDividerSets(image) });
  const layout = read.layout!;
  const wanted = layout.columns.flatMap((col) => read.rows.map((_, band) => ({ slot: col.slot, band })));
  const matches = matchPortraits(image, portraitCells(image, read.rows, layout, figureStarts(read, layout, words), wanted), PRINTS);
  return layout.columns.map((col) => matches.filter((m) => m.slot === col.slot).sort((a, b) => a.band - b.band).map((m) => (m.match?.certainty === "high" ? m.match.championId : m.match?.certainty === "low" ? `?${m.match.championId}` : null)));
}

const ranked = load("client-ranked-1080");
const mastery = load("client-mastery-1080");

describe("champion portraits on the client's own screenshots", () => {
  it("recognises every ranked champion Data Dragon shows, and leaves the others unknown", () => {
    expect(champions(ranked.image, ranked.words)).toEqual(TRUTH.rankedChampions);
  });

  it("recognises every mastery champion", () => {
    expect(champions(mastery.image, mastery.words)).toEqual(TRUTH.masteryChampions);
  });

  it("measures where the round portraits sit inside their boxes from the screenshot itself", () => {
    const read = readScreenshot({ width: mastery.image.width, height: mastery.image.height, words: mastery.words, portraits: [], dividers: findDividerSets(mastery.image) });
    const wanted = read.layout!.columns.flatMap((col) => read.rows.map((_, band) => ({ slot: col.slot, band })));
    const cells = portraitCells(mastery.image, read.rows, read.layout!, figureStarts(read, read.layout!, mastery.words), wanted);
    const g = measureGeometry(mastery.image, cells, PRINTS, cells[0]!.box.width);
    expect(Math.abs(g.dx - GEOMETRY.dx)).toBeLessThanOrEqual(0.04);
    expect(Math.abs(g.dy - GEOMETRY.dy)).toBeLessThanOrEqual(0.04);
  });

  it("without prints, recognises nothing (and invents nothing)", () => {
    const read = readScreenshot({ width: ranked.image.width, height: ranked.image.height, words: ranked.words, portraits: [], dividers: findDividerSets(ranked.image) });
    const cells = portraitCells(ranked.image, read.rows, read.layout!, figureStarts(read, read.layout!, ranked.words), [{ slot: 0, band: 0 }]);
    expect(matchPortraits(ranked.image, cells, null)).toEqual([expect.objectContaining({ match: null })]);
  });
});

describe("as other captures give them", () => {
  // Scaled, as smaller and larger clients give them, and saved as JPEG: the same champions.
  const variants: Record<string, (shot: typeof ranked) => Promise<[Rgba, OcrWord[]]>> = {
    "1280×720": async (s) => [resize(s.image, 1280 / 1920), scaled(s.words, 1280 / 1920)],
    "2560×1440": async (s) => [resize(s.image, 2560 / 1920), scaled(s.words, 2560 / 1920)],
    "JPEG, quality 50": async (s) => [await jpeg(s.png, 50), s.words],
  };
  for (const [label, make] of Object.entries(variants)) {
    it(`${label}: every champion as at 1080p`, async () => {
      for (const [shot, truth] of [[ranked, TRUTH.rankedChampions], [mastery, TRUTH.masteryChampions]] as const) {
        const [image, words] = await make(shot);
        expect(champions(image, words)).toEqual(truth);
      }
    });
  }
});
