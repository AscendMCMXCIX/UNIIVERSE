import type { Db } from "@/server/db/types";
import { getAuthState } from "@/server/auth/session";
import { getPublicAccess } from "./access";
import { publicMemberUser } from "./team";

/**
 * Whether a member's public image may be served: the member has made their profile public, and
 * either the public pages are on or the visitor is signed in (an admin previewing them). Anything
 * else is a 404, the same answer as for an id that does not exist.
 */
export async function publicImageOwner(db: Db, playerId: string): Promise<{ userId: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) return null;
  const member = await publicMemberUser(db, playerId);
  if (!member) return null;
  if ((await getPublicAccess(db)).enabled) return member;
  return (await getAuthState(db)).session ? member : null;
}

/**
 * A public member image. Cached by the visitor's browser for a few minutes only and never by a
 * shared cache, so turning a public profile off takes effect within minutes everywhere.
 */
export function publicImageResponse(image: { contentType: string; data: Buffer }): Response {
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.data.length),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
