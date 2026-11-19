import { expect, test, type Locator, type Page } from "./test";

/*
  Where you are, and where you can go, stay in reach on every screen (docs/RESPONSIVE.md → Shell,
  docs/MOBILE.md → Sections of a page):
    - phones: a profile's sections ride in the top bar, and a section chosen far down the page
      starts at its top, just under the bar, whatever loading state comes between;
    - tablets and desktops: Team's sections and a profile's sections stay pinned at the top of the
      page once it scrolls (under the tablet's top bar), and a table's own pinned header sits under
      them, never behind them; a tablet's destinations are in its top bar, and its avatar menu takes
      the focus to its first item, keeps the arrow keys inside, and gives the focus back to the
      avatar on Escape; a navigation never leaves it open;
    - the installed app on a tablet has no browser Back, so a page reached from another (a
      teammate's profile) gets Back in the top bar there;
    - a long page's own controls stay in reach (PR 2b): from md, once the tabs are pinned and the
      page's toolbar has gone up under them, the row offers the page's compact controls without
      growing, its Filters opening the sheet; nothing in a short window.
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

test("phone: the current section in the top bar keeps the page's view and goes back to the top", async ({ page }) => {
  test.skip(!isPhone(page), "the phone's sections in the top bar");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = await teammate(page);
  // Match History's Encounters view, kept in the address; the current section's own link has none.
  await page.goto(`${profile}/matches?view=encounters`);
  await expect(page.getByTestId("profile-chrome-tabs")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await tapInPlace(page, page.getByTestId("profile-chrome-tab-matches"));
  await expect.poll(() => page.evaluate(() => window.scrollY), { message: "back at the top" }).toBe(0);
  await expect(page).toHaveURL(/[?&]view=encounters/);
});

test("tablet and desktop: a profile section chosen far down the page starts at its own top, under the pinned tabs; one chosen at rest keeps the page still", async ({ page }) => {
  test.skip(isPhone(page), "phones carry the sections in the top bar (their own test above)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = await teammate(page);
  const tabs = page.getByTestId("profile-tabs");
  // Where a section starts from md: the profile card scrolled away and the tabs just pinned (at the
  // top bar's foot, or the window's edge beside the sidebar): their place in the page, less the
  // offset they pin at.
  const pinnedTop = () =>
    page.evaluate(() => {
      const tabs = document.querySelector<HTMLElement>("[data-testid=profile-tabs]")!;
      const pinnedAt = parseFloat(getComputedStyle(tabs).top) || 0;
      tabs.style.position = "static";
      const top = tabs.getBoundingClientRect().top + window.scrollY;
      tabs.style.position = "";
      return Math.round(top - pinnedAt);
    });
  const settled = async (what: string) => {
    await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - (await pinnedTop())), { message: `${what}: the section starts under the pinned tabs` }).toBeLessThanOrEqual(2);
    await page.waitForTimeout(600);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - (await pinnedTop())), `${what}: still there once the content has arrived`).toBeLessThanOrEqual(2);
  };

  // At rest (the card in view), a section keeps the page where it is.
  await page.goto(profile);
  await expect(page.getByTestId("season-summary")).toBeVisible();
  await tabs.getByTestId("profile-tab-champions").click();
  await expect(page).toHaveURL(new RegExp(`${profile}/champions$`));
  await expect(page.getByTestId("all-champions")).toBeVisible();
  expect(await page.evaluate(() => window.scrollY), "a section chosen at rest").toBe(0);

  // Scrolled only a little, the new section's top still in view: the page never moves down to it.
  await tabs.getByTestId("profile-tab-matches").click();
  await expect(page).toHaveURL(new RegExp(`${profile}/matches$`));
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => window.scrollTo(0, 60));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(60);
  await tapInPlace(page, tabs.getByTestId("profile-tab-overview"));
  await expect(page).toHaveURL(new RegExp(`${profile}$`));
  await expect(page.getByTestId("season-summary")).toBeVisible();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.scrollY), "a section chosen a little way down keeps the page, never lower").toBeLessThanOrEqual(60);

  // Far down Match History, Overview (whose card is taller than the band) starts at its own top.
  await tabs.getByTestId("profile-tab-matches").click();
  await expect(page).toHaveURL(new RegExp(`${profile}/matches$`));
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  await tapInPlace(page, tabs.getByTestId("profile-tab-overview"));
  await expect(page).toHaveURL(new RegExp(`${profile}$`));
  await expect(page.getByTestId("season-summary")).toBeVisible();
  await settled("History → Overview");
  // Pinned at the top bar's foot (a tablet) or the window's edge (a desktop, where the bar is hidden).
  const bar = await page.evaluate(() => document.querySelector<HTMLElement>("[data-testid=mobile-topbar]")?.offsetHeight ?? 0);
  expect(Math.abs((await rect(tabs)).top - bar), "the tabs pinned at the frame's top").toBeLessThanOrEqual(1);

  // And from there, far down the Overview, to History.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await tapInPlace(page, tabs.getByTestId("profile-tab-matches"));
  await expect(page).toHaveURL(new RegExp(`${profile}/matches$`));
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await settled("Overview → History");
});

test("tablet and desktop: Team's sections stay in reach as a long page scrolls, and switch the section from there", async ({ page }) => {
  test.skip(isPhone(page), "phones have the bottom tab bar");
  // Records is the longest Team page, but since PR 5b it fits a 1440×900 window in about 1.3
  // screens: a desktop window 600px tall keeps it long enough to scroll well past the tabs (still
  // taller than 480px, where they pin). The tablet's 768×1024 shows it in about two screens.
  if (!isTablet(page)) await page.setViewportSize({ width: 1440, height: 600 });
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
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
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

/**
 * A tab row against its pages: where its first tab starts and where the page's column does (the
 * element of main#content that holds the page: for a bar of main's own, as Team's, the page after
 * it; for a bar inside a page, as a profile's or a view switch, that page), the bar against main's
 * room (inside its padding), the row itself, and on Team Overview its header (capped at 84rem and
 * centred in Team's column). Measured on the page itself, never on a loading state standing in for it.
 */
const rowEdges = (nav: Locator) =>
  nav.evaluate((nav) => {
    const main = document.querySelector<HTMLElement>("main#content")!;
    let column: Element | null = nav;
    while (column && column.parentElement !== main) column = column.parentElement;
    if (column === nav) {
      column = nav.nextElementSibling;
      while (column && column.getBoundingClientRect().width === 0) column = column.nextElementSibling;
    }
    if (!column || column.matches("[role=status]")) throw new Error("measured a loading state, not the page");
    const style = getComputedStyle(main);
    const room = main.getBoundingClientRect();
    const page = column.getBoundingClientRect();
    const bar = nav.getBoundingClientRect();
    const row = (nav.firstElementChild as HTMLElement).getBoundingClientRect();
    const end = nav.querySelector("[data-testid=team-tabs-identity]")?.getBoundingClientRect();
    const header = column.querySelector("[data-testid=team-header]")?.getBoundingClientRect();
    return {
      tab: nav.querySelector("li")!.getBoundingClientRect().left,
      pageLeft: page.left,
      pageRight: page.right,
      barLeft: bar.left,
      barRight: bar.right,
      rowLeft: row.left,
      rowRight: row.right,
      roomLeft: room.left + parseFloat(style.paddingLeft),
      roomRight: room.right - parseFloat(style.paddingRight),
      end: end?.right ?? null,
      header: header ? { left: header.left, right: header.right } : null,
    };
  });

/** Loads a page and waits for the page itself: its heading in main, and no loading state left in its place. */
async function loaded(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main h1, main h2").first()).toBeVisible();
  await expect(page.locator("main#content > [role=status]")).toHaveCount(0);
}

test("wide windows: every tab row starts at its pages' column, on each of their sections, never moving between them; on Team Overview the header is centred in Team's column", async ({ page, context, baseURL }) => {
  test.skip(width(page) < 1024, "desktop windows; phones and tablets fill the width");
  test.setTimeout(240_000);
  const profile = await teammate(page);
  const SETS: Array<{ nav: string; mode: "player" | "admin"; pages: string[]; ownBar?: boolean }> = [
    // Bars of main's own, above pages centred in their set's width (SECTION_HUBS).
    { nav: "team-tabs", mode: "player", pages: ["/team", "/players", "/leaderboards", "/leaderboards?view=records", "/matches"], ownBar: true },
    { nav: "resources-tabs", mode: "player", pages: ["/resources", "/resources/matchups"], ownBar: true },
    { nav: "admin-settings-tabs", mode: "admin", pages: ["/admin/branding", "/admin/previews", "/admin/resources"], ownBar: true },
    // Bars inside their pages: a profile's sections, and the views of a section.
    { nav: "profile-tabs", mode: "player", pages: [profile, `${profile}/champions`, `${profile}/matches`, `${profile}/accounts`] },
    { nav: "leaderboards-views", mode: "player", pages: ["/leaderboards", "/leaderboards?view=records"] },
    { nav: "match-views", mode: "player", pages: [`${profile}/matches`, `${profile}/matches?view=encounters`] },
    { nav: "people-tabs", mode: "admin", pages: ["/admin/people", "/admin/people/access", "/admin/people/privacy"] },
  ];
  // Ultrawide and 1440p, the sidebar open; and 1080p with it folded, where 80rem pages stop growing
  // while Team's 100rem fill the room. (Under a 1600px window nothing changed: the test below.)
  const WINDOWS = [
    { width: 2560, height: 1440, sidebar: "expanded" },
    { width: 3440, height: 1440, sidebar: "expanded" },
    { width: 1920, height: 1080, sidebar: "collapsed" },
  ];
  for (const w of WINDOWS) {
    await page.setViewportSize({ width: w.width, height: w.height });
    for (const set of SETS) {
      if (w.width === 1920 && !set.ownBar) continue;
      await context.addCookies([{ name: "uniiverse_view", value: set.mode, url: baseURL! }, { name: "uniiverse_sidebar", value: w.sidebar, url: baseURL! }]);
      const starts: number[] = [];
      for (const path of set.pages) {
        await loaded(page, path);
        const nav = set.nav === "people-tabs" ? page.getByRole("navigation", { name: "Users & Permissions" }) : page.getByTestId(set.nav);
        await expect(nav).toBeVisible();
        const at = await rowEdges(nav);
        const where = `${set.nav} on ${path.replace(profile, "a profile")} at ${w.width} × ${w.height} (sidebar ${w.sidebar})`;
        expect(Math.abs(at.tab - at.pageLeft), `${where}: the first tab at ${at.tab}, the page's column at ${at.pageLeft}`).toBeLessThanOrEqual(1);
        if (set.ownBar) {
          // The bar's line and its pinned background still span the room beside the sidebar.
          expect(Math.abs(at.barLeft - at.roomLeft) + Math.abs(at.barRight - at.roomRight), `${where}: the bar spans ${at.barLeft} to ${at.barRight}, the room ${at.roomLeft} to ${at.roomRight}`).toBeLessThanOrEqual(1);
          // Team's name, at the row's end, ends where the page's column does.
          if (at.end !== null) expect(Math.abs(at.end - at.pageRight), `${where}: the team's name ends at ${at.end}, the page at ${at.pageRight}`).toBeLessThanOrEqual(1);
        }
        if (at.header) {
          // Team Overview's header (and lineup) keep their 84rem, centred in Team's 100rem column: the
          // tabs start at the column, the logo that inset further in (its approved design, not moved).
          const inset = { left: at.header.left - at.pageLeft, right: at.pageRight - at.header.right };
          expect(Math.abs(inset.left - inset.right), `${where}: the header ${Math.round(inset.left)}px inside the column on the left, ${Math.round(inset.right)}px on the right`).toBeLessThanOrEqual(1);
        }
        starts.push(at.tab);
      }
      expect(Math.max(...starts) - Math.min(...starts), `${set.nav} at ${w.width}: the row starts at ${starts.join(", ")} on its sections`).toBeLessThanOrEqual(1);
    }
  }
});

test("under a 1600px window the pages and the section tabs are as they always were, the sidebar open or folded", async ({ page, context, baseURL }) => {
  test.skip(width(page) < 1024, "desktop windows");
  // A 1920 laptop at 125% (1536 × 864) with the sidebar folded, where the room (1400px) is wider than
  // 80rem: Players and Matches stay 80rem, centred, the row of tabs spans the bar (it did not follow
  // them before 1600px either), and Team Overview's 100rem column fills the room.
  await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
  await page.setViewportSize({ width: 1536, height: 864 });
  for (const [path, wide] of [["/players", false], ["/matches", false], ["/team", true]] as const) {
    await loaded(page, path);
    const at = await rowEdges(page.getByTestId("team-tabs"));
    const room = at.roomRight - at.roomLeft;
    expect(Math.abs(at.rowLeft - at.roomLeft) + Math.abs(at.rowRight - at.roomRight), `${path}: the row spans the bar`).toBeLessThanOrEqual(1);
    expect(Math.round(at.pageRight - at.pageLeft), `${path}: the page's width`).toBe(wide ? Math.round(room) : 1280);
  }
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
  if (isTablet(page)) {
    // At a tablet's width a short window is a phone held sideways: the page's tabs give way to the
    // sections in the compact bar, which slides away while reading (two steps: the bar reads the
    // scroll once a frame, so a jump to the end and back in one step would read as no movement).
    await expect(tabs).toBeHidden();
    await expect(page.getByTestId("mobile-topbar").getByTestId("profile-chrome-tabs")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId("mobile-topbar")).toHaveAttribute("data-hidden", "false");
    await scrollTo(page, "end");
    await expect(page.getByTestId("mobile-topbar")).toHaveAttribute("data-hidden", "true");
    return;
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => (await rect(tabs)).top).toBeLessThan(barBottom);
});

/** The pinned row's compact controls (PageToolbar), drawn only while they show. */
const pageToolbar = (page: Page) => page.getByTestId("page-toolbar");

/** Scrolls by steps, as a reader does, so the observers see every place on the way. */
async function scrollTo(page: Page, y: number | "end") {
  await page.evaluate(async (y) => {
    const end = y === "end" ? document.documentElement.scrollHeight : y;
    const step = end > window.scrollY ? 240 : -240;
    for (let at = window.scrollY; step > 0 ? at < end : at > end; at += step) {
      window.scrollTo(0, at);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    window.scrollTo(0, end);
  }, y);
}

/** Where the page's filter bar ends in the page, and the pinned stack's foot (the pinned tabs' sticky offset and height). */
const barAndFoot = (page: Page, tabs: string) =>
  page.evaluate((tabs) => {
    const bar = document.querySelector("[data-filter-bar]")!.getBoundingClientRect();
    const nav = document.querySelector<HTMLElement>(`[data-testid=${tabs}]`)!;
    return { barBottom: bar.bottom + window.scrollY, foot: (parseFloat(getComputedStyle(nav).top) || 0) + nav.offsetHeight };
  }, tabs);

/** The list's first item against what is pinned over it: its top and the stack's foot (the tabs, or a table's own pinned headings under them). */
const landedAt = (page: Page, first: string, tabs: string, under?: string) =>
  page.evaluate(
    ({ first, tabs, under }) => {
      const item = [...document.querySelectorAll(first)].find((el) => el.getBoundingClientRect().height > 0)!.getBoundingClientRect();
      const foot = document.querySelector(under ?? `[data-testid=${tabs}]`)!.getBoundingClientRect().bottom;
      const end = document.documentElement.scrollHeight - window.innerHeight;
      // The room the page's scroll padding leaves under what is pinned (globals.css: the pinned
      // stack's heights and 0.5rem), where a list's start lands; more with larger text.
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) - foot;
      return { gap: Math.round(item.top - foot), atEnd: window.scrollY >= end - 1, pad: Math.round(pad) };
    },
    { first, tabs, under },
  );

test("tablet and desktop: the pinned row offers the page's controls exactly once the page's filter bar has gone up under it, at the row's own height", async ({ page }) => {
  test.skip(isPhone(page), "phones offer Filters in the top bar (mobile-nav.spec.ts)");
  const profile = await teammate(page);
  await page.goto(`${profile}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  const tabs = page.getByTestId("profile-tabs");
  const resting = await rect(tabs);
  const { barBottom, foot } = await barAndFoot(page, "profile-tabs");
  // The boundary, both ways: the filter bar 10px above the pinned stack's foot (the copies show),
  // then 10px below it (they go, though the row is still pinned). The tabs pin above both places.
  await scrollTo(page, Math.round(barBottom - foot + 10));
  await expect(tabs).toHaveAttribute("data-stuck", "");
  await expect(pageToolbar(page)).toBeVisible();
  await scrollTo(page, Math.round(barBottom - foot - 10));
  await expect(tabs).toHaveAttribute("data-stuck", "");
  await expect(pageToolbar(page)).toHaveCount(0);
  // Far down: Games | Encounters and Filters, in the row, which is as tall as at rest.
  await scrollTo(page, "end");
  await expect(tabs).toHaveAttribute("data-stuck", "");
  await expect(pageToolbar(page)).toBeVisible();
  expect(await pageToolbar(page).evaluate((el) => !!el.closest("[data-testid=profile-tabs]"))).toBe(true);
  await expect(page.getByTestId("toolbar-match-view-games")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("toolbar-match-view-encounters")).toBeVisible();
  await expect(page.getByTestId("toolbar-filters")).toBeVisible();
  expect((await rect(tabs)).height, "the pinned row keeps its height").toBe(resting.height);
  const inside = await tabs.evaluate((nav) => {
    const box = nav.getBoundingClientRect();
    return [...nav.querySelectorAll("[data-page-toolbar] :is(a, button, input)")].every((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 && r.right <= box.right + 0.5;
    });
  });
  expect(inside, "the controls fit in the row").toBe(true);
  // Back up at the toolbar: the copies go, so nothing hidden stays to be tabbed to.
  await scrollTo(page, 0);
  await expect(pageToolbar(page)).toHaveCount(0);
  await expect(page.locator("[data-page-toolbar-slot] :is(a, button, input)")).toHaveCount(0);
});

test("tablet and desktop: a control in the pinned row stays while it has the focus, and goes once the focus moves on", async ({ page }) => {
  test.skip(isPhone(page), "the pinned row is from md");
  const profile = await teammate(page);
  await page.goto(`${profile}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await scrollTo(page, "end");
  const filters = page.getByTestId("toolbar-filters");
  await expect(filters).toBeVisible();
  await filters.focus();
  // Back up at the page's own filters, the copy keeps the focus rather than dropping it on the page.
  await scrollTo(page, 0);
  await page.waitForTimeout(200);
  await expect(filters).toBeVisible();
  await expect(filters).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(pageToolbar(page)).toHaveCount(0);
  await expect(page.locator("[data-page-toolbar-slot] :is(a, button, input)")).toHaveCount(0);
});

test("tablet and desktop: in a short window nothing is pinned, so the row offers nothing", async ({ page }) => {
  test.skip(isPhone(page), "the pinned row is from md");
  const profile = await teammate(page);
  await page.setViewportSize({ width: width(page), height: 420 });
  await page.goto(`${profile}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await scrollTo(page, "end");
  if (isTablet(page)) {
    // At a tablet's width a short window is a phone held sideways: no row in the page to pin (the
    // sections ride in the compact bar), and nothing offered beside it.
    await expect(page.getByTestId("profile-tabs")).toBeHidden();
    await expect(page.getByTestId("mobile-topbar").getByTestId("profile-chrome-tabs")).toBeAttached();
  } else {
    // Not sticky at all in a short window, so no observer runs and nothing is waited for.
    expect(await page.getByTestId("profile-tabs").evaluate((el) => getComputedStyle(el).position)).not.toBe("sticky");
    await expect(page.getByTestId("profile-tabs")).not.toHaveAttribute("data-stuck", /.*/);
  }
  await expect(pageToolbar(page)).toHaveCount(0);
});

test("tablet and desktop: from the end of Match History the pinned row's Filters opens the filter sheet in its sheet form, the row in the page keeping its height", async ({ page }) => {
  test.skip(isPhone(page), "phones offer Filters in the top bar (mobile-nav.spec.ts)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = await teammate(page);
  await page.goto(`${profile}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  const header = page.getByTestId("match-history").getByTestId("section-toolbar");
  const before = await rect(header);
  await scrollTo(page, "end");
  const filters = page.getByTestId("toolbar-filters");
  await expect(filters).toBeVisible();
  const scrolled = await page.evaluate(() => window.scrollY);
  await filters.click();
  const sheet = page.getByTestId("filter-sheet");
  await expect(sheet).toBeVisible();
  // The sheet's form at this width too: Refine's fields in it, in one column, the rest behind More filters.
  await expect(sheet.getByTestId("refine-filters")).toHaveCount(0);
  await expect(sheet.getByTestId("refine-panel")).toBeVisible();
  const column = await sheet.getByTestId("history-refine").evaluate((el) => getComputedStyle(el).display);
  expect(column, "Refine's fields in one column").toBe("flex");
  await expect(sheet.getByTestId("refine-more")).toBeVisible();
  // The page behind does not move, and its toolbar keeps its size while its fields are in the sheet.
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  expect((await rect(header)).height).toBe(before.height);
  await sheet.getByTestId("filter-sheet-done").click();
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
});

test("tablet and desktop: closed with Escape or Done, the sheet hands the focus back to the pinned row's Filters, still drawn, even when its change emptied the list", async ({ page }) => {
  test.skip(isPhone(page), "phones: mobile-nav.spec.ts");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = await teammate(page);
  await page.goto(`${profile}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await scrollTo(page, "end");
  const filters = page.getByTestId("toolbar-filters");
  const sheet = page.getByTestId("filter-sheet");
  await filters.click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(filters).toBeFocused();
  // Again, and a change that leaves no game: the page shortens behind the sheet (its filters back in
  // view), yet the button that opened the sheet is still there to take the focus back.
  await filters.click();
  await sheet.getByTestId("refine-more").click();
  await sheet.getByTestId("refine-to").fill("2001-01-01");
  await expect(page).toHaveURL(/to=2001-01-01/);
  await expect(page.getByTestId("match-empty")).toBeVisible();
  await sheet.getByTestId("filter-sheet-done").click();
  await expect(sheet).toHaveCount(0);
  await expect(filters).toBeVisible();
  await expect(filters).toBeFocused();
  // Once the focus moves on, the copy goes: its toolbar is in view.
  await page.keyboard.press("Tab");
  await expect(pageToolbar(page)).toHaveCount(0);
});

test("tablet and desktop: a sheet closed after only a look moves nothing once the reader goes on: a later change in the page's own filters keeps the place", async ({ page }) => {
  test.skip(isPhone(page), "the pinned row is from md");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = await teammate(page);
  await page.goto(`${profile}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await scrollTo(page, "end");
  await page.getByTestId("toolbar-filters").click();
  const sheet = page.getByTestId("filter-sheet");
  await expect(sheet).toBeVisible();
  // A look only: More filters opened, nothing chosen, and closed.
  await sheet.getByTestId("refine-more").click();
  await expect(sheet.getByTestId("refine-more")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  // The reader goes back up with the wheel (scrolling by script sends no input of the reader's).
  await page.mouse.move(width(page) / 2, 300);
  await page.mouse.wheel(0, -100_000);
  await expect.poll(() => page.evaluate(() => window.scrollY), { message: "the wheel took the page up" }).toBeLessThan(400);
  await scrollTo(page, 0);
  // The page's own Game mode, at the top: the new list arrives and the page stays at its top.
  await page.locator("#overview-mode").selectOption("solo");
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page.getByTestId("match-scope")).toContainText("Ranked Solo/Duo");
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("tablet and desktop: closing the sheet after a change brings the list's first game under the pinned tabs", async ({ page }) => {
  test.skip(isPhone(page), "phones: mobile-nav.spec.ts");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = await teammate(page);
  await page.goto(`${profile}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await scrollTo(page, "end");
  await page.getByTestId("toolbar-filters").click();
  const sheet = page.getByTestId("filter-sheet");
  // Wins only: about half the games (Refine's fields, in the sheet at this width too).
  await sheet.getByTestId("refine-result").getByRole("radio", { name: "Wins" }).click();
  await expect(page).toHaveURL(/result=win/);
  await sheet.getByTestId("filter-sheet-done").click();
  await expect(sheet).toHaveCount(0);
  // The first game just under the pinned tabs, or as near as the page's end allows.
  await expect.poll(async () => { const at = await landedAt(page, "[data-testid=match-card]", "profile-tabs"); return at.gap >= 0 && (at.gap <= 12 || at.atEnd); }, { message: "the first game just under the pinned tabs" }).toBe(true);
});

test("desktop: from the pinned row of every page that offers Filters, a change brings the list's first item under what is pinned", async ({ page }) => {
  test.skip(width(page) < 1024, "one desktop window per page below");
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = await teammate(page);
  // Short enough for each list to scroll its filters away, tall enough for the tabs to pin; the demo's
  // nine players and eight champions need a larger text size for that, and All Champions a window wide
  // enough at that size for its column headings (from a 44rem table), which pin under the tabs.
  const CASES: Array<{ what: string; path: string; tabs: string; first: string; under?: string; text?: number; viewport?: { width: number; height: number }; change: (sheet: Locator) => Promise<unknown>; url?: RegExp }> = [
    // Every player met against (a list long enough to land in), under its pinned column names.
    { what: "Encounters' first player met, under its pinned column names", path: `${profile}/matches?view=encounters&rel=against&min=1&limit=500`, tabs: "profile-tabs", first: "[data-testid=encounter-row]", under: "[data-testid=encounter-heads]", change: (s) => s.getByLabel("Game mode").selectOption("solo"), url: /mode=solo/ },
    { what: "Team Matches' first game", path: "/matches", tabs: "team-tabs", first: "[data-testid=together-card]", change: (s) => s.getByTestId("together-min").selectOption("3"), url: /min=3/ },
    { what: "the Overview's dashboard", path: profile, tabs: "profile-tabs", first: "[data-testid=overview-dashboard]", change: (s) => s.getByLabel("Game mode").selectOption("solo"), url: /mode=solo/ },
    { what: "All Champions' first champion, under its pinned column headings", path: `${profile}/champions`, tabs: "profile-tabs", first: "[data-testid=top-champion]", under: "[data-testid=all-champions-header]", text: 175, viewport: { width: 1920, height: 560 }, change: (s) => s.getByLabel("Game mode").selectOption("solo"), url: /mode=solo/ },
    { what: "Players' first player", path: "/players", tabs: "team-tabs", first: "[data-testid=player-card]", text: 175, change: (s) => s.getByTestId("role-filter-MID").click() },
  ];
  for (const c of CASES) {
    await page.setViewportSize(c.viewport ?? { width: 1440, height: 560 });
    await page.goto(c.path);
    await expect(page.locator("main h1, main h2").first()).toBeVisible();
    if (c.text) await page.addStyleTag({ content: `html { font-size: ${c.text}% !important; }` });
    await page.waitForLoadState("networkidle");
    if (c.under) await expect(page.locator(c.under), `${c.what}: the column headings show`).toBeVisible();
    await scrollTo(page, "end");
    await page.getByTestId("toolbar-filters").click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet).toBeVisible();
    await c.change(sheet);
    if (c.url) await expect(page).toHaveURL(c.url);
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    // Its first item just under what is pinned: at the page's scroll padding under the tabs, or right
    // under All Champions' pinned column headings, which would cover it there; or as near as the
    // page's end allows.
    await expect.poll(async () => { const at = await landedAt(page, c.first, c.tabs, c.under); return at.gap >= -1 && (at.gap <= Math.max(at.pad, 0) + 4 || at.atEnd); }, { message: c.what }).toBe(true);
  }
});

test("desktop: the compact search narrows the list it copies, in the row's own height (Players and All Champions)", async ({ page }) => {
  test.skip(width(page) < 1024, "one desktop window");
  const profile = await teammate(page);
  await page.setViewportSize({ width: 1440, height: 560 });
  for (const [path, tabs, search, item, typed] of [
    ["/players", "team-tabs", "toolbar-players-search", "[data-testid=player-card]", "mid"],
    [`${profile}/champions`, "profile-tabs", "toolbar-all-champions-search", "[data-testid=top-champion]", "top"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator("main h1, main h2").first()).toBeVisible();
    // A larger text size, so the demo's short lists scroll their toolbars away under the tabs.
    await page.addStyleTag({ content: "html { font-size: 175% !important; }" });
    await page.waitForLoadState("networkidle");
    const row = page.getByTestId(tabs);
    const resting = await rect(row);
    const before = await page.locator(item).count();
    await scrollTo(page, "end");
    const field = page.getByTestId(search);
    await expect(field).toBeVisible();
    expect((await rect(row)).height, `${path}: the pinned row keeps its height`).toBe(resting.height);
    await field.fill(typed);
    await expect.poll(() => page.locator(item).count(), { message: `${path}: the list narrows` }).toBeLessThan(before);
    await expect(field).toBeFocused();
    await field.fill("");
  }
});

test("desktop: Team Matches' Bookmarked from the pinned row replaces the entry, is marked, and keeps the place", async ({ page }) => {
  test.skip(width(page) < 1024, "one desktop window");
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/matches");
  await expect(page.getByTestId("played-together")).toBeVisible();
  // A larger text size, so that the page is still longer than the window with only the bookmarked
  // games listed (the demo has none): one sent to its top would read 0.
  await page.addStyleTag({ content: "html { font-size: 175% !important; }" });
  await page.waitForLoadState("networkidle");
  await scrollTo(page, "end");
  const saved = page.getByTestId("toolbar-together-saved");
  await expect(saved).toBeVisible();
  const entries = await page.evaluate(() => history.length);
  await saved.click();
  await expect(page).toHaveURL(/saved=1/);
  await expect(page.getByTestId("together-saved")).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => history.length), "a filter replaces the entry").toBe(entries);
  // Not sent to the page's top: the place is kept, as near as the shorter list allows (its end).
  const at = await page.evaluate(() => ({ y: window.scrollY, end: document.documentElement.scrollHeight - window.innerHeight }));
  expect(at.end, "the shorter page still scrolls").toBeGreaterThan(0);
  expect(at.y, "the page kept its place").toBeGreaterThanOrEqual(at.end - 1);
});

test("desktop: after a look in the sheet (Team Matches' Played with opened and closed, then Done), Bookmarked from the pinned row still keeps the place", async ({ page }) => {
  test.skip(width(page) < 1024, "one desktop window");
  await page.emulateMedia({ reducedMotion: "reduce" });
  // As in the test above, at 175% text, and a window short enough (still tall enough to pin) for the
  // page with only the bookmarked games listed (none in the demo) to end well below where the list's
  // start would land: a landing reads less than the page's end.
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.goto("/matches");
  await expect(page.getByTestId("played-together")).toBeVisible();
  await page.addStyleTag({ content: "html { font-size: 175% !important; }" });
  await page.waitForLoadState("networkidle");
  await scrollTo(page, "end");
  await page.getByTestId("toolbar-filters").click();
  const sheet = page.getByTestId("together-filters-sheet");
  await expect(sheet).toBeVisible();
  const picker = sheet.getByTestId("together-with-button");
  await picker.click();
  await expect(picker).toHaveAttribute("aria-expanded", "true");
  await picker.click();
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toHaveCount(0);
  // The press on Bookmarked is the reader moving on: its change keeps the place, not the list's start.
  await page.getByTestId("toolbar-together-saved").click();
  await expect(page).toHaveURL(/saved=1/);
  await expect(page.getByTestId("together-saved")).toHaveAttribute("aria-current", "page");
  await page.waitForTimeout(500);
  const at = await page.evaluate(() => ({ y: window.scrollY, end: document.documentElement.scrollHeight - window.innerHeight }));
  expect(at.end, "the shorter page still scrolls").toBeGreaterThan(0);
  expect(at.y, "the page kept its place").toBeGreaterThanOrEqual(at.end - 1);
});

test("desktop: the compact search's Clear lets its copy go once the page's own search is back in view, and leaves no focus in the row", async ({ page }) => {
  test.skip(width(page) < 1024, "one desktop window");
  await page.setViewportSize({ width: 1440, height: 560 });
  await page.goto("/players");
  await expect(page.locator("main h1, main h2").first()).toBeVisible();
  // A larger text size, so the demo's short list scrolls its toolbar away under the tabs.
  await page.addStyleTag({ content: "html { font-size: 175% !important; }" });
  await page.waitForLoadState("networkidle");
  await scrollTo(page, "end");
  const field = page.getByTestId("toolbar-players-search");
  await expect(field).toBeVisible();
  // Narrowed to one player, the page is short again and its own search back in view: the copy stays
  // while it has the focus. (By the whole name: "mid" also matched members other tests add, and one
  // with a long name kept the page too tall at 175% for its search to come back, on CI.)
  await field.fill("Demo Mid");
  await expect.poll(async () => (await rect(page.getByTestId("players-search"))).top - (await rect(page.getByTestId("team-tabs"))).bottom, { message: "the page's own search back in view, under the tabs" }).toBeGreaterThanOrEqual(0);
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  // Its Clear goes as it clears (the field is empty), taking the focus with it: the copy goes too.
  await pageToolbar(page).getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByTestId("players-search")).toHaveValue("");
  await expect(pageToolbar(page)).toHaveCount(0);
  expect(await page.evaluate(() => !!document.activeElement?.closest("[data-page-toolbar-slot]")), "no focus left in the row").toBe(false);
});

/** Team's pinned stack: the section tabs' height, the bar's (its hairline included), what --tabs-top assumes, and the compact controls at the bar's end relative to its edges. */
const teamStack = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;height:var(--tabs-top)";
    document.body.append(probe);
    const tabsTop = probe.getBoundingClientRect().height;
    probe.remove();
    const nav = document.querySelector("[data-testid=team-tabs]")!;
    const bar = nav.getBoundingClientRect();
    const controls = [...nav.querySelectorAll<HTMLElement>("[data-page-toolbar-slot] :is(a, button, input)")]
      .filter((el) => el.getBoundingClientRect().height > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.dataset.testid ?? el.getAttribute("aria-label") ?? el.tagName, top: r.top - bar.top, bottom: bar.bottom - r.bottom, height: r.height };
      });
    return { coarse: matchMedia("(pointer: coarse)").matches, rem: parseFloat(getComputedStyle(document.documentElement).fontSize), tabsTop, bar: bar.height, tab: nav.querySelector("li a")!.getBoundingClientRect().height, stuck: nav.hasAttribute("data-stuck"), controls };
  });

test("touch screens from 1024px (an iPad held sideways, a touch laptop): Team's section tabs are 44px, the bar the height the pinned stack assumes, its compact controls inside it, and a change from it lands the list under it", async ({ page }, info) => {
  test.skip(info.project.name !== "tablet", "a touch screen: the tablet project, made 1180 and 1366 wide");
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  // An iPad held sideways and a touch laptop: windows short enough for the demo's Team Matches (six
  // games in member rows) to scroll its filters away under the tabs.
  for (const viewport of [{ width: 1180, height: 820 }, { width: 1366, height: 768 }]) {
    const at = `${viewport.width} × ${viewport.height}`;
    await page.setViewportSize(viewport);
    // Team Matches: a list long enough to pin the tabs and scroll its filters away.
    await page.goto("/matches");
    await expect(page.getByTestId("played-together")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const rest = await teamStack(page);
    expect(rest.coarse, `${at}: a touch screen`).toBe(true);
    expect([rest.tab, rest.bar], `${at}: at rest, the tabs and the bar 44px, as --tabs-top assumes`).toEqual([44, rest.tabsTop]);
    expect(rest.tabsTop, `${at}: --tabs-top`).toBe(44);
    await scrollTo(page, "end");
    await expect(page.getByTestId("toolbar-filters")).toBeVisible();
    const pinned = await teamStack(page);
    expect(pinned.stuck, `${at}: pinned`).toBe(true);
    expect([pinned.tab, pinned.bar], `${at}: pinned, the tabs and the bar 44px`).toEqual([44, pinned.tabsTop]);
    // Filters and Bookmarked: 38px buttons, centred in the bar, nothing past its edges.
    expect(pinned.controls.length, `${at}: the row's controls`).toBe(2);
    for (const c of pinned.controls) expect(c.top >= 0 && c.bottom >= 0 && Math.abs(c.top - c.bottom) <= 0.5, `${at}: ${c.name} inside the bar and centred (${c.top}px above, ${c.bottom}px below)`).toBe(true);
    // A change from the pinned row: the first game lands under the bar, at the page's scroll padding
    // (8px under it), never under the bar; or as near as the page's end allows.
    await page.getByTestId("toolbar-filters").click();
    const sheet = page.getByTestId("together-filters-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByTestId("together-min").selectOption("3");
    await expect(page).toHaveURL(/min=3/);
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toHaveCount(0);
    await expect.poll(async () => { const l = await landedAt(page, "[data-testid=together-card]", "team-tabs"); return l.gap >= 0 && (Math.abs(l.gap - l.pad) <= 1 || l.atEnd); }, { message: `${at}: the first game just under the bar` }).toBe(true);
    // Players at 175% text (so its short demo list scrolls its toolbar away): the compact search is
    // the bar's height, 2.75rem, exactly inside it, as the tabs are.
    await page.goto("/players");
    await expect(page.locator("main h1, main h2").first()).toBeVisible();
    await page.addStyleTag({ content: "html { font-size: 175% !important; }" });
    await page.waitForLoadState("networkidle");
    await scrollTo(page, "end");
    await expect(page.getByTestId("toolbar-players-search")).toBeVisible();
    const large = await teamStack(page);
    expect([large.tab, large.bar], `${at}, 175% text: the tabs and the bar 2.75rem, as --tabs-top assumes`).toEqual([2.75 * large.rem, large.tabsTop]);
    const search = large.controls.find((c) => c.name === "toolbar-players-search")!;
    expect(search.height, `${at}, 175% text: the search 2.75rem`).toBe(2.75 * large.rem);
    for (const c of large.controls) expect(c.top >= 0 && c.bottom >= 0, `${at}, 175% text: ${c.name} inside the bar (${c.top}px above, ${c.bottom}px below)`).toBe(true);
  }
});

test("desktop: with a mouse Team's section tabs stay 40px, level with the sidebar's brand row, under the 2.75rem the pinned stack keeps for them", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a mouse at 1440");
  // Short enough for the demo's Team Matches to scroll its filters away under the tabs.
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/matches");
  await expect(page.getByTestId("played-together")).toBeVisible();
  const rest = await teamStack(page);
  expect(rest.coarse).toBe(false);
  expect([rest.tab, rest.bar, rest.tabsTop]).toEqual([40, 40, 44]);
  await scrollTo(page, "end");
  await expect(page.getByTestId("toolbar-filters")).toBeVisible();
  const pinned = await teamStack(page);
  expect([pinned.stuck, pinned.tab, pinned.bar]).toEqual([true, 40, 40]);
  for (const c of pinned.controls) expect(c.top >= 0 && c.bottom >= 0 && Math.abs(c.top - c.bottom) <= 0.5, `${c.name} inside the bar and centred (${c.top}px above, ${c.bottom}px below)`).toBe(true);
});

/** At the list's end, a short window's top bar back in view (it steps aside while reading down). */
async function endWithTheBar(page: Page) {
  await scrollTo(page, "end");
  await page.evaluate(() => window.scrollBy(0, -160));
  await expect(page.getByTestId("topbar-filters")).toBeInViewport();
}

test("Encounters in its own order and a game mode: from md the pinned row's Filters counts, names and resets only what the bar narrows (the order is its list toolbar's there); a phone's top bar and sheet count, name and reset both", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const phone = info.project.name === "phone";
  const profile = await teammate(page);
  // Short enough for the list to scroll its filters away, tall enough to pin; every player met
  // against (a long list), in the list's own order and minimum (Most recent, any number of games).
  if (!phone) await page.setViewportSize({ width: width(page), height: 560 });
  await page.goto(`${profile}/matches?view=encounters&rel=against&min=1&limit=500&sort=recent&mode=solo`);
  await expect(page.getByTestId("encounter-row").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await scrollTo(page, "end");
  const filters = page.getByTestId(phone ? "topbar-filters" : "toolbar-filters");
  await expect(filters).toBeVisible();
  const sheet = page.getByTestId("filter-sheet");
  if (phone) {
    // The order and the minimum are the sheet's on a phone: counted with the mode, named, and put back by its Reset.
    await expect(filters.locator("span.rounded-full:visible")).toHaveText("3");
    await expect(filters).toHaveAccessibleName(/Most recent/);
    await filters.click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("encounter-sort-choices")).toBeVisible();
    await sheet.getByTestId("reset-filters").click();
    await expect(page).not.toHaveURL(/mode=solo/);
    await expect(page).not.toHaveURL(/sort=recent/);
    await expect(page).not.toHaveURL(/min=1/);
  } else {
    // The game mode only: its count and name, a sheet that neither names nor holds the order and the
    // minimum, and whose Reset leaves them as they are.
    await expect(filters.locator("span.rounded-full")).toHaveText("1");
    await expect(filters).not.toHaveAccessibleName(/Most recent|Any number of games/);
    await filters.click();
    await expect(sheet).toBeVisible();
    await expect(sheet).not.toHaveAccessibleDescription(/Most recent|Any number of games/);
    await expect(sheet.getByTestId("encounter-sort-choices")).toBeHidden();
    await sheet.getByTestId("reset-filters").click();
    await expect(page).not.toHaveURL(/mode=solo/);
    await expect(page).toHaveURL(/sort=recent/);
    await expect(page).toHaveURL(/min=1/);
  }
});

test("phone held sideways (852 × 393): the top bar's Filters counts and names what Encounters' bar narrows at that width, not its order", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "a phone turned to a tablet's width");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = await teammate(page);
  await page.setViewportSize({ width: 852, height: 393 });
  const filters = page.getByTestId("topbar-filters");
  await page.goto(`${profile}/matches?view=encounters&sort=recent`);
  await expect(page.getByTestId("encounter-row").first()).toBeVisible();
  await endWithTheBar(page);
  await expect(filters.locator("span.rounded-full:visible")).toHaveCount(0);
  await expect(filters).not.toHaveAccessibleName(/Most recent/);
  await page.goto(`${profile}/matches?view=encounters&sort=recent&mode=solo`);
  await expect(page.getByTestId("encounter-row").first()).toBeVisible();
  await endWithTheBar(page);
  await expect(filters.locator("span.rounded-full:visible")).toHaveText("1");
  await expect(filters).not.toHaveAccessibleName(/Most recent/);
});

test("the open sheet follows the phone turning across 768px: Encounters' order leaves it held sideways, and is back in it, and in its Reset, held upright", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "a phone turned with its sheet open");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = await teammate(page);
  const sheet = page.getByTestId("filter-sheet");
  // Upright, then sideways: the order goes from the sheet, and so does a Reset that would have put it back.
  await page.goto(`${profile}/matches?view=encounters&sort=recent`);
  await expect(page.getByTestId("encounter-row").first()).toBeVisible();
  await page.getByTestId("filter-toggle").click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("encounter-sort-choices")).toBeVisible();
  await expect(sheet.getByTestId("reset-filters")).toBeVisible();
  await page.setViewportSize({ width: 852, height: 393 });
  await expect(sheet.getByTestId("encounter-sort-choices")).toBeHidden();
  await expect(sheet.getByTestId("reset-filters")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  // Sideways, then upright, with a game mode too: the order is back in the sheet, and its Reset puts both back.
  await page.goto(`${profile}/matches?view=encounters&sort=recent&mode=solo`);
  await expect(page.getByTestId("encounter-row").first()).toBeVisible();
  await endWithTheBar(page);
  await page.getByTestId("topbar-filters").click();
  await expect(sheet).toBeVisible();
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(sheet.getByTestId("encounter-sort-choices")).toBeVisible();
  await sheet.getByTestId("reset-filters").click();
  await expect(page).not.toHaveURL(/mode=solo/);
  await expect(page).not.toHaveURL(/sort=recent/);
});

test("tablet and desktop: Records → Recent form from the pinned row", async ({ page }) => {
  test.skip(isPhone(page), "the pinned row is from md");
  await page.goto("/leaderboards?view=records");
  await expect(page.getByTestId("records")).toBeVisible();
  await scrollTo(page, "end");
  const form = page.getByTestId("toolbar-leaderboards-tab-form");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("toolbar-leaderboards-tab-records")).toHaveAttribute("aria-current", "page");
  await form.click();
  await expect(page).not.toHaveURL(/view=records/);
  await expect(page.getByTestId("leaderboards-tab-form")).toHaveAttribute("aria-current", "page");
});

test("tablet: the destinations are in the top bar, one tap each, and the avatar menu keeps the focus as a menu does and gives it back to the avatar", async ({ page }) => {
  test.skip(!isTablet(page), "a tablet's top bar");
  await page.goto("/players");
  await expect(page.getByTestId("players-directory")).toBeVisible();
  // There is no drawer: each destination is one tap from the bar, Team marked on its sections.
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link")).toHaveText(["My Profile", "Team", "Resources"]);
  await expect(nav.getByRole("link", { name: "Team" })).toHaveAttribute("aria-current", "page");
  const avatar = page.getByTestId("mobile-topbar").getByTestId("account-menu-button");
  await avatar.click();
  const menu = page.getByTestId("account-menu");
  await expect(menu).toBeVisible();
  // The focus starts on its first item; ArrowDown moves to the next item by name, round from the last
  // to the first; ArrowUp from the first goes to the last; Home and End to the first and the last.
  const items = menu.getByRole("menuitem");
  await expect(items).toHaveText(["Settings", "Install App", "Switch to Admin Mode", "Details"]);
  const n = await items.count();
  await expect(items.first()).toBeFocused();
  for (let i = 1; i <= n; i++) {
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(i % n), `ArrowDown ${i}`).toBeFocused();
  }
  await page.keyboard.press("ArrowUp");
  await expect(items.nth(n - 1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("End");
  // The last, Riot's notice's "Details", named in full and ringed as every control the keyboard reaches.
  const details = items.nth(n - 1);
  await expect(details).toBeFocused();
  await expect(details).toHaveAccessibleName("Details: Riot Games notice");
  const accent = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-accent)";
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
  expect(await details.evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineWidth, getComputedStyle(el).outlineColor])).toEqual(["solid", "2px", accent]);
  // A word in the notes, a finger-sized target on a touch screen all the same (touch-target).
  expect(await details.evaluate((el) => parseFloat(getComputedStyle(el, "::after").height))).toBe(44);
  // The notes are a group named by their own words, as the menu pattern allows.
  await expect(menu.getByRole("group")).toHaveAccessibleName(/^Patch .+ Not endorsed by Riot Games\.$/);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(avatar).toBeFocused();
  // Tab closes it too.
  await avatar.click();
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu).toHaveCount(0);
  // A click outside closes it, and a page scrolled far down stays where it was. (Players fits one
  // tablet screen: a teammate's Match History, ten games a page, is the long page here.) A menu is
  // not a window: a click outside also reaches what it lands on, so it lands on the bar's empty
  // stretch between the destinations and the avatar, not on a game.
  await page.goto(`${await teammate(page)}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => window.scrollTo(0, 800));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const scrolled = await page.evaluate(() => window.scrollY);
  await avatar.click();
  await expect(menu).toBeVisible();
  const empty = await page.evaluate(() => {
    const nav = document.querySelector("[data-testid=topbar-destinations] ul")!.getBoundingClientRect();
    const end = document.querySelector("[data-testid=mobile-topbar] [data-testid=account-menu-button]")!.getBoundingClientRect();
    return { x: (nav.right + end.left) / 2, y: (end.top + end.bottom) / 2 };
  });
  await page.mouse.click(empty.x, empty.y);
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  // Left open while the browser's Back changes the page (within the app, so the menu's state
  // survives the change), it is gone, and Forward does not bring it back unasked.
  await page.goto("/team");
  await page.getByTestId("team-tab-players").click();
  await expect(page).toHaveURL(/\/players$/);
  await expect(page.getByTestId("players-directory")).toBeVisible();
  await avatar.click();
  await expect(menu).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
  await expect(menu).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/\/players$/);
  await expect(page.getByTestId("players-directory")).toBeVisible();
  await expect(menu).toHaveCount(0);
});

test("tablet, installed as an app: Back appears on a teammate's profile; in a browser the browser's own Back is the way back, the destinations beside it", async ({ page }) => {
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
  // The destinations are still there beside it, Team marked (a teammate's profile is under it).
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Team" })).toHaveAttribute("aria-current", "page");
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
