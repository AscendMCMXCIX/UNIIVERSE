import { describe, expect, it } from "vitest";
import { demoViewerAllowed, demoViewerFromCookie } from "./demo-viewer";

const DEMO = { NODE_ENV: "production", UNIIVERSE_DB_MODE: "memory", UNIIVERSE_SEED_DEMO: "true", UNIIVERSE_REQUIRE_AUTH: "false", DATABASE_URL: "" };

describe("the demo viewer exists only in the in-memory demo", () => {
  it("is allowed for the browser tests' demo server", () => {
    expect(demoViewerAllowed(DEMO)).toBe(true);
    expect(demoViewerFromCookie("member", DEMO)).toBe("member");
    expect(demoViewerFromCookie("newcomer", DEMO)).toBe("newcomer");
    expect(demoViewerFromCookie("halfway", DEMO)).toBe("halfway");
  });

  it("is refused by a production configuration (Vercel production, with its database and secrets)", () => {
    const production = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production", DATABASE_URL: "postgres://x", UNIIVERSE_AUTH_SECRET: "s", UNIIVERSE_ACCESS_PASSWORD: "k" };
    expect(demoViewerAllowed(production)).toBe(false);
    expect(demoViewerFromCookie("member", production)).toBeNull();
    // Even with every demo variable copied onto it.
    const withDemoVars = { ...production, UNIIVERSE_DB_MODE: "memory", UNIIVERSE_SEED_DEMO: "true", UNIIVERSE_REQUIRE_AUTH: "false" };
    expect(demoViewerAllowed(withDemoVars)).toBe(false);
    expect(demoViewerFromCookie("member", withDemoVars)).toBeNull();
  });

  it("is refused on every other configuration", () => {
    for (const env of [
      { ...DEMO, VERCEL: "1" },
      { ...DEMO, VERCEL_ENV: "preview" },
      { ...DEMO, DATABASE_URL: "postgres://x" },
      { ...DEMO, UNIIVERSE_REQUIRE_AUTH: "true" },
      { ...DEMO, UNIIVERSE_DB_MODE: undefined },
      { ...DEMO, UNIIVERSE_DB_MODE: "file" },
      { ...DEMO, UNIIVERSE_SEED_DEMO: undefined },
      { ...DEMO, UNIIVERSE_SEED_DEMO: "false" },
      { NODE_ENV: "production", DATABASE_URL: "postgres://x" },
      { NODE_ENV: "development" },
      {},
    ]) {
      expect(demoViewerAllowed(env), JSON.stringify(env)).toBe(false);
      expect(demoViewerFromCookie("member", env)).toBeNull();
    }
  });

  it("ignores an unknown value", () => {
    expect(demoViewerFromCookie("owner", DEMO)).toBeNull();
    expect(demoViewerFromCookie("", DEMO)).toBeNull();
    expect(demoViewerFromCookie(undefined, DEMO)).toBeNull();
  });
});
