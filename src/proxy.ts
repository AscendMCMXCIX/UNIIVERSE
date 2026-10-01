import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { missingProductionSetup, requiresAccounts, sessionSecretValue } from "@/server/auth/mode";

/**
 * Route protection (Next.js proxy; runs before any page and cannot query the database).
 * Whenever accounts are required (see `auth/mode.ts`) every app page needs a valid session
 * cookie; the login page itself decides whether to show the owner setup instead. Locally the
 * server layout handles the open mode.
 */
const PUBLIC_PATHS = ["/login", "/setup", "/invite", "/api/health", "/api/jobs", "/api/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname.startsWith("/icons") || pathname.startsWith("/brand");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (!requiresAccounts()) return NextResponse.next();
  if (missingProductionSetup().length > 0) return NextResponse.redirect(new URL("/setup", request.url));

  const token = request.cookies.get("uniiverse_session")?.value;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(sessionSecretValue()));
      return NextResponse.next();
    } catch {
      // fall through to login
    }
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
