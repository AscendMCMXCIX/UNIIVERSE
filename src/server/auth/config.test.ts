import { describe, expect, it } from "vitest";
import { SESSION_HOURS, sessionCookieOptions, sessionMaxAgeSeconds } from "./config";

describe("session configuration", () => {
  it("lasts 24 hours, with no longer option", () => {
    expect(SESSION_HOURS).toBe(24);
    expect(sessionMaxAgeSeconds()).toBe(86_400);
  });

  it("issues HTTP-only, same-site cookies that are secure in production", () => {
    const prod = sessionCookieOptions({ NODE_ENV: "production" });
    expect(prod).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 86_400 });
    expect(sessionCookieOptions({ NODE_ENV: "development" }).secure).toBe(false);
  });
});
