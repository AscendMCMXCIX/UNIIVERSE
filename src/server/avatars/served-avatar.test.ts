import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { AVATAR_SERVED_SIDE, makeServedCopy } from "./served-avatar";

/** A noisy square PNG, so it does not compress to almost nothing. */
async function png(side: number): Promise<Buffer> {
  const raw = Buffer.alloc(side * side * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919 + (i >> 5) * 104729) & 0xff;
  return sharp(raw, { raw: { width: side, height: side, channels: 3 } }).png().toBuffer();
}

describe("the picture as served (avatars/served-avatar.ts)", () => {
  it("a large upload is served as WebP no larger than it is ever drawn, and much smaller", async () => {
    const original = await png(1024);
    const copy = await makeServedCopy({ contentType: "image/png", data: original });
    expect(copy.contentType).toBe("image/webp");
    const meta = await sharp(copy.data).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(AVATAR_SERVED_SIDE);
    expect(copy.data.length).toBeLessThan(original.length / 4);
  });

  it("a picture already small is served as it was stored, never enlarged", async () => {
    const original = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#336699" } }).webp().toBuffer();
    const copy = await makeServedCopy({ contentType: "image/webp", data: original });
    expect(copy.data.equals(original)).toBe(true);
  });

  it("bytes that cannot be decoded are served as stored rather than failing", async () => {
    const original = Buffer.from("not a picture");
    expect(await makeServedCopy({ contentType: "image/png", data: original })).toEqual({ contentType: "image/png", data: original });
  });
});
