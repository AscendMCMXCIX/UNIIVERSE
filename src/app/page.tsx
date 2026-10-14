import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { getViewMode } from "@/server/auth/view-mode";
import { hasPermission } from "@/server/auth/permissions";

export const dynamic = "force-dynamic";

/** Each account's start page: Admin for the Owner, Team for team members, their profile for everyone else. */
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  if ((await getViewMode(session)) === "admin") redirect("/admin/people");
  redirect(hasPermission(session, "view-team") ? "/team" : "/overview");
}
