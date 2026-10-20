import { after } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { getBrandAsset, isBrandAssetRow, storeWebCopy, type BrandAssetFile, type BrandAssetRow } from "@/server/repositories/branding";
import { makeWebCopy } from "@/server/branding/web-copy";
import type { Db } from "@/server/db/types";
import type { BrandAssetKind } from "@/domain/branding";

export const dynamic = "force-dynamic";

/** Copies already tried by this instance (one attempt per image version). */
const tried = new Set<string>();

/**
 * After an original was served (no web copy yet), its copy is made from the bytes already in
 * memory, once the response has gone, and stored for every later read. Nothing more is read
 * from the database. Outside a request (tests, scripts) nothing is made.
 */
function makeCopyLater(db: Db, asset: BrandAssetRow, image: BrandAssetFile) {
  const key = `${asset}:${image.version}`;
  if (tried.has(key)) return;
  tried.add(key);
  const kind = asset.replace("-static", "") as BrandAssetKind;
  try {
    after(async () => {
      try {
        const copy = await makeWebCopy(kind, image);
        if (copy) await storeWebCopy(db, asset, image.version, { ...copy, animated: image.animated });
      } catch {
        // The original keeps being served; the next instance tries again.
        tried.delete(key);
      }
    });
  } catch {
    tried.delete(key);
  }
}

/**
 * Branding images (logo, background and their still frames). Public, because the sign-in page
 * shows them. The URL carries a version, so browsers keep it for a year; a new upload changes
 * the URL. Served from the image's web copy once there is one (WebP at the size it is drawn).
 * SVG logos are sandboxed so they can never run script on this origin.
 */
export async function GET(request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  if (!isBrandAssetRow(asset)) return new Response("Not found", { status: 404 });
  const v = new URL(request.url).searchParams.get("v");
  const db = await getAppDb();
  const image = await getBrandAsset(db, asset, v && /^\d{1,15}$/.test(v) ? Number(v) : null);
  if (!image) return new Response("Not found", { status: 404 });
  if (image.original && image.contentType !== "image/svg+xml") makeCopyLater(db, asset, image);
  const versioned = v !== null;
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.data.length),
      // Versioned URLs never change: the CDN keeps them too, so a large GIF leaves the database once.
      "Cache-Control": versioned ? "public, max-age=31536000, s-maxage=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
