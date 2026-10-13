import { NextResponse } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { SESSION_COOKIE } from "@/server/auth/session";
import { revokeSession } from "@/server/auth/sessions";

export async function POST(request: Request) {
  const token = request.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (token) await revokeSession(await getAppDb(), decodeURIComponent(token));
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
