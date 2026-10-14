import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { brandUploadChunks } from "@/server/db/schema";
import { BRAND_LIMITS, BRAND_STATIC_MAX_BYTES, BRAND_UPLOAD_CHUNK_BYTES, type BrandAssetKind } from "@/domain/branding";
import { setBrandAsset } from "@/server/repositories/branding";
import { decodeDataUrl, isAnimated, looksLikeSvg, sniffImage } from "@/server/images";

/*
  Branding image uploads. One request may carry at most 4.5 MB on the hosting platform, so the
  browser sends an image in pieces of BRAND_UPLOAD_CHUNK_BYTES; each piece is stored here, and the
  finishing step joins them, checks the real type, size and dimensions, stores the image and
  deletes the pieces. Everything stays in the database the app already uses: no extra service.
*/

export class UploadError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pieces of uploads abandoned for an hour are removed whenever a new upload starts. */
export async function pruneUploadChunks(db: Db, olderThanMs = 3_600_000): Promise<void> {
  await db.delete(brandUploadChunks).where(lt(brandUploadChunks.createdAt, new Date(Date.now() - olderThanMs)));
}

/** Stores one piece; refuses pieces that are too big or would take the upload past its limit. */
export async function saveUploadChunk(db: Db, input: { uploadId: string; kind: BrandAssetKind; index: number; data: Buffer }): Promise<{ received: number }> {
  const limit = BRAND_LIMITS[input.kind];
  if (!limit) throw new UploadError("Unknown image.");
  if (!UUID.test(input.uploadId)) throw new UploadError("Invalid upload.");
  if (!Number.isInteger(input.index) || input.index < 0 || input.index > Math.ceil(limit.maxBytes / BRAND_UPLOAD_CHUNK_BYTES)) throw new UploadError("Invalid upload piece.");
  if (input.data.length === 0 || input.data.length > BRAND_UPLOAD_CHUNK_BYTES) throw new UploadError("Invalid upload piece.");
  if (input.index === 0) await pruneUploadChunks(db);
  const [sofar] = await db.select({ bytes: sql<number>`coalesce(sum(length(${brandUploadChunks.data})), 0)` }).from(brandUploadChunks).where(and(eq(brandUploadChunks.uploadId, input.uploadId), sql`${brandUploadChunks.idx} <> ${input.index}`));
  const received = Number(sofar?.bytes ?? 0) + input.data.length;
  if (received > limit.maxBytes) throw new UploadError(`Too large: keep it under ${limit.label}.`);
  await db
    .insert(brandUploadChunks)
    .values({ uploadId: input.uploadId, kind: input.kind, idx: input.index, data: input.data })
    .onConflictDoUpdate({ target: [brandUploadChunks.uploadId, brandUploadChunks.idx], set: { data: input.data, kind: input.kind, createdAt: new Date() } });
  return { received };
}

/** Joins the pieces of an upload (all of them, in order, same image kind) and deletes them. */
export async function takeUpload(db: Db, uploadId: string, kind: BrandAssetKind, pieces: number): Promise<Buffer> {
  if (!UUID.test(uploadId)) throw new UploadError("Invalid upload.");
  const rows = await db.select().from(brandUploadChunks).where(eq(brandUploadChunks.uploadId, uploadId)).orderBy(asc(brandUploadChunks.idx));
  await db.delete(brandUploadChunks).where(eq(brandUploadChunks.uploadId, uploadId));
  if (rows.length !== pieces || rows.some((r, i) => r.idx !== i || r.kind !== kind)) throw new UploadError("The upload was incomplete; please try again.");
  return Buffer.concat(rows.map((r) => Buffer.from(r.data)));
}

/**
 * Checks an image (real type from its bytes, size, dimensions; SVG only as a logo) and its still
 * frame, then stores both. Returns a person-readable error instead of throwing for bad files.
 */
export async function storeBrandImage(db: Db, kind: BrandAssetKind, data: Buffer, stillDataUrl: string | null): Promise<string | null> {
  const limit = BRAND_LIMITS[kind];
  if (!limit) return "Unknown image.";
  if (data.length > limit.maxBytes) return `Too large: keep it under ${limit.label}.`;
  const info = sniffImage(data);
  let image: { contentType: string; data: Buffer; width: number | null; height: number | null; animated: boolean };
  if (info) {
    if (info.width < 16 || info.height < 16) return "Too small: at least 16×16 pixels.";
    if (info.width > limit.maxSide || info.height > limit.maxSide) return `Too large: at most ${limit.maxSide}×${limit.maxSide} pixels.`;
    image = { contentType: info.type, data, width: info.width, height: info.height, animated: isAnimated(data, info.type) };
  } else if (kind === "logo" && looksLikeSvg(data)) {
    image = { contentType: "image/svg+xml", data, width: null, height: null, animated: false };
  } else return kind === "logo" ? "Use a PNG, JPEG, WebP, GIF or SVG image." : "Use a PNG, JPEG, WebP or GIF image.";

  let still: { contentType: string; data: Buffer; width: number | null; height: number | null } | null = null;
  if (image.animated && stillDataUrl) {
    const stillData = decodeDataUrl(stillDataUrl);
    const stillInfo = stillData ? sniffImage(stillData) : null;
    if (!stillData || !stillInfo || stillInfo.type === "image/gif" || stillData.length > BRAND_STATIC_MAX_BYTES) return "The still frame of the animation could not be prepared; try again.";
    still = { contentType: stillInfo.type, data: stillData, width: stillInfo.width, height: stillInfo.height };
  }
  await setBrandAsset(db, kind, image, still);
  return null;
}
