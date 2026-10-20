import type { Worker as OcrWorker } from "tesseract.js";
import { decodePrints, type ChampionPrints, type Rect, type Rgba } from "@/domain/clash-scout/champion-print";
import type { OcrWord, ScreenshotRead } from "@/domain/clash-scout/layout";
import { recognizeShot, type OcrEngine } from "@/domain/clash-scout/recognize";
import { fileHash } from "./file-hash";

/*
  Reading a Clash screenshot in the browser. The screenshot never leaves the device: it is decoded
  into pixels here, the text is read by Tesseract (open-source OCR, compiled to WebAssembly and
  loaded only the first time a screenshot is pasted; its language files come from the jsDelivr
  CDN and are kept by the browser), and champion portraits are matched against the champion prints
  (one small download per patch from this site). The layout logic (domain/clash-scout/layout.ts)
  then turns that into five players.

  Names are where accuracy matters most. Each name is read again on its own at a larger scale;
  when the English reading is not confident, Cyrillic, Korean, Japanese and Chinese models are
  tried and the most confident reading kept. A name still below NAME_SURE is shown with a crop of
  the screenshot so a member can check it in a second. Nothing is invented: what cannot be read
  stays empty.
*/

export interface ShotResult {
  /** SHA-256 of the file: the same screenshot pasted again is not read twice. */
  hash: string;
  read: ScreenshotRead;
  /** A small image of each player's name as it appears in the screenshot (for checking), by slot. */
  nameCrops: Array<string | null>;
  opponentCrop: string | null;
  /** Why some things could not be recognised (no champion prints, no text…). */
  warnings: string[];
}

export interface Recognizer {
  read(file: Blob, onStep?: (step: string) => void): Promise<ShotResult>;
}

const LANG_PATH = (lang: string) => `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int`;
const MAX_WIDTH = 2400;
const MIN_WIDTH = 1600;

/** How long the first download of the recogniser (or a language) may take before giving up. */
const LOAD_TIMEOUT_MS = 60_000;
/** How long reading one image or name may take. */
const READ_TIMEOUT_MS = 90_000;

/** A promise that fails after `ms`: a blocked download otherwise leaves Tesseract waiting forever. */
function within<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

const workers = new Map<string, Promise<OcrWorker>>();
function worker(lang: string): Promise<OcrWorker> {
  let w = workers.get(lang);
  if (!w) {
    w = within(
      import("tesseract.js").then(({ createWorker }) => createWorker(lang, 1, { langPath: LANG_PATH(lang) })),
      LOAD_TIMEOUT_MS,
      "Text recognition could not be downloaded.",
    );
    // A failed load (offline, blocked CDN) must not stick: the next screenshot tries again.
    w.catch(() => workers.delete(lang));
    workers.set(lang, w);
  }
  return w;
}

let printsPromise: Promise<ChampionPrints | null> | null = null;
function championPrints(version: string | null): Promise<ChampionPrints | null> {
  if (!version) return Promise.resolve(null);
  printsPromise ??= fetch(`/api/clash/champion-prints?v=${encodeURIComponent(version)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j ? decodePrints(j) : null))
    .catch(() => {
      printsPromise = null;
      return null;
    });
  return printsPromise;
}

/** The screenshot drawn at a working size: large enough for small client text, never huge. */
async function draw(file: Blob): Promise<{ canvas: HTMLCanvasElement; pixels: Rgba }> {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width > MAX_WIDTH ? MAX_WIDTH / bitmap.width : bitmap.width < MIN_WIDTH ? Math.min(2, MIN_WIDTH / bitmap.width) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, pixels: { width: data.width, height: data.height, data: data.data } };
}

function crop(source: HTMLCanvasElement, r: Rect, scale: number, pad = 6): HTMLCanvasElement {
  const x = Math.max(0, Math.floor(r.x - pad)), y = Math.max(0, Math.floor(r.y - pad));
  const w = Math.min(source.width - x, Math.ceil(r.width + pad * 2)), h = Math.min(source.height - y, Math.ceil(r.height + pad * 2));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

type Block = { paragraphs: Array<{ lines: Array<{ words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> }> }> };
function wordsOf(blocks: Block[] | null | undefined): OcrWord[] {
  const out: OcrWord[] = [];
  for (const b of blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) out.push({ text: w.text, confidence: w.confidence, box: { x: w.bbox.x0, y: w.bbox.y0, width: w.bbox.x1 - w.bbox.x0, height: w.bbox.y1 - w.bbox.y0 } });
  return out;
}

export function createRecognizer(options: { ddragonVersion: string | null }): Recognizer {
  return {
    async read(file, onStep) {
      const warnings: string[] = [];
      const hash = await fileHash(file);
      onStep?.("Preparing the screenshot");
      const { canvas, pixels } = await draw(file);
      onStep?.("Loading text recognition (first time only)");
      const [, prints] = await Promise.all([worker("eng"), championPrints(options.ddragonVersion)]);
      if (!prints) warnings.push("Champion portraits could not be recognised right now: pick champions by hand where needed.");
      const engine: OcrEngine = {
        async words() {
          const r = await within((await worker("eng")).recognize(canvas, {}, { blocks: true }), READ_TIMEOUT_MS, "Reading the screenshot took too long.");
          return wordsOf((r.data as unknown as { blocks?: Block[] }).blocks);
        },
        async line(region, scale, lang) {
          try {
            const r = await within((await worker(lang)).recognize(crop(canvas, region, scale)), READ_TIMEOUT_MS, "Reading a name took too long.");
            return { text: r.data.text, confidence: r.data.confidence };
          } catch {
            return null;
          }
        },
      };
      const read = await recognizeShot(pixels, engine, prints, onStep);
      if (read.columns.every((c) => !c.name) && read.columns.every((c) => !c.ranked.length && !c.mastery.length)) warnings.push("No players could be read in this image. Is it one of Clash's two scouting screens?");
      const preview = (r: Rect) => crop(canvas, r, Math.min(2, 40 / Math.max(1, r.height))).toDataURL("image/webp", 0.8);
      return { hash, read, nameCrops: read.columns.map((c) => (c.name ? preview(c.name.box) : null)), opponentCrop: read.opponent ? preview(read.opponent.box) : null, warnings };
    },
  };
}
