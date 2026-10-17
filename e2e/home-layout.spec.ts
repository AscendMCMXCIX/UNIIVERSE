import { expect, test, type Locator, type Page } from "@playwright/test";

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
/** An element's box once it is on screen (measuring before it renders gives no box). */
async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  return (await locator.boundingBox())!;
}

test("Team Overview on a wide screen: five across on one stage that reaches the window's foot", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "wide screens");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/team");
  const cards = page.getByTestId("lineup-cell");
  await expect(cards).toHaveCount(5);
  const boxes = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), height: r.height })));
  expect(new Set(boxes.map((b) => b.top)).size, "one row").toBe(1);
  // Portrait cards: taller than they are wide, the artwork growing with the window.
  const art = await box(page.getByTestId("card-art").first());
  expect(art.height).toBeGreaterThanOrEqual(13 * 16);
  const floor = await box(page.getByTestId("lineup-stage-floor"));
  expect(floor.y + floor.height, "the stage reaches the foot of the window").toBeGreaterThanOrEqual(1080 - 40);
  expect(await page.getByTestId("lineup-stage-floor").getAttribute("aria-hidden")).toBe("true");
  // Names are never cut: a long one wraps instead.
  const cut = await page.locator('[data-testid="lineup-overview"] [data-name-style]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length);
  expect(cut).toBe(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("Team Overview on a 1366 × 768 laptop with the sidebar open: all five in one centred row of equal cards", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "laptop widths");
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/team");
  const cells = page.getByTestId("lineup-cell");
  await expect(cells).toHaveCount(5);
  const boxes = await cells.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), bottom: r.bottom })));
  expect(new Set(boxes.map((b) => b.top)).size, "one row").toBe(1);
  expect(new Set(boxes.map((b) => b.width)).size, "equal widths").toBe(1);
  expect(new Set(boxes.map((b) => b.height)).size, "equal heights").toBe(1);
  // The whole lineup on the first screen, centred in the content area under a header of the same width.
  expect(Math.max(...boxes.map((b) => b.bottom))).toBeLessThanOrEqual(768);
  const track = await box(page.getByTestId("lineup-overview"));
  const header = await box(page.getByTestId("team-header"));
  const main = await box(page.locator("main"));
  expect(Math.abs(track.x + track.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs(header.width - track.width)).toBeLessThanOrEqual(2);
  // Narrow cards stay readable: names wrap whole (never cut) and ranks are not shortened.
  const cut = await page.locator('[data-testid="lineup-overview"] [data-name-style], [data-testid="lineup-overview"] [data-testid="rank-inline"] > span').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length);
  expect(cut).toBe(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("Team Overview on a very wide screen: the lineup keeps its maximum width, centred", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "wide screens");
  await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/team");
  const track = await box(page.getByTestId("lineup-overview"));
  const main = await box(page.locator("main"));
  // The cap is in rem (the type scales with very large screens, the lineup with it), never the window.
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(track.width).toBeLessThanOrEqual(84 * rem + 1);
  expect(track.width).toBeLessThan(main.width - 2 * 4 * rem);
  expect(Math.abs(track.x + track.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(2);
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
    const top = (await box(primary)).y + (await page.evaluate(() => window.scrollY));
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
