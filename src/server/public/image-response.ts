import type { Db } from "@/server/db/types";
import { cachedFor } from "@/server/observability/cache";
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
 * The bytes of a public member image, kept by this server instance for a minute (`kind` is
 * "avatar" or "banner", `id` its owner). Every request still checks that the member is on the
 * public page first, so leaving it takes effect at once; only a new picture can take up to a
 * minute to replace the old one on another instance. Without this, each anonymous request read the
 * whole image (up to about 600 KB as stored) from the database, so a loop could use up the free
 * plan's egress. Saving or removing a picture clears the entry (the repositories).
 */
export function publicImageBytes(db: Db, kind: "avatar" | "banner", id: string, load: () => Promise<{ contentType: string; data: Buffer } | null>) {
  return cachedFor(`public-image:${kind}:${id}`, 60_000, load, db);
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
