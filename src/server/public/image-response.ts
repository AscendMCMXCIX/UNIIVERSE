import type { Db } from "@/server/db/types";
import { getOrCreateTeam } from "@/server/repositories/team";
import { publicMemberUser } from "./team";

/**
 * Whether a member's public image may be served: only for a player on the public page (a lineup
 * starter or a role's designated substitute). Anything else is a 404, the same answer as for an
 * id that does not exist.
 */
export async function publicImageOwner(db: Db, playerId: string): Promise<{ userId: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) return null;
  const team = await getOrCreateTeam(db);
  return publicMemberUser(db, team.id, playerId);
}

/**
 * A public member image. Cached by the visitor's browser for a few minutes only and never by a
 * shared cache, so a player who leaves the lineup stops appearing within minutes everywhere.
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
