import { NextResponse, type NextRequest } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { getAuthState, needsSetup } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";
import { ADMIN_HOME, playerHome, VIEW_COOKIE } from "@/server/auth/view-mode";

export const dynamic = "force-dynamic";

const YEAR = 365 * 24 * 3600;

/**
 * Switches between Player Mode and Admin Mode (?to=admin or ?to=player): remembers the choice and
 * opens that mode's start page. The choice is a preference only (src/server/auth/view-mode.ts):
 * Admin Mode is for administrators, checked here against the database as on every request.
 * Anyone else is sent to Player Mode and any saved preference for Admin Mode is removed. Opened as
 * a plain link (never prefetched), so it works alike in a browser tab and in the installed app.
 */
export async function GET(request: NextRequest) {
  const db = await getAppDb();
  const { session } = await getAuthState(db);
  // A relative Location, as the sign-out route explains: the browser resolves it on its own origin.
  const go = (location: string) => new NextResponse(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
  if (!session) return go("/");
  if (needsSetup(session)) return go("/welcome");
  const admin = isAdmin(session);
  const wantsAdmin = request.nextUrl.searchParams.get("to") === "admin";
  const res = go(wantsAdmin && admin ? ADMIN_HOME : playerHome(session));
  if (admin) res.cookies.set(VIEW_COOKIE, wantsAdmin ? "admin" : "player", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: YEAR });
  else res.cookies.set(VIEW_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
