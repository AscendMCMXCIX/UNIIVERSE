import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getViewMode } from "@/server/auth/view-mode";
import { hasPermission } from "@/server/auth/permissions";
import { PublicPage, publicMetadata } from "@/components/public/public-page";

export const dynamic = "force-dynamic";
export const generateMetadata = publicMetadata;

/**
 * The site's address. Visitors get the public page itself (it is also the way to sign in); every
 * signed-in account goes straight to its own start page, never through the public page: Admin for
 * the Owner, Team for team members, their profile for everyone else.
 */
export default async function Home() {
  const db = await getAppDb();
  const session = (await getAuthState(db)).session;
  if (!session) return <PublicPage member={false} />;
  if ((await getViewMode(session)) === "admin") redirect("/admin/people");
  redirect(hasPermission(session, "view-team") ? "/team" : "/overview");
}
