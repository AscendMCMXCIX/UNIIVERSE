import { getAppDb } from "@/server/bootstrap";
import { getAuthState } from "@/server/auth/session";
import { PublicPage, publicMetadata } from "@/components/public/public-page";

export const dynamic = "force-dynamic";
export const generateMetadata = publicMetadata;

/**
 * The public page at its own address too: what visitors see at "/", and the way members look at it
 * (they see Open App where visitors see Sign In). Read-only and always open; everything on it comes
 * from the public loaders (server/public), never from the members' pages.
 */
export default async function PublicRoute() {
  const auth = await getAuthState(await getAppDb());
  return <PublicPage member={!!auth.session} />;
}
