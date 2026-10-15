import { expect, test } from "@playwright/test";

/* Meta & Trends → Duo Synergies: role pairs, a ranked list with sample sizes, sorting, no overflow. */

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("duo synergies: role pairs, ranked pairs with their games, sorting by games played", async ({ page }) => {
  await page.goto("/trends/duos");
  await expect(page.getByRole("heading", { name: "Duo Synergies" })).toBeVisible();
  await expect(page.getByTestId("duo-pairs").getByRole("link")).toHaveCount(5);
  const rows = page.getByTestId("duo-row");
  if ((await rows.count()) === 0) {
    await expect(page.getByTestId("duo-empty")).toBeVisible();
    return;
  }
  // Every listed pair has at least the minimum games together.
  const games = await rows.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-games"))));
  expect(Math.min(...games)).toBeGreaterThanOrEqual(25);
  await page.getByTestId("duo-sorts").getByRole("link", { name: "Most played" }).click();
  await page.waitForURL(/sort=games/);
  const sorted = await page.getByTestId("duo-row").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-games"))));
  expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
  await page.getByTestId("duo-pairs").getByRole("link", { name: /Jungle \+ Mid/ }).click();
  await page.waitForURL(/pair=jungle-mid/);
  await expect(page.getByTestId("duo-pairs").getByRole("link", { name: /Jungle \+ Mid/ })).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});
