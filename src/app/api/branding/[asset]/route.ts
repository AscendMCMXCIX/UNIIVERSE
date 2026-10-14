import { getAppDb } from "@/server/bootstrap";
import { getBrandAsset, isBrandAssetRow } from "@/server/repositories/branding";

export const dynamic = "force-dynamic";

/**
 * Branding images (logo, background and their still frames). Public, because the sign-in page
 * shows them. The URL carries a version, so browsers keep it for a year; a new upload changes
 * the URL. SVG logos are sandboxed so they can never run script on this origin.
 */
export async function GET(request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  if (!isBrandAssetRow(asset)) return new Response("Not found", { status: 404 });
  const db = await getAppDb();
  const image = await getBrandAsset(db, asset);
  if (!image) return new Response("Not found", { status: 404 });
  const versioned = new URL(request.url).searchParams.has("v");
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.data.length),
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
