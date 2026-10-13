/**
 * Session lifetimes. One place to change them; environment variables override for a deployment.
 *   UNIIVERSE_SESSION_DAYS           default session (a normal sign-in)            30 days
 *   UNIIVERSE_SESSION_REMEMBER_DAYS  "Remember this device" sessions                365 days
 */
const DEFAULT_SESSION_DAYS = 30;
const DEFAULT_REMEMBER_DAYS = 365;

function days(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 3650 ? Math.floor(n) : fallback;
}

export interface SessionEnv {
  NODE_ENV?: string;
  UNIIVERSE_SESSION_DAYS?: string;
  UNIIVERSE_SESSION_REMEMBER_DAYS?: string;
}

export function sessionDays(remember: boolean, env: SessionEnv = process.env): number {
  return remember ? days(env.UNIIVERSE_SESSION_REMEMBER_DAYS, DEFAULT_REMEMBER_DAYS) : days(env.UNIIVERSE_SESSION_DAYS, DEFAULT_SESSION_DAYS);
}

export function sessionMaxAgeSeconds(remember: boolean, env: SessionEnv = process.env): number {
  return sessionDays(remember, env) * 86_400;
}

/** How often a session's last-seen time is written back (per request would be wasteful). */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** Cookie attributes shared by every session cookie write. */
export function sessionCookieOptions(remember: boolean, env: SessionEnv = process.env) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds(remember, env),
  };
}
