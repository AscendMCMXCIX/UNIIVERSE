import { expect, test, type Page } from "@playwright/test";

/*
  Team Overview and a profile's Overview as home screens (in-memory demo roster, synthetic data).
  Team: on a wide screen the five cards stand side by side on one stage that reaches the foot of
  the window, and long names take a second line instead of being cut. Profile: the season, rank
  and form come first and the primary pool starts within the first screen of a 1440 × 900
  window; off roles are one-line summaries that open in place, and their portraits still open
  the champion window.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("Team Overview on a wide screen: five across on one stage that reaches the window's foot", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "wide screens");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/team");
  const cards = page.getByTestId("lineup-cell");
  await expect(cards).toHaveCount(5);
  const boxes = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), height: r.height })));
  expect(new Set(boxes.map((b) => b.top)).size, "one row").toBe(1);
  // Portrait cards: taller than they are wide, the artwork growing with the window.
  const art = (await page.getByTestId("card-art").first().boundingBox())!;
  expect(art.height).toBeGreaterThanOrEqual(13 * 16);
  const floor = (await page.getByTestId("lineup-stage-floor").boundingBox())!;
  expect(floor.y + floor.height, "the stage reaches the foot of the window").toBeGreaterThanOrEqual(1080 - 40);
  expect(await page.getByTestId("lineup-stage-floor").getAttribute("aria-hidden")).toBe("true");
  // Names are never cut: a long one wraps instead.
  const cut = await page.locator('[data-testid="lineup-overview"] [data-name-style]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length);
  expect(cut).toBe(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

async function openTeammate(page: Page) {
  await page.goto("/players");
  const card = page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByTestId("pool-editor")).toBeVisible();
}

test("profile Overview: the primary pool starts within the first screen; off roles open in place", async ({ page }, info) => {
  await openTeammate(page);
  const primary = page.getByTestId("primary-pool");
  if (info.project.name === "desktop") {
    // 1440 × 900: season, rank and form, then the primary pool's heading and first cards.
    const top = (await primary.boundingBox())!.y + (await page.evaluate(() => window.scrollY));
    expect(top, "the primary pool starts on the first screen").toBeLessThan(900 - 60);
  }
  // Off roles: one line each, with the champions as portraits; the cards are behind "Show".
  const off = page.getByTestId("secondary-pool");
  await expect(off).toHaveAttribute("data-open", "false");
  await expect(off.getByTestId("secondary-pool-preview")).toBeVisible();
  await expect(off.getByTestId("secondary-pool-list")).toBeHidden();
  const toggle = off.getByTestId("secondary-pool-expand");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  // A portrait opens that champion's window, in the off role.
  const portrait = off.getByTestId("pool-preview-inspect").first();
  const champion = await portrait.locator("xpath=..").getAttribute("data-champion");
  await portrait.click();
  await expect(page.getByTestId("champion-detail")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`champ=${champion}`));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-detail")).toHaveCount(0);
  // Opening shows the full, editable pool; closing folds it back.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(off.getByTestId("secondary-pool-list")).toBeVisible();
  await expect(off.getByTestId("secondary-pool-list").getByTestId("pool-item").first()).toBeVisible();
  await expect(off.getByRole("button", { name: /Add/ }).first()).toBeVisible();
  await toggle.click();
  await expect(off.getByTestId("secondary-pool-list")).toBeHidden();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});
