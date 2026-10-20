import type { ChampionMatch, Rect } from "./champion-print";
import { columnsFromDividers, type Dividers } from "./grid";
import { cleanName, hasNonLatin, isLabelOrFigure, isTimer, nameShape, parseGames, parseKda, parseMasteryLevel, parseMasteryPoints, parseRank, parseWinRate } from "./text";
import { SCOUT_SLOTS, type MasteryChampion, type RankInfo, type RankedChampion, type ScreenshotKind } from "./types";

/*
  From what was recognised in one screenshot to the five players it shows, in a fixed order of
  steps, each narrowing where the next one looks:

  1. The five columns. The client separates its five player columns with thin vertical lines
     (grid.ts finds them in the pixels); without them (a re-coloured or heavily compressed image)
     the columns come from the figures, which line up in five groups. Everything outside the
     columns (the friends list, the Clash schedule and its timer, the top bar) is never read as a
     player.
  2. The names' row: one line per column at the same height, above the players' figures, that
     reads as a name (not a label, a timer or a figure). Above it is the header (the opponent's team
     name and the screen's tabs); below it, each column's rank or total mastery, then its champion
     rows.
  3. Each column's figures, kept with the column they were read in: the first column is always the
     first player, as in the client.

  This module works from text already read (OCR words with their boxes); recognize.ts then reads
  each region again on its own, closer and cleaner, and keeps the better reading.
*/

export interface OcrWord {
  text: string;
  /** 0–100. */
  confidence: number;
  box: Rect;
}

export interface FoundPortrait {
  box: Rect;
  match: ChampionMatch | null;
}

export interface LineRead {
  text: string;
  confidence: number;
  box: Rect;
}

export interface Column {
  slot: number;
  x0: number;
  x1: number;
}

export interface ScreenLayout {
  /** How the columns were found: the client's dividing lines, or the figures' alignment. */
  source: "dividers" | "text";
  columns: Column[];
  /** One column's width. */
  pitch: number;
  /** The names' row (image y) and the names' text height. `found`: false when no name could be read there and its place was estimated. */
  nameBand: { y0: number; y1: number; textHeight: number; found: boolean };
  /** Above the names: the opponent's team name and the screen's tabs. */
  header: Rect;
  /** Where the columns' content (rank or total mastery, champion rows) starts and ends. */
  bodyTop: number;
  bodyBottom: number;
  /** The height of the screen's small print (the champion rows' figures), in pixels. */
  lineHeight: number;
}

/** One champion row's place on the screen (image y), shared by the five columns. */
export interface RowBand {
  y0: number;
  y1: number;
}

export interface ColumnRead {
  slot: number;
  /** Where and what the name was read (null: nothing readable there). */
  name: LineRead | null;
  rank: RankInfo | null;
  /** The line the rank was read from (its confidence is the rank's). */
  rankLine: LineRead | null;
  /** Two readings agreed on the rank, or one read it clearly: false marks it for checking. */
  rankSure: boolean;
  /** The "Total mastery" figure the mastery screen prints under the name. */
  totalMastery: number | null;
  ranked: RankedChampion[];
  mastery: MasteryChampion[];
}

export interface ScreenshotRead {
  kind: ScreenshotKind | null;
  /** False when the screen could be either (the member is asked). */
  kindSure: boolean;
  /** The team name in the header, when one was found. */
  opponent: LineRead | null;
  columns: ColumnRead[];
  /** Where the five columns were found; null when they were not (nothing is then read as a player). */
  layout: ScreenLayout | null;
  /** The champion rows' places, shared by the columns. */
  rows: RowBand[];
}

export const cx = (r: Rect) => r.x + r.width / 2;
export const cy = (r: Rect) => r.y + r.height / 2;

export function union(boxes: Rect[]): Rect {
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width)), y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/** Words grouped into lines (top to bottom), each read left to right. */
export function groupLines(words: OcrWord[]): LineRead[] {
  const sorted = [...words].sort((a, b) => cy(a.box) - cy(b.box));
  const lines: OcrWord[][] = [];
  for (const w of sorted) {
    const line = lines.find((l) => {
      // A line is as tall as its typical word, not as everything in it: a portrait read as a tall
      // "word" must not pull the two lines of figures beside it into one.
      const h = median(l.map((x) => x.box.height));
      if (w.box.height > h * 2.5 || w.box.height * 2.5 < h) return false;
      const mid = median(l.map((x) => cy(x.box)));
      const overlap = Math.min(mid + h / 2, w.box.y + w.box.height) - Math.max(mid - h / 2, w.box.y);
      return overlap > 0.5 * Math.min(h, w.box.height);
    });
    if (line) line.push(w);
    else lines.push([w]);
  }
  return lines
    .map((l) => {
      const ws = l.sort((a, b) => a.box.x - b.box.x);
      return { text: ws.map((w) => w.text).join(" ").trim(), confidence: ws.reduce((n, w) => n + w.confidence, 0) / ws.length, box: union(ws.map((w) => w.box)) };
    })
    .filter((l) => l.text)
    .sort((a, b) => a.box.y - b.box.y);
}

/** A figure a champion row shows (win rate, KDA, points, level, games), as opposed to a rank or a name. */
export function isStatText(text: string): boolean {
  return parseWinRate(text) !== null || parseKda(text) !== null || /\bkda\b/i.test(text) || /\bpts\b|\bpoints\b/i.test(text) || parseMasteryLevel(text) !== null || /\b\d{1,3}(?:[.,]\d)?\s*k\b/i.test(text) || parseGames(text) !== null;
}

/** A word that belongs to the figures (used to find the columns when the client's lines are not visible). */
function isStatWord(text: string): boolean {
  return /\d/.test(text) || /^(?:kda|pts|lv|lp|games?|%)$/i.test(text.trim());
}

export const TOTAL_LABEL = /total\s*mastery/i;

/** How the text reads: ranked figures, mastery figures, or neither. */
export function kindScores(lines: Array<{ text: string }>): { ranked: number; mastery: number } {
  let ranked = 0, mastery = 0;
  for (const l of lines) {
    if (parseWinRate(l.text) !== null) ranked += 2;
    if (parseKda(l.text) !== null || /\bkda\b/i.test(l.text)) ranked += 1;
    const rank = parseRank(l.text);
    if (rank && rank.tier !== "UNRANKED") ranked += 1;
    if (/\bpts\b|\bpoints\b/i.test(l.text)) mastery += 2;
    if (parseMasteryLevel(l.text) !== null) mastery += 1;
    if (TOTAL_LABEL.test(l.text)) mastery += 3;
  }
  return { ranked, mastery };
}

/** The five columns from the figures' alignment: they form five groups across the screen. */
function columnsFromText(words: OcrWord[], width: number): { columns: Column[]; pitch: number } | null {
  const stat = words.filter((w) => isStatWord(w.text) && w.confidence >= 20);
  if (stat.length < 10) return null;
  const xs = stat.map((w) => cx(w.box)).sort((a, b) => a - b);
  const h = median(stat.map((w) => w.box.height));
  // Groups: a gap wider than a few characters separates columns.
  const gap = Math.max(width * 0.03, h * 3);
  const groups: number[][] = [];
  for (const x of xs) {
    const g = groups.at(-1);
    if (g && x - g.at(-1)! <= gap) g.push(x);
    else groups.push([x]);
  }
  const strong = groups.filter((g) => g.length >= 2);
  if (strong.length < SCOUT_SLOTS) return null;
  // Five neighbouring groups, as evenly spaced and as full as possible.
  let best: { centres: number[]; score: number } | null = null;
  for (let i = 0; i + SCOUT_SLOTS <= strong.length; i++) {
    const five = strong.slice(i, i + SCOUT_SLOTS);
    const centres = five.map((g) => median(g));
    const steps = centres.slice(1).map((c, k) => c - centres[k]!);
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    const spread = Math.max(...steps.map((s) => Math.abs(s - mean))) / mean;
    if (spread > 0.25) continue;
    const score = five.reduce((n, g) => n + g.length, 0) * (1 - spread);
    if (!best || score > best.score) best = { centres, score };
  }
  if (!best) return null;
  const c = best.centres;
  const pitch = (c[4]! - c[0]!) / 4;
  const columns = c.map((centre, slot) => ({ slot, x0: Math.max(0, slot ? (c[slot - 1]! + centre) / 2 : centre - pitch / 2), x1: Math.min(width, slot < 4 ? (centre + c[slot + 1]!) / 2 : centre + pitch / 2) }));
  return { columns, pitch };
}

/** Lines of one column (words whose middle lies in it). */
export function columnLines(words: OcrWord[], col: { x0: number; x1: number }): LineRead[] {
  return groupLines(words.filter((w) => cx(w.box) >= col.x0 && cx(w.box) < col.x1));
}

/** The total mastery figure: a number on its own, printed large under the name. */
export function isTotalFigure(text: string): boolean {
  return /^[\d\s.,]+$/.test(text.trim()) && /^\d{2,4}$/.test(text.replace(/[^\d]/g, ""));
}

/** Lines that hold a column's content: a rank, the total mastery, a figure. */
function isContent(l: LineRead): boolean {
  return TOTAL_LABEL.test(l.text) || !!parseRank(l.text) || isStatText(l.text) || isTotalFigure(l.text);
}

/** Groups items by height on the screen (their middles within `tol` of each other). */
export function clusterByY<T>(items: T[], y: (t: T) => number, tol: number): T[][] {
  const sorted = [...items].sort((a, b) => y(a) - y(b));
  const out: T[][] = [];
  for (const it of sorted) {
    const last = out.at(-1);
    if (last && y(it) - median(last.map(y)) <= tol) last.push(it);
    else out.push([it]);
  }
  return out;
}

/** How much a line reads like a name, with its confidence (0–1). */
export function nameScore(l: { text: string; confidence: number }): number {
  const name = cleanName(l.text);
  if (!name || isTimer(name)) return 0;
  return nameShape(name) * Math.max(0.15, Math.min(1, l.confidence / 100));
}

/**
 * The five columns, the names' row, the header and the body. Null when the screenshot does not
 * show five player columns (then nothing in it is read as a player).
 */
export function findLayout(input: { width: number; height: number; words: OcrWord[]; dividers?: Dividers[] }): ScreenLayout | null {
  const words = input.words.filter((w) => /[\p{L}\p{N}%|]/u.test(w.text));
  // Candidate column sets: from the dividing lines (each set the picture allows), else from the figures.
  const candidates: Array<{ source: "dividers" | "text"; columns: Column[]; pitch: number; top: number | null; bottom: number | null }> = [];
  for (const d of input.dividers ?? []) {
    candidates.push({ source: "dividers", columns: columnsFromDividers(d, input.width).map((c, slot) => ({ slot, ...c })), pitch: d.pitch, top: d.top, bottom: d.bottom });
  }
  const t = columnsFromText(words, input.width);
  if (t) candidates.push({ source: "text", columns: t.columns, pitch: t.pitch, top: null, bottom: null });
  let best: { layout: ScreenLayout; score: number } | null = null;
  for (const c of candidates) {
    const found = layoutWithin(words, input, c);
    // The dividers are trusted over the figures' alignment when both give a reading.
    const score = found ? found.score + (c.source === "dividers" ? 2 : 0) : -1;
    if (found && (!best || score > best.score)) best = { layout: found.layout, score };
  }
  return best?.layout ?? null;
}

function layoutWithin(
  words: OcrWord[],
  input: { width: number; height: number },
  c: { source: "dividers" | "text"; columns: Column[]; pitch: number; top: number | null; bottom: number | null },
): { layout: ScreenLayout; score: number } | null {
  const perColumn = c.columns.map((col) => columnLines(words, col));
  const statHeights = perColumn.flat().filter((l) => isStatText(l.text) && (c.top === null || l.box.y >= c.top)).map((l) => l.box.height);
  const lineHeight = statHeights.length ? median(statHeights) : Math.max(10, c.pitch * 0.055);
  // Content rows: heights where at least three columns show a rank, a total or a figure. A figure
  // in one column only (the top bar's currencies above the fifth column) is not the players'.
  const content = perColumn.flatMap((ls, slot) => ls.filter((l) => isContent(l) && (c.top === null || l.box.y + l.box.height >= c.top)).map((l) => ({ l, slot })));
  const aligned = clusterByY(content, (x) => cy(x.l.box), lineHeight * 0.8).filter((g) => new Set(g.map((x) => x.slot)).size >= 3);
  if (!aligned.length) return null;
  const contentTop = Math.min(...aligned[0]!.map((x) => x.l.box.y));
  const contentBottom = Math.max(...aligned.flat().map((x) => x.l.box.y + x.l.box.height));
  const columnsWithContent = new Set(aligned.flat().map((x) => x.slot)).size;

  // The names' row: above the content, one name-like line per column at the same height.
  const lowest = c.top !== null ? c.top - lineHeight * 3 : contentTop - c.pitch * 0.9;
  const candidates = perColumn.flatMap((ls, slot) => ls.filter((l) => l.box.y + l.box.height <= contentTop + lineHeight * 0.3 && l.box.y >= lowest && !isContent(l)).map((l) => ({ l, slot, s: nameScore(l) })));
  const bands = clusterByY(
    candidates.filter((x) => x.s > 0),
    (x) => cy(x.l.box),
    lineHeight * 0.9,
  ).map((g) => {
    const bySlot = new Map<number, number>();
    for (const x of g) bySlot.set(x.slot, Math.max(bySlot.get(x.slot) ?? 0, x.s));
    const y0 = median(g.map((x) => x.l.box.y)), y1 = median(g.map((x) => x.l.box.y + x.l.box.height));
    const textHeight = median(g.map((x) => x.l.box.height));
    // With the client's lines, names sit where the lines start: bands far from there are something else.
    const near = c.top === null ? 1 : Math.exp(-Math.abs((y0 + y1) / 2 - (c.top + lineHeight * 0.6)) / (lineHeight * 3));
    return { y0, y1, textHeight, columns: bySlot.size, score: [...bySlot.values()].reduce((a, b) => a + b, 0) * (0.5 + 0.5 * near) };
  });
  const picked = bands.filter((b) => b.columns >= 2 || b.score >= 0.6).sort((a, b) => b.score - a.score || b.y1 - a.y1)[0];
  const nameBand = picked
    ? { y0: picked.y0, y1: picked.y1, textHeight: picked.textHeight, found: true }
    : c.top !== null
      ? // Not read: where the client prints names, at the top of its lines.
        { y0: c.top - lineHeight * 0.4, y1: c.top + lineHeight * 1.6, textHeight: lineHeight * 1.2, found: false }
      : { y0: contentTop - lineHeight * 2.8, y1: contentTop - lineHeight * 0.6, textHeight: lineHeight * 1.2, found: false };
  const left = c.columns[0]!.x0, right = c.columns[SCOUT_SLOTS - 1]!.x1;
  const headerTop = Math.max(0, nameBand.y0 - c.pitch * 0.85);
  const header = { x: left, y: headerTop, width: right - left, height: Math.max(0, nameBand.y0 - lineHeight * 0.3 - headerTop) };
  const bodyBottom = Math.max(contentBottom + lineHeight, c.bottom ?? 0);
  const score = columnsWithContent * 2 + (picked ? picked.score : 0) + Math.min(aligned.length, 12) * 0.2;
  return {
    layout: { source: c.source, columns: c.columns, pitch: c.pitch, nameBand, header, bodyTop: nameBand.y1, bodyBottom: Math.min(input.height, bodyBottom), lineHeight },
    score,
  };
}

/** The champion rows (each one or two lines of figures beside a portrait), shared by the columns. */
export function findRows(perColumnStat: LineRead[][], lineHeight: number): RowBand[] {
  // Within a column, lines less than about a line and a half apart belong to one row (its two lines of figures).
  const rows = perColumnStat.flatMap((lines) => {
    const sorted = [...lines].sort((a, b) => a.box.y - b.box.y);
    const out: RowBand[] = [];
    for (const l of sorted) {
      const last = out.at(-1);
      if (last && l.box.y - last.y1 < lineHeight * 1.6) last.y1 = Math.max(last.y1, l.box.y + l.box.height);
      else out.push({ y0: l.box.y, y1: l.box.y + l.box.height });
    }
    return out;
  });
  // Across columns, rows at the same height are the same row; a row seen in one column only is noise.
  const groups = clusterByY(rows, (r) => (r.y0 + r.y1) / 2, lineHeight * 1.2).filter((g) => g.length >= Math.min(2, perColumnStat.filter((l) => l.length).length));
  const bands = groups.map((g) => ({ y0: median(g.map((r) => r.y0)), y1: median(g.map((r) => r.y1)) })).sort((a, b) => a.y0 - b.y0);
  // Rows do not overlap: where two do, the taller one is two rows read as one, and goes.
  for (let i = 0; i + 1 < bands.length; ) {
    const a = bands[i]!, b = bands[i + 1]!;
    if (a.y1 > b.y0 + lineHeight * 0.25) bands.splice(a.y1 - a.y0 > b.y1 - b.y0 ? i : i + 1, 1);
    else i++;
  }
  return bands;
}

/** The figures of one ranked champion row, from its text (sure: the text was read clearly). */
export function rankedRow(text: string, championId: string | null, sure: boolean): RankedChampion {
  const row = { championId, games: parseGames(text), winRate: parseWinRate(text), kda: parseKda(text) };
  return { ...row, certainty: sure && row.winRate !== null && row.games !== null && row.kda !== null ? "high" : "low" };
}

/** The figures of one mastery champion row, from its text. */
export function masteryRow(text: string, championId: string | null, sure: boolean): MasteryChampion {
  const points = parseMasteryPoints(text);
  // The level is printed after a small crest that OCR can misread: a lone number on the level's line still counts.
  let level = parseMasteryLevel(text);
  if (level === null) {
    const rest = text.replace(/\d{1,3}(?:[.,]\d{1,2})?\s*[km]\b|\b\d{1,3}(?:[,.\s]\d{3})+\b|\b\d{4,8}\s*(?:pts|points)\b/gi, " ");
    const lone = /(?:^|\s)(\d{1,2})(?=\s|$)/.exec(rest);
    if (lone && Number(lone[1]) >= 1) level = Number(lone[1]);
  }
  return { championId, level, points, certainty: sure && points !== null && level !== null ? "high" : "low" };
}

/**
 * The team name from the header's words: the tallest words shaped like text, on one line. A logo
 * that OCR reads as letters gives a box far taller than its "letters" are wide, and the client's
 * labels (CLASH, TIER III, the tabs) are never the name.
 */
export function pickOpponentWords(words: OcrWord[]): LineRead | null {
  const shaped = words.filter((w) => {
    const t = cleanName(w.text);
    const letters = [...t].length;
    return !!t && /\p{L}/u.test(t) && w.confidence >= 25 && w.box.height <= 2.2 * (w.box.width / Math.max(1, letters)) && !isLabelOrFigure(t) && !/clash|scout/i.test(t) && (letters >= 2 || hasNonLatin(t));
  });
  if (!shaped.length) return null;
  // Much less sure than the surest word: stray marks (a separator and the labels beside the title, read as letters).
  const surest = Math.max(...shaped.map((w) => w.confidence));
  const sure = shaped.filter((w) => w.confidence >= surest * 0.75);
  const tallest = Math.max(...sure.map((w) => w.box.height));
  const line = groupLines(sure.filter((w) => w.box.height >= tallest * 0.6)).sort((a, b) => b.box.height * b.confidence - a.box.height * a.confidence)[0];
  return line ? { ...line, text: cleanName(line.text) } : null;
}

/** An empty reading: five columns with nothing in them. */
export function emptyRead(layout: ScreenLayout | null = null): ScreenshotRead {
  return { kind: null, kindSure: false, opponent: null, layout, rows: [], columns: Array.from({ length: SCOUT_SLOTS }, (_, slot) => ({ slot, name: null, rank: null, rankLine: null, rankSure: false, totalMastery: null, ranked: [], mastery: [] })) };
}

/**
 * The reading of one screenshot from its words alone (and the portraits found, when given): the
 * layout, the kind, and each column's name, rank, total and champion rows.
 */
export function readScreenshot(input: { width: number; height: number; words: OcrWord[]; portraits: FoundPortrait[]; dividers?: Dividers[]; kind?: ScreenshotKind }): ScreenshotRead {
  const words = input.words.filter((w) => /[\p{L}\p{N}%|]/u.test(w.text));
  const layout = findLayout({ width: input.width, height: input.height, words, dividers: input.dividers });
  if (!layout) return emptyRead(null);
  const { columns, nameBand, lineHeight } = layout;
  const below = words.filter((w) => cy(w.box) > nameBand.y1 && cy(w.box) <= layout.bodyBottom);
  const perColumn = columns.map((col) => columnLines(below, col));

  const scores = kindScores(perColumn.flat());
  const detected: ScreenshotKind | null = scores.ranked === 0 && scores.mastery === 0 ? null : scores.ranked >= scores.mastery ? "ranked" : "mastery";
  const kind = input.kind ?? detected;
  const kindSure = !!input.kind || (detected !== null && Math.max(scores.ranked, scores.mastery) >= 2 * Math.max(1, Math.min(scores.ranked, scores.mastery)));

  // The champion rows' figures start right of their portraits, at the same place in every column;
  // anything read left of there is a portrait read as letters, never a figure.
  const starts = columns
    .map((col) => below.filter((w) => cx(w.box) >= col.x0 && cx(w.box) < col.x1 && /\d/.test(w.text) && isStatText(w.text)).map((w) => w.box.x - col.x0))
    .filter((xs) => xs.length)
    .map((xs) => Math.min(...xs));
  const figureStart = starts.length ? median(starts) - lineHeight : 0;
  const statLines = columns.map((col) => columnLines(below.filter((w) => w.box.x + w.box.width > col.x0 + figureStart), col).filter((l) => isStatText(l.text) && !parseRank(l.text) && !TOTAL_LABEL.test(l.text)));
  const rows = findRows(statLines, lineHeight);
  const portraitsIn = input.portraits.filter((p) => !p.match || p.match.score >= 0.5);

  const out: ColumnRead[] = columns.map((col) => {
    const lines = perColumn[col.slot]!;
    const nameLine = columnLines(
      words.filter((w) => cy(w.box) >= nameBand.y0 - lineHeight * 0.3 && cy(w.box) <= nameBand.y1 + lineHeight * 0.3),
      col,
    )
      .filter((l) => nameScore(l) > 0)
      .sort((a, b) => nameScore(b) - nameScore(a))[0];
    const rankLine = lines.find((l) => parseRank(l.text)) ?? null;
    const totalLabel = lines.find((l) => TOTAL_LABEL.test(l.text));
    const totalLine = lines.find((l) => isTotalFigure(l.text) && (!totalLabel || l.box.y < totalLabel.box.y) && (!rows[0] || l.box.y + l.box.height <= rows[0].y0));
    const statsOf = statLines[col.slot]!;
    const rowText = (r: RowBand) =>
      statsOf
        .filter((l) => cy(l.box) >= r.y0 - lineHeight * 0.5 && cy(l.box) <= r.y1 + lineHeight * 0.5)
        .map((l) => l.text)
        .join(" ");
    const portraitOf = (r: RowBand) =>
      portraitsIn
        .filter((p) => cx(p.box) >= col.x0 && cx(p.box) < col.x1 && cy(p.box) >= r.y0 - (r.y1 - r.y0) && cy(p.box) <= r.y1 + (r.y1 - r.y0))
        .sort((a, b) => Math.abs(cy(a.box) - (r.y0 + r.y1) / 2) - Math.abs(cy(b.box) - (r.y0 + r.y1) / 2))[0];
    const present = rows.filter((r) => rowText(r) || portraitOf(r));
    const champion = (r: RowBand) => {
      const m = portraitOf(r)?.match;
      return { id: m?.confident ? m.championId : null, sure: !!m?.confident };
    };
    const ranked: RankedChampion[] = kind === "ranked" ? present.map((r) => rankedRow(rowText(r), champion(r).id, champion(r).sure)) : [];
    const mastery: MasteryChampion[] = kind === "mastery" ? present.map((r) => masteryRow(rowText(r), champion(r).id, champion(r).sure)) : [];
    return {
      slot: col.slot,
      name: nameLine ? { ...nameLine, text: cleanName(nameLine.text) } : null,
      rank: kind === "ranked" && rankLine ? parseRank(rankLine.text) : null,
      rankLine: kind === "ranked" ? rankLine : null,
      rankSure: false,
      totalMastery: kind === "mastery" && totalLine ? Number(totalLine.text.replace(/[^\d]/g, "")) : null,
      ranked,
      mastery,
    };
  });

  const headerWords = words.filter((w) => cy(w.box) >= layout.header.y && cy(w.box) <= layout.header.y + layout.header.height && cx(w.box) >= layout.header.x && cx(w.box) <= layout.header.x + layout.header.width);
  return { kind, kindSure, opponent: pickOpponentWords(headerWords), columns: out, layout, rows };
}
