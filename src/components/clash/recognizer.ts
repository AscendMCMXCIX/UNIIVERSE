import type { Worker as OcrWorker } from "tesseract.js";
import { decodePrints, PRINT_FORMAT, type ChampionPrints, type Rect, type Rgba } from "@/domain/clash-scout/champion-print";
import { fingerprint } from "@/domain/clash-scout/image";
import type { LineRead, OcrWord, ScreenshotRead } from "@/domain/clash-scout/layout";
import { recognizeShot, type OcrEngine, type OcrLanguage } from "@/domain/clash-scout/recognize";
import type { ScreenshotKind } from "@/domain/clash-scout/types";

/*
  Reading a Clash screenshot in the browser. The screenshot never leaves the device: it is decoded
  into pixels here, the text is read by Tesseract (open-source OCR, compiled to WebAssembly and
  loaded only the first time a screenshot is read; its language files come from the jsDelivr CDN
  and are kept by the browser), and champion portraits are matched against the champion prints
  (one small download per patch from this site). domain/clash-scout/recognize.ts does the rest:
  the five columns, then each name, rank and row of figures read from its own crop.

  Names are where accuracy matters most. When the English reading of a name is not confident,
  Cyrillic, Korean, Japanese and Chinese models are tried (each downloaded only when first needed).
  A name still unsure is shown with a crop of the screenshot so a member can check it in a second.
  Nothing is invented: what cannot be read stays empty.
*/

/** A screenshot decoded and ready to read (kept in memory while the page is open, to read it again). */
export interface OpenedShot {
  /** The picture's fingerprint: the same screenshot pasted again, even re-encoded, is recognised. */
  fingerprint: string;
  /** What the file was called (the browser-test stand-in answers from it). */
  fileName: string;
  canvas: HTMLCanvasElement | null;
  pixels: Rgba | null;
}

export interface ShotResult {
  read: ScreenshotRead;
  /** A small image of each column's name as it appears in the screenshot (for checking), by column. */
  nameCrops: Array<string | null>;
  /** Why some things could not be recognised (no champion prints…). */
  warnings: string[];
}

export interface ReadOptions {
  /** The member said which screen this is. */
  kind?: ScreenshotKind;
  onStep?: (step: string) => void;
}

export interface Recognizer {
  /** Starts downloading text recognition (when a member is about to paste), so the first reading starts sooner. */
  warmUp(): void;
  /** Decodes the image (quick): its fingerprint, before any reading. */
  open(file: Blob): Promise<OpenedShot>;
  read(shot: OpenedShot, opts?: ReadOptions): Promise<ShotResult>;
}

const LANG_PATH = (lang: string) => `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int`;
/** Wider screenshots (4K captures) are read at this width: more pixels add time, not accuracy. */
const MAX_WIDTH = 2560;

/** How long the first download of the recogniser (or a language) may take before giving up. */
const LOAD_TIMEOUT_MS = 60_000;
/** How long reading one image or field may take. */
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

const workers = new Map<OcrLanguage, Promise<OcrWorker>>();
function worker(lang: OcrLanguage): Promise<OcrWorker> {
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
  printsPromise ??= fetch(`/api/clash/champion-prints?v=${encodeURIComponent(version)}&f=${PRINT_FORMAT}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j ? decodePrints(j) : null))
    .catch(() => {
      printsPromise = null;
      return null;
    });
  return printsPromise;
}

/** Pixels on a canvas, the form Tesseract takes them in the browser. */
function canvasOf(image: Rgba): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return c;
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

type Box = { x0: number; y0: number; x1: number; y1: number };
type Block = { paragraphs: Array<{ lines: Array<{ text: string; confidence: number; bbox: Box; words: Array<{ text: string; confidence: number; bbox: Box }> }> }> };
const rect = (b: Box): Rect => ({ x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });

function linesAndWords(blocks: Block[] | null | undefined): { lines: LineRead[]; words: OcrWord[] } {
  const lines: LineRead[] = [];
  const words: OcrWord[] = [];
  for (const b of blocks ?? [])
    for (const p of b.paragraphs)
      for (const l of p.lines) {
        if (l.text.trim()) lines.push({ text: l.text.trim(), confidence: l.confidence, box: rect(l.bbox) });
        for (const w of l.words) words.push({ text: w.text, confidence: w.confidence, box: rect(w.bbox) });
      }
  return { lines, words };
}

// Tesseract's page segmentation: automatic for the whole screen, one line (a name, a rank), one block (a column's figures).
const PSM = { words: "3", line: "7", block: "6" } as const;

/** Tesseract behind the OcrEngine the recognition expects. */
const engine: OcrEngine = {
  async words(image) {
    const w = await worker("eng");
    await w.setParameters({ tessedit_pageseg_mode: PSM.words as never });
    const r = await within(w.recognize(canvasOf(image), {}, { blocks: true }), READ_TIMEOUT_MS, "Reading the screenshot took too long.");
    return linesAndWords((r.data as unknown as { blocks?: Block[] }).blocks).words;
  },
  async read(image, mode, lang) {
    try {
      const w = await worker(lang);
      await w.setParameters({ tessedit_pageseg_mode: PSM[mode] as never });
      const r = await within(w.recognize(canvasOf(image), {}, { blocks: true }), READ_TIMEOUT_MS, "Reading took too long.");
      return { text: r.data.text, confidence: r.data.confidence, ...linesAndWords((r.data as unknown as { blocks?: Block[] }).blocks) };
    } catch {
      // A language that cannot load, or a field that cannot be read, leaves that reading out.
      return null;
    }
  },
};

/** The screenshot as pixels, at most MAX_WIDTH wide. */
async function decode(file: Blob): Promise<{ canvas: HTMLCanvasElement; pixels: Rgba }> {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width > MAX_WIDTH ? MAX_WIDTH / bitmap.width : 1;
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

export function createRecognizer(options: { ddragonVersion: string | null }): Recognizer {
  return {
    warmUp() {
      void worker("eng").catch(() => {});
      void championPrints(options.ddragonVersion);
    },
    async open(file) {
      const { canvas, pixels } = await decode(file);
      return { fingerprint: fingerprint(pixels), fileName: file instanceof File ? file.name : "", canvas, pixels };
    },
    async read(shot, opts = {}) {
      const warnings: string[] = [];
      if (!shot.canvas || !shot.pixels) throw new Error("This screenshot is no longer open.");
      opts.onStep?.("Loading text recognition");
      const [, prints] = await Promise.all([worker("eng"), championPrints(options.ddragonVersion)]);
      if (!prints) warnings.push("Champion portraits could not be recognised right now: pick champions by hand where needed.");
      const read = await recognizeShot(shot.pixels, engine, prints, { kind: opts.kind, onStep: opts.onStep });
      const canvas = shot.canvas;
      const preview = (r: Rect) => crop(canvas, r, Math.min(2, 40 / Math.max(1, r.height))).toDataURL("image/webp", 0.8);
      return { read, nameCrops: read.columns.map((c) => (c.name ? preview(c.name.box) : null)), warnings };
    },
  };
}
