import { getAppDb } from "@/server/bootstrap";
import { getCardBanner } from "@/server/repositories/card-banners";
import { publicImageOwner, publicImageResponse } from "@/server/public/image-response";

export const dynamic = "force-dynamic";

/** A member's card banner on the public pages: only for a member who made their profile public. */
export async function GET(_request: Request, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const db = await getAppDb();
  const banner = (await publicImageOwner(db, playerId)) ? await getCardBanner(db, playerId) : null;
  return banner ? publicImageResponse(banner) : new Response("Not found", { status: 404 });
}
