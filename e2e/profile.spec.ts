import { expect, test } from "@playwright/test";

/* My Profile pieces: All Champions sorting (both ways, filters kept) and the profile header controls. */

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("All Champions: column headings sort both ways within the current filters; mastery points shown", async ({ page }) => {
  test.skip(test.info().project.name === "phone", "the phone layout uses the Sort by control (next test)");
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']").first().getAttribute("href");
  await page.goto(`${href}/champions`);
  const rows = page.getByTestId("top-champion");
  test.skip((await rows.count()) < 2, "needs stored games");
  const before = new URL(page.url()).search;
  const games = () => rows.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-games"))));
  // Games: most first by default, then least first.
  const desc = await games();
  expect(desc).toEqual([...desc].sort((a, b) => b - a));
  await page.getByTestId("sort-games").click();
  const asc = await games();
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  await expect(page.getByTestId("all-champions-header").locator("[aria-sort=ascending]")).toHaveCount(1);
  // Mastery points: a column of its own, sorted highest first; missing values last.
  await page.getByTestId("sort-mastery").click();
  const mastery = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-mastery")).map((v) => (v ? Number(v) : null)));
  const known = mastery.filter((v): v is number => v !== null);
  expect(known).toEqual([...known].sort((a, b) => b - a));
  expect(mastery.slice(known.length).every((v) => v === null)).toBe(true);
  await expect(rows.first().getByTestId("mastery-points")).toBeVisible();
  // Sorting never touches the filters (they live in the address).
  expect(new URL(page.url()).search).toBe(before);
});

test("All Champions on a phone: a Sort by control with a direction toggle, no sideways scrolling", async ({ page }) => {
  test.skip(test.info().project.name !== "phone", "phone only");
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']").first().getAttribute("href");
  await page.goto(`${href}/champions`);
  const rows = page.getByTestId("top-champion");
  test.skip((await rows.count()) < 2, "needs stored games");
  await page.locator("#all-champions-sort-by").selectOption("games");
  await page.getByTestId("all-champions-sort-dir").click();
  const asc = await rows.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-games"))));
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("the profile header: Main lineup is a status, Customise is one small control, rank has a crest", async ({ page }) => {
  await page.goto("/players");
  await page.locator("main a[data-testid='player-card']").first().click();
  const header = page.getByTestId("profile-header");
  await expect(header).toBeVisible();
  await expect(header.getByTestId("profile-rank").getByTestId("rank-emblem")).toHaveCount(1);
  const status = header.getByTestId("lineup-status");
  if (await status.count()) {
    await expect(status).toContainText("Main lineup");
    expect(await status.evaluate((e) => e.tagName)).toBe("SPAN");
  }
  const customise = header.getByTestId("customise-card");
  await expect(customise).toHaveCount(1);
  await expect(customise).toHaveAccessibleName(/Customise/);
  const box = (await customise.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(48);
});
