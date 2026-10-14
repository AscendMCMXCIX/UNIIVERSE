/**
 * Session lifetime: every sign-in lasts 24 hours from the moment of signing in, then the
 * person signs in again. It is fixed (no "remember this device", no environment override) and
 * absolute: activity does not extend it.
 */
export const SESSION_HOURS = 24;
export const SESSION_MAX_AGE_MS = SESSION_HOURS * 3_600_000;

export interface SessionEnv {
  NODE_ENV?: string;
}

export function sessionMaxAgeSeconds(): number {
  return SESSION_HOURS * 3_600;
}

/** How often a session's last-seen time is written back (per request would be wasteful). */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** Cookie attributes shared by every session cookie write. */
export function sessionCookieOptions(env: SessionEnv = process.env) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds(),
  };
}
