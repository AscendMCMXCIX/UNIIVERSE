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
