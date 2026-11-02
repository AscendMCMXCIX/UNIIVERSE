import { describe, expect, it } from "vitest";
import { missingProductionSetup, requiresAccounts } from "./mode";

describe("deployment mode", () => {
  it("stays open only for local development and local demo servers", () => {
    expect(requiresAccounts({ NODE_ENV: "development" })).toBe(false);
    expect(requiresAccounts({ NODE_ENV: "production" })).toBe(false);
    expect(requiresAccounts({ NODE_ENV: "development", DATABASE_URL: "postgres://x" })).toBe(false);
  });
  it("requires accounts on every Vercel deployment, including previews, and on any production server with a real database", () => {
    expect(requiresAccounts({ NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production", DATABASE_URL: "postgres://x" })).toBe(true);
    expect(requiresAccounts({ NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", DATABASE_URL: "postgres://x" })).toBe(true);
    expect(requiresAccounts({ NODE_ENV: "production", VERCEL: "1" })).toBe(true);
    expect(requiresAccounts({ NODE_ENV: "production", DATABASE_URL: "postgres://x" })).toBe(true);
  });
  it("honours the explicit flag in both directions off Vercel", () => {
    expect(requiresAccounts({ NODE_ENV: "development", UNIIVERSE_REQUIRE_AUTH: "true" })).toBe(true);
    expect(requiresAccounts({ NODE_ENV: "production", DATABASE_URL: "postgres://x", UNIIVERSE_REQUIRE_AUTH: "false" })).toBe(false);
  });
  it("never opens a Vercel deployment, whatever the flag says", () => {
    expect(requiresAccounts({ NODE_ENV: "production", VERCEL: "1", UNIIVERSE_REQUIRE_AUTH: "false" })).toBe(true);
    expect(requiresAccounts({ NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", UNIIVERSE_REQUIRE_AUTH: "false" })).toBe(true);
  });
  it("names what a production deployment still lacks", () => {
    expect(missingProductionSetup({ NODE_ENV: "production", VERCEL: "1" })).toEqual(["DATABASE_URL", "UNIIVERSE_AUTH_SECRET"]);
    expect(missingProductionSetup({ NODE_ENV: "production", VERCEL: "1", DATABASE_URL: "postgres://x", UNIIVERSE_AUTH_SECRET: "s" })).toEqual([]);
    expect(missingProductionSetup({ NODE_ENV: "development" })).toEqual([]);
  });
});
