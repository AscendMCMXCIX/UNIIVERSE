import { matchChampion, printOf, type ChampionPrints, type Rect, type Rgba } from "./champion-print";
import { findPortraits } from "./icons";
import { readScreenshot, type LineRead, type OcrWord, type ScreenshotRead } from "./layout";
import { cleanName, nameSimilarity } from "./text";

/*
  One screenshot from pixels to five players, independent of where it runs: the browser passes
  Tesseract running in a Web Worker, the tests pass Tesseract in Node. Names get a second, closer
  reading (see rereadName): English first, then the other scripts only when English is unsure.
*/

/** A reading this confident is not tried in other scripts. */
const READ_SURE = 90;

export const EXTRA_SCRIPTS = ["rus", "kor", "jpn", "chi_sim"] as const;
export type OcrLanguage = "eng" | (typeof EXTRA_SCRIPTS)[number];

export interface OcrEngine {
  /** Every word of the whole image, with boxes, in English. */
  words(): Promise<OcrWord[]>;
  /** The text of one region, enlarged `scale` times, in one language (null when that language cannot load). */
  line(region: Rect, scale: number, lang: OcrLanguage): Promise<{ text: string; confidence: number } | null>;
}

export async function rereadName(ocr: OcrEngine, line: LineRead): Promise<{ text: string; confidence: number }> {
  const scale = Math.min(4, Math.max(1, 48 / Math.max(1, line.box.height)));
  const eng = await ocr.line(line.box, scale, "eng");
  const first = eng && cleanName(eng.text) ? { text: cleanName(eng.text), confidence: eng.confidence } : { text: line.text, confidence: line.confidence };
  // A confident English reading stands; below that the other scripts are tried (a Latin name in
  // an unusual font can also read better with them).
  if (first.confidence >= READ_SURE && first.text) return first;
  const readings = [first];
  for (const lang of EXTRA_SCRIPTS) {
    const r = await ocr.line(line.box, scale, lang);
    const text = r ? cleanName(r.text) : "";
    if (!text) continue;
    readings.push({ text, confidence: r!.confidence });
    if (r!.confidence >= READ_SURE) return readings.at(-1)!;
  }
  // The reading kept is the most confident one, counting the support of the readings that agree
  // with it: two models reading nearly the same thing outweigh one slightly surer model.
  const support = (a: { text: string; confidence: number }) => a.confidence + 0.5 * readings.reduce((n, b) => (b === a ? n : n + nameSimilarity(a.text, b.text) * b.confidence), 0);
  return readings.reduce((best, r) => (support(r) > support(best) ? r : best));
}

export async function recognizeShot(pixels: Rgba, ocr: OcrEngine, prints: ChampionPrints | null, onStep?: (step: string) => void): Promise<ScreenshotRead> {
  onStep?.("Reading names and figures");
  const words = await ocr.words();
  const portraits = findPortraits(pixels).map((box) => ({ box, match: prints ? matchChampion(printOf(pixels, box), prints) : null }));
  const read = readScreenshot({ width: pixels.width, height: pixels.height, words, portraits });
  onStep?.("Checking names");
  for (const col of read.columns) {
    if (!col.name) continue;
    const again = await rereadName(ocr, col.name);
    if (again.text && again.confidence >= col.name.confidence) col.name = { ...col.name, text: again.text, confidence: again.confidence };
  }
  if (read.opponent) {
    const again = await rereadName(ocr, read.opponent);
    if (again.text && again.confidence >= read.opponent.confidence) read.opponent = { ...read.opponent, text: again.text, confidence: again.confidence };
  }
  return read;
}
