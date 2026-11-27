import { NextResponse, type NextRequest } from "next/server";
import { missingProductionSetup, requiresAccounts } from "@/server/auth/mode";
import { legacyMatchupRedirect } from "@/components/champion-lookup/address";

/** Matchup Intel's old address (its own page retired 23 Nov 2026; Matchup Intel lives in Champion Intel's Compare since 27 Nov 2026), whose every link leads to Champion Intel. */
const MATCHUP_INTEL_PATH = "/resources/matchups";

/**
 * Route protection (Next.js proxy; runs before any page and cannot query the database).
 * Whenever accounts are required (see `auth/mode.ts`) every app page needs a valid session
 * cookie; the login page itself decides whether to show the owner setup instead. Locally the
 * server layout handles the open mode.
 */
// The public pages (/public, /api/public) are open to everyone (no switch): server/public decides,
// field by field, what they serve; branding images are shown on the sign-in page.
const PUBLIC_PATHS = ["/login", "/setup", "/recover", "/privacy", "/invite", "/api/health", "/api/jobs", "/api/auth", "/api/branding", "/public", "/api/public"];

function isPublic(pathname: string): boolean {
  // "/" decides on the server: the app for members, the public team page or sign-in for visitors.
  // /riot.txt (public/riot.txt) is the code Riot's Developer Portal fetches, signed out, to check
  // that the product's address is ours.
  return pathname === "/" || PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/manifest.webmanifest" || pathname === "/sw.js" || pathname === "/offline.html" || pathname.startsWith("/icons") || pathname.startsWith("/brand") || pathname === "/riot.txt";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Matchup Intel's old links: one permanent redirect to Champion Intel, carrying both champions
  // and the lane (`champion`, `vs`, `role`; one of them alone, or `vs2`, `ally`: legacyMatchupRedirect), answered here as an
  // HTTP 308 before any page renders, so no page streams a client-side redirect. Champion Intel
  // checks who may open it, signed out included (this proxy again, on /lookup).
  if (pathname === MATCHUP_INTEL_PATH) {
    const sp: Record<string, string[]> = {};
    for (const [k, v] of request.nextUrl.searchParams) (sp[k] ??= []).push(v);
    return NextResponse.redirect(new URL(legacyMatchupRedirect(sp), request.url), 308);
  }
  if (isPublic(pathname)) return NextResponse.next();

  if (!requiresAccounts()) return NextResponse.next();
  if (missingProductionSetup().length > 0) return NextResponse.redirect(new URL("/setup", request.url));

  // Opaque server-side session tokens are validated against the database (including the
  // 24-hour limit) by the app layout and the API handlers; the proxy cannot query it.
  const token = request.cookies.get("uniiverse_session")?.value;
  if (token && token.startsWith("s1.") && token.length >= 40) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
