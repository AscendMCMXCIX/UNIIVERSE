import { expect, test, type Page } from "./test";

/*
  Profile Overview → Season performance → Refresh. It sits under the title and its line of scope:
  one quiet button (an icon and the word), apart from the filters, with the page's data status one
  ⓘ beside it and no banner above the section. A click asks the server for real (the e2e server has
  no Riot API key, so the answer is honestly "not available"), shows the progress on the button and
  ends with a notification; no count, explanation or time stays beside the button.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 768;

async function openProfile(page: Page, name: string) {
  await page.goto("/players");
  const href = (await page.locator(`main a[data-testid='player-card'][data-player-name='${name}']`).first().getAttribute("href"))!;
  await page.goto(href, { waitUntil: "networkidle" });
  await expect(page.getByTestId("season-summary")).toBeVisible();
}

test("Refresh sits under Season performance's title, alone with its ⓘ, and says what happened", async ({ page }) => {
  await openProfile(page, "Demo Support");
  const control = page.getByTestId("data-refresh");
  const button = page.getByTestId("data-refresh-button");
  // One status on the page, and no banner above the section.
  await expect(page.getByTestId("data-status")).toHaveCount(0);
  await expect(control).toHaveCount(1);
  // An icon and the word, nothing else beside it but the ⓘ.
  await expect(button).toHaveText("Refresh");
  await expect(button.locator("svg")).toHaveCount(1);
  expect((await control.boundingBox())!.width).toBeLessThan(200);
  // Under the title and its scope, lined up with them, and apart from the filters.
  const [title, scope, at] = await Promise.all([page.locator("#season-stats").boundingBox(), page.getByTestId("stats-population").boundingBox(), button.boundingBox()]);
  expect(at!.y).toBeGreaterThanOrEqual(scope!.y + scope!.height - 1);
  expect(Math.abs(at!.x - title!.x)).toBeLessThanOrEqual(1);
  expect(await button.evaluate((el) => !el.closest("[data-testid=overview-filters]"))).toBe(true);
  const filters = (await page.getByTestId(isPhone(page) ? "filter-toggle" : "refine-filters").boundingBox())!;
  const apart = at!.x + at!.width <= filters.x || filters.x + filters.width <= at!.x || at!.y + at!.height <= filters.y || filters.y + filters.height <= at!.y;
  expect(apart, "Refresh and the filters do not touch").toBe(true);
  // Touch screens: a finger-sized button.
  if (isPhone(page)) expect(at!.height).toBeGreaterThanOrEqual(44);

  // A click asks the server (held back here, to see the progress on the button)...
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1_000));
    await route.continue();
  });
  if (isPhone(page)) await button.tap();
  else await button.click();
  await expect(button).toHaveText("Refreshing…");
  await expect(button).toHaveAttribute("aria-disabled", "true");
  // ...and ends with a notification of what happened; the button is itself again.
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText(/not available right now/);
  await expect(toast).toHaveAttribute("data-tone", "warning");
  await expect(toast).not.toContainText(/new games?|updated/i);
  await expect(button).toHaveText("Refresh");
  await expect(button).not.toHaveAttribute("aria-disabled", /.+/);
  expect((await control.boundingBox())!.width).toBeLessThan(200);
  // Never a sideways scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});
