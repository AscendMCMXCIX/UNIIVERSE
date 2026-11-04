import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { ADMIN_HOME, getPreferredMode, hasStaleAdminPreference, playerHome } from "@/server/auth/view-mode";

export const dynamic = "force-dynamic";

/**
 * Each account's start page (also the installed app's): the mode an administrator used last
 * (Admin Mode's dashboard, or Player Mode), Player Mode for everyone else (Team for team members,
 * their profile otherwise). Visitors see the public team page.
 */
export default async function Home() {
  const db = await getAppDb();
  const session = (await getAuthState(db)).session;
  // Visitors without an account: the public team page (its Sign in opens a window there).
  if (!session) redirect("/public");
  // A preference for Admin Mode left by an account that is no longer an administrator: the switch
  // route forgets it and opens Player Mode.
  if (await hasStaleAdminPreference(session)) redirect("/api/mode?to=player");
  redirect((await getPreferredMode(session)) === "admin" ? ADMIN_HOME : playerHome(session));
}
