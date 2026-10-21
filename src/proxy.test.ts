import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const visit = (path: string) => proxy(new NextRequest(`https://team.example${path}`));

describe("route protection", () => {
  // As on Vercel: accounts required and set up, and no session cookie (a visitor or Riot's check).
  beforeEach(() => {
    vi.stubEnv("UNIIVERSE_REQUIRE_AUTH", "true");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("UNIIVERSE_AUTH_SECRET", "s");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends a visitor on a members' page to sign-in", async () => {
    const res = await visit("/team");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://team.example/login?next=%2Fteam");
  });
  it("serves Riot's ownership file to anyone, and only that exact address", async () => {
    expect((await visit("/riot.txt")).headers.get("x-middleware-next")).toBe("1");
    expect((await visit("/riot.txt/x")).status).toBe(307);
    expect((await visit("/riot.txtx")).status).toBe(307);
  });
  it("keeps Riot's ownership file to the code alone (no newline, nothing else)", () => {
    expect(readFileSync("public/riot.txt", "utf8")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
