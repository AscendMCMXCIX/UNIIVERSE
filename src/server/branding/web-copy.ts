import type { BrandAssetKind } from "@/domain/branding";

/*
  Web copies of branding images. Uploads are kept exactly as they came (up to 20 MB: an animated
  logo can be several MB, a background a few), and an image is read from the database whenever
  the CDN starts cold, as it does after every deployment. A copy made for the screen, WebP at the
  largest size the app draws it, is stored beside the original and served instead
  (repositories/branding.ts). The original stays: nothing is lost, and a better copy can always be
  made from it.
*/

/**
 * The largest each image is drawn, in device pixels: a logo at most 80 CSS pixels (the branding
 * preview and the Team header) on a 3× screen, a background across a 2560-pixel screen.
 */
export const WEB_COPY_MAX_SIDE: Record<BrandAssetKind, number> = { logo: 256, background: 2560, appBackground: 2560 };

/** Inputs larger than this many pixels (all frames together) are left as they are. */
const MAX_INPUT_PIXELS = 60_000_000;

export interface WebCopy {
  contentType: "image/webp";
  data: Buffer;
  width: number;
  height: number;
}

/**
 * A WebP copy of a branding image, animation kept, no larger than it is ever drawn. Null when
 * there is nothing to gain: an SVG, or a copy that would not be clearly smaller.
 */
export async function makeWebCopy(kind: BrandAssetKind, image: { contentType: string; data: Buffer; animated: boolean }): Promise<WebCopy | null> {
  if (image.contentType === "image/svg+xml") return null;
  // Loaded only when a copy is made (once per image), so no other server code carries it.
  const { default: sharp } = await import("sharp");
  const side = WEB_COPY_MAX_SIDE[kind];
  const { data, info } = await sharp(image.data, { animated: image.animated, limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
    .webp({ quality: kind === "logo" ? 85 : 80, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  if (data.length > image.data.length * 0.9) return null;
  // An animation's frames are stacked: its height is one frame's.
  return { contentType: "image/webp", data, width: info.width, height: info.pageHeight ?? info.height };
}
