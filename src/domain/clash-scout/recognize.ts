import type { ChampionPrints, Rect, Rgba } from "./champion-print";
import { findDividerSets } from "./grid";
import { findLogo, portraitIn } from "./icons";
import { matchPortraits, type PortraitCell } from "./portraits";
import { clampRect, crop, prepareForOcr, resize } from "./image";
import {
  columnLines,
  cx,
  cy,
  findRows,
  groupLines,
  isStatText,
  isTotalFigure,
  masteryRow,
  median,
  nameScore,
  pickOpponentWords,
  rankedRow,
  readScreenshot,
  TOTAL_LABEL,
  type LineRead,
  type OcrWord,
  type RowBand,
  type ScreenLayout,
  type ScreenshotRead,
} from "./layout";
import { cleanName, hasNonLatin, nameKey, nameShape, nameSimilarity, parseRank } from "./text";
import type { MasteryChampion, RankedChampion, ScreenshotKind } from "./types";

/*
  One screenshot from pixels to five players, the same wherever it runs: the browser passes
  Tesseract running in a Web Worker, the tests pass Tesseract in Node.

  First the whole screen is read once (layout.ts turns that into the five columns and the names'
  row). Then every field is read again on its own, from a crop of exactly its region: each name,
  each rank, each column's champion figures, the team name. A crop holds nothing but that field,
  cleaned for OCR (image.ts), so neighbouring columns, portraits and the client's decorations
  cannot run into it. Names in other scripts get further readings with the Korean, Japanese,
  Chinese and Cyrillic models when the English one is unsure; the reading kept is the one the
  others agree with most. A field that cannot be read stays empty: nothing is invented.
*/

/** A reading this confident, and shaped like a name, is not tried in other scripts. */
const READ_SURE = 90;
/** A single reading this confident is trusted without a second one agreeing. */
const CLEAR = 85;

export const EXTRA_SCRIPTS = ["rus", "kor", "jpn", "chi_sim"] as const;
export type OcrLanguage = "eng" | (typeof EXTRA_SCRIPTS)[number];

export interface OcrText {
  text: string;
  confidence: number;
  /** The lines found, with their boxes in the read image. */
  lines: LineRead[];
  /** The words found, with their boxes in the read image. */
  words: OcrWord[];
}

export interface OcrEngine {
  /** Every word of an image, with boxes, in English (automatic page layout). */
  words(image: Rgba): Promise<OcrWord[]>;
  /** The text of a prepared region: one line (a name, a rank) or a block of lines (figures). Null when that language cannot load. */
  read(image: Rgba, mode: "line" | "block", lang: OcrLanguage): Promise<OcrText | null>;
}

export interface RecognizeOptions {
  /** The member said which screen this is: read it as that. */
  kind?: ScreenshotKind;
  onStep?: (step: string) => void;
}

interface Reading {
  text: string;
  confidence: number;
}

/**
 * A name read from its own crop: English first, then the other scripts when English is unsure.
 * `earlier` is what the whole-screen reading saw there, one more opinion. Null when nothing
 * name-like could be read.
 */
export async function readName(ocr: OcrEngine, image: Rgba, earlier: Reading | null): Promise<Reading | null> {
  const readings: Reading[] = [];
  const eng = await ocr.read(image, "line", "eng");
  const engText = eng ? cleanName(eng.text) : "";
  if (eng && engText) readings.push({ text: engText, confidence: eng.confidence });
  // What the whole-screen reading saw there: the same English model on the screen as it was.
  if (earlier && cleanName(earlier.text)) readings.push({ text: cleanName(earlier.text), confidence: earlier.confidence });
  const sure = !!eng && !!engText && eng.confidence >= READ_SURE && nameShape(engText) >= 0.75 && !hasNonLatin(engText);
  if (!sure) {
    for (const lang of EXTRA_SCRIPTS) {
      const r = await ocr.read(image, "line", lang);
      const text = r ? cleanName(r.text) : "";
      if (!text) continue;
      readings.push({ text, confidence: r!.confidence });
      // A confident reading in another script stands: the models of the other scripts often
      // agree with English on a lookalike in Latin letters, which must not outvote it.
      // Only when it is clearly surer than English: on a Latin name, these models can also be confident about a lookalike.
      if (r!.confidence >= READ_SURE && nameShape(text) >= 0.75 && r!.confidence >= (eng?.confidence ?? 0) + 8) return { text, confidence: r!.confidence };
    }
  }
  const usable = readings.filter((r) => nameScore(r) > 0);
  if (!usable.length) return null;
  // The reading kept: its own confidence and shape, plus the support of the readings that agree
  // with it (two models reading nearly the same thing outweigh one slightly surer model).
  const support = (a: Reading) => a.confidence * (0.4 + 0.6 * nameShape(a.text)) + 0.5 * usable.reduce((n, b) => (b === a ? n : n + nameSimilarity(a.text, b.text) * b.confidence), 0);
  const best = usable.reduce((x, r) => (support(r) > support(x) ? r : x));
  // Agreement raises confidence: the same name from two independent readings is likely right.
  const agreeing = usable.filter((r) => r !== best && nameSimilarity(r.text, best.text) === 1);
  // Readings that agree but for case or spaces ("Jettos", "jettos"): the spelling most of them, and the surest, back.
  const spellings = new Map<string, number>();
  for (const r of [best, ...agreeing]) spellings.set(r.text, (spellings.get(r.text) ?? 0) + r.confidence);
  const text = [...spellings].sort((a, b) => b[1] - a[1])[0]![0];
  return { text, confidence: Math.min(99, best.confidence + agreeing.length * 6) };
}

/** Maps lines read in a prepared crop back to the screenshot's coordinates. */
function backToImage(lines: LineRead[], region: Rect, factor: number, margin: number): LineRead[] {
  return lines.map((l) => ({ ...l, box: { x: region.x + (l.box.x - margin) / factor, y: region.y + (l.box.y - margin) / factor, width: l.box.width / factor, height: l.box.height / factor } }));
}

const MARGIN = 16;
const TEXT_HEIGHT = 40;
/** Names are read larger: one line, the field that matters most. */
const NAME_HEIGHT = 44;

/** A region prepared for OCR, with what is needed to map its lines back. */
function prepared(image: Rgba, region: Rect, sourceTextHeight: number, textHeight = TEXT_HEIGHT) {
  return { image: prepareForOcr(image, region, { textHeight, sourceTextHeight, margin: MARGIN }), factor: Math.max(0.5, Math.min(6, textHeight / Math.max(4, sourceTextHeight))) };
}

/** A 1080p client's column width: the client's text reads best at that size. */
const CLIENT_PITCH = 303;
/** At most this many pixels are read at once (the whole screen, enlarged). */
const MAX_WORK_PIXELS = 6_000_000;

/** Every word in one area of the image, read at `factor` (bounded), in the image's coordinates. */
async function wordsIn(image: Rgba, ocr: OcrEngine, area: Rect, factor: number): Promise<OcrWord[]> {
  const whole = area.x <= 0 && area.y <= 0 && area.width >= image.width && area.height >= image.height;
  const part = whole ? image : crop(image, area);
  const f = Math.max(0.5, Math.min(2, factor, Math.sqrt(MAX_WORK_PIXELS / (part.width * part.height))));
  const work = Math.abs(f - 1) < 0.02 ? part : resize(part, f);
  const scale = work.width / part.width;
  const x0 = whole ? 0 : clampRect(area, image).x, y0 = whole ? 0 : clampRect(area, image).y;
  return (await ocr.words(work)).map((w) => ({ ...w, box: { x: x0 + w.box.x / scale, y: y0 + w.box.y / scale, width: w.box.width / scale, height: w.box.height / scale } }));
}

export async function recognizeShot(image: Rgba, ocr: OcrEngine, prints: ChampionPrints | null, opts: RecognizeOptions = {}): Promise<ScreenshotRead> {
  opts.onStep?.("Finding the five players");
  const dividers = findDividerSets(image);
  const lines = dividers[0];
  let words: OcrWord[] = [];
  let read: ScreenshotRead | null = null;
  if (lines) {
    // The client's lines give its place and size, even as a window on a larger screen: only the
    // client's scouting panel is read (its header above the lines, its columns between them), at
    // the size a 1080p client's text has, which Tesseract reads well.
    const area = { x: lines.xs[0]! - lines.pitch * 1.1, y: lines.top - lines.pitch * 1.05, width: lines.xs[3]! - lines.xs[0]! + lines.pitch * 2.2, height: lines.bottom - lines.top + lines.pitch * 1.2 };
    words = await wordsIn(image, ocr, area, CLIENT_PITCH / lines.pitch);
    read = readScreenshot({ width: image.width, height: image.height, words, portraits: [], dividers, kind: opts.kind });
  }
  if (!read?.layout) {
    // No lines, or nothing readable between them: the whole screen, at a size Tesseract reads well (the client's small print 12–20 px high).
    const factor = image.width < 1600 ? Math.min(2, 1600 / image.width) : image.width > 2400 ? 2400 / image.width : 1;
    words = await wordsIn(image, ocr, { x: 0, y: 0, width: image.width, height: image.height }, factor);
    read = readScreenshot({ width: image.width, height: image.height, words, portraits: [], dividers, kind: opts.kind });
  }
  const layout = read.layout;
  if (!layout) return read;
  const { columns, pitch, lineHeight, nameBand } = layout;
  const inset = pitch * 0.025;

  // Names: each from its own cell of the names' row.
  opts.onStep?.("Reading names");
  // Names are printed a little larger than the figures: a measured height far from that is noise (JPEG blocks, a merged line).
  const textHeight = Math.max(6, Math.min(lineHeight * 1.7, Math.max(lineHeight * 0.8, nameBand.textHeight)));
  // The names' row with a little room above and below, never so much that the next line (a rank in
  // some layouts) comes into the crop: that alone can make OCR misread a name's capitals.
  const centre = (nameBand.y0 + nameBand.y1) / 2;
  const rowHeight = Math.min(textHeight * 1.6, Math.max(textHeight, nameBand.y1 - nameBand.y0));
  for (const col of columns) {
    const cell = { x: col.x0 + inset, y: centre - rowHeight / 2 - textHeight * 0.4, width: col.x1 - col.x0 - inset * 2, height: rowHeight + textHeight * 0.8 };
    const p = prepared(image, cell, textHeight, NAME_HEIGHT);
    const earlier = read.columns[col.slot]!.name;
    const name = await readName(ocr, p.image, earlier);
    read.columns[col.slot]!.name = name ? { ...name, box: earlier?.box ?? cell } : null;
  }

  const kind = read.kind;
  if (kind) {
    opts.onStep?.(kind === "ranked" ? "Reading ranks and champions" : "Reading mastery and champions");
    const { rows, bands, starts } = await readFigures(image, ocr, read, layout, words, kind);
    if (prints) matchChampions(image, prints, rows, bands, layout, starts);
    settle(read, rows, kind);
    read.rows = bands;
  }

  // The opponent's team name: the header's largest text beside the logo, read on its own.
  opts.onStep?.("Reading the team name");
  const headerRight = columns[Math.min(2, columns.length - 1)]!.x0;
  // The team's logo sits left of its name and reads as stray letters: the name is read from beside it.
  const logo = layout.header.height > lineHeight * 2 ? findLogo(image, { x: columns[0]!.x0, y: layout.header.y, width: headerRight - columns[0]!.x0, height: layout.header.height }) : null;
  const left = logo ? logo.x + logo.width + lineHeight * 0.3 : columns[0]!.x0;
  const header = { x: left, y: layout.header.y, width: Math.max(1, headerRight - left), height: layout.header.height };
  if (header.height > lineHeight) {
    const p = prepared(image, header, lineHeight * 2);
    const r = await ocr.read(p.image, "block", "eng");
    let fromCrop = r ? pickOpponentWords(backToImage(r.words, header, p.factor, MARGIN)) : null;
    if (fromCrop) {
      // Read once more on its own line: a large title alone reads more surely than among the logo and labels.
      const cell = { x: fromCrop.box.x - fromCrop.box.height * 0.3, y: fromCrop.box.y - fromCrop.box.height * 0.25, width: fromCrop.box.width + fromCrop.box.height * 0.6, height: fromCrop.box.height * 1.5 };
      const q = prepared(image, cell, fromCrop.box.height * 0.9);
      const again = await ocr.read(q.image, "line", "eng");
      const text = again ? cleanName(again.text) : "";
      // The line read on its own sees the whole title (a short word can drop out of the first reading).
      if (text && again!.confidence >= Math.min(fromCrop.confidence, 85) - 5 && nameSimilarity(text, fromCrop.text) >= 0.5) fromCrop = { ...fromCrop, text, confidence: Math.max(again!.confidence, fromCrop.confidence) };
    }
    if (fromCrop) {
      // The header read on its own (cleaned and at its size) is preferred to the whole screen's
      // reading; when the two disagree, the name is kept for checking.
      const first = read.opponent;
      if (!first || nameKey(first.text) === nameKey(fromCrop.text)) read.opponent = { ...fromCrop, confidence: Math.max(fromCrop.confidence, first?.confidence ?? 0) };
      else if (fromCrop.confidence >= 50 || fromCrop.confidence >= first.confidence) read.opponent = { ...fromCrop, confidence: Math.min(fromCrop.confidence, CLEAR - 1) };
      else read.opponent = { ...first, confidence: Math.min(first.confidence, CLEAR - 1) };
    }
  }
  return read;
}

/** One champion row of one column as read: its place among the rows the columns share, its figures, and whether its readings disagreed. */
interface Row {
  band: number;
  champion: RankedChampion | MasteryChampion;
  /** The row's two readings disagreed on a figure: the surer one is kept, marked for checking. */
  doubt: boolean;
}

/**
 * One figure from a row's two readings (the column's own strip, and the whole screen). Read once,
 * or the same twice, it stands; read differently, it is kept in doubt: for figures printed with a
 * decimal point ("91.8 k"), the reading that kept the point (OCR loses a point far more often
 * than it invents one: the two are then ten times apart); otherwise the surer reading.
 */
function figure<T extends number>(own: T | null, whole: T | null, ownSurer: boolean, decimal = false): { value: T | null; doubt: boolean } {
  if (own === null || whole === null || own === whole) return { value: own ?? whole, doubt: false };
  if (decimal && (own * 10 === whole || whole * 10 === own)) return { value: Math.min(own, whole) as T, doubt: true };
  return { value: ownSurer ? own : whole, doubt: true };
}

const meanConfidence = (lines: LineRead[]) => (lines.length ? lines.reduce((n, l) => n + l.confidence, 0) / lines.length : 0);

/**
 * Where each column's figures start (right of the portraits), as an offset from the column's left
 * edge, from the figures the whole screen's reading found: the leftmost place at least two of its
 * lines of figures start (the mastery levels start further right, after their crest; one stray
 * mark in a portrait, read as a figure, starts alone). `typical` stands in for a column without.
 */
export function figureOffsets(read: ScreenshotRead, layout: ScreenLayout, words: OcrWord[]): { offsets: Array<number | null>; typical: number } {
  const { columns, pitch, lineHeight } = layout;
  const body = words.filter((w) => cy(w.box) > layout.nameBand.y1 && cy(w.box) <= layout.bodyBottom);
  // Words that start a figure's line: a figure ("50%", "175.4k"), or the label printed before one
  // ("Mastery 7"), within the champion rows (not the "Total mastery" caption above them).
  const inRows = (w: OcrWord) => !read.rows.length || (cy(w.box) >= read.rows[0]!.y0 - lineHeight && cy(w.box) <= read.rows.at(-1)!.y1 + lineHeight);
  const statWords = (col: { x0: number; x1: number }) => body.filter((w) => cx(w.box) >= col.x0 && cx(w.box) < col.x1 && inRows(w) && ((isStatText(w.text) && /\d/.test(w.text)) || /^(?:mastery|level)$/i.test(w.text.trim())));
  const offsets = columns.map((col) => {
    const starts = groupLines(statWords(col))
      .map((l) => l.box.x)
      .sort((a, b) => a - b);
    const shared = starts.find((x) => starts.filter((y) => Math.abs(y - x) <= lineHeight).length >= 2) ?? starts[0];
    return shared === undefined ? null : shared - col.x0;
  });
  const known = offsets.filter((o): o is number => o !== null);
  return { offsets, typical: known.length ? median(known) : pitch * 0.5 };
}

/**
 * The left edge of a column's figures, a little left of where they start. Columns found from the
 * client's lines are exactly alike: the typical start is safer than one column's own (a figure
 * misread there would move it and cut off digits, or let a portrait in). Columns found from the
 * text vary a little: there, never start right of the column's own figures.
 */
export function figureX(layout: ScreenLayout, col: { slot: number; x0: number }, offsets: Array<number | null>, typical: number): number {
  const start = layout.source === "dividers" ? typical : Math.min(offsets[col.slot] ?? typical, typical);
  return col.x0 + Math.max(0, start - layout.pitch * 0.03);
}

/** Where each column's figures start, from the whole screen's words (what readFigures uses to place the portraits). */
export function figureStarts(read: ScreenshotRead, layout: ScreenLayout, words: OcrWord[]): number[] {
  const { offsets, typical } = figureOffsets(read, layout, words);
  return layout.columns.map((col) => figureX(layout, col, offsets, typical) + layout.pitch * 0.03);
}

/** Ranks, totals and every champion row's figures, each column read on its own. */
async function readFigures(image: Rgba, ocr: OcrEngine, read: ScreenshotRead, layout: ScreenLayout, words: OcrWord[], kind: ScreenshotKind): Promise<{ rows: Row[][]; bands: RowBand[]; starts: number[] }> {
  const { columns, pitch, lineHeight } = layout;
  const inset = pitch * 0.025;
  const body = words.filter((w) => cy(w.box) > layout.nameBand.y1 && cy(w.box) <= layout.bodyBottom);
  const { offsets, typical } = figureOffsets(read, layout, words);

  // The figures start below the rank or total under each name (where the whole-screen reading found
  // the first row, when it did) and run to the bottom of the columns.
  const labels = columns.map((col) => columnLines(body, col).find((l) => TOTAL_LABEL.test(l.text) || !!parseRank(l.text))).filter((l): l is LineRead => !!l);
  const below = labels.length ? median(labels.map((l) => l.box.y + l.box.height)) + lineHeight * 0.5 : layout.bodyTop;
  const top = read.rows.length ? Math.max(below, read.rows[0]!.y0 - lineHeight * 0.7) : below;
  const bottom = layout.bodyBottom;
  const strips: LineRead[][] = [];
  const regions: Rect[] = [];
  for (const col of columns) {
    const x = figureX(layout, col, offsets, typical);
    const region = { x, y: top, width: col.x1 - inset - x, height: bottom - top };
    regions.push(region);
    const p = prepared(image, region, lineHeight);
    const r = await ocr.read(p.image, "block", "eng");
    // Every line with a figure counts: the strip holds nothing but the column's figures.
    strips.push(r ? backToImage(r.lines, region, p.factor, MARGIN).filter((l) => /\d/.test(l.text)) : []);
  }
  // The rows as the columns' own readings place them (clearer than the whole screen's, whose lines can
  // run together at small sizes), else as first found. Their own line height separates the rows.
  const stripHeights = strips.flat().map((l) => l.box.height);
  const ownHeight = stripHeights.length ? median(stripHeights) : lineHeight;
  const found = findRows(strips, ownHeight);

  const bands: RowBand[] = found.length ? found : read.rows;

  // Each row is read twice: in the column's strip (cleaned and enlarged), and in the whole screen at
  // its working size. Small print can defeat one reading and not the other ("52%" read as "529%" in
  // one), so each figure is taken from whichever reading has it, and a row the two readings
  // disagree on is kept for checking rather than trusted.
  const whole = regions.map((r) => groupLines(body.filter((w) => cx(w.box) >= r.x && cx(w.box) < r.x + r.width && cy(w.box) >= r.y && cy(w.box) <= r.y + r.height)).filter((l) => /\d/.test(l.text)));
  const inBand = (lines: LineRead[], band: RowBand, h: number) => lines.filter((l) => cy(l.box) >= band.y0 - h * 0.5 && cy(l.box) <= band.y1 + h * 0.5);
  const text = (lines: LineRead[]) => lines.map((l) => l.text).join(" ");
  const rows = columns.map((col) => {
    const out: Row[] = [];
    bands.forEach((band, i) => {
      const own = inBand(strips[col.slot]!, band, ownHeight);
      const screen = inBand(whole[col.slot]!, band, lineHeight);
      if (!own.length && !screen.length) return;
      // The strip was cut and cleaned for exactly these figures: it is preferred unless the whole screen read them clearly better.
      const ownSurer = meanConfidence(own) >= meanConfidence(screen) - 10;
      if (kind === "ranked") {
        const a = rankedRow(text(own), null, false), b = rankedRow(text(screen), null, false);
        const winRate = figure(a.winRate, b.winRate, ownSurer), games = figure(a.games, b.games, ownSurer), kda = figure(a.kda, b.kda, ownSurer);
        out.push({ band: i, champion: { championId: null, winRate: winRate.value, games: games.value, kda: kda.value, certainty: "low" }, doubt: winRate.doubt || games.doubt || kda.doubt });
      } else {
        const a = masteryRow(text(own), null, false), b = masteryRow(text(screen), null, false);
        const points = figure(a.points, b.points, ownSurer, true), level = figure(a.level, b.level, ownSurer);
        out.push({ band: i, champion: { championId: null, points: points.value, level: level.value, certainty: "low" }, doubt: points.doubt || level.doubt });
      }
    });
    return out;
  });

  // Between the names and the first champion row: the rank under its emblem, or the total mastery
  // (large figures over their "Total mastery" caption).
  const areaTop = layout.nameBand.y1 + lineHeight * 0.3;
  const areaBottom = (bands[0]?.y0 ?? areaTop + pitch * 0.7) - lineHeight * 0.5;
  const area = (col: { x0: number; x1: number }) => ({ x: col.x0 + inset, y: areaTop, width: col.x1 - col.x0 - inset * 2, height: Math.max(1, areaBottom - areaTop) });
  if (kind === "ranked") {
    // The rank's line: where the other columns printed theirs.
    const lines = read.columns.map((c) => c.rankLine).filter((l): l is LineRead => !!l);
    const y0 = lines.length ? median(lines.map((l) => l.box.y)) : null;
    const y1 = lines.length ? median(lines.map((l) => l.box.y + l.box.height)) : null;
    for (const col of columns) {
      const c = read.columns[col.slot]!;
      let r: OcrText | null;
      let cell: Rect;
      if (y0 !== null && y1 !== null) {
        cell = { x: col.x0 + inset, y: y0 - (y1 - y0) * 0.5, width: col.x1 - col.x0 - inset * 2, height: (y1 - y0) * 2 };
        r = await ocr.read(prepared(image, cell, (y1 - y0) * 0.9).image, "line", "eng");
      } else {
        // No column's rank was found at all: the whole area under the name, read as a block.
        cell = area(col);
        const block = await ocr.read(prepared(image, cell, lineHeight).image, "block", "eng");
        const line = block?.lines.find((l) => parseRank(l.text));
        r = line ? { text: line.text, confidence: line.confidence, lines: [line], words: [] } : null;
      }
      const again = r ? parseRank(r.text) : null;
      const first = c.rank;
      const firstConfidence = c.rankLine?.confidence ?? 0;
      if (!again) {
        // Only the whole screen read it: trusted when that reading was clear.
        c.rankSure = !!first && firstConfidence >= CLEAR;
        continue;
      }
      const line = { text: r!.text.trim(), confidence: r!.confidence, box: cell };
      if (!first) {
        c.rank = again;
        c.rankLine = line;
        c.rankSure = r!.confidence >= CLEAR;
      } else if (first.tier === again.tier && first.division === again.division) {
        // Two readings agree.
        c.rank = again.lp !== null || first.lp === null ? again : first;
        c.rankLine = line;
        c.rankSure = true;
      } else if (first.tier === again.tier && (!first.division || !again.division)) {
        // One reading lost the division: the fuller one, trusted when it was clear.
        const fuller = again.division ? again : first;
        c.rank = fuller;
        if (fuller === again) c.rankLine = line;
        c.rankSure = (fuller === again ? r!.confidence : firstConfidence) >= CLEAR;
      } else {
        // The readings disagree: the surer one, for checking.
        if (r!.confidence > firstConfidence) {
          c.rank = again;
          c.rankLine = line;
        }
        c.rankSure = false;
      }
    }
  } else if (areaBottom - areaTop > lineHeight * 2) {
    // The total mastery: large italic figures over their "Total mastery" caption, which the whole
    // screen often misses or misreads. Read as a block, the caption hides them (Tesseract takes a
    // block's text to be of one size), so the caption is found first (on the whole screen, else in
    // a column's area) and the figures above it are read again on their own line, at their size
    // (about a sixth of a column's width). Two readings that differ leave the total empty rather
    // than pick one.
    let captionTop = median(columns.flatMap((col) => columnLines(body, col).filter((l) => TOTAL_LABEL.test(l.text)).map((l) => l.box.y)));
    for (const col of Number.isNaN(captionTop) ? columns : []) {
      const cell = area(col);
      const p = prepared(image, cell, lineHeight);
      const r = await ocr.read(p.image, "block", "eng");
      const caption = r ? backToImage(r.lines, cell, p.factor, MARGIN).find((l) => TOTAL_LABEL.test(l.text)) : undefined;
      if (caption) {
        captionTop = caption.box.y;
        break;
      }
    }
    const figuresBottom = Number.isNaN(captionTop) ? areaTop + (areaBottom - areaTop) * 0.6 : captionTop - lineHeight * 0.2;
    if (figuresBottom - areaTop > lineHeight) {
      for (const col of columns) {
        const c = read.columns[col.slot]!;
        const cell = { ...area(col), height: figuresBottom - areaTop };
        const r = await ocr.read(prepared(image, cell, pitch * 0.16).image, "line", "eng");
        const again = r && isTotalFigure(r.text) ? Number(r.text.replace(/[^\d]/g, "")) : null;
        const first = c.totalMastery;
        c.totalMastery = first === null ? again : again === null || again === first ? first : null;
      }
    }
  }
  return { rows, bands, starts: regions.map((r) => r.x + pitch * 0.03) };
}

/**
 * The champion rows' portrait boxes: portraits sit on a grid (one x per column, one y per row, one
 * size), so each is found left of where its column's figures start and then placed on that grid: a
 * portrait the client drew over a highlight, or partly hidden, is still cut out whole. `starts` is
 * where each column's figures start. A box holds the round portrait and its ring (portraits.ts).
 */
export function portraitCells(image: Rgba, bands: RowBand[], layout: ScreenLayout, starts: number[], wanted: ReadonlyArray<{ slot: number; band: number }>): PortraitCell[] {
  const { columns, pitch } = layout;
  if (!bands.length || !wanted.length) return [];
  const rowsPitch = bands.length > 1 ? median(bands.slice(1).map((r, i) => r.y0 - bands[i]!.y0)) : pitch * 0.3;
  const found = columns.map((col) => {
    const firstFigure = starts[col.slot] ?? col.x0 + pitch * 0.55;
    const room = firstFigure - col.x0;
    const side = Math.min(rowsPitch * 0.95, room);
    return bands.map((band) => {
      const centre = (band.y0 + band.y1) / 2;
      return portraitIn(image, { x: Math.max(col.x0, firstFigure - side * 1.25), y: centre - side * 0.6, width: Math.min(side * 1.25, room), height: side * 1.2 });
    });
  });
  const side = median(found.flat().map((b) => b.width));
  const colX = found.map((boxes) => median(boxes.map((b) => b.x + b.width / 2)));
  const rowY = bands.map((_, i) => median(found.map((boxes) => boxes[i]!.y + boxes[i]!.height / 2)));
  return wanted.map(({ slot, band }) => ({ slot, band, box: { x: colX[slot]! - side / 2, y: rowY[band]! - side / 2, width: side, height: side } }));
}

/** Each champion row's portrait, recognised (portraits.ts): a sure match is the champion, a likely one a suggestion to check. */
function matchChampions(image: Rgba, prints: ChampionPrints, rows: Row[][], bands: RowBand[], layout: ScreenLayout, starts: number[]) {
  const wanted = layout.columns.flatMap((col) => (rows[col.slot] ?? []).map((r) => ({ slot: col.slot, band: r.band })));
  for (const m of matchPortraits(image, portraitCells(image, bands, layout, starts, wanted), prints)) {
    const row = rows[m.slot]?.find((r) => r.band === m.band);
    if (!row || !m.match?.certainty) continue;
    row.champion.championId = m.match.championId;
    row.champion.championCertainty = m.match.certainty;
  }
}

const complete = (c: RankedChampion | MasteryChampion) => ("winRate" in c ? c.winRate !== null && c.games !== null && c.kda !== null : c.points !== null && c.level !== null);
const anyFigure = (c: RankedChampion | MasteryChampion) => ("winRate" in c ? c.winRate !== null || c.games !== null || c.kda !== null : c.points !== null || c.level !== null);

/**
 * The rows into the columns. A row's figures are sure when all of them were read and its two
 * readings agreed; its champion is shown apart (recognised, or left for the member to pick).
 */
function settle(read: ScreenshotRead, rows: Row[][], kind: ScreenshotKind) {
  for (const c of read.columns) {
    const list = (rows[c.slot] ?? []).filter((r) => r.champion.championId || anyFigure(r.champion));
    for (const r of list) r.champion.certainty = complete(r.champion) && !r.doubt ? "high" : "low";
    if (kind === "ranked") c.ranked = list.map((r) => r.champion as RankedChampion);
    else c.mastery = list.map((r) => r.champion as MasteryChampion);
  }
}
