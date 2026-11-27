import { afterEach, describe, expect, it, vi } from "vitest";
import { championsFirstForTest, championsPerPageForTest, kitChangedForTest, longestNotesForTest, noteAgeForTest, opponentSearchFromForTest, opponentsPerColumnForTest } from "./test-hooks";

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

describe("All Champions' workspace page caps", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("are read on the in-memory demo only: 1 to 19 champions a page, 1 to 5 opponents or games a column", () => {
    vi.stubEnv("UNIIVERSE_DB_MODE", "memory");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(championsPerPageForTest("3")).toBe(3);
    expect(championsPerPageForTest("19")).toBe(19);
    for (const bad of ["0", "20", "-1", "3x", "", null, undefined]) expect(championsPerPageForTest(bad)).toBeNull();
    expect(opponentsPerColumnForTest("1")).toBe(1);
    expect(opponentsPerColumnForTest("5")).toBe(5);
    for (const bad of ["0", "6", "12", "1x", "", null, undefined]) expect(opponentsPerColumnForTest(bad)).toBeNull();
    vi.stubEnv("VERCEL", "1");
    expect(championsPerPageForTest("3")).toBeNull();
    expect(opponentsPerColumnForTest("1")).toBeNull();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    expect(championsPerPageForTest("3")).toBeNull();
    expect(opponentsPerColumnForTest("1")).toBeNull();
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

describe("Matchup Intel's notes test hooks", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("are read on the in-memory demo only: a note's age in patches (0–9) and a changed kit", () => {
    vi.stubEnv("UNIIVERSE_DB_MODE", "memory");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(noteAgeForTest("2")).toBe(2);
    expect(noteAgeForTest("4")).toBe(4);
    for (const bad of ["10", "-1", "x", "", null, undefined]) expect(noteAgeForTest(bad)).toBeNull();
    expect(kitChangedForTest("1")).toBe(true);
    expect(kitChangedForTest("0")).toBe(false);
    expect(longestNotesForTest("1")).toBe(true);
    expect(longestNotesForTest("yes")).toBe(false);
    vi.stubEnv("VERCEL", "1");
    expect(noteAgeForTest("2")).toBeNull();
    expect(kitChangedForTest("1")).toBe(false);
    expect(longestNotesForTest("1")).toBe(false);
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "postgres://example.invalid/db");
    expect(longestNotesForTest("1")).toBe(false);
  });
});
