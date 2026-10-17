import { expect, test } from "@playwright/test";

/*
  Meta & Trends, shared conventions: Solo Queue Meta opens with three leaders (most present, most
  banned, best win rate with its minimum) that agree with the board below; on wide screens they sit
  in the right column so the top ten still fits one screen. Duo Synergies keeps its controls in the
  board's toolbar (roles, then whose champions and rank by) and its patch choice in the header.
  Demo statistics (synthetic), in-memory only.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("Solo Queue Meta: three highlights that match the board, with their samples", async ({ page }) => {
  await page.goto("/trends/solo");
  const tiles = page.getByTestId("meta-highlights").getByTestId("meta-highlight");
  await expect(tiles).toHaveCount(3);
  await expect(tiles.nth(0)).toContainText("Highest presence");
  await expect(tiles.nth(1)).toContainText("Most banned");
  await expect(tiles.nth(2)).toContainText("Best win rate");
  // The presence leader is the board's first row on Overall / Presence.
  const board = page.getByTestId("trends-board");
  const first = await board.getByTestId("trend-row").first().getAttribute("data-champion");
  await expect(tiles.nth(0)).toHaveAttribute("data-champion", first!);
  // The win-rate leader is the first row on Win, and states the minimum it was ranked with.
  await page.getByTestId("trends-sort-win").click();
  const winFirst = await board.getByTestId("trend-row").first().getAttribute("data-champion");
  await expect(tiles.nth(2)).toHaveAttribute("data-champion", winFirst!);
  await expect(tiles.nth(2)).toContainText(/\d[\d,]* games · 100\+ to rank/);
});

test("Solo Queue Meta on a wide screen: highlights beside the board, top ten in one screen", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "wide screens");
  await page.goto("/trends/solo");
  // boundingBox() does not wait: measure once both are on screen.
  await expect(page.getByTestId("trends-board")).toBeVisible();
  await expect(page.getByTestId("meta-highlights")).toBeVisible();
  const board = (await page.getByTestId("trends-board").boundingBox())!;
  const tiles = (await page.getByTestId("meta-highlights").boundingBox())!;
  expect(tiles.x, "the highlights sit right of the board").toBeGreaterThanOrEqual(board.x + board.width);
  expect(board.y + board.height).toBeLessThanOrEqual(page.viewportSize()!.height);
});

test("Duo Synergies: one toolbar on the board, the patch choice in the header", async ({ page }) => {
  await page.goto("/trends/duos");
  const toolbar = page.getByTestId("duo-toolbar");
  await expect(toolbar.getByTestId("duo-roles")).toBeVisible();
  await expect(toolbar.getByTestId("duo-scope")).toBeVisible();
  await expect(toolbar.getByTestId("duo-sorts")).toBeVisible();
  // Changing the ranking keeps the roles and stays in the toolbar.
  await toolbar.getByTestId("duo-sorts").getByRole("link", { name: "Most played" }).click();
  await expect(page).toHaveURL(/sort=games/);
  await expect(page.getByTestId("duo-toolbar").getByTestId("duo-sorts").locator("[aria-current=page]")).toHaveText("Most played");
  const patches = page.getByTestId("duo-patches");
  if (await patches.count()) await expect(page.locator("main header").first().getByTestId("duo-patches")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
