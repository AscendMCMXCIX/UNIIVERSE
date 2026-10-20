/*
  Recognising a champion from its portrait. Every champion's square portrait (Data Dragon) is
  reduced to a small "print": the centre of the picture (past the frame the client may draw and
  the corners a round mask may hide), averaged down to PRINT_SIZE × PRINT_SIZE colours, then
  normalised so brightness and contrast do not matter. A portrait cut from a screenshot gets the
  same treatment and is compared with every print (correlation, 1 = identical). A match is
  accepted only when it is clearly the best: high enough, and clearly ahead of the runner-up.
  Otherwise the champion stays unknown and the member can pick it.
*/

export const PRINT_SIZE = 12;
export const PRINT_LENGTH = PRINT_SIZE * PRINT_SIZE * 3;
/** The share of the portrait's side kept, centred (0.68 fits inside a round mask). */
export const PRINT_CROP = 0.68;
/** Minimum correlation for a match. */
export const MATCH_MIN = 0.8;
/** How far the best match must lead the second best. */
export const MATCH_MARGIN = 0.06;

/** Pixels as browsers and the PNG decoder give them: RGBA, row by row. */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The normalised print of a region of an image (by default the whole image). */
export function printOf(image: Rgba, region: Rect = { x: 0, y: 0, width: image.width, height: image.height }): Float32Array {
  const side = Math.min(region.width, region.height) * PRINT_CROP;
  const x0 = region.x + (region.width - side) / 2;
  const y0 = region.y + (region.height - side) / 2;
  const cell = side / PRINT_SIZE;
  const out = new Float32Array(PRINT_LENGTH);
  for (let cy = 0; cy < PRINT_SIZE; cy++) {
    for (let cx = 0; cx < PRINT_SIZE; cx++) {
      let r = 0, g = 0, b = 0, n = 0;
      const ys = Math.floor(y0 + cy * cell), ye = Math.max(ys + 1, Math.floor(y0 + (cy + 1) * cell));
      const xs = Math.floor(x0 + cx * cell), xe = Math.max(xs + 1, Math.floor(x0 + (cx + 1) * cell));
      for (let y = Math.max(0, ys); y < Math.min(image.height, ye); y++) {
        for (let x = Math.max(0, xs); x < Math.min(image.width, xe); x++) {
          const i = (y * image.width + x) * 4;
          r += image.data[i]!;
          g += image.data[i + 1]!;
          b += image.data[i + 2]!;
          n++;
        }
      }
      const o = (cy * PRINT_SIZE + cx) * 3;
      out[o] = n ? r / n : 0;
      out[o + 1] = n ? g / n : 0;
      out[o + 2] = n ? b / n : 0;
    }
  }
  return normalise(out);
}

function normalise(v: Float32Array): Float32Array {
  let mean = 0;
  for (const x of v) mean += x;
  mean /= v.length;
  let sq = 0;
  for (const x of v) sq += (x - mean) ** 2;
  const sd = Math.sqrt(sq / v.length) || 1;
  for (let i = 0; i < v.length; i++) v[i] = (v[i]! - mean) / sd;
  return v;
}

/** Correlation of two normalised prints, −1…1. */
export function similarity(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s / a.length;
}

export interface ChampionPrints {
  /** The Data Dragon version the prints were made from. */
  version: string;
  ids: string[];
  prints: Float32Array[];
}

export interface ChampionMatch {
  championId: string;
  score: number;
  /** Whether it is clearly the best match (see MATCH_MIN and MATCH_MARGIN). */
  confident: boolean;
}

/** The best champion for a portrait print, or null when there are no prints. */
export function matchChampion(print: Float32Array, prints: ChampionPrints): ChampionMatch | null {
  let best = -2, second = -2, bestId: string | null = null;
  for (let i = 0; i < prints.ids.length; i++) {
    const s = similarity(print, prints.prints[i]!);
    if (s > best) {
      second = best;
      best = s;
      bestId = prints.ids[i]!;
    } else if (s > second) second = s;
  }
  if (!bestId) return null;
  return { championId: bestId, score: best, confident: best >= MATCH_MIN && best - second >= MATCH_MARGIN };
}

/** Prints travel as one base64 string of signed bytes (each value ×32, clamped): about 0.6 KB per champion. */
export function encodePrints(prints: ChampionPrints): { version: string; ids: string[]; size: number; data: string } {
  const bytes = new Int8Array(prints.ids.length * PRINT_LENGTH);
  prints.prints.forEach((p, i) => p.forEach((v, j) => (bytes[i * PRINT_LENGTH + j] = Math.max(-127, Math.min(127, Math.round(v * 32))))));
  return { version: prints.version, ids: prints.ids, size: PRINT_SIZE, data: bytesToBase64(new Uint8Array(bytes.buffer)) };
}

export function decodePrints(json: { version: string; ids: string[]; size: number; data: string }): ChampionPrints {
  if (json.size !== PRINT_SIZE) throw new Error("Champion prints use another size.");
  const bytes = new Int8Array(base64ToBytes(json.data).buffer);
  const prints = json.ids.map((_, i) => normalise(Float32Array.from(bytes.subarray(i * PRINT_LENGTH, (i + 1) * PRINT_LENGTH), (v) => v / 32)));
  return { version: json.version, ids: json.ids, prints };
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(s: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(s, "base64"));
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
