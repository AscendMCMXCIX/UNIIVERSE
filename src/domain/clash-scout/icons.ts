import type { Rect, Rgba } from "./champion-print";

/*
  Finding champion portraits in a screenshot without knowing exact positions: the client draws
  them as square (or round) pictures, densely detailed and colourful, on a dark, mostly flat
  background. The image is divided into small cells; a cell is "busy" when its brightness varies
  or its colour is saturated. Connected busy cells form regions, and a region is a portrait
  candidate when it is about square, mostly filled and of a portrait's size. Text lines form wide,
  sparse regions and are left out. Each candidate is then checked against the champion prints:
  only a clear match becomes a champion (champion-print.ts).
*/

export interface PortraitCandidate extends Rect {
  /** Share of the region's cells that are busy, 0–1. */
  fill: number;
}

/**
 * The champion portrait within a region where one is expected (left of a champion row's figures):
 * the largest busy, roughly square area there. When none stands out, the region's own square
 * centre is the best guess (the caller only trusts a confident champion match either way).
 */
export function portraitIn(image: Rgba, region: Rect): Rect {
  const x0 = Math.max(0, Math.floor(region.x)), y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(image.width, Math.ceil(region.x + region.width)), y1 = Math.min(image.height, Math.ceil(region.y + region.height));
  const w = x1 - x0, h = y1 - y0;
  const side = Math.min(w, h);
  const guess = { x: x1 - side, y: y0 + (h - side) / 2, width: side, height: side };
  if (w < 8 || h < 8) return guess;
  const cell = Math.max(2, Math.round(side / 24));
  const gw = Math.floor(w / cell), gh = Math.floor(h / cell);
  const busy = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0, sq = 0, sat = 0, n = 0;
      for (let y = y0 + gy * cell; y < y0 + (gy + 1) * cell; y++) {
        for (let x = x0 + gx * cell; x < x0 + (gx + 1) * cell; x++) {
          const i = (y * image.width + x) * 4;
          const r = image.data[i]!, g = image.data[i + 1]!, b = image.data[i + 2]!;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          sum += lum;
          sq += lum * lum;
          sat += max > 24 ? (max - min) / max : 0;
          n++;
        }
      }
      const mean = sum / n;
      busy[gy * gw + gx] = Math.sqrt(Math.max(0, sq / n - mean * mean)) > 14 || (sat / n > 0.3 && mean > 36) || mean > 70 ? 1 : 0;
    }
  }
  const seen = new Uint8Array(gw * gh);
  let best: { box: Rect; count: number } | null = null;
  const stack: number[] = [];
  for (let start = 0; start < busy.length; start++) {
    if (!busy[start] || seen[start]) continue;
    let bx0 = gw, by0 = gh, bx1 = 0, by1 = 0, count = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % gw, y = (k - x) / gw;
      count++;
      bx0 = Math.min(bx0, x);
      bx1 = Math.max(bx1, x);
      by0 = Math.min(by0, y);
      by1 = Math.max(by1, y);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const nk = ny * gw + nx;
        if (busy[nk] && !seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    const bw = (bx1 - bx0 + 1) * cell, bh = (by1 - by0 + 1) * cell;
    const aspect = bw / bh;
    if (aspect < 0.7 || aspect > 1.4 || Math.min(bw, bh) < side * 0.4) continue;
    if (!best || count > best.count) best = { box: { x: x0 + bx0 * cell, y: y0 + by0 * cell, width: bw, height: bh }, count };
  }
  if (!best) return guess;
  // A round portrait in a square box: make it square around its centre.
  const s = Math.max(best.box.width, best.box.height);
  return { x: best.box.x + best.box.width / 2 - s / 2, y: best.box.y + best.box.height / 2 - s / 2, width: s, height: s };
}

export function findPortraits(image: Rgba): PortraitCandidate[] {
  const cell = Math.max(2, Math.round(Math.max(image.width, image.height) / 640));
  const gw = Math.floor(image.width / cell);
  const gh = Math.floor(image.height / cell);
  const busy = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0, sq = 0, sat = 0, n = 0;
      for (let y = gy * cell; y < (gy + 1) * cell; y++) {
        for (let x = gx * cell; x < (gx + 1) * cell; x++) {
          const i = (y * image.width + x) * 4;
          const r = image.data[i]!, g = image.data[i + 1]!, b = image.data[i + 2]!;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          sum += lum;
          sq += lum * lum;
          sat += max > 24 ? (max - min) / max : 0;
          n++;
        }
      }
      const mean = sum / n;
      const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
      busy[gy * gw + gx] = sd > 14 || (sat / n > 0.32 && mean > 40) ? 1 : 0;
    }
  }

  const seen = new Uint8Array(gw * gh);
  const out: PortraitCandidate[] = [];
  const minSide = Math.max(14, image.width * 0.012);
  const maxSide = Math.max(minSide * 2, Math.min(image.width, image.height) * 0.22);
  const stack: number[] = [];
  for (let start = 0; start < busy.length; start++) {
    if (!busy[start] || seen[start]) continue;
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0, count = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % gw, y = (k - x) / gw;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const nk = ny * gw + nx;
        if (busy[nk] && !seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    const w = (x1 - x0 + 1) * cell, h = (y1 - y0 + 1) * cell;
    const aspect = w / h;
    const fill = count / ((x1 - x0 + 1) * (y1 - y0 + 1));
    if (aspect < 0.75 || aspect > 1.33 || fill < 0.6 || Math.min(w, h) < minSide || Math.max(w, h) > maxSide) continue;
    out.push({ x: x0 * cell, y: y0 * cell, width: w, height: h, fill });
  }
  return out;
}

/**
 * The team logo at the start of a header: a large, busy, roughly square picture whose left edge is
 * near the region's left, as tall as a good part of the region. Null when there is none.
 */
export function findLogo(image: Rgba, region: Rect): Rect | null {
  const box = portraitIn(image, { ...region, width: Math.min(region.width, region.height * 1.6) });
  const busyEnough = box.height >= region.height * 0.35 && box.x - region.x <= region.height * 0.6;
  // portraitIn falls back to the region's own square when it finds nothing: that is not a logo.
  const isGuess = Math.abs(box.height - Math.min(region.width, region.height * 1.6, region.height)) < 1 && Math.abs(box.y - (region.y + (region.height - box.height) / 2)) < 1;
  return busyEnough && !isGuess ? box : null;
}
