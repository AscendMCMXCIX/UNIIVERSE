import { NextResponse, type NextRequest } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { SESSION_COOKIE } from "@/server/auth/session";
import { ACCOUNTS_COOKIE, IDENTITY_COOKIE, parseJar, signOutOfAll } from "@/server/auth/account-jar";

/**
 * Sign out (a plain form post, then a full page load, so nothing of the account stays in the
 * page). The browser's session ends on the server, together with any the old cookie of
 * remembered accounts still names (see account-jar.ts), and every account cookie is cleared.
 */
export async function POST(request: NextRequest) {
  const db = await getAppDb();
  await signOutOfAll(db, { active: request.cookies.get(SESSION_COOKIE)?.value ?? null, remembered: parseJar(request.cookies.get(ACCOUNTS_COOKIE)?.value) });
  // A relative Location: the browser resolves it against the page it is on. An absolute one built
  // from request.url can name another host (a proxy, a custom domain, localhost behind 127.0.0.1),
  // and the page's form-action 'self' policy blocks a form's redirect to another origin.
  // "/" is the public team page, where Sign in opens its window.
  const res = new NextResponse(null, { status: 303, headers: { Location: "/" } });
  for (const name of [SESSION_COOKIE, IDENTITY_COOKIE, ACCOUNTS_COOKIE]) res.cookies.set(name, "", { path: "/", maxAge: 0 });
  return res;
}
