import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";
import { decodePng } from "@/server/images/png";
import { MATCH_MARGIN, printOf, similarity, type ChampionPrints } from "@/domain/clash-scout/champion-print";
import { recognizeShot, type OcrEngine, type OcrLanguage } from "@/domain/clash-scout/recognize";
import type { OcrWord } from "@/domain/clash-scout/layout";
import { mergeScreenshot } from "@/domain/clash-scout/merge";
import { emptyContent } from "@/domain/clash-scout/types";
import { hasNonLatin } from "@/domain/clash-scout/text";
import champions from "@/server/riot/fixtures/champions.fixture.json";
import { portraitPixels } from "../fixtures/clash/portrait.mjs";
import { cropScaled, encodePng } from "./png-encode";

/*
  Clash Scout recognition end to end, with real OCR: Tesseract (the same engine and models the
  browser loads) reads the synthetic Clash screens in tests/fixtures/clash (made by
  scripts/clash-scout-fixtures.mjs: five panels, names in Cyrillic, Hangul, Japanese, Chinese and
  Latin, round champion portraits). Champion prints are made from the synthetic portraits of all
  173 champions, so every portrait has 172 wrong candidates. Real client screenshots may differ
  (fonts, effects, layout changes); this shows the pipeline works on a faithful imitation, at two
  sizes. Slow (OCR): about a minute. Run with `pnpm vitest run tests/clash`.
*/

const dir = path.resolve(__dirname, "../fixtures/clash");
const truth = JSON.parse(readFileSync(path.join(dir, "expected.json"), "utf8")) as {
  opponent: string;
  players: Array<{ name: string; rank: [string, string | null, number]; ranked: Array<[string, number, number, number]>; mastery: Array<[string, number, number]> }>;
};
const langPath = (lang: string) => path.resolve(__dirname, `../../node_modules/@tesseract.js-data/${lang}/4.0.0_best_int`);

const workers = new Map<OcrLanguage, Worker>();
let prints: ChampionPrints;

beforeAll(async () => {
  for (const lang of ["eng", "rus", "kor", "jpn", "chi_sim"] as OcrLanguage[]) workers.set(lang, await createWorker(lang, 1, { langPath: langPath(lang), cacheMethod: "none" }));
  const ids = (champions as { champions: Array<{ id: string }> }).champions.map((c) => c.id);
  prints = { version: "test", ids, prints: ids.map((id) => printOf(portraitPixels(id))) };
  // Synthetic portraits that nearly match another one: recognition rightly leaves those unknown.
  ids.forEach((id, i) => {
    if (ids.some((other, j) => j !== i && similarity(prints.prints[i]!, prints.prints[j]!) > 1 - MATCH_MARGIN)) ambiguous.add(id);
  });
}, 120_000);
const ambiguous = new Set<string>();
/** The champion recognition should give: the champion, or unknown when its portrait has a near twin. */
const champion = (got: string | null, want: string) => (got === null && ambiguous.has(want) ? want : got);
afterAll(async () => {
  for (const w of workers.values()) await w.terminate();
});

function engineFor(file: string) {
  const image = decodePng(readFileSync(path.join(dir, file)))!;
  const engine: OcrEngine = {
    async words() {
      const r = await workers.get("eng")!.recognize(encodePng(image), {}, { blocks: true });
      const out: OcrWord[] = [];
      for (const b of (r.data as unknown as { blocks: Array<{ paragraphs: Array<{ lines: Array<{ words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> }> }> }> }).blocks ?? [])
        for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) out.push({ text: w.text, confidence: w.confidence, box: { x: w.bbox.x0, y: w.bbox.y0, width: w.bbox.x1 - w.bbox.x0, height: w.bbox.y1 - w.bbox.y0 } });
      return out;
    },
    async line(region, scale, lang) {
      const r = await workers.get(lang)!.recognize(encodePng(cropScaled(image, region, scale)));
      return { text: r.data.text, confidence: r.data.confidence };
    },
  };
  return { image, engine };
}

describe("reading Clash screenshots (real OCR on synthetic screens)", () => {
  for (const file of ["ranked-1600.png", "ranked-1280.png"]) {
    it(`reads the ranked screen at ${file.slice(7, -4)} px: names in any script, ranks, figures and champions`, async () => {
      const { image, engine } = engineFor(file);
      const read = await recognizeShot(image, engine, prints);
      expect(read.kind).toBe("ranked");
      expect(read.opponent?.text).toBe(truth.opponent);
      read.columns.forEach((col, i) => {
        const want = truth.players[i]!;
        expect(col.name?.text, `name ${i}`).toBe(want.name);
        expect(col.rank).toEqual({ tier: want.rank[0], division: want.rank[1], lp: want.rank[2] });
        expect(col.ranked.map((c) => [champion(c.championId, want.ranked[col.ranked.indexOf(c)]?.[0] ?? ""), c.winRate, c.games])).toEqual(want.ranked.map((r) => r.slice(0, 3)));
        // KDA is read when its decimal point survives (at small sizes OCR can drop it: then it stays empty, never wrong).
        col.ranked.forEach((c, j) => expect([null, want.ranked[j]![3]]).toContain(c.kda));
      });
    }, 120_000);
  }

  it("reads the mastery screen and pairs it with the ranked one, player by player", async () => {
    const ranked = await recognizeShot(engineFor("ranked-1600.png").image, engineFor("ranked-1600.png").engine, prints);
    const { image, engine } = engineFor("mastery-1600.png");
    const mastery = await recognizeShot(image, engine, prints);
    expect(mastery.kind).toBe("mastery");
    let content = mergeScreenshot(emptyContent("oc1"), ranked, "ranked").content;
    const merged = mergeScreenshot(content, mastery, "mastery");
    content = merged.content;
    expect(merged.notes).toEqual([]);
    content.players.forEach((p, i) => {
      const want = truth.players[i]!;
      // Names in other scripts come through exactly. Latin "x" and "X" differ only in size, and the
      // two screens can read them differently ("xX_…" / "XX_…"): Riot's own spelling replaces the
      // reading once the account is verified, and until then the name is one tap to correct.
      if (hasNonLatin(want.name)) expect(p.name).toBe(want.name);
      else expect(p.name.toLowerCase()).toBe(want.name.toLowerCase());
      expect(p.mastery.map((m, j) => [champion(m.championId, want.mastery[j]![0]), m.level, m.points])).toEqual(want.mastery);
      expect(p.ranked).toHaveLength(3);
      // A name is never an account: nothing is verified by reading screenshots.
      expect(p).toMatchObject({ verification: "unverified", riotId: null, puuid: null });
    });
  }, 180_000);
});
