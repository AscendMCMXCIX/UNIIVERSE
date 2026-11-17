import { expect, type APIRequestContext } from "@playwright/test";
import { FIRST_SEASON, seasonForDate, seasonLabel, seasonOfPatch } from "../src/domain/season";

/*
  The season the demo's games are in ("Season 2026"), so that an expectation follows it rather than
  naming a year. The demo is seeded in the current season (server/demo/seed.ts), which currentSeason
  (server/accounts/sync.ts) takes from the current patch: Data Dragon's latest when the server
  reached it, else the offline fixture's, which has no season, so the server's calendar year. Both
  facts come from /api/health (its patch and its clock), and the earliest season offered is the
  floor, as on every page. In CI the patch is Data Dragon's, so Season 2026 lasts until Riot's first
  patch of 2027; with the fixture it lasts until 1 January. The server syncs the patch and seeds the
  demo on the first page it renders (server/bootstrap.ts), so a page is opened first: a test run on
  its own against a fresh server may ask before any page has.
*/
export async function demoSeasonLabel(request: APIRequestContext): Promise<string> {
  expect((await request.get("/public")).ok(), "the public team page answers").toBe(true);
  const res = await request.get("/api/health");
  expect(res.ok(), "/api/health answers").toBe(true);
  const health = (await res.json()) as { patch?: string | null; now?: string };
  const fromPatch = seasonOfPatch(health.patch);
  const season = fromPatch !== null && fromPatch >= 14 ? fromPatch : seasonForDate(health.now ? new Date(health.now) : new Date());
  return seasonLabel(Math.max(season, FIRST_SEASON));
}
