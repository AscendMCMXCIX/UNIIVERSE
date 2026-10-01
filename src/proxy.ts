import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Route protection (Next.js proxy, runs at the edge so it cannot query the database).
 * In production every app page needs a valid session cookie; the login page itself decides
 * whether to show the owner setup instead. Locally the server layout handles the open mode.
 */
const PUBLIC_PATHS = ["/login", "/setup", "/invite", "/api/health", "/api/jobs", "/api/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname.startsWith("/icons") || pathname.startsWith("/brand");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const isProduction = process.env.NODE_ENV === "production" && (process.env.VERCEL_ENV === "production" || process.env.UNIIVERSE_REQUIRE_AUTH === "true");
  if (!isProduction) return NextResponse.next();
  if (!process.env.DATABASE_URL || !(process.env.UNIIVERSE_AUTH_SECRET || process.env.UNIIVERSE_ACCESS_PASSWORD)) {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  const token = request.cookies.get("uniiverse_session")?.value;
  if (token) {
    try {
      const raw = process.env.UNIIVERSE_AUTH_SECRET || process.env.UNIIVERSE_ACCESS_PASSWORD || "uniiverse-local-development-secret";
      await jwtVerify(token, new TextEncoder().encode(raw));
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
