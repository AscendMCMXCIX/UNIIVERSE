import { expect, test, type Locator, type Page } from "./test";

/*
  Where you are, and where you can go, stay in reach on every screen (docs/RESPONSIVE.md → Shell,
  docs/MOBILE.md → Sections of a page):
    - phones: a profile's sections ride in the top bar, and a section chosen far down the page
      starts at its top, just under the bar, whatever loading state comes between;
    - tablets and desktops: Team's sections and a profile's sections stay pinned at the top of the
      page once it scrolls (under the tablet's top bar), and a table's own pinned header sits under
      them, never behind them; the tablet's menu is a modal dialog: focus stays inside, the page
      behind is inert, and Escape returns focus to the menu button;
    - the installed app on a tablet has no browser Back, so a page reached from another (a
      teammate's profile) gets Back in the top bar there.
  In-memory demo roster.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const width = (page: Page) => page.viewportSize()?.width ?? 1440;
const isPhone = (page: Page) => width(page) < 768;
const isTablet = (page: Page) => width(page) >= 768 && width(page) < 1024;

/** A teammate's profile (the demo's local owner has no player of its own). */
async function teammate(page: Page): Promise<string> {
  await page.goto("/team");
  return `/players/${await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id")}`;
}

/** Where a profile section starts on a phone: the profile card's bottom edge, less the top bar (docs/MOBILE.md). */
const sectionTop = (page: Page) =>
  page.evaluate(() => {
    const card = document.querySelector("[data-testid=profile-header]")!.getBoundingClientRect();
    return Math.round(card.bottom + window.scrollY - document.querySelector<HTMLElement>("[data-testid=mobile-topbar]")!.offsetHeight);
  });

/**
 * Taps a control where it is on screen. Playwright's click first scrolls its target "into view",
 * which moves a page whose sticky bar already shows the control; a finger does not.
 */
async function tapInPlace(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const rect = (target: Locator) => target.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; });

test("phone: a section chosen far down a profile starts at its top, just under the bar, once its content has arrived", async ({ page }) => {
  test.skip(!isPhone(page), "the sections ride in the phone's top bar");
  const profile = await teammate(page);
  const tabs = page.getByTestId("profile-chrome-tabs");
  const settled = async (what: string) => {
    // Where the section should start now that its own header (the compact band) is on the page,
    // and the place keeps once the content has replaced the loading state.
    await expect.poll(() => page.evaluate(() => window.scrollY), { message: `${what}: the section starts under the bar` }).toBeCloseTo(await sectionTop(page), -1);
    await page.waitForTimeout(600);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - (await sectionTop(page))), `${what}: still there once the content has arrived`).toBeLessThanOrEqual(2);
  };

  await page.goto(profile);
  await expect(page.getByTestId("season-summary")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 1200));
  await tapInPlace(page, tabs.getByRole("link", { name: "History" }));
  await expect(page).toHaveURL(new RegExp(`${profile}/matches$`));
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await settled("Overview → History");

  // From a section sitting exactly at its top (the band just under the bar), the next one starts at
  // its own top too: the Overview's card is taller than the band, so the place differs.
  await tapInPlace(page, tabs.getByRole("link", { name: "Overview" }));
  await expect(page).toHaveURL(new RegExp(`${profile}$`));
  await expect(page.getByTestId("season-summary")).toBeVisible();
  await settled("History at its top → Overview");

  await tapInPlace(page, tabs.getByRole("link", { name: "History" }));
  await expect(page).toHaveURL(new RegExp(`${profile}/matches$`));
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => window.scrollTo(0, 1200));
  await tapInPlace(page, tabs.getByRole("link", { name: "Overview" }));
  await expect(page).toHaveURL(new RegExp(`${profile}$`));
  await expect(page.getByTestId("season-summary")).toBeVisible();
  await settled("History → Overview");

  await page.evaluate(() => window.scrollTo(0, 1200));
  await tapInPlace(page, tabs.getByRole("link", { name: "Champions" }));
  await expect(page).toHaveURL(new RegExp(`${profile}/champions$`));
  await expect(page.getByTestId("all-champions")).toBeVisible();
  await settled("Overview → Champions");

  // Chosen with the card still in view, the page stays where it is.
  await page.evaluate(() => window.scrollTo(0, 0));
  await tapInPlace(page, tabs.getByRole("link", { name: "Accounts" }));
  await expect(page).toHaveURL(new RegExp(`${profile}/accounts$`));
  await expect(page.getByTestId("riot-accounts")).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("tablet and desktop: Team's sections stay in reach as a long page scrolls, and switch the section from there", async ({ page }) => {
  test.skip(isPhone(page), "phones have the bottom tab bar");
  await page.goto("/leaderboards?view=records");
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("records")).toBeVisible();
  const tabs = page.getByTestId("team-tabs");
  const resting = await rect(tabs);
  // At rest the bar is part of the page: no ink of its own.
  await expect(tabs).not.toHaveAttribute("data-stuck", /.*/);
  const ink = () => tabs.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await ink()).toBe("rgba(0, 0, 0, 0)");
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
  // Pinned at the top of the page: under the tablet's top bar, at the window's edge beside the
  // sidebar, and in the frame's ink while it is.
  const pinned = await rect(tabs);
  const barBottom = isTablet(page) ? (await rect(page.getByTestId("mobile-topbar"))).bottom : 0;
  expect(pinned.top).toBe(barBottom);
  expect(pinned.height).toBe(resting.height);
  await expect(tabs).toHaveAttribute("data-stuck", "");
  // The ink fades in over 150 ms: wait for it rather than sample its first frame.
  await expect.poll(ink).not.toBe("rgba(0, 0, 0, 0)");
  // Focus moving onto a pinned tab (or the sidebar's logo) does not scroll the page: the pinned
  // controls take the page's scroll padding back.
  const scrolled = await page.evaluate(() => window.scrollY);
  await tabs.getByRole("link", { name: "Overview" }).focus();
  await expect(tabs.getByRole("link", { name: "Overview" })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  if (!isTablet(page)) {
    await page.locator("aside a[title]").first().focus();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(tabs).not.toHaveAttribute("data-stuck", /.*/);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect(tabs).toHaveAttribute("data-stuck", "");
  // Whatever is brought into view stops under them (scroll-padding), as it does under the phone's bars.
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop))).toBeGreaterThanOrEqual(pinned.bottom);
  await tapInPlace(page, tabs.getByRole("link", { name: "Matches" }));
  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.getByTestId("team-tab-matches")).toHaveAttribute("aria-current", "page");
});

test("tablet and desktop: a profile's sections stay in reach, and All Champions' column headings pin under them, not behind them", async ({ page }) => {
  test.skip(isPhone(page), "phones show the sections in the top bar");
  const profile = await teammate(page);
  await page.goto(`${profile}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  const tabs = page.getByTestId("profile-tabs");
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  const barBottom = isTablet(page) ? (await rect(page.getByTestId("mobile-topbar"))).bottom : 0;
  expect((await rect(tabs)).top).toBe(barBottom);
  await tapInPlace(page, tabs.getByRole("link", { name: "All Champions" }));
  await expect(page).toHaveURL(new RegExp(`${profile}/champions$`));
  // The column headings pin under the tabs (their own offset is the tabs' height, plus the tablet's
  // bar); a short window, so the table scrolls as far as its eight champions allow.
  const header = page.getByTestId("all-champions-header");
  await expect(header).toBeVisible();
  expect(await header.evaluate((el) => parseFloat(getComputedStyle(el).top))).toBeGreaterThanOrEqual(barBottom + (await rect(tabs)).height - 1);
  await page.setViewportSize({ width: width(page), height: 500 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const pinnedTabs = await rect(tabs);
  const pinnedHeader = await rect(header);
  expect(pinnedTabs.top).toBe(barBottom);
  expect(pinnedHeader.top).toBeGreaterThanOrEqual(pinnedTabs.bottom - 1);
  // A short window (480px tall or shorter) keeps its height for the page: nothing stays pinned there.
  await page.setViewportSize({ width: width(page), height: 420 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => (await rect(tabs)).top).toBeLessThan(barBottom);
});

test("tablet: the menu is a modal dialog: focus stays inside, the page behind is inert, and Escape returns focus to the menu button", async ({ page }) => {
  test.skip(!isTablet(page), "the drawer is the tablet's menu");
  await page.goto("/players");
  await expect(page.getByTestId("players-directory")).toBeVisible();
  const menu = page.getByRole("button", { name: "Open menu" });
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "Menu" });
  await expect(drawer).toBeVisible();
  const inside = () => page.evaluate(() => !!document.activeElement?.closest("#mobile-drawer"));
  expect(await inside()).toBe(true);
  // Tab goes round the menu's own controls (past its last one, the browser's own chrome, then
  // round again); never into the page behind.
  let within = 0;
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab");
    const on = await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest("#mobile-drawer"));
    expect(on, `focus after ${i + 1} tabs`).toBe(true);
    if (await inside()) within++;
  }
  expect(within).toBeGreaterThanOrEqual(10);
  // The page behind cannot take focus while the menu is open.
  expect(await page.evaluate(() => { const link = document.querySelector<HTMLElement>("main a[href]")!; link.focus(); return document.activeElement === link; })).toBe(false);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(menu).toBeFocused();
  // A click outside the panel closes it too, and a page scrolled far down stays where it was when
  // focus returns to the menu button in the bar. (Players fits one tablet screen: a teammate's
  // Match History, ten games a page, is the long page here.)
  await page.goto(`${await teammate(page)}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => window.scrollTo(0, 800));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const scrolled = await page.evaluate(() => window.scrollY);
  await menu.click();
  await expect(drawer).toBeVisible();
  await page.mouse.click(700, 500);
  await expect(drawer).toHaveCount(0);
  await expect(menu).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  // Left open while the browser's Back changes the page (within the app, so the menu's state
  // survives the change), it is gone, and Forward does not bring it back unasked.
  await page.goto("/team");
  await page.getByTestId("team-tab-players").click();
  await expect(page).toHaveURL(/\/players$/);
  await expect(page.getByTestId("players-directory")).toBeVisible();
  await menu.click();
  await expect(drawer).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
  await expect(drawer).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/\/players$/);
  await expect(page.getByTestId("players-directory")).toBeVisible();
  await expect(drawer).toHaveCount(0);
});

test("tablet, installed as an app: Back appears on a teammate's profile; in a browser the menu is the way back", async ({ page }) => {
  test.skip(!isTablet(page), "the tablet's top bar");
  const profile = await teammate(page);
  await page.goto(profile);
  await expect(page.getByTestId("profile-tabs")).toBeVisible();
  await expect(page.getByTestId("mobile-back")).toBeHidden();
  // The installed app's display mode, as the page asks the browser for it (install-state.ts);
  // Chromium cannot emulate it, so the answer is stood in for. A real iPad is on the real-device list.
  await page.context().addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const list = real(query);
      if (!query.includes("display-mode: standalone")) return list;
      return { matches: true, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false } as unknown as MediaQueryList;
    };
  });
  await page.goto(profile);
  const back = page.getByTestId("mobile-back");
  await expect(back).toBeVisible();
  await expect(back).toContainText("Players");
  // The menu is still there beside it.
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/players$/);
});

test("phone: Done closes the filter sheet the way Escape does, with its motion", async ({ page }) => {
  test.skip(!isPhone(page), "the sheet is the phone's filter bar");
  const profile = await teammate(page);
  await page.goto(`${profile}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await page.getByTestId("filter-toggle").click();
  const sheet = page.getByTestId("filter-sheet");
  await expect(sheet).toBeVisible();
  // The sheet is marked as closing for its motion (140 ms) before it goes: watched, not sampled.
  await sheet.evaluate((dialog) => {
    const w = window as unknown as { __sheetClosing?: boolean };
    w.__sheetClosing = false;
    new MutationObserver(() => {
      if (dialog.getAttribute("data-closing") === "true") w.__sheetClosing = true;
    }).observe(dialog, { attributes: true, attributeFilter: ["data-closing"] });
  });
  await page.getByTestId("filter-sheet-done").click();
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __sheetClosing?: boolean }).__sheetClosing)).toBe(true);
  await expect(page.getByTestId("filter-toggle")).toBeFocused();
});

test("Admin Mode's Settings page has a title, so the phone bar can name it like every page", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/admin/settings");
  await expect(page.locator("main h1")).toHaveText("Settings");
});
