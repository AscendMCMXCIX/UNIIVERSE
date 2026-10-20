import type { Rgba } from "./champion-print";

/*
  Where the five players' columns are, from the picture itself. The client separates the five
  columns of its scouting screens with thin vertical lines; they are the most regular thing in the
  image: four lines, equally spaced, running down most of its height. Text and portraits make
  short vertical strokes, and the rest of the client (the friends list, the Clash schedule, the
  top bar) has edges but never four equally spaced lines. Finding those lines gives the columns
  exactly, at any size, before any text is read, so nothing outside them can be taken for a player.
*/

export interface Dividers {
  /** The four lines between the five columns, left to right (image x). */
  xs: number[];
  /** Their spacing: one column's width. */
  pitch: number;
  /** Where the lines start and end (image y). */
  top: number;
  bottom: number;
  /** How much of the image's height the lines cover, on average (0–1). */
  strength: number;
}

interface Line {
  x: number;
  /** Longest run of the line, as a share of the rows looked at. */
  run: number;
  top: number;
  bottom: number;
}

/** Candidate vertical lines: a narrow ridge of light that runs a long way down the image. */
function verticalLines(image: Rgba): Line[] {
  const { width: w, height: h, data } = image;
  if (w < 200 || h < 120) return [];
  // Neighbours this far either side must both be darker than the line itself.
  const d = Math.max(2, Math.round(w / 640));
  const step = Math.max(1, Math.round(h / 540));
  const y0 = Math.floor(h * 0.08), y1 = Math.floor(h * 0.99);
  const rows = Math.floor((y1 - y0) / step);
  const light = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return Math.max(data[i]!, data[i + 1]!, data[i + 2]!);
  };
  // For each column of pixels: the longest run of rows where it is a ridge (gaps of a few rows allowed, for text crossing it).
  const best: Line[] = [];
  const allowGap = Math.max(2, Math.round(rows * 0.012));
  for (let x = d; x < w - d; x++) {
    let runStart = -1, lastOn = -1, bestRun = 0, bestStart = 0, bestEnd = 0;
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * step;
      const c = light(x, y);
      const on = c - Math.max(light(x - d, y), light(x + d, y)) >= 12 && c >= 40;
      if (on) {
        if (runStart < 0 || r - lastOn > allowGap) runStart = r;
        lastOn = r;
        const len = r - runStart + 1;
        if (len > bestRun) {
          bestRun = len;
          bestStart = runStart;
          bestEnd = r;
        }
      }
    }
    if (bestRun / rows >= 0.2) best.push({ x, run: bestRun / rows, top: y0 + bestStart * step, bottom: y0 + bestEnd * step });
  }
  // Neighbouring x's are one line (a line can be several pixels wide): keep the strongest, centred.
  const merged: Line[] = [];
  for (const l of best) {
    const last = merged.at(-1);
    if (last && l.x - last.x <= d + 1) {
      if (l.run > last.run) merged[merged.length - 1] = { ...l, x: (l.x + last.x) / 2 };
      else last.x = (last.x + l.x) / 2;
    } else merged.push({ ...l });
  }
  return merged;
}

/**
 * Every set of four equally spaced long lines that could separate five columns, the most
 * convincing first (several can exist when an outer edge happens to be drawn as a line too).
 */
export function findDividerSets(image: Rgba): Dividers[] {
  const lines = verticalLines(image);
  if (lines.length < 4) return [];
  const w = image.width;
  const sets: Dividers[] = [];
  const n = lines.length;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const pitch = lines[b]!.x - lines[a]!.x;
      if (pitch < w * 0.06 || pitch > w * 0.3) continue;
      const tol = Math.max(3, pitch * 0.025);
      const pick = [lines[a]!, lines[b]!];
      for (const k of [2, 3]) {
        const want = lines[a]!.x + pitch * k;
        const found = lines.filter((l) => Math.abs(l.x - want) <= tol).sort((p, q) => q.run - p.run)[0];
        if (!found) break;
        pick.push(found);
      }
      if (pick.length !== 4) continue;
      // The five columns must fit in the picture (the outer two may be cut by a cropped screenshot, but not lost).
      if (pick[0]!.x - pitch < -pitch * 0.35 || pick[3]!.x + pitch > w + pitch * 0.35) continue;
      const tops = pick.map((l) => l.top).sort((p, q) => p - q);
      const bottoms = pick.map((l) => l.bottom).sort((p, q) => p - q);
      // The lines run alongside each other: similar starts and ends.
      const top = (tops[1]! + tops[2]!) / 2, bottom = (bottoms[1]! + bottoms[2]!) / 2;
      if (bottom - top < image.height * 0.2) continue;
      if (tops[3]! - tops[0]! > (bottom - top) * 0.35 || bottoms[3]! - bottoms[0]! > (bottom - top) * 0.35) continue;
      const strength = pick.reduce((s, l) => s + l.run, 0) / 4;
      const xs = pick.map((l) => l.x);
      const exactPitch = (xs[3]! - xs[0]!) / 3;
      if (!sets.some((s) => s.xs.every((x, i) => Math.abs(x - xs[i]!) < tol))) sets.push({ xs, pitch: exactPitch, top, bottom, strength });
    }
  }
  return sets.sort((p, q) => q.strength - p.strength).slice(0, 3);
}

/** The five columns either side of four dividers, clipped to the image. */
export function columnsFromDividers(d: Dividers, width: number): Array<{ x0: number; x1: number }> {
  const edges = [d.xs[0]! - d.pitch, ...d.xs, d.xs[3]! + d.pitch];
  return Array.from({ length: 5 }, (_, i) => ({ x0: Math.max(0, edges[i]!), x1: Math.min(width, edges[i + 1]!) }));
}
