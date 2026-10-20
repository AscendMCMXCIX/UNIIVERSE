import { inflateSync } from "node:zlib";
import type { Rgba } from "@/domain/clash-scout/champion-print";

/*
  A small PNG decoder for the server's own use (champion portraits from Data Dragon): 8-bit
  greyscale, grey+alpha, RGB, RGBA and palette images, not interlaced, which covers Riot's
  portraits. Anything else is refused (null) rather than decoded wrongly. Uses Node's zlib only.
*/

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decodePng(buf: Uint8Array): Rgba | null {
  if (buf.length < 33 || SIGNATURE.some((b, i) => buf[i] !== b)) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8;
  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let alphaTable: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= buf.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(buf[pos + 4]!, buf[pos + 5]!, buf[pos + 6]!, buf[pos + 7]!);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      depth = buf[pos + 16]!;
      colorType = buf[pos + 17]!;
      interlace = buf[pos + 20]!;
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") alphaTable = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const channels = CHANNELS[colorType];
  if (!width || !height || depth !== 8 || interlace !== 0 || !channels || (colorType === 3 && !palette) || width * height > 4_000_000) return null;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + x]! : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels]! : 0;
      let v = line[x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) return null;
      px[y * stride + x] = v & 255;
    }
  }
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, o = i * 4;
    if (colorType === 0) out.set([px[s]!, px[s]!, px[s]!, 255], o);
    else if (colorType === 4) out.set([px[s]!, px[s]!, px[s]!, px[s + 1]!], o);
    else if (colorType === 2) out.set([px[s]!, px[s + 1]!, px[s + 2]!, 255], o);
    else if (colorType === 6) out.set([px[s]!, px[s + 1]!, px[s + 2]!, px[s + 3]!], o);
    else {
      const k = px[s]!;
      out.set([palette![k * 3] ?? 0, palette![k * 3 + 1] ?? 0, palette![k * 3 + 2] ?? 0, alphaTable?.[k] ?? 255], o);
    }
  }
  return { width, height, data: out };
}
