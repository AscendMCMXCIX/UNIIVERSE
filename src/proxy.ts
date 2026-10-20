import { NextResponse, type NextRequest } from "next/server";
import { missingProductionSetup, requiresAccounts } from "@/server/auth/mode";

/**
 * Route protection (Next.js proxy; runs before any page and cannot query the database).
 * Whenever accounts are required (see `auth/mode.ts`) every app page needs a valid session
 * cookie; the login page itself decides whether to show the owner setup instead. Locally the
 * server layout handles the open mode.
 */
// The public pages (/public, /api/public, and "/" for visitors) serve only the public allowlist
// (server/public); branding images are shown on the public page and the sign-in page.
const PUBLIC_PATHS = ["/login", "/setup", "/recover", "/privacy", "/invite", "/api/health", "/api/jobs", "/api/auth", "/api/branding", "/public", "/api/public"];

function isPublic(pathname: string): boolean {
  // "/" decides on the server: each member's start page, or the public page for visitors.
  return pathname === "/" || PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/manifest.webmanifest" || pathname === "/sw.js" || pathname === "/offline.html" || pathname.startsWith("/icons") || pathname.startsWith("/brand");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
