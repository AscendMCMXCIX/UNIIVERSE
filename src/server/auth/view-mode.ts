import { cookies } from "next/headers";
import { hasPermission, isAdmin, isOwner, type Session } from "./permissions";

/*
  Player Mode and Admin Mode. The address decides the mode: every page under /admin is Admin Mode
  (its own layout, navigation and dashboard, src/app/(admin)), every other page is Player Mode. So
  a refresh, a bookmark, Back and Forward, a new tab and the installed app all keep the mode, and
  nothing in the browser can change it: the (admin) layout lets administrators in and sends
  everyone else to Player Mode, and every admin page, action and API route checks again.

  The view cookie only remembers which mode an administrator used last, so opening the app at "/"
  (the installed app's start page) returns them there. It is a preference, never a permission:
  it is read only for administrators, and the switch route clears it for anyone who is not one,
  so a revoked administrator keeps no trace of Admin Mode.
*/

export const VIEW_COOKIE = "uniiverse_view";
export type ViewMode = "player" | "admin";

/** Where Player Mode opens for this account: Team for team members, otherwise their profile. */
export function playerHome(session: Session | null): string {
  return hasPermission(session, "view-team") ? "/team" : "/overview";
}

/** Where Admin Mode opens: its dashboard. */
export { ADMIN_HOME } from "@/lib/nav";

/**
 * The mode "/" opens for this session: the one the administrator used last; with no preference,
 * Admin Mode for an Owner without a player profile (an admin-only account) and Player Mode for
 * everyone else. Never Admin Mode for anyone who is not an administrator, whatever the cookie says.
 */
export function preferredMode(cookieValue: string | undefined, session: Session | null): ViewMode {
  if (!isAdmin(session)) return "player";
  if (cookieValue === "admin" || cookieValue === "player") return cookieValue;
  return isOwner(session) && !session?.playerId ? "admin" : "player";
}

export async function getPreferredMode(session: Session | null): Promise<ViewMode> {
  const store = await cookies();
  return preferredMode(store.get(VIEW_COOKIE)?.value, session);
}

/** A saved preference for Admin Mode on an account that is not (or no longer) an administrator. */
export async function hasStaleAdminPreference(session: Session | null): Promise<boolean> {
  if (isAdmin(session)) return false;
  return (await cookies()).get(VIEW_COOKIE)?.value === "admin";
}
