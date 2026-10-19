import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getViewMode } from "@/server/auth/view-mode";
import { hasPermission } from "@/server/auth/permissions";

export const dynamic = "force-dynamic";

/** Each account's start page: Admin for the Owner, Team for team members, their profile for everyone else; visitors see the public team page. */
export default async function Home() {
  const db = await getAppDb();
  const session = (await getAuthState(db)).session;
  // Visitors without an account: the public team page (it links to sign in).
  if (!session) redirect("/public");
  if ((await getViewMode(session)) === "admin") redirect("/admin/people");
  redirect(hasPermission(session, "view-team") ? "/team" : "/overview");
}
