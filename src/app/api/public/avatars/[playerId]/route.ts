import { getAppDb } from "@/server/bootstrap";
import { getAvatar } from "@/server/repositories/profile";
import { publicImageOwner, publicImageResponse } from "@/server/public/image-response";

export const dynamic = "force-dynamic";

/** A member's profile picture on the public pages: only for a player on the public page. */
export async function GET(_request: Request, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const db = await getAppDb();
  const owner = await publicImageOwner(db, playerId);
  const avatar = owner?.userId ? await getAvatar(db, owner.userId) : null;
  return avatar ? publicImageResponse(avatar) : new Response("Not found", { status: 404 });
}
