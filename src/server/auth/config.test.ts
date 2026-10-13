import { describe, expect, it } from "vitest";
import { sessionCookieOptions, sessionDays, sessionMaxAgeSeconds } from "./config";

describe("session configuration", () => {
  it("defaults to 30 days, or about a year when the device is remembered", () => {
    expect(sessionDays(false, {})).toBe(30);
    expect(sessionDays(true, {})).toBe(365);
    expect(sessionMaxAgeSeconds(false, {})).toBe(30 * 86_400);
  });

  it("can be tuned per deployment without code changes, ignoring nonsense", () => {
    expect(sessionDays(false, { UNIIVERSE_SESSION_DAYS: "7" })).toBe(7);
    expect(sessionDays(true, { UNIIVERSE_SESSION_REMEMBER_DAYS: "90" })).toBe(90);
    expect(sessionDays(false, { UNIIVERSE_SESSION_DAYS: "0" })).toBe(30);
    expect(sessionDays(true, { UNIIVERSE_SESSION_REMEMBER_DAYS: "abc" })).toBe(365);
  });

  it("issues HTTP-only, same-site cookies that are secure in production", () => {
    const prod = sessionCookieOptions(true, { NODE_ENV: "production" });
    expect(prod).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 365 * 86_400 });
    expect(sessionCookieOptions(false, { NODE_ENV: "development" }).secure).toBe(false);
  });
});
