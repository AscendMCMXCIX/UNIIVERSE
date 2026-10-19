import { expect, test } from "@playwright/test";

/*
  Season 2026 is the earliest season offered anywhere (domain/season). No page offers Season 2025
  or older, and an old address or saved link asking for it opens the current season.
*/

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "the same server rule on every screen size");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const PAGES = ["/overview", "/overview/champions", "/overview/matches", "/overview/matchups", "/leaderboards", "/matches", "/matches?view=encounters"];

test("no season choice offers 2025 or older, on any page", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator("main"), path).toBeVisible();
    await expect(page.locator("option", { hasText: /Season 20(1\d|2[0-5])\b/ }), path).toHaveCount(0);
    await expect(page.locator("main").getByText(/Season 20(1\d|2[0-5])\b/), path).toHaveCount(0);
  }
});

test("an old address asking for Season 2025 opens the current season", async ({ page }) => {
  for (const path of ["/overview", "/overview/matches", "/leaderboards"]) {
    for (const q of ["season=15", "season=2025"]) {
      await page.goto(`${path}?${q}`);
      await expect(page.locator("main"), `${path}?${q}`).toBeVisible();
      await expect(page.locator("main").getByText(/Season 2025/), `${path}?${q}`).toHaveCount(0);
    }
  }
});
