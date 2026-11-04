import { getAppDb } from "@/server/bootstrap";
import { getAuthState } from "@/server/auth/session";
import { getCardBanner } from "@/server/repositories/card-banners";
import { mayOpenProfile } from "@/server/auth/profile-access";

export const dynamic = "force-dynamic";

/**
 * A player's card banner (Player Card Studio). Members only, like profile pictures, and a
 * personal-use player's only for that player and administrators (mayOpenProfile: "not found" to
 * anyone else, as their profile is); the URL carries a version, so the browser may keep it for a
 * year and a new upload changes the URL. Served as an image with a CSP that forbids everything else.
 */
export async function GET(request: Request, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) return new Response("Not found", { status: 404 });
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (!auth.session) return new Response("Sign in required", { status: 401 });
  if (!(await mayOpenProfile(db, auth.session, playerId))) return new Response("Not found", { status: 404 });
  const banner = await getCardBanner(db, playerId);
  if (!banner) return new Response("Not found", { status: 404 });
  const versioned = new URL(request.url).searchParams.has("v");
  return new Response(new Uint8Array(banner.data), {
    headers: {
      "Content-Type": banner.contentType,
      "Content-Length": String(banner.data.length),
      "Cache-Control": versioned ? "private, max-age=31536000, immutable" : "private, no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
