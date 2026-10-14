import { cookies } from "next/headers";
import { canUseAdminArea, isOwner, type Session } from "./permissions";

/*
  Admin Mode. Owners with a player profile use UNIIVERSE as players by default; an admin-only
  account (no player profile) starts in the Admin area. A cookie remembers an explicit switch
  either way. The cookie is a preference, never a permission: every admin route and action
  checks the session's role itself.
*/

export const VIEW_COOKIE = "uniiverse_view";
export type ViewMode = "player" | "admin";

/** The mode to render for this session: admin only for accounts that may use the Admin area, by choice or (owners) because they have no player profile. */
export function resolveViewMode(cookieValue: string | undefined, session: Session | null): ViewMode {
  if (!canUseAdminArea(session)) return "player";
  if (!isOwner(session)) return cookieValue === "admin" ? "admin" : "player";
  if (cookieValue === "admin" || cookieValue === "player") return cookieValue;
  return session?.playerId ? "player" : "admin";
}

export async function getViewMode(session: Session | null): Promise<ViewMode> {
  const store = await cookies();
  return resolveViewMode(store.get(VIEW_COOKIE)?.value, session);
}

export async function setViewModeCookie(mode: ViewMode): Promise<void> {
  const store = await cookies();
  store.set(VIEW_COOKIE, mode, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 30 * 86_400 });
}
