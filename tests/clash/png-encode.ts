import { deflateSync } from "node:zlib";
import type { Rgba } from "@/domain/clash-scout/champion-print";

/** Test helper: RGBA pixels to a PNG file (no filtering), so regions can be handed to Tesseract in Node. */
export function encodePng(image: Rgba): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    raw[y * (image.width * 4 + 1)] = 0;
    Buffer.from(image.data.buffer, image.data.byteOffset + y * image.width * 4, image.width * 4).copy(raw, y * (image.width * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** A region of an image, enlarged `scale` times (bilinear), as the browser canvas does. */
export function cropScaled(image: Rgba, r: { x: number; y: number; width: number; height: number }, scale: number, pad = 6): Rgba {
  const x0 = Math.max(0, Math.floor(r.x - pad)), y0 = Math.max(0, Math.floor(r.y - pad));
  const w = Math.min(image.width - x0, Math.ceil(r.width + pad * 2)), h = Math.min(image.height - y0, Math.ceil(r.height + pad * 2));
  const W = Math.max(1, Math.round(w * scale)), H = Math.max(1, Math.round(h * scale));
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1.001, Math.max(0, (x + 0.5) / scale - 0.5)), sy = Math.min(h - 1.001, Math.max(0, (y + 0.5) / scale - 0.5));
      const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
      for (let c = 0; c < 4; c++) {
        const p = (xx: number, yy: number) => image.data[((y0 + yy) * image.width + x0 + xx) * 4 + c]!;
        const v = p(ix, iy) * (1 - fx) * (1 - fy) + p(ix + 1, iy) * fx * (1 - fy) + p(ix, iy + 1) * (1 - fx) * fy + p(ix + 1, iy + 1) * fx * fy;
        out[(y * W + x) * 4 + c] = v;
      }
    }
  }
  return { width: W, height: H, data: out };
}
