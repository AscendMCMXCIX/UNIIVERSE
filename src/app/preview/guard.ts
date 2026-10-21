import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { canUseAdminArea } from "@/server/auth/permissions";

/** Previews are for administrators only (Admin Mode → Platform Settings → Previews); anyone else is sent home. */
export async function requirePreviewAccess(): Promise<void> {
  if (!canUseAdminArea(await getSession())) redirect("/");
}
