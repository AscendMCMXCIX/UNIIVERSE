import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { canUseAdminArea } from "@/server/auth/permissions";

/**
 * Previews are for administrators only (Admin Mode → Platform Settings → Previews). Without a
 * session (signed out, expired or forged: the proxy lets any well-formed cookie through) it is the
 * sign-in page, as for every other protected page; a signed-in account that is not an
 * administrator is sent home.
 */
export async function requirePreviewAccess(): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canUseAdminArea(session)) redirect("/");
}
