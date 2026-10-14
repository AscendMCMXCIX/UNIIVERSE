"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { canUseAdminArea } from "@/server/auth/permissions";
import { firstAdminPath } from "@/lib/nav";
import { setViewModeCookie } from "@/server/auth/view-mode";

/** Switches an owner between Player View and Admin Mode (a preference cookie; routes check the role themselves). */
export async function switchViewAction(formData: FormData): Promise<void> {
  const mode = String(formData.get("mode") ?? "player") === "admin" ? "admin" : "player";
  const session = await getSession();
  if (mode === "admin" && !canUseAdminArea(session)) redirect("/team");
  await setViewModeCookie(mode);
  redirect(mode === "admin" ? firstAdminPath(session) : "/team");
}
