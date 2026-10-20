import type { Rect, Rgba } from "./champion-print";

/*
  Pixel work for reading Clash screenshots, the same in the browser and in the tests: cropping,
  resizing, and turning a region into what OCR reads best. The client draws light text on a dark,
  textured background, sometimes coloured (a green or red KDA, gold figures); Tesseract reads dark
  text on a plain light background, at a few dozen pixels high, most reliably. So a region is cut
  out, each pixel becomes its brightest channel (coloured text stays bright), the contrast is
  stretched between the background and the text, the result is inverted and enlarged, and a white
  margin is added. Nothing here changes what the text says; it only makes it easier to read.
*/

export function clampRect(r: Rect, image: { width: number; height: number }): Rect {
  const x = Math.max(0, Math.min(image.width, Math.floor(r.x)));
  const y = Math.max(0, Math.min(image.height, Math.floor(r.y)));
  const x1 = Math.max(x, Math.min(image.width, Math.ceil(r.x + r.width)));
  const y1 = Math.max(y, Math.min(image.height, Math.ceil(r.y + r.height)));
  return { x, y, width: x1 - x, height: y1 - y };
}

export function crop(image: Rgba, region: Rect): Rgba {
  const r = clampRect(region, image);
  const out = new Uint8ClampedArray(Math.max(1, r.width) * Math.max(1, r.height) * 4);
  for (let y = 0; y < r.height; y++) {
    const from = ((r.y + y) * image.width + r.x) * 4;
    out.set(image.data.subarray(from, from + r.width * 4), y * r.width * 4);
  }
  return { width: Math.max(1, r.width), height: Math.max(1, r.height), data: out };
}

/** The image resized by `factor`: bilinear when enlarging, averaging when reducing (so thin strokes are not lost). */
export function resize(image: Rgba, factor: number): Rgba {
  const W = Math.max(1, Math.round(image.width * factor));
  const H = Math.max(1, Math.round(image.height * factor));
  const out = new Uint8ClampedArray(W * H * 4);
  if (factor >= 1) {
    for (let y = 0; y < H; y++) {
      const sy = Math.min(image.height - 1, Math.max(0, (y + 0.5) / factor - 0.5));
      const iy = Math.floor(sy), fy = sy - iy, iy1 = Math.min(image.height - 1, iy + 1);
      for (let x = 0; x < W; x++) {
        const sx = Math.min(image.width - 1, Math.max(0, (x + 0.5) / factor - 0.5));
        const ix = Math.floor(sx), fx = sx - ix, ix1 = Math.min(image.width - 1, ix + 1);
        const a = (iy * image.width + ix) * 4, b = (iy * image.width + ix1) * 4, c = (iy1 * image.width + ix) * 4, d = (iy1 * image.width + ix1) * 4;
        const o = (y * W + x) * 4;
        for (let k = 0; k < 4; k++) out[o + k] = image.data[a + k]! * (1 - fx) * (1 - fy) + image.data[b + k]! * fx * (1 - fy) + image.data[c + k]! * (1 - fx) * fy + image.data[d + k]! * fx * fy;
      }
    }
    return { width: W, height: H, data: out };
  }
  // Reducing: each output pixel averages the source pixels it covers.
  const sx = image.width / W, sy = image.height / H;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < Math.min(image.height, y1); yy++) {
        for (let xx = x0; xx < Math.min(image.width, x1); xx++) {
          const i = (yy * image.width + xx) * 4;
          r += image.data[i]!;
          g += image.data[i + 1]!;
          b += image.data[i + 2]!;
          a += image.data[i + 3]!;
          n++;
        }
      }
      const o = (y * W + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return { width: W, height: H, data: out };
}

/** Brightness as text sees it: the brightest channel, so gold, green and red text stay as bright as white. */
export function brightness(image: Rgba): Uint8Array {
  const out = new Uint8Array(image.width * image.height);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(image.data[i * 4]!, image.data[i * 4 + 1]!, image.data[i * 4 + 2]!);
  return out;
}

/** The value below which `share` of the values lie. */
function percentile(values: Uint8Array, share: number): number {
  const hist = new Uint32Array(256);
  for (const v of values) hist[v]!++;
  const target = share * values.length;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v]!;
    if (seen >= target) return v;
  }
  return 255;
}

export interface PrepareOptions {
  /** The height the text's line should have once enlarged (Tesseract reads 30–40 px text best). */
  textHeight: number;
  /** The height of the text in the source, in source pixels. */
  sourceTextHeight: number;
  /** White margin added around the result, in output pixels. */
  margin?: number;
}

/**
 * A region made ready for OCR: dark text on white, enlarged so its text is about
 * `textHeight` pixels high, with a white margin. Light-on-dark is the client's way; an image
 * whose text is dark on light (a printed or re-coloured screenshot) is kept that way round.
 */
export function prepareForOcr(image: Rgba, region: Rect, opts: PrepareOptions): Rgba {
  const part = crop(image, region);
  const factor = Math.max(0.5, Math.min(6, opts.textHeight / Math.max(4, opts.sourceTextHeight)));
  const sized = Math.abs(factor - 1) < 0.05 ? part : resize(part, factor);
  const light = brightness(sized);
  // Background and text levels: most of a region is background; the text is its brightest part.
  const median = percentile(light, 0.5);
  const lo = percentile(light, 0.2);
  const hi = percentile(light, 0.995);
  const lightText = median < 128;
  const margin = opts.margin ?? 16;
  const W = sized.width + margin * 2, H = sized.height + margin * 2;
  const out = new Uint8ClampedArray(W * H * 4).fill(255);
  const span = Math.max(24, hi - lo);
  for (let y = 0; y < sized.height; y++) {
    for (let x = 0; x < sized.width; x++) {
      const v = light[y * sized.width + x]!;
      // 0 = background, 1 = text.
      let t = (v - lo) / span;
      if (!lightText) t = 1 - t;
      t = Math.max(0, Math.min(1, t));
      // A gentle curve keeps anti-aliased edges but flattens the background's texture.
      const ink = t < 0.18 ? 0 : t > 0.7 ? 1 : (t - 0.18) / 0.52;
      const g = Math.round(255 * (1 - ink));
      const o = ((y + margin) * W + x + margin) * 4;
      out[o] = out[o + 1] = out[o + 2] = g;
      out[o + 3] = 255;
    }
  }
  return { width: W, height: H, data: out };
}

/**
 * A fingerprint of the picture itself rather than its file: the same screenshot pasted again, or
 * pasted once and dropped once as a saved file, gives the same fingerprint and is not read twice.
 * Exact (two FNV-1a hashes over every pixel): a screenshot taken a second later, with the Clash
 * timer moved on, is a different picture and is read.
 */
export function fingerprint(image: Rgba): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9;
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    a = Math.imul(a ^ d[i]!, 0x01000193);
    a = Math.imul(a ^ d[i + 1]!, 0x01000193);
    a = Math.imul(a ^ d[i + 2]!, 0x01000193);
    b = Math.imul(b ^ (d[i]! + (d[i + 1]! << 8) + (d[i + 2]! << 16)), 0x5bd1e995);
    b ^= b >>> 13;
  }
  return `${image.width}x${image.height}-${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
