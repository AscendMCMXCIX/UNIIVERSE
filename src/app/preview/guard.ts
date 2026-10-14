import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { canUseAdminArea } from "@/server/auth/permissions";

/** Previews are for the Owner only (Admin → Previews); anyone else is sent home. */
export async function requirePreviewAccess(): Promise<void> {
  if (!canUseAdminArea(await getSession())) redirect("/");
}
