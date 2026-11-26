import { afterEach, describe, expect, it, vi } from "vitest";
import { championsFirstForTest, opponentSearchFromForTest } from "./test-hooks";

describe("All Champions' Show all test hook", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is read on the in-memory demo only, for 1 to 19 rows", () => {
    vi.stubEnv("UNIIVERSE_DB_MODE", "memory");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(championsFirstForTest("3")).toBe(3);
    expect(championsFirstForTest("19")).toBe(19);
    for (const bad of ["0", "20", "-1", "3x", "", null, undefined]) expect(championsFirstForTest(bad)).toBeNull();
    vi.stubEnv("VERCEL", "1");
    expect(championsFirstForTest("3")).toBeNull();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("UNIIVERSE_DB_MODE", "postgres");
    expect(championsFirstForTest("3")).toBeNull();
    vi.stubEnv("UNIIVERSE_DB_MODE", "memory");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    expect(championsFirstForTest("3")).toBeNull();
  });
});

describe("the preview's opponent search test hook", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is read on the in-memory demo only, for a threshold of 1 to 3 opponents", () => {
    vi.stubEnv("UNIIVERSE_DB_MODE", "memory");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(opponentSearchFromForTest("2")).toBe(2);
    for (const bad of ["0", "4", "12", "2x", "", null, undefined]) expect(opponentSearchFromForTest(bad)).toBeNull();
    vi.stubEnv("VERCEL", "1");
    expect(opponentSearchFromForTest("2")).toBeNull();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    expect(opponentSearchFromForTest("2")).toBeNull();
  });
});
