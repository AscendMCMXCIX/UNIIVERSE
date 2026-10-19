import { NextResponse, type NextRequest } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { SESSION_COOKIE } from "@/server/auth/session";
import { sessionCookieOptions } from "@/server/auth/config";
import { ACCOUNTS_COOKIE, IDENTITY_COOKIE, identityMarker, parseJar, serializeJar, sessionUser, signOutOfActive, signOutOfAll } from "@/server/auth/account-jar";

/**
 * Sign out (a plain form post, then a full page load, so nothing of the account stays in the
 * page). `?all=1` signs out of every account this browser is signed in to; otherwise only the
 * active one, and another signed-in account, if any, becomes active. Sessions end on the server.
 */
export async function POST(request: NextRequest) {
  const db = await getAppDb();
  const state = { active: request.cookies.get(SESSION_COOKIE)?.value ?? null, remembered: parseJar(request.cookies.get(ACCOUNTS_COOKIE)?.value) };
  const next = request.nextUrl.searchParams.get("all") === "1" ? await signOutOfAll(db, state) : await signOutOfActive(db, state);
  const userId = await sessionUser(db, next.active);
  // A relative Location: the browser resolves it against the page it is on. An absolute one built
  // from request.url can name another host (a proxy, a custom domain, localhost behind 127.0.0.1),
  // and the page's form-action 'self' policy blocks a form's redirect to another origin.
  const res = new NextResponse(null, { status: 303, headers: { Location: userId ? "/" : "/login" } });
  const options = sessionCookieOptions();
  if (userId && next.active) {
    res.cookies.set(SESSION_COOKIE, next.active, options);
    res.cookies.set(IDENTITY_COOKIE, identityMarker(userId), { ...options, httpOnly: false });
  } else {
    res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    res.cookies.set(IDENTITY_COOKIE, "", { path: "/", maxAge: 0 });
  }
  const jar = userId ? serializeJar(next.remembered) : "";
  if (jar) res.cookies.set(ACCOUNTS_COOKIE, jar, options);
  else res.cookies.set(ACCOUNTS_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
