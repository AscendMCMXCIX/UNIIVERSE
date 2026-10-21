import { matchCertainty, printOf, similarity, type ChampionMatch, type ChampionPrints, type Rect, type Rgba } from "./champion-print";

/*
  Where each champion portrait is, exactly, and which champion it shows.

  The rows' portraits are found as boxes on a grid (recognize.ts: one x per column, one y per row,
  one size): each box holds the round portrait and the gold ring the client draws partly around
  it, so the portrait itself sits a little right of and below the box's centre. Its inner part is
  compared with the champion prints (champion-print.ts) at the client's zoom.

  How far right, how far down and how large differ a little between captures (scaled, compressed,
  a client in a window), so the geometry is measured on each screenshot rather than assumed: a few
  portraits are compared over a small range of positions and sizes, and the geometry most of the
  clearly recognised ones agree on is used for every portrait, each then fine-tuned by a pixel or
  two. A screenshot whose portraits nothing recognises keeps the geometry measured on the client's
  own screenshots (GEOMETRY).

  Cost: about 25 × 25 small prints compared with ~170 champions each, a fraction of a second.
*/

/** One portrait's place: its box on the grid (portrait and ring), in screenshot pixels. */
export interface PortraitCell {
  slot: number;
  band: number;
  box: Rect;
}

/** Where the compared square sits, as shares of the box's side: its centre's offset and its size. */
export interface PortraitGeometry {
  dx: number;
  dy: number;
  size: number;
}

/** Measured on the League client's own scouting screenshots (1080p, 76 px boxes). */
export const GEOMETRY: PortraitGeometry = { dx: 0.055, dy: 0.065, size: 0.55 };

export interface PortraitMatch extends PortraitCell {
  /** The best champion and how sure it is; null without prints. */
  match: ChampionMatch | null;
}

const SIZES = [0.5, 0.55, 0.6];
/** How far the calibration looks around GEOMETRY, and in what steps (shares of the side). */
const REACH = 0.12;
const STEP = 0.04;
/** The fine-tuning around the measured geometry, per portrait. */
const FINE_REACH = 0.03;
const FINE_STEP = 0.015;
/** Portraits measured for the calibration: enough to outvote a misplaced one, few enough to stay quick. */
const SAMPLE = 6;

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

function squareAt(box: Rect, g: PortraitGeometry, side: number): Rect {
  const s = side * g.size;
  return { x: box.x + box.width / 2 + g.dx * side - s / 2, y: box.y + box.height / 2 + g.dy * side - s / 2, width: s, height: s };
}

/** The best score any champion reaches for this square, and which. */
function best(image: Rgba, region: Rect, prints: ChampionPrints): { score: number; index: number } {
  const p = printOf(image, region);
  let score = -2, index = -1;
  for (let i = 0; i < prints.prints.length; i++) {
    const s = similarity(p, prints.prints[i]!);
    if (s > score) {
      score = s;
      index = i;
    }
  }
  return { score, index };
}

/** The geometry most clearly recognised portraits of this screenshot agree on (GEOMETRY when none). */
export function measureGeometry(image: Rgba, cells: readonly PortraitCell[], prints: ChampionPrints, side: number): PortraitGeometry {
  if (!prints.prints.length || !cells.length) return GEOMETRY;
  // Spread over the columns and rows: every few cells, never two neighbours only.
  const step = Math.max(1, Math.floor(cells.length / SAMPLE));
  const sample = cells.filter((_, i) => i % step === 0).slice(0, SAMPLE);
  const found: PortraitGeometry[] = [];
  for (const cell of sample) {
    let top = { score: -2, g: GEOMETRY };
    for (const size of SIZES)
      for (let dx = GEOMETRY.dx - REACH; dx <= GEOMETRY.dx + REACH + 1e-9; dx += STEP)
        for (let dy = GEOMETRY.dy - REACH; dy <= GEOMETRY.dy + REACH + 1e-9; dy += STEP) {
          const g = { dx, dy, size };
          const { score } = best(image, squareAt(cell.box, g, side), prints);
          if (score > top.score) top = { score, g };
        }
    // Only a portrait clearly recognised somewhere in the range tells where portraits are.
    if (top.score >= 0.8) found.push(top.g);
  }
  if (found.length < 2) return GEOMETRY;
  return { dx: median(found.map((g) => g.dx)), dy: median(found.map((g) => g.dy)), size: median(found.map((g) => g.size)) };
}

/** Each portrait compared with every champion's print, at this screenshot's geometry fine-tuned per portrait. */
export function matchPortraits(image: Rgba, cells: readonly PortraitCell[], prints: ChampionPrints | null): PortraitMatch[] {
  if (!prints || !prints.prints.length) return cells.map((c) => ({ ...c, match: null }));
  const side = median(cells.map((c) => Math.min(c.box.width, c.box.height)));
  const g = measureGeometry(image, cells, prints, side);
  return cells.map((cell) => {
    let top: { score: number; region: Rect } | null = null;
    for (let dx = g.dx - FINE_REACH; dx <= g.dx + FINE_REACH + 1e-9; dx += FINE_STEP)
      for (let dy = g.dy - FINE_REACH; dy <= g.dy + FINE_REACH + 1e-9; dy += FINE_STEP) {
        const region = squareAt(cell.box, { dx, dy, size: g.size }, side);
        const { score } = best(image, region, prints);
        if (!top || score > top.score) top = { score, region };
      }
    // The runner-up is judged at the same place as the best: another champion's own best place
    // elsewhere would make every match look closer than it is.
    const p = printOf(image, top!.region);
    let score = -2, championId: string | null = null;
    const scores = prints.prints.map((q) => similarity(p, q));
    scores.forEach((s, i) => {
      if (s > score) {
        score = s;
        championId = prints.ids[i]!;
      }
    });
    let runnerUp = -2;
    scores.forEach((s, i) => {
      if (prints.ids[i] !== championId && s > runnerUp) runnerUp = s;
    });
    return { ...cell, match: championId ? { championId, score, runnerUp, certainty: matchCertainty(score, runnerUp) } : null };
  });
}
