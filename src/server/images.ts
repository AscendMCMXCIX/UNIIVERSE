/*
  Small, dependency-free image sniffing for uploads: the type comes from the file's own bytes
  (never from the browser's claim), and the dimensions from its header, so oversized or
  disguised files are refused before anything is stored.
*/

export type ImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface ImageInfo {
  type: ImageType;
  width: number;
  height: number;
}

function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1]!;
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function webpSize(buf: Buffer): { width: number; height: number } | null {
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buf.length >= 30) return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (chunk === "VP8 " && buf.length >= 30) return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L" && buf.length >= 25) {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** The real type and size of an image, or null when the bytes are not a supported image. */
export function sniffImage(buf: Buffer): ImageInfo | null {
  if (buf.length < 24) return null;
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { type: "image/png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    const size = jpegSize(buf);
    return size ? { type: "image/jpeg", ...size } : null;
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const size = webpSize(buf);
    return size ? { type: "image/webp", ...size } : null;
  }
  const gif = buf.toString("ascii", 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return { type: "image/gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  return null;
}

/** Decodes a data: URL produced by a canvas or FileReader (base64 only). */
export function decodeDataUrl(dataUrl: string): Buffer | null {
  const m = /^data:[\w/+.-]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  return m ? Buffer.from(m[1]!, "base64") : null;
}

/** Number of frames in a GIF (1 for a still image), walking its blocks; null when malformed. */
export function gifFrameCount(buf: Buffer): number | null {
  if (buf.length < 13 || !/^GIF8[79]a$/.test(buf.toString("ascii", 0, 6))) return null;
  let i = 13;
  const flags = buf[10]!;
  if (flags & 0x80) i += 3 * 2 ** ((flags & 0x07) + 1);
  const skipSubBlocks = () => {
    while (i < buf.length) {
      const size = buf[i]!;
      i += 1;
      if (size === 0) return;
      i += size;
    }
  };
  let frames = 0;
  while (i < buf.length) {
    const block = buf[i]!;
    if (block === 0x3b) return frames;
    if (block === 0x21) {
      i += 2;
      skipSubBlocks();
    } else if (block === 0x2c) {
      frames += 1;
      if (i + 10 > buf.length) return null;
      const local = buf[i + 9]!;
      i += 10;
      if (local & 0x80) i += 3 * 2 ** ((local & 0x07) + 1);
      i += 1; // LZW minimum code size
      skipSubBlocks();
    } else return frames > 0 ? frames : null;
  }
  return frames > 0 ? frames : null;
}

/** Whether an image moves: a GIF with several frames or a WebP with the animation flag. */
export function isAnimated(buf: Buffer, type: ImageType): boolean {
  if (type === "image/gif") return (gifFrameCount(buf) ?? 1) > 1;
  if (type === "image/webp") return buf.toString("ascii", 12, 16) === "VP8X" && (buf[20]! & 0x02) !== 0;
  return false;
}

/** An SVG document (text), for logos only; served sandboxed. */
export function looksLikeSvg(buf: Buffer): boolean {
  const head = buf.toString("utf8", 0, Math.min(buf.length, 1024)).trimStart();
  return (head.startsWith("<svg") || head.startsWith("<?xml")) && buf.toString("utf8").includes("<svg");
}
