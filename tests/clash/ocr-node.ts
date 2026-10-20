import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";
import type { Rgba } from "@/domain/clash-scout/champion-print";
import type { LineRead, OcrWord } from "@/domain/clash-scout/layout";
import type { OcrEngine, OcrLanguage } from "@/domain/clash-scout/recognize";
import { encodePng } from "./png-encode";

/*
  Test helper: Tesseract in Node behind the same OcrEngine the browser uses (whole-screen words in
  automatic layout; a line or a block of a prepared crop, in any of the five languages). The
  language files come from node_modules (@tesseract.js-data), the same models the browser loads.
*/

const langPath = (lang: string) => path.resolve(__dirname, `../../node_modules/@tesseract.js-data/${lang}/4.0.0_best_int`);

type Blocks = Array<{ paragraphs: Array<{ lines: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> }> }> }>;
const box = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });

export interface NodeOcr {
  engine: OcrEngine;
  /** How many reads were made, by mode (for the timing notes in the tests). */
  calls: Record<string, number>;
  terminate(): Promise<void>;
}

export async function nodeOcr(languages: OcrLanguage[] = ["eng", "kor", "jpn", "chi_sim", "rus"]): Promise<NodeOcr> {
  const workers = new Map<OcrLanguage, Worker>();
  for (const lang of languages) workers.set(lang, await createWorker(lang, 1, { langPath: langPath(lang), cacheMethod: "none" }));
  const calls: Record<string, number> = {};
  const count = (k: string) => (calls[k] = (calls[k] ?? 0) + 1);
  const engine: OcrEngine = {
    async words(image: Rgba) {
      count("words");
      const w = workers.get("eng")!;
      await w.setParameters({ tessedit_pageseg_mode: "3" as never });
      const r = await w.recognize(encodePng(image), {}, { blocks: true });
      const out: OcrWord[] = [];
      for (const b of (r.data as unknown as { blocks: Blocks }).blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const wd of l.words) out.push({ text: wd.text, confidence: wd.confidence, box: box(wd.bbox) });
      return out;
    },
    async read(image: Rgba, mode, lang) {
      count(mode);
      const w = workers.get(lang);
      if (!w) return null;
      await w.setParameters({ tessedit_pageseg_mode: (mode === "line" ? "7" : "6") as never });
      const r = await w.recognize(encodePng(image), {}, { blocks: true });
      const lines: LineRead[] = [];
      const words: OcrWord[] = [];
      for (const b of (r.data as unknown as { blocks: Blocks }).blocks ?? [])
        for (const p of b.paragraphs)
          for (const l of p.lines) {
            if (l.text.trim()) lines.push({ text: l.text.trim(), confidence: l.confidence, box: box(l.bbox) });
            for (const wd of l.words) words.push({ text: wd.text, confidence: wd.confidence, box: box(wd.bbox) });
          }
      return { text: r.data.text, confidence: r.data.confidence, lines, words };
    },
  };
  return {
    engine,
    calls,
    async terminate() {
      for (const w of workers.values()) await w.terminate();
    },
  };
}
