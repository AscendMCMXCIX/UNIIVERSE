import { expect, test, type Page } from "./test";

/*
  Profile Overview → Season performance → Refine. From tablets up, Refine opens a panel anchored
  under its button that floats over the page: the heading, the figures and the sections below
  never move or narrow; it closes on a click outside, Escape or Refine again, and a choice made in
  it is kept (in the address) when it closes and opens again. Phones keep the full-width filter
  panel. Never a horizontal scroll.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 768;

/** A teammate's profile Overview (the in-memory demo's owner has no player profile of their own). */
async function openProfile(page: Page) {
  await page.goto("/players", { waitUntil: "networkidle" });
  const href = (await page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first().getAttribute("href"))!;
  await page.goto(href, { waitUntil: "networkidle" });
  await expect(page.getByTestId("season-summary")).toBeVisible();
  return href;
}

const layout = (page: Page) =>
  page.evaluate(() => {
    const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    return { heading: Math.round(r("#season-stats").width), headingH: Math.round(r("#season-stats").height), figures: Math.round(r("[data-testid=season-figures]").top), section: Math.round(r("[data-testid=season-summary]").height), overflow: document.documentElement.scrollWidth - innerWidth };
  });

test("Refine opens over the page: the heading, figures and sections below stay where they are", async ({ page }) => {
  test.skip(isPhone(page), "phones keep the full-width filter panel (below)");
  await openProfile(page);
  const before = await layout(page);
  const refine = page.getByTestId("refine-filters");
  await refine.click();
  const panel = page.getByTestId("refine-panel");
  await expect(panel).toBeVisible();
  await expect(refine).toHaveAttribute("aria-expanded", "true");
  const after = await layout(page);
  expect(after).toEqual(before);
  expect(after.overflow).toBeLessThanOrEqual(1);
  // The heading reads on one line, at its full width.
  expect(after.headingH).toBeLessThan(40);
  // Inside the window, under the button.
  const box = (await panel.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  expect(box.y).toBeGreaterThan((await refine.boundingBox())!.y);
  // Labelled controls, and what they narrow (ranked progress and the pools keep their own scope).
  await expect(panel.getByTestId("refine-scope")).toHaveText("Applies to Season performance, its multikills and Recent form.");
  await expect(panel.getByText("Role played", { exact: true })).toBeVisible();
  await expect(panel.getByText("Champions", { exact: true })).toBeVisible();

  // Escape closes and gives focus back to Refine; Refine again toggles; a click outside closes.
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(refine).toBeFocused();
  await refine.click();
  await expect(panel).toBeVisible();
  await refine.click();
  await expect(panel).toBeHidden();
  await refine.click();
  await page.locator("#season-stats").click();
  await expect(panel).toBeHidden();
  expect(await layout(page)).toEqual(before);
});

test("a choice made in Refine applies, is kept when the panel closes and reopens, and clears from its chip", async ({ page }) => {
  test.skip(isPhone(page), "desktop and tablet");
  await openProfile(page);
  const refine = page.getByTestId("refine-filters");
  await refine.click();
  await expect(page.getByTestId("recent-form-scope")).toHaveCount(0);
  await page.getByTestId("refine-panel").getByTestId("role-filter-TOP").click();
  await expect(page).toHaveURL(/role=TOP/);
  await expect(page.getByTestId("stats-population")).toContainText(/Top/);
  // The same filter narrows the multikills and Recent form, which says so; ranked progress keeps its own queue and account.
  await expect(page.getByTestId("recent-form-scope")).toHaveText("Filtered: Top");
  await expect(page.getByTestId("multikills")).toBeVisible();
  // Still open after the choice applied; closing and reopening keeps it.
  await page.keyboard.press("Escape");
  await expect(refine).toContainText("1");
  await refine.click();
  await expect(page.getByTestId("refine-panel").getByTestId("role-filter-TOP")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  // The active refinement shows as a chip under the bar, which removes it.
  await page.getByRole("button", { name: "Remove filter Top" }).click();
  await expect(page).not.toHaveURL(/role=TOP/);
  expect((await layout(page)).overflow).toBeLessThanOrEqual(1);
});

test("phones: the same fields sit in the full-width filter panel, without a horizontal scroll", async ({ page }) => {
  test.skip(!isPhone(page), "phones only");
  await openProfile(page);
  const bar = page.getByTestId("overview-filters");
  await expect(bar.getByTestId("refine-filters")).toBeHidden();
  await bar.getByTestId("filter-toggle").click();
  await expect(bar.getByTestId("refine-panel")).toBeVisible();
  await expect(bar.getByRole("radio", { name: "All roles" })).toBeVisible();
  const heading = await page.locator("#season-stats").boundingBox();
  expect(heading!.height).toBeLessThan(40);
  expect((await layout(page)).overflow).toBeLessThanOrEqual(1);
});
