import { NextResponse } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission } from "@/server/auth/session";
import { BRAND_LIMITS, BRAND_UPLOAD_CHUNK_BYTES, type BrandAssetKind } from "@/domain/branding";
import { saveUploadChunk, UploadError } from "@/server/branding/upload";

export const dynamic = "force-dynamic";

/**
 * One piece of a branding image upload: POST the raw bytes (at most BRAND_UPLOAD_CHUNK_BYTES)
 * with ?kind=logo|background&upload=<uuid>&index=<n>. Needs the branding permission. The upload
 * is completed by finishBrandUploadAction, which checks the whole image.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!hasPermission(session, "manage-branding")) return NextResponse.json({ ok: false, error: "You do not have permission to change branding." }, { status: 403 });
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as BrandAssetKind;
  if (!BRAND_LIMITS[kind]) return NextResponse.json({ ok: false, error: "Unknown image." }, { status: 400 });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > BRAND_UPLOAD_CHUNK_BYTES) return NextResponse.json({ ok: false, error: "Upload piece too large." }, { status: 413 });
  try {
    const data = Buffer.from(await request.arrayBuffer());
    const result = await saveUploadChunk(await getAppDb(), { uploadId: url.searchParams.get("upload") ?? "", kind, index: Number(url.searchParams.get("index")), data });
    return NextResponse.json({ ok: true, received: result.received });
  } catch (err) {
    const message = err instanceof UploadError ? err.message : "The upload could not be stored; please try again.";
    return NextResponse.json({ ok: false, error: message }, { status: err instanceof UploadError ? 400 : 500 });
  }
}
