import { getAppDb } from "@/server/bootstrap";
import { getAuthState } from "@/server/auth/session";
import { getAvatar } from "@/server/repositories/profile";

export const dynamic = "force-dynamic";

/**
 * A member's profile picture. Members only (pictures are not public); the URL carries a version,
 * so the browser may keep it for a year and a new upload simply changes the URL.
 */
export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return new Response("Not found", { status: 404 });
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (!auth.session) return new Response("Sign in required", { status: 401 });
  const avatar = await getAvatar(db, userId);
  if (!avatar) return new Response("Not found", { status: 404 });
  const versioned = new URL(request.url).searchParams.has("v");
  return new Response(new Uint8Array(avatar.data), {
    headers: {
      "Content-Type": avatar.contentType,
      "Content-Length": String(avatar.data.length),
      "Cache-Control": versioned ? "private, max-age=31536000, immutable" : "private, no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
