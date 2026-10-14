"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission } from "@/server/auth/session";
import { BRAND_LIMITS, BRAND_STATIC_MAX_BYTES, checkContrast, DEFAULT_BRANDING, parseBranding, type BrandAssetKind, type Branding } from "@/domain/branding";
import { getBranding, removeBrandAsset, saveBranding, setBrandAsset } from "@/server/repositories/branding";
import { decodeDataUrl, isAnimated, looksLikeSvg, sniffImage } from "@/server/images";

type Result = { ok: true; data: Branding } | { ok: false; error: string };

/** Names, tagline and colours. Colours that would make text unreadable are refused. */
export async function saveBrandingAction(input: Partial<Branding>): Promise<Result> {
  try {
    await requirePermission("manage-branding");
    const parsed = parseBranding(input);
    const failing = checkContrast(parsed).filter((c) => !c.ok);
    if (failing.length) return { ok: false, error: `Not readable enough: ${failing.map((c) => c.message).join("; ")}.` };
    const db = await getAppDb();
    const saved = await saveBranding(db, parsed);
    revalidatePath("/", "layout");
    return { ok: true, data: saved };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Back to the UNIIVERSE names and colours (images are kept; remove them separately). */
export async function resetBrandingAction(): Promise<Result> {
  return saveBrandingAction(DEFAULT_BRANDING);
}

/**
 * Uploads a logo or background. The browser sends the file as it is (GIFs keep their animation)
 * plus, for animated images, a still first frame it drew on a canvas; the server checks the real
 * type, size and dimensions of both.
 */
export async function uploadBrandAssetAction(kind: BrandAssetKind, dataUrl: string, stillDataUrl: string | null): Promise<Result> {
  try {
    await requirePermission("manage-branding");
    const limit = BRAND_LIMITS[kind];
    if (!limit) return { ok: false, error: "Unknown image." };
    const data = decodeDataUrl(dataUrl);
    if (!data) return { ok: false, error: "That file could not be read." };
    if (data.length > limit.maxBytes) return { ok: false, error: `Too large: keep it under ${limit.label}.` };
    const info = sniffImage(data);
    let image: { contentType: string; data: Buffer; width: number | null; height: number | null; animated: boolean };
    if (info) {
      if (info.width < 16 || info.height < 16) return { ok: false, error: "Too small: at least 16×16 pixels." };
      if (info.width > limit.maxSide || info.height > limit.maxSide) return { ok: false, error: `Too large: at most ${limit.maxSide}×${limit.maxSide} pixels.` };
      image = { contentType: info.type, data, width: info.width, height: info.height, animated: isAnimated(data, info.type) };
    } else if (kind === "logo" && looksLikeSvg(data)) {
      image = { contentType: "image/svg+xml", data, width: null, height: null, animated: false };
    } else return { ok: false, error: kind === "logo" ? "Use a PNG, JPEG, WebP, GIF or SVG image." : "Use a PNG, JPEG, WebP or GIF image." };

    let still: { contentType: string; data: Buffer; width: number | null; height: number | null } | null = null;
    if (image.animated && stillDataUrl) {
      const stillData = decodeDataUrl(stillDataUrl);
      const stillInfo = stillData ? sniffImage(stillData) : null;
      if (!stillData || !stillInfo || stillInfo.type === "image/gif" || stillData.length > BRAND_STATIC_MAX_BYTES) return { ok: false, error: "The still frame of the animation could not be prepared; try again." };
      still = { contentType: stillInfo.type, data: stillData, width: stillInfo.width, height: stillInfo.height };
    }
    const db = await getAppDb();
    await setBrandAsset(db, kind, image, still);
    revalidatePath("/", "layout");
    return { ok: true, data: await getBranding(db) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function removeBrandAssetAction(kind: BrandAssetKind): Promise<Result> {
  try {
    await requirePermission("manage-branding");
    if (!BRAND_LIMITS[kind]) return { ok: false, error: "Unknown image." };
    const db = await getAppDb();
    await removeBrandAsset(db, kind);
    revalidatePath("/", "layout");
    return { ok: true, data: await getBranding(db) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
