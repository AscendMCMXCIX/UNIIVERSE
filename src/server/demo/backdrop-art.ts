import { deflateSync } from "node:zlib";

/*
  A synthetic background artwork for screenshot and layout checks only (the in-memory demo with
  UNIIVERSE_DEMO_SCREENSHOT=1): a dark night sky with two soft nebulae in the brand's cyan and
  violet, a ring and a scatter of stars, drawn here so the demo has detailed artwork to test Team
  Overview's background visibility against. Never used with a real database. Encoded as a PNG with
  Node's zlib (no image library).
*/

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function demoBackdropPng(width = 1280, height = 720): Buffer {
  let seed = 1999;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280), seed / 233280);
  const stars = Array.from({ length: 420 }, () => ({ x: rnd() * width, y: rnd() * height, r: 0.6 + rnd() * 1.6, a: 0.35 + rnd() * 0.65 }));
  const blobs = [
    { x: 0.28, y: 0.38, rx: 0.34, ry: 0.42, c: [31, 195, 255], a: 0.55 },
    { x: 0.74, y: 0.3, rx: 0.3, ry: 0.36, c: [140, 92, 255], a: 0.5 },
    { x: 0.55, y: 0.85, rx: 0.5, ry: 0.25, c: [88, 168, 242], a: 0.3 },
  ];
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;
      // Night-blue base, lighter towards the middle.
      let r = 8 + 10 * (1 - v);
      let g = 12 + 14 * (1 - v);
      let b = 36 + 30 * (1 - Math.abs(u - 0.5));
      for (const n of blobs) {
        const d = ((u - n.x) / n.rx) ** 2 + ((v - n.y) / n.ry) ** 2;
        const w = n.a * Math.exp(-d * 2.2) * (0.85 + 0.15 * Math.sin(u * 37 + v * 23));
        r += n.c[0]! * w;
        g += n.c[1]! * w;
        b += n.c[2]! * w;
      }
      // A thin ring around the centre, like a portal or a logo mark.
      const ring = Math.abs(Math.hypot((u - 0.5) * (width / height), v - 0.48) - 0.3);
      const glow = Math.exp(-((ring / 0.006) ** 2)) * 0.9 + Math.exp(-((ring / 0.03) ** 2)) * 0.25;
      r += 127 * glow;
      g += 220 * glow;
      b += 255 * glow;
      const i = row + 1 + x * 3;
      raw[i] = Math.min(255, r);
      raw[i + 1] = Math.min(255, g);
      raw[i + 2] = Math.min(255, b);
    }
  }
  for (const s of stars) {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.round(s.x) + dx;
        const y = Math.round(s.y) + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const a = s.a * Math.max(0, 1 - Math.hypot(dx, dy) / (s.r + 0.5));
        const i = y * (width * 3 + 1) + 1 + x * 3;
        for (let k = 0; k < 3; k++) raw[i + k] = Math.min(255, raw[i + k]! + 255 * a);
      }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}
