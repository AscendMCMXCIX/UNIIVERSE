import { expect, test, type Page } from "./test";
import { pick } from "./select";
import { closeFilterSheet, openFilterBar } from "./filters";

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

test("phones: the current tab on its own page, the current section in the top bar's row, and the page's title in the top bar, go back to the top", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone tab bar");
  await page.emulateMedia({ reducedMotion: "reduce" });
  // A tall phone, whose bars stay put while the page scrolls (under 700px tall they slide away: docs/MOBILE.md, "The frame slides away").
  await page.setViewportSize({ width: 393, height: 852 });
  // Matchup Intel's tab on its own page.
  await page.goto("/resources");
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => scrollY(page)).toBeGreaterThan(0);
  await page.getByTestId("phone-tabbar").getByTestId("tab-resources").click();
  await expect(page).toHaveURL(/\/resources$/);
  await expect.poll(() => scrollY(page)).toBe(0);
  // Players, one of Team's sections: its tab in the top bar's row.
  await page.goto("/players");
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => scrollY(page)).toBeGreaterThan(0);
  await page.getByTestId("team-chrome-tab-players").click();
  await expect(page).toHaveURL(/\/players$/);
  await expect.poll(() => scrollY(page)).toBe(0);
  // The title moves into the bar once the heading has gone under it; a tap on it goes to the top.
  await page.evaluate(() => window.scrollTo(0, 400));
  const title = page.getByTestId("mobile-title");
  await expect(title).toHaveText("Players");
  await title.click();
  await expect.poll(() => scrollY(page)).toBe(0);
});

/**
 * Follows the page's own content requests (Next's RSC fetches, prefetches left out) from now on:
 * any it lists after a click means the click navigated, and the page was fetched again.
 */
function watchNavigations(page: Page) {
  const seen: string[] = [];
  const onRequest = (request: import("@playwright/test").Request) => {
    const h = request.headers();
    if (h["rsc"] === "1" && !h["next-router-prefetch"] && !h["next-router-segment-prefetch"]) seen.push(new URL(request.url()).pathname);
  };
  page.on("request", onRequest);
  return async () => {
    await page.waitForLoadState("networkidle");
    page.off("request", onRequest);
    return seen;
  };
}

test("tablets and desktops: the current section tab, and the frame's entry for the page shown (the sidebar's, a tablet's top bar's), keep the page as it is and go back to the top", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "phones: the tab bar (the test above)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Leaderboards' records keep their season in the address (?season=); the current tab's own link has
  // no query, and following it used to bring back the default (Recent form, when Records was a view).
  await page.goto("/leaderboards?season=16");
  await expect(page.getByTestId("records")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => scrollY(page)).toBeGreaterThan(200);
  let navigations = watchNavigations(page);
  await page.getByTestId("team-tab-leaderboards").click();
  await expect.poll(() => scrollY(page)).toBe(0);
  // Kept, not fetched again: no request for the page's content once the network is quiet.
  expect(await navigations(), "the current tab fetches nothing").toEqual([]);
  await expect(page).toHaveURL(/[?&]season=16/);
  await expect(page.getByTestId("records")).toBeVisible();
  // With a modifier key the tab keeps its meaning: it opens in a new tab.
  const [opened] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("team-tab-leaderboards").click({ modifiers: ["ControlOrMeta"] })]);
  await opened.close();
  // Matchup Intel's own entry in the frame (the sidebar's on a desktop, a tablet's top bar's), pressed
  // on its page, keeps the pair it shows and goes to the top, as Leaderboards' tab keeps its season: its
  // own link has no query, and following it cleared the pair. The page is made long enough to scroll, as
  // the Library's below.
  await page.goto("/resources/matchups?champion=Riven&vs=Mordekaiser");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Mordekaiser");
  // Once the page's code runs: a click before then follows the tab's bare link.
  await expect(page.getByTestId("matchup-remembered")).not.toHaveAttribute("data-state", "loading");
  await page.evaluate(() => {
    const extra = document.createElement("div");
    extra.dataset.testid = "test-length";
    extra.style.height = "2000px";
    document.querySelector("main")!.append(extra);
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect.poll(() => scrollY(page)).toBeGreaterThan(200);
  navigations = watchNavigations(page);
  const intel = page.getByTestId(info.project.name === "desktop" ? "nav-resources-matchups" : "topbar-nav-resources-matchups");
  await expect(intel).toHaveAttribute("aria-current", "page");
  await intel.click();
  await expect.poll(() => scrollY(page)).toBe(0);
  expect(await navigations(), "Matchup Intel's entry on its own page fetches nothing").toEqual([]);
  await expect(page).toHaveURL(/\/resources\/matchups\?champion=Riven&vs=Mordekaiser$/);
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Mordekaiser");
  {
    // The frame's entry for the page shown (Resources), the sidebar's on a desktop and the top bar's
    // destination on a tablet: the page stays as it is, back at its top. Resources fits a desktop
    // window, so the test makes it long enough to scroll. The Library's rows ask each site for its
    // icon; a test asks none (resources.spec.ts).
    const entry = page.getByTestId(info.project.name === "desktop" ? "nav-resources" : "topbar-nav-resources");
    await page.route(/\/favicon\.ico$/, (route) => route.abort());
    await page.goto("/resources");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      const extra = document.createElement("div");
      extra.dataset.testid = "test-length";
      extra.style.height = "2000px";
      document.querySelector("main")!.append(extra);
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect.poll(() => scrollY(page)).toBeGreaterThan(200);
    navigations = watchNavigations(page);
    await expect(entry).toHaveAttribute("aria-current", "page");
    await entry.click();
    await expect.poll(() => scrollY(page)).toBe(0);
    expect(await navigations(), `the ${info.project.name === "desktop" ? "sidebar's entry" : "top bar's destination"} for the page shown fetches nothing`).toEqual([]);
    await expect(page).toHaveURL(/\/resources$/);
    await expect(page.getByTestId("test-length"), "the page is the one it was, not a new one").toHaveCount(1);
  }
});

test("Team Matches' filters replace the history entry, as every filter does: Back leaves the page", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  await page.goto("/team");
  await page.goto("/matches");
  // Phones: the filters are in the sheet behind Filters (opened again if a change closed it); each
  // field has one copy, wherever it is shown.
  const bar = page.getByTestId("together-filters");
  const show = () => openFilterBar(bar, "together-filters-toggle");
  await show();
  await pick(page.getByTestId("together-queue"), "solo");
  await expect(page).toHaveURL(/queue=solo/);
  await show();
  await pick(page.getByTestId("together-min"), "3");
  await expect(page).toHaveURL(/min=3/);
  await show();
  await bar.getByTestId("reset-filters").click();
  await expect(page).not.toHaveURL(/queue=|min=/);
  await closeFilterSheet(page);
  // Three changes, one entry: Back goes to the page before Matches.
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
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
  await page.goto("/admin/people/access");
  const open = page.getByRole("button", { name: "New level" });
  const dialog = page.locator("dialog[open]");
  await expect(async () => {
    if (!(await dialog.isVisible())) await open.click({ timeout: 2_000 });
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(dialog.getByTestId("sheet-grabber")).toBeVisible();
  await expect(async () => expect(await dialog.evaluate((d) => getComputedStyle(d).transform)).toBe("none")).toPass();
  const docked = await dialog.evaluate((d) => Math.abs(d.getBoundingClientRect().bottom - innerHeight) <= 1);
  expect(docked).toBe(true);
  await expect(dialog.locator("[id^=dialog-title]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("phones: Matchup Intel's tab, on its own page, keeps the pair and goes back to the top, fetching nothing", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone's tab bar (the test above has tablets and desktops)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  // A tall phone, whose bars stay put while the page scrolls (under 700px tall they slide away: docs/MOBILE.md, "The frame slides away").
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/resources/matchups?champion=Riven&vs=Mordekaiser");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Mordekaiser");
  await expect(page.getByTestId("matchup-remembered")).not.toHaveAttribute("data-state", "loading");
  // No tabs in the page any more: Matchup Intel is a destination of its own, a tab of the bar.
  await expect(page.getByTestId("resources-tabs")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => scrollY(page)).toBeGreaterThan(200);
  const navigations = watchNavigations(page);
  const tab = page.getByTestId("phone-tabbar").getByTestId("tab-resources-matchups");
  await expect(tab).toHaveAttribute("aria-current", "page");
  await tab.click();
  await expect.poll(() => scrollY(page)).toBe(0);
  expect(await navigations(), "the tab of the page shown fetches nothing").toEqual([]);
  await expect(page).toHaveURL(/\/resources\/matchups\?champion=Riven&vs=Mordekaiser$/);
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Mordekaiser");
});
