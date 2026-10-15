import { expect, test } from "@playwright/test";

/*
  R7/R8 on a teammate's profile (demo roster; the rank snapshots are synthetic demo data, seeded
  in demo mode only): the recent-form strip follows the filter's newest games, and Ranked progress
  shows Solo/Duo and Flex separately, with the date tracking started and the rank changes.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("a profile shows recent form and ranked progress per queue", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}`);

  // Recent form: up to twenty squares, oldest to newest, opening Match History; a text summary for screen readers.
  const strip = page.getByTestId("recent-form-strip");
  await expect(strip).toBeVisible();
  const squares = await strip.locator("[data-result]").count();
  expect(squares).toBeGreaterThanOrEqual(5);
  expect(squares).toBeLessThanOrEqual(20);
  await expect(strip).toHaveAttribute("aria-label", /Last \d+ games: \d+ wins, \d+ losses/);
  await expect(strip).toHaveAttribute("href", `/players/${id}/matches`);
  await expect(page.getByTestId("recent-form-trend")).toBeVisible();
  // Recent KDA beside the whole sample (sample-aware: an arrow only on enough games and a clear gap).
  await expect(page.getByTestId("recent-form-kda")).toContainText(/\d\.\d vs \d\.\d/);

  // Ranked progress: Solo/Duo by default, with a chart, the tracking date and named rank changes.
  const ranked = page.getByTestId("ranked-progress");
  await expect(ranked).toBeVisible();
  await expect(page.getByTestId("ranked-queue-solo")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("ranked-tracking")).toContainText(/tracked since/);
  await expect(page.getByTestId("ranked-chart")).toBeVisible();
  await expect(page.getByTestId("ranked-events").locator("li").first()).toContainText(/Promoted|Demoted/);
  // The header shows the same current rank as Ranked progress.
  const current = (await page.getByTestId("ranked-current").innerText()).split("·")[0]!.trim();
  await expect(page.getByTestId("profile-rank")).toContainText(current);

  // Flex is its own ladder: one reading so far, so no line yet.
  await page.getByTestId("ranked-queue-flex").click();
  await expect(page).toHaveURL(/rq=flex/);
  await expect(page.getByTestId("ranked-current")).toContainText("Silver I");
  await expect(page.getByTestId("ranked-single")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
