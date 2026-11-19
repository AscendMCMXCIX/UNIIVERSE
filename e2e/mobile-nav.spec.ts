import { expect, test, type Page } from "./test";
import { memberContext, setBaseAccess } from "./member-account";

/*
  The phone frame (docs/MOBILE.md): five destinations in the bottom tab bar, a top bar that says where
  you are (the team's mark, or Back named after where it leads, and the page's title once its heading
  has scrolled away), a profile's sections under it, the account screen behind the avatar (which
  answers a tap made before the page's code has run), filters in a sheet with chips for what is
  narrowed, and a game opened as a whole screen that Back closes. Phones only, except the tests
  tagged @tablet (a tablet's top bar and its avatar menu); in-memory demo roster.
*/

test.beforeEach(async ({ context, baseURL }, info) => {
  const frame = info.tags.includes("@tablet") ? "tablet" : "phone";
  test.skip(info.project.name !== frame, `the ${frame} frame`);
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const tabBar = (page: Page) => page.getByTestId("phone-tabbar");

/**
 * Holds the page's JavaScript back until released: the server's HTML and styles arrive and are
 * drawn, and nothing of the app runs (a slow network, the first seconds of a cold start).
 */
async function holdScripts(page: Page): Promise<{ release: () => void }> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, async (route) => {
    await held;
    await route.continue().catch(() => undefined);
  });
  return { release };
}

/** Counts each dialog's openings (showModal), by test id, from the page's first script on. */
const COUNT_OPENINGS = () => {
  const opened: Record<string, number> = {};
  (window as unknown as { __opened: Record<string, number> }).__opened = opened;
  const show = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    const id = this.dataset.testid ?? "?";
    opened[id] = (opened[id] ?? 0) + 1;
    return show.call(this);
  };
};
const openings = (page: Page) => page.evaluate(() => (window as unknown as { __opened: Record<string, number> }).__opened);

async function idOf(page: Page, role: "TOP" | "MID") {
  if (!page.url().endsWith("/team")) await page.goto("/team");
  return (await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id"))!;
}

test("the tab bar holds Team, Players, Leaderboards, Matches and Profile, one tap each, and marks where you are", async ({ page }) => {
  await page.goto("/team");
  await expect(tabBar(page).getByRole("link")).toHaveText(["Team", "Players", "Leaderboards", "Matches", "Profile"]);
  // Team's sections are the tab bar itself: no tab strip repeats them in the page.
  await expect(page.getByTestId("team-tabs")).toBeHidden();
  for (const [key, path] of [
    ["players", "/players"],
    ["leaderboards", "/leaderboards"],
    ["matches", "/matches"],
    ["overview", "/overview"],
    ["team", "/team"],
  ] as const) {
    await tabBar(page).getByTestId(`tab-${key}`).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(tabBar(page).getByTestId(`tab-${key}`)).toHaveAttribute("aria-current", "page");
    await expect(tabBar(page).locator("[aria-current=page]")).toHaveCount(1);
    // A destination's own page has no Back: the team's mark instead.
    await expect(page.getByTestId("mobile-back")).toHaveCount(0);
    await expect(page.getByTestId("mobile-brand")).toBeVisible();
  }
  // Every tab is a 44px target or larger, and the longest label stays whole.
  for (const box of await tabBar(page).getByRole("link").evaluateAll((links) => links.map((l) => l.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  const label = tabBar(page).getByTestId("tab-leaderboards").locator("span").last();
  expect(await label.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
});

test("an account without Leaderboards has Matchup Intel as its fifth tab, shown as Intel: on a 320px phone at 100% text every label shows, and its whole name is read out", async ({ page, browser }) => {
  // A member with the built-in Restricted Player level: no teammates' statistics, so no Leaderboards,
  // and Matchup Intel takes the fifth place (PHONE_TABS). In full its label is as long as
  // Leaderboards', and such a five lost every label on a 320px phone (TAB_FIT, 19 Nov 2026).
  const member = await memberContext(browser, page, { width: 320, height: 568 }, { base: "Restricted" });
  await setBaseAccess(page, member.username, "Restricted Player");
  const phone = member.page;
  await phone.goto("/team");
  const bar = tabBar(phone);
  await expect(bar.getByRole("link")).toHaveText(["Team", "Players", "Matches", "Profile", "Matchup Intel"]);
  const intel = bar.getByRole("link", { name: "Matchup Intel" });
  await expect(intel).toHaveAccessibleName("Matchup Intel");
  const fit = await bar.evaluate((nav) => ({
    width: nav.getBoundingClientRect().width,
    labels: [...nav.querySelectorAll("a")].map((a) => {
      const label = a.querySelector(":scope > span:last-child")!;
      // What shows: the label's text less the words read out only.
      const quiet = [...label.querySelectorAll(".sr-only")].map((s) => s.textContent ?? "").join("");
      return { text: (label.textContent ?? "").slice(quiet.length), shown: label.getBoundingClientRect().width > 1, whole: label.scrollWidth <= label.clientWidth + 1 };
    }),
    right: Math.max(...[...nav.querySelectorAll("li")].map((li) => li.getBoundingClientRect().right)),
    page: document.documentElement.scrollWidth,
  }));
  expect(fit.width).toBe(320);
  expect(fit.labels.map((l) => l.text)).toEqual(["Team", "Players", "Matches", "Profile", "Intel"]);
  expect(fit.labels.filter((l) => !l.shown || !l.whole), "every label shown and whole").toEqual([]);
  expect(fit.right, "the tabs within the phone").toBeLessThanOrEqual(320);
  expect(fit.page, "the page within the phone").toBeLessThanOrEqual(320);
  // Its own page: its tab is current, and there is no Back (a destination's own page).
  await intel.click();
  await expect(phone).toHaveURL(/\/resources\/matchups$/);
  await expect(intel).toHaveAttribute("aria-current", "page");
  await expect(phone.getByTestId("mobile-back")).toHaveCount(0);
  // The account screen holds the rest, Resources (it has no tab here) and Settings: Matchup Intel is not repeated there.
  await phone.getByTestId("account-sheet-button").click();
  const screen = phone.getByTestId("account-sheet");
  await expect(screen.getByRole("navigation", { name: "More pages and your account" }).getByRole("link")).toHaveText(["Resources", "Settings"]);
  await phone.keyboard.press("Escape");
  await expect(screen).toHaveCount(0);
  // Held sideways the same five ride in the top bar, Intel too, every label shown where the bar is 38rem or wider.
  await phone.setViewportSize({ width: 844, height: 390 });
  const sideways = phone.getByTestId("topbar-tabs");
  await expect(sideways.getByRole("link")).toHaveText(["Team", "Players", "Matches", "Profile", "Matchup Intel"]);
  const row = await sideways.evaluate((nav) => ({
    shown: [...nav.querySelectorAll("a")].map((a) => a.querySelector(":scope > span > span:last-child")!.getBoundingClientRect().width > 1),
    scrolls: nav.querySelector("ul")!.scrollWidth > nav.querySelector("ul")!.clientWidth + 1,
  }));
  expect(row).toEqual({ shown: [true, true, true, true, true], scrolls: false });
  await member.context.close();
});

test("Back from a teammate's profile returns to where you came from, named after it; opened directly, it leads to Players", async ({ page }) => {
  await page.goto("/players");
  await page.getByTestId("players-directory").locator("a[data-testid=player-card][data-player-name='Demo Mid']").click();
  await expect(page).toHaveURL(/\/players\/[^/]+$/);
  // A teammate's profile belongs to Players.
  await expect(tabBar(page).getByTestId("tab-players")).toHaveAttribute("aria-current", "page");
  const back = page.getByTestId("mobile-back");
  await expect(back).toContainText("Players");
  await back.click();
  await expect(page).toHaveURL(/\/players$/);

  // From Leaderboards, Back is named after it (its heading, "Leaderboards", as Players' is "Players").
  await page.goto("/leaderboards");
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  await page.getByTestId("form-row").first().click();
  await expect(page).toHaveURL(/\/players\/[^/]+$/);
  await expect(back).toHaveAccessibleName(/^Leaderboards\b/);
  await expect(back).toContainText("Leaderboards");
  await back.click();
  await expect(page).toHaveURL(/\/leaderboards$/);

  // Opened directly (no page of the app before it): Back leads to Players.
  await page.goto(`/players/${await idOf(page, "TOP")}`);
  await expect(back).toHaveAttribute("href", "/players");
});

test("a profile's sections stay under the top bar, and the bar shows the player's name once the card has scrolled away", async ({ page }) => {
  const top = await idOf(page, "TOP");
  await page.goto("/players");
  await page.goto(`/players/${top}`);
  const sections = page.getByTestId("profile-chrome-tabs");
  await expect(sections.getByRole("link")).toHaveText(["Overview", "Champions", "History", "Accounts"]);
  // The page's own bar is the tablet's and desktop's.
  await expect(page.getByTestId("profile-tabs")).toBeHidden();
  const title = page.getByTestId("mobile-title");
  await expect(title).toHaveText("");
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect(title).toHaveText("Demo Top");
  await expect(sections).toBeInViewport();
  // Moving between sections replaces the history entry: Back leaves the profile.
  await sections.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(new RegExp(`/players/${top}/matches$`));
  await expect(sections.getByRole("link", { name: "History" })).toHaveAttribute("aria-current", "page");
  await sections.getByRole("link", { name: "Champions" }).click();
  await expect(page).toHaveURL(new RegExp(`/players/${top}/champions$`));
  await page.goBack();
  await expect(page).toHaveURL(/\/players$/);
});

test("the avatar opens the account screen: Matchup Intel, Resources, Settings, Install App and Sign out live there", async ({ page }) => {
  await page.goto("/team");
  // No menu drawer anywhere (a tablet's destinations are in its top bar).
  await expect(page.getByTestId("menu-button")).toHaveCount(0);
  await page.getByTestId("account-sheet-button").click();
  const screen = page.getByTestId("account-sheet");
  await expect(screen).toBeVisible();
  await expect(screen).toHaveAttribute("data-size", "screen");
  await expect(screen.getByRole("heading", { name: "Account" })).toBeVisible();
  // The pages the tab bar does not hold, in the sidebar's order: Matchup Intel, then Resources.
  await expect(screen.getByRole("navigation", { name: "More pages and your account" }).getByRole("link")).toHaveText(["Matchup Intel", "Resources", "Settings"]);
  await expect(screen.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(screen.getByText("Not endorsed by Riot Games.")).toBeVisible();
  // Full-width rows, finger-sized.
  const settings = (await screen.getByRole("link", { name: "Settings" }).boundingBox())!;
  expect(settings.height).toBeGreaterThanOrEqual(48);
  expect(settings.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 40);
  await screen.getByRole("link", { name: "Resources" }).click();
  await expect(page).toHaveURL(/\/resources$/);
  await expect(screen).toHaveCount(0);
  // Resources has no tab here, so it is a page reached from another: Back. No tabs in the page.
  await expect(page.getByTestId("mobile-back")).toBeVisible();
  await expect(page.getByTestId("resources-tabs")).toHaveCount(0);
  // Matchup Intel likewise, one tap from the account screen, and marked there as the page shown.
  await page.getByTestId("account-sheet-button").click();
  await expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute("aria-current", "page");
  await expect(screen.getByRole("link", { name: "Matchup Intel" })).not.toHaveAttribute("aria-current", "page");
  await screen.getByRole("link", { name: "Matchup Intel" }).click();
  await expect(page).toHaveURL(/\/resources\/matchups$/);
  await expect(screen).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Matchup Intel" })).toBeVisible();
  await expect(page.getByTestId("mobile-back")).toBeVisible();
  await page.getByTestId("account-sheet-button").click();
  await expect(screen.getByRole("link", { name: "Matchup Intel" })).toHaveAttribute("aria-current", "page");
  await expect(screen.getByRole("link", { name: "Resources" })).not.toHaveAttribute("aria-current", "page");
});

test("the account screen fills a small phone in Player Mode and Admin Mode: everything in view without scrolling, every control in reach", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const path of ["/team", "/admin"]) {
    if (path === "/admin") await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
    await page.goto(path);
    await page.getByTestId("account-sheet-button").click();
    const screen = page.getByTestId("account-sheet");
    await expect(screen).toHaveAttribute("data-entered", "true");
    const fit = await screen.evaluate((d) => {
      const box = d.getBoundingClientRect();
      const body = d.querySelector<HTMLElement>("[data-sheet-scroll]")!;
      const missed = [...d.querySelectorAll<HTMLElement>("[data-testid=account-sheet-close], nav a, nav button, [data-testid=mode-switch], [data-testid=sign-out]")].filter((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(r.bottom <= box.bottom && !!at && (at === el || el.contains(at)));
      }).length;
      return { box: [box.left, box.top, box.width, box.height], scrolls: body.scrollHeight > body.clientHeight + 1, missed };
    });
    expect(fit).toEqual({ box: [0, 0, 320, 568], scrolls: false, missed: 0 });
    if (path === "/admin") {
      // Admin Mode: the admin pages the tab bar does not hold, and nothing the tab bar repeats.
      await expect(screen.getByRole("link", { name: "Audit Logs" })).toBeVisible();
      await expect(screen.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
      await expect(screen.getByTestId("mode-switch")).toBeInViewport();
    } else {
      await expect(screen.getByRole("link", { name: "Matchup Intel" })).toBeInViewport();
      await expect(screen.getByRole("link", { name: "Resources" })).toBeInViewport();
    }
    await expect(screen.getByText("Not endorsed by Riot Games.")).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(screen).toHaveCount(0);
    await expect(page.getByTestId("account-sheet-button")).toBeFocused();
  }
});

test("touches on the account screen never move the page behind; there is nothing to pull", async ({ page, context }) => {
  await page.goto("/players");
  await page.evaluate(() => window.scrollTo(0, 300));
  const scrolled = await page.evaluate(() => scrollY);
  const screen = page.getByTestId("account-sheet");
  const cdp = await context.newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  async function drag(x: number, from: number, to: number) {
    await touch("touchStart", x, from);
    for (let i = 1; i <= 8; i++) {
      await touch("touchMove", x, from + ((to - from) * i) / 8);
      await page.waitForTimeout(25);
    }
    await touch("touchEnd", x, to);
  }
  await page.getByTestId("account-sheet-button").click();
  await expect(screen).toHaveAttribute("data-entered", "true");
  const { width, height } = page.viewportSize()!;
  // Pulled down by its header, pushed up from its rows, dragged in its empty lower part: it stays
  // where it is (it has no handle), and the page behind never moves.
  await drag(width / 2, 30, 260);
  await drag(width / 2, 300, 60);
  await drag(width / 2, height - 60, height - 260);
  await expect(screen).toBeVisible();
  expect((await screen.boundingBox())!.y).toBe(0);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  await page.keyboard.press("Escape");
  await expect(screen).toHaveCount(0);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
});

test("a tap on the avatar before the page's code has run is kept: the avatar shows pressed, and the account screen opens once the code runs, exactly once", async ({ page }) => {
  await page.addInitScript(COUNT_OPENINGS);
  const scripts = await holdScripts(page);
  await page.goto("/team", { waitUntil: "domcontentloaded" });
  const avatar = page.getByTestId("account-sheet-button");
  const screen = page.getByTestId("account-sheet");
  // The server's page, drawn, with none of the app's code: the tap is kept, and a second one too
  // queues nothing more.
  await avatar.tap();
  await avatar.tap();
  await expect(avatar).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => window.__earlyTaps)).toEqual(["sheet"]);
  await page.waitForTimeout(300);
  await expect(screen).toHaveCount(0);
  scripts.release();
  await expect(screen).toBeVisible();
  await expect(avatar).not.toHaveAttribute("aria-busy");
  // Exactly once: one opening, and still open a moment later.
  await page.waitForTimeout(600);
  await expect(screen).toBeVisible();
  expect(await openings(page)).toEqual({ "account-sheet": 1 });
  // From then on the script stands aside, and the avatar works as ever.
  await page.keyboard.press("Escape");
  await expect(screen).toHaveCount(0);
  await avatar.tap();
  await expect(screen).toBeVisible();
  expect(await openings(page)).toEqual({ "account-sheet": 2 });
});

test("at 150% text, with an account, the account screen keeps its header and close button in place and its body scrolls down to Sign out", async ({ page, browser }) => {
  // A member's account: Sign out is offered only with accounts (the demo's local owner has none).
  // The smallest phone, where large text leaves the screen's body least room. (At 200% the page
  // itself is wider than a 320px phone: the large-text layout is its own piece of work.)
  const member = await memberContext(browser, page, { width: 320, height: 568 }, { base: "Large" });
  const phone = member.page;
  await phone.goto("/team");
  await phone.addStyleTag({ content: "html { font-size: 150% !important; }" });
  await phone.getByTestId("account-sheet-button").focus();
  await phone.keyboard.press("Enter");
  const screen = phone.getByTestId("account-sheet");
  await expect(screen).toHaveAttribute("data-entered", "true");
  expect((await screen.boundingBox())!).toMatchObject({ x: 0, y: 0, width: 320, height: 568 });
  const close = (await screen.getByTestId("account-sheet-close").boundingBox())!;
  await screen.locator("[data-sheet-scroll]").evaluate((b) => b.scrollTo(0, b.scrollHeight));
  await expect(screen.getByTestId("sign-out")).toBeInViewport({ ratio: 1 });
  await expect(screen.getByText("Not endorsed by Riot Games.")).toBeInViewport();
  expect((await screen.getByTestId("account-sheet-close").boundingBox())!.y).toBe(close.y);
  await member.context.close();
});

test.describe("a tablet before the page's code has run", () => {
  // The page is loaded twice; a service worker would serve the second load's navigation itself.
  test.use({ serviceWorkers: "block" });

  test("a tap on the avatar is kept, shown pressed, and opens the account menu once the code runs, exactly once", { tag: "@tablet" }, async ({ page }) => {
    // Its other trigger, the sidebar's tile, is on the page too, hidden at this width: the tap opens
    // the one tapped. (The destinations are links, which work before the code has run.)
    const scripts = await holdScripts(page);
    await page.goto("/team", { waitUntil: "domcontentloaded" });
    const avatar = page.getByTestId("mobile-topbar").getByTestId("account-menu-button");
    await avatar.tap();
    await avatar.tap();
    await expect(avatar).toHaveAttribute("aria-busy", "true");
    expect(await page.evaluate(() => window.__earlyTaps)).toEqual(["account"]);
    scripts.release();
    const menu = page.getByTestId("account-menu");
    await expect(menu).toBeVisible();
    await expect(avatar).toHaveAttribute("aria-expanded", "true");
    await expect(avatar).not.toHaveAttribute("aria-busy");
    // Exactly once: a second click would have closed it again.
    await page.waitForTimeout(600);
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  });
});

test("a tablet's destinations are in its top bar, one tap each; its avatar menu holds the account's items, the switch between the modes, the patch and Riot's notice", { tag: "@tablet" }, async ({ page, context, baseURL }) => {
  await page.goto("/team");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link")).toHaveText(["My Profile", "Team", "Matchup Intel", "Resources"]);
  // The current destination is marked twice: its icon in the brand blue and its lift, and the name bright.
  const team = nav.getByRole("link", { name: "Team" });
  await expect(team).toHaveAttribute("aria-current", "page");
  // ...and the brand's gradient as a short bar at its foot, the sidebar's fourth signal; on it alone.
  await expect(team.getByTestId("topbar-current-bar")).toHaveCSS("opacity", "1");
  await expect(nav.getByTestId("topbar-current-bar")).toHaveCount(1);
  for (const box of await nav.getByRole("link").evaluateAll((links) => links.map((l) => l.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  // One tap from anywhere: from Team to Resources, and Team stays marked on its other sections.
  await nav.getByRole("link", { name: "Resources" }).click();
  await expect(page).toHaveURL(/\/resources$/);
  await expect(nav.getByRole("link", { name: "Resources" })).toHaveAttribute("aria-current", "page");
  await expect(nav.locator("a[aria-current=page]")).toHaveCount(1);
  // Matchup Intel is a destination of its own, marked on its page with a pair chosen, Resources not.
  await nav.getByRole("link", { name: "Matchup Intel" }).click();
  await expect(page).toHaveURL(/\/resources\/matchups$/);
  await page.goto("/resources/matchups?champion=Riven&vs=Mordekaiser");
  await expect(nav.getByRole("link", { name: "Matchup Intel" })).toHaveAttribute("aria-current", "page");
  await expect(nav.locator("a[aria-current=page]")).toHaveCount(1);
  await page.goto("/matches");
  await expect(team).toHaveAttribute("aria-current", "page");
  const avatar = page.getByTestId("mobile-topbar").getByTestId("account-menu-button");
  await avatar.click();
  const menu = page.getByTestId("account-menu");
  await expect(menu.getByRole("menuitem")).toHaveText(["Settings", "Install App", "Switch to Admin Mode", "Details"]);
  await expect(menu.getByTestId("account-menu-notes")).toContainText(/Patch .+Not endorsed by Riot Games\./);
  // Install App opens its window over the page; the menu has closed and the focus goes back to the avatar.
  await menu.getByTestId("install-app").click();
  const install = page.getByTestId("install-window");
  await expect(install).toBeVisible();
  await expect(menu).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(install).toHaveCount(0);
  await expect(avatar).toBeFocused();
  // Admin Mode: its four tabs in the bar (Platform Settings by its full name: the avatar menu under the
  // bar holds the account's own Settings), the admin pages without a tab in the avatar menu.
  await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/admin");
  await expect(nav.getByRole("link")).toHaveText(["Dashboard", "Users", "Platform Settings", "Health"]);
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  await avatar.click();
  await expect(menu.getByRole("menuitem")).toHaveText(["Data & Integrations", "Audit Logs", "Settings", "Install App", "Return to Player Mode", "Details"]);
  await menu.getByRole("menuitem", { name: "Audit Logs" }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(menu).toHaveCount(0);
});

test("a tablet's top bar gives way at a larger text size: the team's name first, then the labels, by its own width, and never wider than the window", { tag: "@tablet" }, async ({ page, context, baseURL }) => {
  // BAR_FIT in mobile-nav.tsx, in rem of the bar's row less its gutters: Player Mode's name below
  // 42.5rem and labels below 36.25rem (four destinations since Matchup Intel's own entry: 42.0rem and
  // 35.9rem needed), Admin Mode's below 43rem and 36.5rem. The gutters are 1rem a side, so they grow
  // with the text: a 768px tablet's row is 768px over the root's size less 2rem, 46rem at 100% text,
  // 36.4rem at 125%, 30rem at 150% and 22rem at 200%.
  const FIT = { player: { brand: 42.5, labels: 36.25 }, admin: { brand: 43, labels: 36.5 } } as const;
  const ROW = { 100: 46, 125: 36.4, 150: 30, 200: 22 } as const;
  // What the 768px tablet shows, written out, so a threshold above what fits fails here as well as
  // one below it: Player Mode keeps its four labels at 125% (the name gone), Admin Mode its icons alone.
  const AT_768 = {
    player: { 100: { name: true, labels: true }, 125: { name: false, labels: true }, 150: { name: false, labels: false }, 200: { name: false, labels: false } },
    admin: { 100: { name: true, labels: true }, 125: { name: false, labels: false }, 150: { name: false, labels: false }, 200: { name: false, labels: false } },
  } as const;
  expect(page.viewportSize()!.width, "the tablet project's window").toBe(768);
  for (const mode of ["player", "admin"] as const) {
    await context.addCookies([{ name: "uniiverse_view", value: mode, url: baseURL! }]);
    for (const root of [100, 125, 150, 200] as const) {
      const where = `${mode === "admin" ? "Admin Mode" : "Player Mode"} at ${root}% text`;
      await page.goto(mode === "admin" ? "/admin/settings" : "/team");
      await page.evaluate((r) => {
        document.documentElement.style.fontSize = `${r}%`;
      }, root);
      await page.evaluate(() => document.fonts.ready);
      await expect(async () => {
        const m = await page.evaluate(() => {
          const row = document.querySelector<HTMLElement>("[data-testid=mobile-topbar] > div")!;
          const cs = getComputedStyle(row);
          const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
          const list = document.querySelector<HTMLElement>("[data-testid=topbar-destinations] ul")!;
          const shown = (el: Element | null) => !!el && el.getBoundingClientRect().width > 1;
          return {
            content: (row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / rem,
            name: shown(document.querySelector("[data-testid=mobile-brand-name]")),
            labels: [...list.querySelectorAll("a")].map((a) => shown(a.querySelector(":scope > span:last-child"))),
            listScrolls: list.scrollWidth > list.clientWidth + 1,
            rowOverflow: row.scrollWidth - row.clientWidth,
            bar: document.querySelector("[data-testid=mobile-topbar]")!.getBoundingClientRect().right - innerWidth,
          };
        });
        const fit = FIT[mode];
        expect(m.content, `${where}: the bar's row in rem`).toBeCloseTo(ROW[root], 1);
        expect(m.name, `${where}: the team's name (row ${m.content.toFixed(1)}rem)`).toBe(m.content >= fit.brand);
        for (const label of m.labels) expect(label, `${where}: a label (row ${m.content.toFixed(1)}rem)`).toBe(m.content >= fit.labels);
        const shows = AT_768[mode][root];
        expect({ name: m.name, labels: m.labels }, `${where}: what a 768px tablet shows`).toEqual({ name: shows.name, labels: [shows.labels, shows.labels, shows.labels, shows.labels] });
        // What each step leaves fits: the list needs no scrolling, and neither the bar nor its row is
        // wider than the window (the page's own content is its pages' to fit: e2e/phone-wraps.spec.ts).
        expect(m.listScrolls, `${where}: the destinations fit`).toBe(false);
        expect(m.rowOverflow, `${where}: the bar's row`).toBeLessThanOrEqual(1);
        expect(m.bar, `${where}: the bar within the window`).toBeLessThanOrEqual(1);
      }).toPass({ timeout: 15_000 });
    }
  }
  // The installed app adds Back on a page reached from another (Matchup Intel opened directly: Back
  // to Team). Beside it the labels give way where the name does (42.5rem, BAR_FIT's besideBack), so
  // at 125% the four show their icons alone rather than scrolling (69px at the bare threshold).
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }));
  for (const [root, labels] of [[100, true], [125, false]] as const) {
    await page.goto("/resources/matchups");
    await page.evaluate((r) => {
      document.documentElement.style.fontSize = `${r}%`;
    }, root);
    await expect(page.getByTestId("mobile-back")).toBeVisible();
    await expect(async () => {
      const m = await page.evaluate(() => {
        const list = document.querySelector<HTMLElement>("[data-testid=topbar-destinations] ul")!;
        return { labels: [...list.querySelectorAll("a")].map((a) => a.querySelector(":scope > span:last-child")!.getBoundingClientRect().width > 1), scrolls: list.scrollWidth > list.clientWidth + 1 };
      });
      expect(m, `installed, beside Back, at ${root}% text`).toEqual({ labels: [labels, labels, labels, labels], scrolls: false });
    }).toPass({ timeout: 15_000 });
  }
});

test("one primary navigation is shown at a time: the bottom bar upright, the compact bar sideways, a tablet's top bar, none beside the sidebar", async ({ page }) => {
  for (const [viewport, expected] of [
    [{ width: 375, height: 667 }, "phone-tabbar"],
    [{ width: 568, height: 320 }, "topbar-tabs"],
    [{ width: 852, height: 393 }, "topbar-tabs"],
    [{ width: 768, height: 1024 }, "topbar-destinations"],
    [{ width: 1024, height: 768 }, null],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto("/team");
    const shown = await page.evaluate(() => [...document.querySelectorAll("nav[aria-label=Primary]")].filter((n) => getComputedStyle(n).display !== "none" && n.getBoundingClientRect().height > 0).map((n) => n.getAttribute("data-testid")));
    expect(shown, `${viewport.width} × ${viewport.height}`).toEqual(expected ? [expected] : []);
    await expect(page.getByRole("navigation", { name: "Primary" }), `${viewport.width} × ${viewport.height}`).toHaveCount(expected ? 1 : 0);
  }
});

test("the account screen closes when the page changes, Back and Forward included, and is not reopened by Forward, upright and held sideways", async ({ page, browser, baseURL }) => {
  // Its state is the path it was opened on (MobileNav's sheetAt): a navigation leaves it closed.
  const check = async (p: Page, tab: string, where: string) => {
    const screen = p.getByTestId("account-sheet");
    await p.goto("/team");
    await p.getByTestId(tab).click();
    await expect(p, where).toHaveURL(/\/players$/);
    await expect(p.getByTestId("players-directory"), where).toBeVisible();
    await p.getByTestId("account-sheet-button").click();
    await expect(screen, where).toBeVisible();
    await p.goBack();
    await expect(p, where).toHaveURL(/\/team$/);
    await expect(screen, `${where}: closed by Back`).toHaveCount(0);
    await p.goForward();
    await expect(p, where).toHaveURL(/\/players$/);
    await expect(p.getByTestId("players-directory"), where).toBeVisible();
    await expect(screen, `${where}: not reopened by Forward`).toHaveCount(0);
  };
  await check(page, "tab-players", "upright");
  const sideways = await browser.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
  await sideways.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await check(await sideways.newPage(), "topbar-tab-players", "held sideways at 852 × 393");
  await sideways.close();
});

test("Sign out from a tablet's avatar menu is told to the browser's other tabs, and the next thing they do lands on sign-in", { tag: "@tablet" }, async ({ page, browser }) => {
  const member = await memberContext(browser, page, { width: 768, height: 1024 }, { base: "Tabs" });
  const [first, other] = [member.page, await member.context.newPage()];
  await first.goto("/team");
  await other.goto("/team");
  await expect(other.getByTestId("mobile-topbar").getByTestId("account-menu-button")).toBeVisible();
  // The other tab listens where the account guard does (account-guard.tsx) for the announcement.
  await other.evaluate(() => {
    const heard: string[] = [];
    (window as unknown as { __heard: string[] }).__heard = heard;
    new BroadcastChannel("uniiverse-account").onmessage = (e) => heard.push(String(e.data));
  });
  await first.getByTestId("mobile-topbar").getByTestId("account-menu-button").click();
  await first.getByTestId("account-menu").getByRole("menuitem", { name: "Sign out" }).click();
  // Signed out of the only account: the site's address, the public team page.
  await expect(first).toHaveURL(/\/public$/);
  await expect.poll(() => other.evaluate(() => (window as unknown as { __heard: string[] }).__heard)).toEqual(["changed"]);
  // The other tab no longer acts as the member: its next page is the sign-in page.
  await other.getByRole("link", { name: "Players", exact: true }).first().click();
  await expect(other).toHaveURL(/\/login/);
  await member.context.close();
});

test("filters open in a sheet; what is narrowed shows as chips beside Filters, and a chip removes itself", async ({ page }) => {
  await page.goto(`/players/${await idOf(page, "TOP")}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  const toggle = page.getByTestId("filter-toggle");
  await toggle.click();
  const sheet = page.getByTestId("filter-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Game mode").selectOption("solo");
  await expect(page).toHaveURL(/mode=solo/);
  await sheet.getByTestId("filter-sheet-done").click();
  await expect(sheet).toHaveCount(0);
  const chip = page.getByRole("button", { name: "Ranked Solo/Duo: remove this filter" });
  await expect(chip).toBeVisible();
  await expect(toggle).toContainText("1");
  await chip.click();
  await expect(page).not.toHaveURL(/mode=solo/);
  await expect(chip).toHaveCount(0);
});

/** Scrolls to the page's end by steps, as a reader does, so the observers see the way down. */
async function scrollToEnd(page: Page) {
  await page.evaluate(async () => {
    for (let at = window.scrollY; at < document.documentElement.scrollHeight; at += 240) {
      window.scrollTo(0, at);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
}

test("once the page's own Filters has scrolled away, the top bar offers it: 44px, named with what is chosen, opening the sheet; Done after a change brings the first game under the bars", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/players/${await idOf(page, "TOP")}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  const filters = page.getByTestId("topbar-filters");
  await scrollToEnd(page);
  await expect(filters).toBeVisible();
  await expect(filters).toHaveAccessibleName(/^Filters: Season \d{4} · All supported games/);
  const box = (await filters.boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([44, 44]);
  // Back at the top, the page's own Filters is in view: the bar's goes (asserted after it showed, so
  // it is the observer's answer, not the moment before it).
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(filters).toHaveCount(0);
  await scrollToEnd(page);
  await filters.click();
  const sheet = page.getByTestId("filter-sheet");
  await expect(sheet).toBeVisible();
  // Wins only: about half the games, still more than a screen of them (Refine's fields are in the sheet).
  await sheet.getByTestId("refine-result").getByRole("radio", { name: "Wins" }).click();
  await expect(page).toHaveURL(/result=win/);
  await sheet.getByTestId("filter-sheet-done").click();
  await expect(sheet).toHaveCount(0);
  // The new list starts at its first game, just under the top bar (with the profile's sections in it),
  // or as near it as the page's end allows.
  const landed = () =>
    page.evaluate(() => {
      const first = document.querySelector("[data-testid=match-card]")!.getBoundingClientRect();
      const under = document.querySelector("[data-testid=mobile-topbar]")!.getBoundingClientRect();
      const end = document.documentElement.scrollHeight - window.innerHeight;
      return { gap: Math.round(first.top - under.bottom), atEnd: window.scrollY >= end - 1 };
    });
  await expect.poll(async () => { const at = await landed(); return at.gap >= 0 && (at.gap <= 12 || at.atEnd); }, { message: "the first game just under the bars" }).toBe(true);
  // The focus came back to it as the sheet closed; its badge counts the narrowed filter.
  await expect(filters).toBeFocused();
  await expect(filters.locator("span:not(.sr-only)")).toHaveText("1");
});

test("the top bar's Filters gets the focus back from its sheet (Escape, Done), and stays while it has it, even once a change has emptied the list", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/players/${await idOf(page, "TOP")}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await scrollToEnd(page);
  const filters = page.getByTestId("topbar-filters");
  const sheet = page.getByTestId("filter-sheet");
  await filters.click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(filters).toBeFocused();
  // A change that leaves no game: the page shortens behind the sheet and its own Filters comes back
  // into view; the bar's button is still there to take the focus back, and stays while it has it.
  await filters.click();
  await sheet.getByTestId("refine-more").click();
  await sheet.getByTestId("refine-to").fill("2001-01-01");
  await expect(page).toHaveURL(/to=2001-01-01/);
  await expect(page.getByTestId("match-empty")).toBeVisible();
  await sheet.getByTestId("filter-sheet-done").click();
  await expect(sheet).toHaveCount(0);
  await expect(filters).toBeVisible();
  await expect(filters).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(filters).toHaveCount(0);
});

test("the fullest top bar (Back, the title, Filters with its count, the avatar) keeps within a 320px phone at 100%, 175% and 200% text: Back gives way, Filters and the avatar stay on the screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const profile = `/players/${await idOf(page, "TOP")}`;
  for (const root of [100, 175, 200]) {
    // A teammate's Match History, reached from Players (so Back is named) and narrowed (a count badge).
    await page.goto("/players");
    await page.goto(`${profile}/matches?result=win`);
    if (root !== 100) await page.addStyleTag({ content: `html { font-size: ${root}% !important; }` });
    await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
    await scrollToEnd(page);
    const filters = page.getByTestId("topbar-filters");
    await expect(filters, `${root}% text`).toBeVisible();
    await expect(page.getByTestId("mobile-back"), `${root}% text: Back`).toBeVisible();
    await expect(filters.locator("span:not(.sr-only)")).toHaveText("1");
    const fit = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>("[data-testid=mobile-topbar]")!;
      const row = bar.firstElementChild as HTMLElement;
      const right = (el: Element) => Math.round(el.getBoundingClientRect().right);
      return { page: document.documentElement.scrollWidth, bar: right(bar), row: row.scrollWidth - row.clientWidth, items: Math.max(...[...row.children].map(right)), filters: right(document.querySelector("[data-testid=topbar-filters]")!), avatar: right(document.querySelector("[data-testid=account-sheet-button]")!) };
    });
    // The page under the bar fits the phone at 100%. At 175% and 200% a teammate's pages are wider
    // than a 320px phone already, from their own content (the strip of Match History's last games,
    // All Champions' sort row, Encounters' rates), not from the bar, so there the bar itself is
    // measured: it, its row and everything in the row end within the screen.
    if (root === 100) expect(fit.page, "100% text: the page").toBeLessThanOrEqual(320);
    expect(fit.bar, `${root}% text: the bar`).toBeLessThanOrEqual(320);
    expect(fit.row, `${root}% text: the bar's row`).toBeLessThanOrEqual(1);
    expect(fit.items, `${root}% text: everything in the bar's row`).toBeLessThanOrEqual(320);
    expect(fit.filters, `${root}% text: Filters on screen`).toBeLessThanOrEqual(320);
    expect(fit.avatar, `${root}% text: the avatar on screen`).toBeLessThanOrEqual(320);
  }
});

test("a game opens as a whole screen of its own; Back closes it and the list is as it was", async ({ page }) => {
  await page.goto(`/players/${await idOf(page, "TOP")}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  // Phone cards leave both teams to the game's own screen.
  await expect(page.getByTestId("match-card").first().getByTestId("match-teams")).toBeHidden();
  const card = page.getByTestId("match-card").nth(2);
  await card.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  const id = (await card.getByTestId("match-row").getAttribute("data-match"))!;
  await card.click({ position: { x: 24, y: 16 } });
  const window_ = page.getByTestId("match-detail");
  await expect(window_).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`match=${id}`));
  await expect(window_.getByTestId("match-breakdown")).toBeVisible();
  const box = (await window_.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
  // No breakdown opens under the card on a phone.
  await expect(page.getByTestId("match-expanded")).toHaveCount(0);
  await page.goBack();
  await expect(window_).toHaveCount(0);
  await expect(page).not.toHaveURL(/match=/);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThanOrEqual(2);
  // The close button closes it the same way.
  await card.click({ position: { x: 24, y: 16 } });
  await expect(window_).toBeVisible();
  await window_.getByTestId("match-detail-close").click();
  await expect(window_).toHaveCount(0);
  await expect(page).not.toHaveURL(/match=/);
});

test("Team → Matches opens a game as a whole screen too, and its cards keep to the members who played", async ({ page }) => {
  await page.goto("/matches");
  const game = page.getByTestId("together-game").first();
  await expect(game).toBeVisible();
  await expect(game.getByTestId("together-member").first()).toBeVisible();
  await expect(game.getByTestId("match-teams")).toBeHidden();
  await game.getByTestId("together-card").click({ position: { x: 24, y: 12 } });
  const window_ = page.getByTestId("match-detail");
  await expect(window_).toBeVisible();
  await expect(page).toHaveURL(/match=/);
  await page.goBack();
  await expect(window_).toHaveCount(0);
  await expect(page).toHaveURL(/\/matches$/);
});

test("a page's views share one track on the narrowest phones, each named in full", async ({ page }) => {
  // Match History's Games and Encounters: since 19 Nov 2026 the only views in Player Mode (Leaderboards is one page).
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  const games = page.getByTestId("match-view-games");
  const encounters = page.getByTestId("match-view-encounters");
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 667 });
    const [a, b] = [(await games.boundingBox())!, (await encounters.boundingBox())!];
    expect(Math.abs(a.y - b.y), `one line at ${width}px`).toBeLessThan(1);
    expect(b.x + b.width).toBeLessThanOrEqual(width);
  }
  await expect(games).toHaveAccessibleName("Games");
  await expect(encounters).toHaveAccessibleName("Encounters");
});

test("Players and Leaderboards read as lists on a phone: a row per player, a row per member, each row one tap", async ({ page }) => {
  await page.goto("/players");
  // One panel, a row per player, one column; the whole row is the link to the profile.
  const rows = page.getByTestId("players-directory").getByTestId("player-card-item");
  await expect(rows.first()).toBeVisible();
  const boxes = await rows.evaluateAll((els) => els.map((e) => ({ left: Math.round(e.getBoundingClientRect().left), height: e.getBoundingClientRect().height, link: e.querySelector("a[data-testid=player-card]")!.getBoundingClientRect().height })));
  expect(new Set(boxes.map((b) => b.left)).size, "one column").toBe(1);
  for (const b of boxes) {
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.link, "the link covers its row").toBeGreaterThanOrEqual(b.height - 2);
  }
  // Recent form: a row per member, at least 64px (two lines, three when the gap takes its own line):
  // the record, dates and gap under the name, the role on the picture. One link covers the whole
  // row, so a tap anywhere on it (not only on the name) opens the member's profile.
  await page.goto("/leaderboards");
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  const row = page.getByTestId("form-row").first();
  await expect(row.getByTestId("form-meta")).toBeVisible();
  await expect(page.getByTestId("form-heads")).toBeHidden();
  const box = (await row.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(64);
  const link = (await row.locator("a[data-row-link]").boundingBox())!;
  expect(link.height, "the row's link covers the row").toBeGreaterThanOrEqual(box.height - 2);
  const id = await row.getAttribute("data-player-id");
  // The win rate at the row's right end: no link drawn there, but the row's link covers it.
  await page.touchscreen.tap(box.x + box.width - 12, box.y + box.height / 2);
  await expect(page).toHaveURL(new RegExp(`/players/${id}$`));
});
