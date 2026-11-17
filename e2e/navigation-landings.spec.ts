import { expect, test, type Page } from "./test";

/*
  The navigation contract (docs/DESIGN_SYSTEM.md, "The navigation contract"): where a page starts,
  Back to the place it was, the next page of a list starting with its first item, back to the top
  from the phone's tab bar and title, Skip to content, and every dialog being the one shared sheet.
  In-memory demo roster.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

async function topId(page: Page) {
  await page.goto("/team");
  return (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
}

test("a profile opened from a scrolled list starts at its top, and Back returns to the list where it was", async ({ page }, info) => {
  // Players fits one screen on tablets and desktops since the roster board: a window short enough for
  // it to scroll there, still taller than a short window (480px), so the pinned section tabs and the
  // desktop frame behind the bug below are the ones in play.
  if (info.project.name !== "phone") await page.setViewportSize({ width: page.viewportSize()!.width, height: 500 });
  await page.goto("/players");
  await page.waitForLoadState("networkidle");
  // The list's last profile link (a profile itself, not one of its sections); found again if the list re-renders meanwhile.
  const href = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>("main a[href^='/players/']")]
      .filter((a) => a.offsetParent !== null)
      .map((a) => a.getAttribute("href")!)
      .filter((h) => /^\/players\/[0-9a-f-]{36}$/.test(h))
      .pop(),
  );
  const link = page.locator(`main a[href="${href}"]:visible`).last();
  await expect(async () => link.scrollIntoViewIfNeeded({ timeout: 2_000 })).toPass({ timeout: 15_000 });
  const listY = await scrollY(page);
  // A list that fits again fails here, loudly, rather than skipping what the test is for.
  expect(listY, `the Players list scrolls on ${info.project.name}`).toBeGreaterThan(0);
  await link.click();
  await expect(page).toHaveURL(/\/players\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("profile-header")).toBeVisible();
  // It once started where the list was (48px down on a desktop, the profile card cut).
  await expect.poll(() => scrollY(page)).toBe(0);
  expect((await page.getByTestId("profile-header").boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/players$/);
  await expect.poll(() => scrollY(page)).toBe(listY);
});

test("Match History's next page starts with its first game under the bars, not at its end", async ({ page }) => {
  await page.goto(`/players/${await topId(page)}/matches`);
  const history = page.getByTestId("match-history");
  await expect(history).toHaveAttribute("data-ready", "true");
  const next = page.getByTestId("match-next");
  test.skip(!(await next.isVisible()), "one page of games");
  await next.scrollIntoViewIfNeeded();
  await next.click();
  await expect(page).toHaveURL(/page=2/);
  await expect(history).toHaveAttribute("data-ready", "true");
  const first = page.getByTestId("match-card").first();
  await expect(first).toBeInViewport();
  const box = (await first.boundingBox())!;
  const height = page.viewportSize()!.height;
  // Within the top third of the screen: under the bars, at the list's start.
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeLessThan(height / 3);
});

test("phones: the current tab on its own page, and the page's title in the top bar, go back to the top", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone tab bar");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/players");
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => scrollY(page)).toBeGreaterThan(0);
  await page.getByTestId("phone-tabbar").getByTestId("tab-players").click();
  await expect(page).toHaveURL(/\/players$/);
  await expect.poll(() => scrollY(page)).toBe(0);
  // The title moves into the bar once the heading has gone under it; a tap on it goes to the top.
  await page.evaluate(() => window.scrollTo(0, 400));
  const title = page.getByTestId("mobile-title");
  await expect(title).toHaveText("Players");
  await title.click();
  await expect.poll(() => scrollY(page)).toBe(0);
});

test("Skip to content is the first stop on the page and moves focus to the page itself", async ({ page }) => {
  await page.goto("/team");
  await page.keyboard.press("Tab");
  const skip = page.getByTestId("skip-link");
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#content")).toBeFocused();
});

test("phones: a dialog is the one shared sheet, docked to the bottom edge with its handle", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "the phone sheet");
  await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/admin/people");
  const open = page.locator("[data-testid=open-access]:not([disabled])").first();
  const dialog = page.locator("dialog[open]");
  await expect(async () => {
    if (!(await dialog.isVisible())) await open.click({ timeout: 2_000 });
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(dialog.getByTestId("sheet-grabber")).toBeVisible();
  await expect(async () => expect(await dialog.evaluate((d) => getComputedStyle(d).transform)).toBe("none")).toPass();
  const docked = await dialog.evaluate((d) => Math.abs(d.getBoundingClientRect().bottom - innerHeight) <= 1);
  expect(docked).toBe(true);
  await expect(dialog.locator("#dialog-title")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
