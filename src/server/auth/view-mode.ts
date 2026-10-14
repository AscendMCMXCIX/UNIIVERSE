import { cookies } from "next/headers";
import { canUseAdminArea, type Session } from "./permissions";

/*
  Admin Mode. The Owner account works only in Admin Mode (there is no Player View switch); every
  other account only ever sees the player app. The one exception is the automatic local owner of
  a development machine without accounts (never a deployment), which may also look at the player
  app through the view cookie, so the player pages can be developed and tested locally. The
  cookie is never a permission: every admin route and action checks the session's role itself.
*/

export const VIEW_COOKIE = "uniiverse_view";
export type ViewMode = "player" | "admin";

/** The mode to render for this session: admin for the Owner, player for everyone else. */
export function resolveViewMode(cookieValue: string | undefined, session: Session | null): ViewMode {
  if (!canUseAdminArea(session)) return "player";
  if (session?.localDev && cookieValue === "player") return "player";
  return "admin";
}

export async function getViewMode(session: Session | null): Promise<ViewMode> {
  const store = await cookies();
  return resolveViewMode(store.get(VIEW_COOKIE)?.value, session);
}
