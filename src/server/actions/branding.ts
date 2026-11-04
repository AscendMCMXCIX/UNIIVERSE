"use server";

import { publicErrorMessage } from "@/server/errors";
import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission } from "@/server/auth/session";
import { BRAND_LIMITS, checkContrast, parseBranding, resetLook, type BrandAssetKind, type Branding } from "@/domain/branding";
import { getBranding, removeBrandAsset, saveBranding } from "@/server/repositories/branding";
import { decodeDataUrl } from "@/server/images";
import { storeBrandImage, takeUpload } from "@/server/branding/upload";
import { recordAudit } from "@/server/audit/log";

type Result = { ok: true; data: Branding } | { ok: false; error: string };

/** Names, tagline and colours. Colours that would make text unreadable are refused. */
export async function saveBrandingAction(input: Partial<Branding>): Promise<Result> {
  return saveBrandingAs(input, "branding.save");
}

async function saveBrandingAs(input: Partial<Branding>, action: "branding.save" | "branding.reset"): Promise<Result> {
  try {
    const session = await requirePermission("manage-branding");
    const parsed = parseBranding(input);
    const failing = checkContrast(parsed).filter((c) => !c.ok);
    if (failing.length) return { ok: false, error: `Not readable enough: ${failing.map((c) => c.message).join("; ")}.` };
    const db = await getAppDb();
    const saved = await saveBranding(db, parsed);
    await recordAudit(db, session, { action, target: { type: "branding", name: saved.teamName } });
    revalidatePath("/", "layout");
    return { ok: true, data: saved };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}

/** Back to the default colours and background visibility; names, tagline and images are kept. */
export async function resetBrandingAction(): Promise<Result> {
  try {
    await requirePermission("manage-branding");
    return saveBrandingAs(resetLook(await getBranding(await getAppDb())), "branding.reset");
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}

/**
 * Uploads a small logo or background in one request (kept for small files and scripts). The
 * browser sends the file as it is (GIFs keep their animation) plus, for animated images, a still
 * first frame it drew on a canvas; the server checks the real type, size and dimensions of both.
 */
export async function uploadBrandAssetAction(kind: BrandAssetKind, dataUrl: string, stillDataUrl: string | null): Promise<Result> {
  try {
    const session = await requirePermission("manage-branding");
    if (!BRAND_LIMITS[kind]) return { ok: false, error: "Unknown image." };
    const data = decodeDataUrl(dataUrl);
    if (!data) return { ok: false, error: "That file could not be read." };
    const db = await getAppDb();
    const error = await storeBrandImage(db, kind, data, stillDataUrl);
    if (error) return { ok: false, error };
    await recordAudit(db, session, { action: "branding.asset", target: { type: "branding", name: kind } });
    revalidatePath("/", "layout");
    return { ok: true, data: await getBranding(db) };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}

/**
 * Finishes an upload sent in pieces to /api/branding/upload (images up to 20 MB): joins them,
 * checks the image and its still frame, stores it and deletes the pieces.
 */
export async function finishBrandUploadAction(kind: BrandAssetKind, uploadId: string, pieces: number, stillDataUrl: string | null): Promise<Result> {
  try {
    const session = await requirePermission("manage-branding");
    if (!BRAND_LIMITS[kind]) return { ok: false, error: "Unknown image." };
    const db = await getAppDb();
    const data = await takeUpload(db, uploadId, kind, pieces);
    const error = await storeBrandImage(db, kind, data, stillDataUrl);
    if (error) return { ok: false, error };
    await recordAudit(db, session, { action: "branding.asset", target: { type: "branding", name: kind } });
    revalidatePath("/", "layout");
    return { ok: true, data: await getBranding(db) };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}

export async function removeBrandAssetAction(kind: BrandAssetKind): Promise<Result> {
  try {
    const session = await requirePermission("manage-branding");
    if (!BRAND_LIMITS[kind]) return { ok: false, error: "Unknown image." };
    const db = await getAppDb();
    await removeBrandAsset(db, kind);
    await recordAudit(db, session, { action: "branding.asset-remove", target: { type: "branding", name: kind } });
    revalidatePath("/", "layout");
    return { ok: true, data: await getBranding(db) };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}
