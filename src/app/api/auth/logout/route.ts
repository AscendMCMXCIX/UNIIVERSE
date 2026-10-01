import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/session";

export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
