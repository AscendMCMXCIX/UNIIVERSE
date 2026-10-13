import { cookies } from "next/headers";
import { isOwner, type Session } from "./permissions";

/*
  Admin Mode. Owners use UNIIVERSE as players by default; a cookie remembers that they switched
  into the Admin area. The cookie is a preference, never a permission: every admin route and
  action checks the session's role itself.
*/

export const VIEW_COOKIE = "uniiverse_view";
export type ViewMode = "player" | "admin";

/** The mode to render for this session: admin only when the cookie asks for it and the account is an owner. */
export function resolveViewMode(cookieValue: string | undefined, session: Session | null): ViewMode {
  return cookieValue === "admin" && isOwner(session) ? "admin" : "player";
}

export async function getViewMode(session: Session | null): Promise<ViewMode> {
  const store = await cookies();
  return resolveViewMode(store.get(VIEW_COOKIE)?.value, session);
}

export async function setViewModeCookie(mode: ViewMode): Promise<void> {
  const store = await cookies();
  if (mode === "admin") store.set(VIEW_COOKIE, "admin", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 30 * 86_400 });
  else store.set(VIEW_COOKIE, "", { path: "/", maxAge: 0 });
}
