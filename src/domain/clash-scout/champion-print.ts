/*
  Recognising a champion from its portrait. Every champion's square portrait (Data Dragon) is
  reduced to a small "print": a centred part of the picture averaged down to PRINT_SIZE ×
  PRINT_SIZE colours, then normalised so brightness and contrast do not matter. A portrait cut from
  a screenshot gets the same treatment and is compared with every print (correlation, 1 =
  identical).

  The client does not show the square as it is: it draws a round portrait zoomed into the square's
  centre, with a gold ring beside it. Measured on real client screenshots (Data Dragon 16.18 and
  16.21 against client 26.18), the inner 55% of the round portrait shows the centre 50% of the
  square (REFERENCE_CROP); compared that way, a correct champion scores 0.92–0.99 and the best
  wrong one at most 0.75. The old comparison (the centre 68% of both) never passed 0.76 for any
  of 50 real portraits, so every champion was left unknown. Finding the portrait itself is
  portraits.ts.

  A match is "high" (shown as recognised) only when clearly the best; "low" (shown as a
  suggestion to check) when it is likely but not clear; otherwise the champion stays unknown and
  the member picks it. Nothing is assigned silently.
*/

export const PRINT_SIZE = 12;
export const PRINT_LENGTH = PRINT_SIZE * PRINT_SIZE * 3;
/** The share of a Data Dragon square's side its print is made from, centred (what the client's round portrait shows inside its ring). */
export const REFERENCE_CROP = 0.5;
/**
 * The prints' format: changes whenever prints made before would no longer compare (REFERENCE_CROP,
 * PRINT_SIZE). It is part of the prints' address, so a browser never uses prints of another format
 * from its year-long cache.
 */
export const PRINT_FORMAT = 2;
/** A recognised champion: at least this correlation… */
export const MATCH_SURE = 0.85;
/** …and this far ahead of the best other champion. */
export const MATCH_SURE_MARGIN = 0.15;
/** A champion suggested for checking: at least this correlation… */
export const MATCH_POSSIBLE = 0.75;
/** …and this far ahead of the best other champion. */
export const MATCH_POSSIBLE_MARGIN = 0.08;

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

/** The normalised print of the centred square that is `crop` of a region's shorter side (by default the whole image). */
export function printOf(image: Rgba, region: Rect = { x: 0, y: 0, width: image.width, height: image.height }, crop = 1): Float32Array {
  const side = Math.min(region.width, region.height) * crop;
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
  /** The best score of any other champion. */
  runnerUp: number;
  /** "high": clearly this champion; "low": probably, to be checked; null: not good enough to suggest. */
  certainty: "high" | "low" | null;
}

/** How sure a best score is, given the best score of any other champion (see MATCH_SURE and MATCH_POSSIBLE). */
export function matchCertainty(score: number, runnerUp: number): ChampionMatch["certainty"] {
  if (score >= MATCH_SURE && score - runnerUp >= MATCH_SURE_MARGIN) return "high";
  if (score >= MATCH_POSSIBLE && score - runnerUp >= MATCH_POSSIBLE_MARGIN) return "low";
  return null;
}

/** The best champion for a portrait print, or null when there are no prints. A champion with several prints counts once. */
export function matchChampion(print: Float32Array, prints: ChampionPrints): ChampionMatch | null {
  let best = -2, bestId: string | null = null;
  const scores = new Float32Array(prints.ids.length);
  for (let i = 0; i < prints.ids.length; i++) {
    const s = (scores[i] = similarity(print, prints.prints[i]!));
    if (s > best) {
      best = s;
      bestId = prints.ids[i]!;
    }
  }
  if (!bestId) return null;
  let runnerUp = -2;
  for (let i = 0; i < prints.ids.length; i++) if (prints.ids[i] !== bestId && scores[i]! > runnerUp) runnerUp = scores[i]!;
  return { championId: bestId, score: best, runnerUp, certainty: matchCertainty(best, runnerUp) };
}

export interface EncodedPrints {
  version: string;
  format: number;
  ids: string[];
  size: number;
  data: string;
}

/** Prints travel as one base64 string of signed bytes (each value ×32, clamped): about 0.6 KB per champion. */
export function encodePrints(prints: ChampionPrints): EncodedPrints {
  const bytes = new Int8Array(prints.ids.length * PRINT_LENGTH);
  prints.prints.forEach((p, i) => p.forEach((v, j) => (bytes[i * PRINT_LENGTH + j] = Math.max(-127, Math.min(127, Math.round(v * 32))))));
  return { version: prints.version, format: PRINT_FORMAT, ids: prints.ids, size: PRINT_SIZE, data: bytesToBase64(new Uint8Array(bytes.buffer)) };
}

export function decodePrints(json: { version: string; format?: number; ids: string[]; size: number; data: string }): ChampionPrints {
  if (json.size !== PRINT_SIZE || json.format !== PRINT_FORMAT) throw new Error("Champion prints use another format.");
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
