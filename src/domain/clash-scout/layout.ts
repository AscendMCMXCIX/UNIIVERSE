import type { ChampionMatch, Rect } from "./champion-print";
import { cleanName, isLabelOrFigure, parseGames, parseKda, parseMasteryLevel, parseMasteryPoints, parseRank, parseWinRate } from "./text";
import { SCOUT_SLOTS, type MasteryChampion, type RankInfo, type RankedChampion, type ScreenshotKind } from "./types";

/*
  From what was recognised in one screenshot (OCR words with their boxes, and portraits with their
  best champion) to the five players it shows. Clash lays its scouting screens out as five equal
  player panels side by side, the same order on both screens, so the content is split into five
  columns. Within a column the name is the first line that is neither a label nor a figure; the
  rank is the line that reads as one; each champion is a portrait with the figures printed on its
  row. Nothing depends on pixel positions of one client size, so any resolution works as long as
  the five panels are in the picture.
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

export interface ColumnRead {
  slot: number;
  /** Where the name was read (so it can be read again with other scripts and shown for checking). */
  name: LineRead | null;
  rank: RankInfo | null;
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
}

const cx = (r: Rect) => r.x + r.width / 2;
const cy = (r: Rect) => r.y + r.height / 2;

function union(boxes: Rect[]): Rect {
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width)), y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Words of one column grouped into lines (top to bottom), each read left to right. */
export function groupLines(words: OcrWord[]): LineRead[] {
  const sorted = [...words].sort((a, b) => cy(a.box) - cy(b.box));
  const lines: OcrWord[][] = [];
  for (const w of sorted) {
    const line = lines.find((l) => {
      const ref = union(l.map((x) => x.box));
      const overlap = Math.min(ref.y + ref.height, w.box.y + w.box.height) - Math.max(ref.y, w.box.y);
      return overlap > 0.5 * Math.min(ref.height, w.box.height);
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

function kindScores(lines: LineRead[]): { ranked: number; mastery: number } {
  let ranked = 0, mastery = 0;
  for (const l of lines) {
    if (parseWinRate(l.text) !== null) ranked += 2;
    if (parseGames(l.text) !== null || parseKda(l.text) !== null) ranked += 1;
    if (parseMasteryPoints(l.text) !== null) mastery += 2;
    if (parseMasteryLevel(l.text) !== null) mastery += 1;
    if (/mastery/i.test(l.text)) mastery += 3;
    if (/\branked\b|win ?rate/i.test(l.text)) ranked += 3;
  }
  return { ranked, mastery };
}

export function readScreenshot(input: { width: number; height: number; words: OcrWord[]; portraits: FoundPortrait[] }): ScreenshotRead {
  // Low-confidence words are kept: a name in another script reads badly in English at first, and is read again on its own.
  // A lone "|" stays too: it is how OCR often reads a division's "I" ("Platinum |").
  const words = input.words.filter((w) => /[\p{L}\p{N}%|]/u.test(w.text));
  // Portraits: of a typical size (text glyphs can look like small pictures) and, when champions
  // could be compared, actually resembling one.
  const sides = input.portraits.map((p) => Math.min(p.box.width, p.box.height)).sort((a, b) => a - b);
  const median = sides[Math.floor(sides.length / 2)] ?? 0;
  const portraitsIn = input.portraits.filter((p) => {
    const side = Math.min(p.box.width, p.box.height);
    if (sides.length >= 3 && (side < median * 0.7 || side > median * 1.4)) return false;
    return !p.match || p.match.score >= 0.5;
  });
  // The body starts at the first portrait (or rank line); everything above it is the header.
  const allLines = groupLines(words);
  const firstRank = allLines.find((l) => parseRank(l.text));
  const portraitTop = portraitsIn.length ? Math.min(...portraitsIn.map((p) => p.box.y)) : Infinity;
  const bodyTop = Math.min(portraitTop, firstRank ? firstRank.box.y : Infinity);
  // A name sits just above the rank and the portraits: the header ends a little above the body.
  const nameAllowance = Number.isFinite(bodyTop) ? (firstRank?.box.height ?? 24) * 3 : 0;
  const headerBottom = Number.isFinite(bodyTop) ? bodyTop - nameAllowance : input.height * 0.12;
  const header = words.filter((w) => cy(w.box) < headerBottom);
  const body = words.filter((w) => cy(w.box) >= headerBottom);

  // Five equal columns over the content's width.
  const spanItems = [...body.map((w) => w.box), ...portraitsIn.map((p) => p.box)];
  const left = spanItems.length ? Math.min(...spanItems.map((b) => b.x)) : 0;
  const right = spanItems.length ? Math.max(...spanItems.map((b) => b.x + b.width)) : input.width;
  const colWidth = Math.max(1, (right - left) / SCOUT_SLOTS);
  const colOf = (r: Rect) => Math.min(SCOUT_SLOTS - 1, Math.max(0, Math.floor((cx(r) - left) / colWidth)));

  const bodyLines = groupLines(body);
  const scores = kindScores(bodyLines);
  const kind: ScreenshotKind | null = scores.ranked === 0 && scores.mastery === 0 ? null : scores.ranked >= scores.mastery ? "ranked" : "mastery";
  const kindSure = kind !== null && Math.max(scores.ranked, scores.mastery) >= 2 * Math.max(1, Math.min(scores.ranked, scores.mastery));

  const columns: ColumnRead[] = Array.from({ length: SCOUT_SLOTS }, (_, slot) => {
    const lines = groupLines(body.filter((w) => colOf(w.box) === slot));
    const portraits = portraitsIn.filter((p) => colOf(p.box) === slot).sort((a, b) => a.box.y - b.box.y);
    const firstChampionY = portraits[0]?.box.y ?? Infinity;
    const nameLine = lines.find((l) => l.box.y < firstChampionY && !isLabelOrFigure(l.text) && cleanName(l.text).length > 0) ?? null;
    const rank = lines.map((l) => parseRank(l.text)).find((r) => r) ?? null;
    // Each portrait's row: the lines whose middle lies within the portrait's height (a little either side).
    const rowText = (p: FoundPortrait) =>
      lines
        .filter((l) => l !== nameLine && cy(l.box) >= p.box.y - p.box.height * 0.25 && cy(l.box) <= p.box.y + p.box.height * 1.25)
        .map((l) => l.text)
        .join(" ");
    const rows = portraits.length
      ? portraits.map((p) => ({ championId: p.match?.confident ? p.match.championId : null, text: rowText(p), sure: !!p.match?.confident }))
      : // No portraits found: the figure lines alone, champions unknown.
        lines.filter((l) => l !== nameLine && !parseRank(l.text) && (parseWinRate(l.text) !== null || parseMasteryPoints(l.text) !== null)).map((l) => ({ championId: null, text: l.text, sure: false }));
    const ranked: RankedChampion[] = kind === "ranked" ? rows.map((r) => ({ championId: r.championId, games: parseGames(r.text), winRate: parseWinRate(r.text), kda: parseKda(r.text), certainty: r.sure ? "high" : "low" })) : [];
    const mastery: MasteryChampion[] = kind === "mastery" ? rows.map((r) => ({ championId: r.championId, level: parseMasteryLevel(r.text), points: parseMasteryPoints(r.text), certainty: r.sure && parseMasteryPoints(r.text) !== null ? "high" : "low" })) : [];
    return { slot, name: nameLine ? { ...nameLine, text: cleanName(nameLine.text) } : null, rank, ranked, mastery };
  });

  // The opponent's name: the tallest header line that is not a label (the team name is the screen's title).
  const headerLines = groupLines(header).filter((l) => !isLabelOrFigure(l.text) && !/clash|scout/i.test(l.text));
  const opponent = headerLines.sort((a, b) => b.box.height - a.box.height)[0] ?? null;
  return { kind, kindSure, opponent: opponent ? { ...opponent, text: cleanName(opponent.text) } : null, columns };
}
