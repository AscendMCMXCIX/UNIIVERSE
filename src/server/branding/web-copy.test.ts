import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { makeWebCopy, WEB_COPY_MAX_SIDE } from "./web-copy";

/** Random pixels: an image that no format can shrink much without loss, like a busy photo. */
async function noise(width: number, height: number, format: "png" | "webp" = "png"): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  let x = 2463534242;
  for (let i = 0; i < pixels.length; i++) {
    // xorshift32: the same "random" pixels every run.
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    pixels[i] = x & 0xff;
  }
  const image = sharp(pixels, { raw: { width, height, channels: 3 } });
  return format === "png" ? image.png().toBuffer() : image.webp({ quality: 50 }).toBuffer();
}

/** An animated GIF of `frames` frames, each a different colour with a pattern. */
async function animatedGif(side: number, frames: number): Promise<Buffer> {
  const stills = await Promise.all(
    Array.from({ length: frames }, (_, f) => {
      const pixels = Buffer.alloc(side * side * 3);
      for (let i = 0; i < side * side; i++) {
        pixels[i * 3] = (i + f * 40) % 256;
        pixels[i * 3 + 1] = (Math.floor(i / side) * 3 + f * 60) % 256;
        pixels[i * 3 + 2] = f * 50;
      }
      return sharp(pixels, { raw: { width: side, height: side, channels: 3 } }).png().toBuffer();
    }),
  );
  return sharp(stills, { join: { animated: true } }).gif({ delay: 80 }).toBuffer();
}

describe("web copies of branding images", () => {
  it("draws a background no larger than a 2560-pixel screen, as WebP, much smaller", async () => {
    const original = await noise(3000, 1600);
    const copy = await makeWebCopy("background", { contentType: "image/png", data: original, animated: false });
    expect(copy).not.toBeNull();
    expect(copy!.contentType).toBe("image/webp");
    expect([copy!.width, copy!.height]).toEqual([WEB_COPY_MAX_SIDE.background, 1365]);
    expect(copy!.data.length).toBeLessThan(original.length / 2);
    expect((await sharp(copy!.data).metadata()).format).toBe("webp");
  });

  it("keeps a logo's animation, every frame, at the largest size a logo is drawn", async () => {
    const original = await animatedGif(420, 4);
    expect((await sharp(original, { animated: true }).metadata()).pages).toBe(4);
    const copy = await makeWebCopy("logo", { contentType: "image/gif", data: original, animated: true });
    expect(copy).not.toBeNull();
    expect([copy!.width, copy!.height]).toEqual([256, 256]);
    const meta = await sharp(copy!.data, { animated: true }).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.pages).toBe(4);
    expect(copy!.data.length).toBeLessThan(original.length);
  });

  it("never enlarges a small image", async () => {
    const copy = await makeWebCopy("appBackground", { contentType: "image/png", data: await noise(800, 450), animated: false });
    expect([copy!.width, copy!.height]).toEqual([800, 450]);
  });

  it("leaves an SVG, and an image a copy would not clearly shrink, as they are", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
    expect(await makeWebCopy("logo", { contentType: "image/svg+xml", data: svg, animated: false })).toBeNull();
    const small = await noise(64, 64, "webp");
    expect(await makeWebCopy("logo", { contentType: "image/webp", data: small, animated: false })).toBeNull();
  });
});
