import { expect, test, type Page } from "./test";
import { pick } from "./select";
import { memberContext, setBaseAccess } from "./member-account";

/*
  The phone frame (docs/MOBILE.md): the sidebar's four destinations in the bottom tab bar (navigation
  N1: My Profile, Team, Champion Lookup and Resources), named by the label ladder; a top bar that says
  where you are (the team's mark, or Back named after where it leads, and the page's title once its
  heading has scrolled away), with a profile's sections or Team's under it; the account screen behind
  the avatar, the account's own items only (it answers a tap made before the page's code has run,
  and Back closes it); filters in a sheet with chips for what is narrowed, and a game opened as a
  whole screen that Back closes. Phones only, except the tests tagged @tablet (a tablet's top bar and
  its avatar menu); in-memory demo roster.
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

/**
 * Scrolls a phone's page down to `y`, then brings the top bar's first row back as a finger does before
 * tapping the avatar, and returns where the page comes to rest. Under 700px tall that row slides away as
 * the page scrolls down (docs/MOBILE.md). Tapped mid-slide, the test runner first scrolls the page to
 * reveal the avatar (to the top, or 48px up where the page's end moves as the frame settles), so a
 * place noted straight after the scroll was not the page's (account-screen.spec.ts does the same).
 */
async function scrolledAtRest(page: Page, y: number): Promise<number> {
  await page.evaluate((to) => window.scrollTo(0, to), y);
  await page.mouse.wheel(0, -30);
  const bar = page.getByTestId("mobile-topbar");
  await expect(bar).toHaveAttribute("data-hidden", "false");
  await expect.poll(() => bar.evaluate((b) => b.getAnimations().length === 0 && Math.round(b.getBoundingClientRect().top) === 0)).toBe(true);
  const at = () => page.evaluate(() => `${scrollY},${document.documentElement.scrollHeight}`);
  await expect.poll(async () => { const before = await at(); await page.waitForTimeout(150); return before === (await at()); }).toBe(true);
  return page.evaluate(() => scrollY);
}

/** What each bar's destination shows of its name (the part read out only left out), whether it shows any, and whether it is whole. */
const shownNames = (nav: ReturnType<Page["getByTestId"]>) =>
  nav.evaluate((el) =>
    [...el.querySelectorAll("a")].map((a) => {
      const label = a.querySelector<HTMLElement>("[data-name=label]")!;
      const rest = label.querySelector<HTMLElement>("[data-name=rest]");
      const restShown = !!rest && rest.getBoundingClientRect().width > 1;
      const text = (label.textContent ?? "").trim();
      return { text: rest && !restShown ? text.replace(rest.textContent ?? "", "").trim() : text, shown: label.getBoundingClientRect().width > 1, whole: label.scrollWidth <= label.clientWidth + 1 };
    }),
  );

test("the tab bar holds the sidebar's four destinations, My Profile, Team, Champion Lookup and Resources, one tap each; Team's sections are the top bar's second row", async ({ page }) => {
  await page.goto("/team");
  await expect(tabBar(page).getByRole("link")).toHaveText(["My Profile", "Team", "Champion Lookup", "Resources"]);
  // Team's sections ride under the top bar on every Team page, with the desktop's names; no row repeats them in the page.
  await expect(page.getByTestId("team-tabs")).toBeHidden();
  const sections = page.getByTestId("team-chrome-tabs");
  await expect(sections.getByRole("link")).toHaveText(["Overview", "Players", "Leaderboards", "Matches"]);
  await expect(sections.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  for (const [key, path] of [
    ["overview", "/overview"],
    ["lookup", "/lookup"],
    ["resources", "/resources"],
    ["team", "/team"],
  ] as const) {
    await tabBar(page).getByTestId(`tab-${key}`).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(tabBar(page).getByTestId(`tab-${key}`)).toHaveAttribute("aria-current", "page");
    await expect(tabBar(page).locator("[aria-current=page]")).toHaveCount(1);
    // A destination's own page has no Back (no "‹ Team"): the team's mark instead.
    await expect(page.getByTestId("mobile-back")).toHaveCount(0);
    await expect(page.getByTestId("mobile-brand")).toBeVisible();
  }
  // Every tab is a 44px target or larger, and at 375px and 100% text every name shows whole.
  for (const box of await tabBar(page).getByRole("link").evaluateAll((links) => links.map((l) => l.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  expect(await shownNames(tabBar(page))).toEqual(["My Profile", "Team", "Champion Lookup", "Resources"].map((text) => ({ text, shown: true, whole: true })));
  // Team's sections: one tap each, Team marked on all of them.
  await sections.getByRole("link", { name: "Leaderboards" }).click();
  await expect(page).toHaveURL(/\/leaderboards$/);
  await expect(sections.getByRole("link", { name: "Leaderboards" })).toHaveAttribute("aria-current", "page");
  await expect(tabBar(page).getByTestId("tab-team")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("mobile-back")).toHaveCount(0);
});

test("the Team tab reopens the Team section last used, and tapped again on Team leads to Overview", async ({ page }) => {
  await page.goto("/team");
  await page.getByTestId("team-chrome-tabs").getByRole("link", { name: "Players" }).click();
  await expect(page).toHaveURL(/\/players$/);
  // Elsewhere, the Team tab leads back to Players.
  await tabBar(page).getByTestId("tab-resources").click();
  await expect(page).toHaveURL(/\/resources$/);
  await expect(tabBar(page).getByTestId("tab-team")).toHaveAttribute("href", "/players");
  await tabBar(page).getByTestId("tab-team").click();
  await expect(page).toHaveURL(/\/players$/);
  await expect(page.getByTestId("team-chrome-tabs").getByRole("link", { name: "Players" })).toHaveAttribute("aria-current", "page");
  // On Team, the tab leads to Overview; there, it goes back to the top and stays.
  await expect(tabBar(page).getByTestId("tab-team")).toHaveAttribute("href", "/team");
  await tabBar(page).getByTestId("tab-team").click();
  await expect(page).toHaveURL(/\/team$/);
  await page.evaluate(() => window.scrollTo(0, 400));
  await tabBar(page).getByTestId("tab-team").click();
  await expect(page).toHaveURL(/\/team$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  // The section is remembered in this tab of the browser: a reload keeps it.
  await page.getByTestId("team-chrome-tabs").getByRole("link", { name: "Matches" }).click();
  await expect(page).toHaveURL(/\/matches$/);
  await page.goto("/lookup");
  await expect(tabBar(page).getByTestId("tab-team")).toHaveAttribute("href", "/matches");
});

test("the label ladder: whole names where the bar has room, then Profile and Lookup with the whole names read out, then the icons alone only at 200% (or 150% on 320px); Admin Mode's short names", async ({ page }) => {
  // The bar's width in rem decides (TAB_FIT): the root's size stands for the reader's text size.
  const steps = { full: ["My Profile", "Team", "Champion Lookup", "Resources"], short: ["Profile", "Team", "Lookup", "Resources"] } as const;
  const expected: Record<number, Record<number, keyof typeof steps | "icons">> = {
    320: { 100: "full", 125: "short", 150: "icons", 200: "icons" },
    375: { 100: "full", 125: "full", 150: "short", 200: "icons" },
    390: { 100: "full", 125: "full", 150: "short", 200: "icons" },
    393: { 100: "full", 125: "full", 150: "short", 200: "icons" },
    430: { 100: "full", 125: "full", 150: "full", 200: "icons" },
  };
  for (const [width, sizes] of Object.entries(expected)) {
    await page.setViewportSize({ width: Number(width), height: 800 });
    await page.goto("/team");
    for (const [root, step] of Object.entries(sizes)) {
      const where = `${width}px at ${root}% text`;
      await page.evaluate((r) => (document.documentElement.style.fontSize = `${r}%`), Number(root));
      await expect(async () => {
        const names = await shownNames(tabBar(page));
        if (step === "icons") expect(names.map((n) => n.shown), where).toEqual([false, false, false, false]);
        else expect(names, where).toEqual(steps[step].map((text) => ({ text, shown: true, whole: true })));
        // Whatever shows, each destination keeps its whole name for screen readers, and the bar fits the phone.
        const fit = await tabBar(page).evaluate((nav) => ({ right: Math.max(...[...nav.querySelectorAll("li")].map((li) => li.getBoundingClientRect().right)), width: nav.getBoundingClientRect().width }));
        expect(fit.right, `${where}: within the phone`).toBeLessThanOrEqual(fit.width + 1);
      }).toPass({ timeout: 10_000 });
      for (const [i, name] of steps.full.entries()) await expect(tabBar(page).getByRole("link").nth(i), where).toHaveAccessibleName(name);
    }
  }
  // Admin Mode's phone bar keeps its short names at every width ("Platform", so a phone never shows a
  // second "Settings"), down to its icons below 15rem; measured on Settings, which fits a phone at 150%.
  await page.context().addCookies([{ name: "uniiverse_view", value: "admin", url: page.url() }]);
  for (const [width, root, shows] of [[393, 100, true], [320, 125, true], [393, 150, true], [320, 150, false]] as const) {
    const where = `Admin Mode, ${width}px at ${root}% text`;
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/admin/settings");
    await page.evaluate((r) => (document.documentElement.style.fontSize = `${r}%`), root);
    await expect(async () => {
      const names = await shownNames(tabBar(page));
      if (shows) expect(names, where).toEqual(["Dashboard", "Users", "Platform", "System"].map((text) => ({ text, shown: true, whole: true })));
      else expect(names.map((n) => n.shown), where).toEqual([false, false, false, false]);
    }).toPass({ timeout: 10_000 });
    for (const [i, name] of ["Dashboard", "Users & Permissions", "Platform Settings", "System"].entries()) await expect(tabBar(page).getByRole("link").nth(i), where).toHaveAccessibleName(name);
  }
});

test("Restricted Player (no Leaderboards): the same four destinations, Team's row holds the sections it may open, and on a 320px phone every name is whole", async ({ page, browser }) => {
  const member = await memberContext(browser, page, { width: 320, height: 568 }, { base: "Restricted" });
  await setBaseAccess(page, member.username, "Restricted Player");
  const phone = member.page;
  await phone.goto("/team");
  const bar = tabBar(phone);
  await expect(bar.getByRole("link")).toHaveText(["My Profile", "Team", "Champion Lookup", "Resources"]);
  expect(await shownNames(bar)).toEqual(["My Profile", "Team", "Champion Lookup", "Resources"].map((text) => ({ text, shown: true, whole: true })));
  await expect(phone.getByTestId("team-chrome-tabs").getByRole("link")).toHaveText(["Overview", "Players", "Matches"]);
  expect(await phone.evaluate(() => document.documentElement.scrollWidth), "the page within the phone").toBeLessThanOrEqual(320);
  // The account screen holds the account's items only: no page is in both.
  await phone.getByTestId("account-sheet-button").click();
  const screen = phone.getByTestId("account-sheet");
  await expect(screen.getByRole("navigation", { name: "Your account" }).getByRole("link")).toHaveText(["Settings"]);
  await phone.keyboard.press("Escape");
  await expect(screen).toHaveCount(0);
  await member.context.close();
});

test("Back from a teammate's profile returns to where you came from, named after it; opened directly, it leads to Players", async ({ page }) => {
  await page.goto("/players");
  await page.getByTestId("players-directory").locator("a[data-testid=player-card][data-player-name='Demo Mid']").click();
  await expect(page).toHaveURL(/\/players\/[^/]+$/);
  // A teammate's profile is under Team (its Players), as in the sidebar.
  await expect(tabBar(page).getByTestId("tab-team")).toHaveAttribute("aria-current", "page");
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

test("the avatar opens the account screen: the account's own items only (Settings, Install App, the switch between the modes), the team's mark and the notes; no page is offered twice", async ({ page }) => {
  await page.goto("/team");
  // No menu drawer anywhere (a tablet's destinations are in its top bar).
  await expect(page.getByTestId("menu-button")).toHaveCount(0);
  await page.getByTestId("account-sheet-button").click();
  const screen = page.getByTestId("account-sheet");
  await expect(screen).toBeVisible();
  await expect(screen).toHaveAttribute("data-size", "screen");
  await expect(screen.getByRole("heading", { name: "Account" })).toBeVisible();
  // Every page is a destination in the bar: the screen holds Settings and Install App, then the mode switch.
  await expect(screen.getByRole("navigation", { name: "Your account" }).getByRole("link")).toHaveText(["Settings"]);
  await expect(screen.getByTestId("install-app")).toBeVisible();
  await expect(screen.getByTestId("mode-switch")).toHaveText("Switch to Admin Mode");
  for (const name of ["Champion Lookup", "Resources", "My Profile", "Players", "Team"]) await expect(screen.getByRole("link", { name, exact: true }), name).toHaveCount(0);
  // The team's mark, the patch and Riot's notice at its foot.
  await expect(screen.getByTestId("account-sheet-team")).toBeVisible();
  await expect(screen.getByText("Not endorsed by Riot Games.")).toBeVisible();
  // Full-width rows, finger-sized.
  const settings = (await screen.getByRole("link", { name: "Settings" }).boundingBox())!;
  expect(settings.height).toBeGreaterThanOrEqual(48);
  expect(settings.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 40);
  // Settings: the page before is known, so Back is named after it; it replaced the screen's own history entry.
  await screen.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(screen).toHaveCount(0);
  await expect(page.getByTestId("mobile-back")).toContainText("Team");
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
  await expect(screen).toHaveCount(0);
  // Opened directly, Settings leads home: Team, a Team page, so "‹ Team" names where it really goes.
  await page.goto("/settings");
  await expect(page.getByTestId("mobile-back")).toHaveAttribute("href", "/team");
  // Champion Lookup and Resources, destinations of their own, never claim Team as their parent.
  for (const path of ["/resources", "/lookup"]) {
    await page.goto(path);
    await expect(page.getByTestId("mobile-back"), path).toHaveCount(0);
  }
});

test("Back closes the account screen and the page stays where it was; Forward does not reopen it; the close button takes its history entry away", async ({ page }) => {
  await page.goto("/players");
  const scrolled = await scrolledAtRest(page, 300);
  expect(scrolled).toBeGreaterThan(0);
  const screen = page.getByTestId("account-sheet");
  await page.getByTestId("account-sheet-button").click();
  await expect(screen).toBeVisible();
  await page.goBack();
  await expect(screen).toHaveCount(0);
  await expect(page).toHaveURL(/\/players$/);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  await page.goForward();
  await expect(page).toHaveURL(/\/players$/);
  await page.waitForTimeout(300);
  await expect(screen).toHaveCount(0);
  // Closed by its button, it leaves no entry behind: Back then leaves the page as before.
  await page.goto("/team");
  await page.goto("/players");
  await page.getByTestId("account-sheet-button").click();
  await expect(screen).toBeVisible();
  await screen.getByTestId("account-sheet-close").click();
  await expect(screen).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (history.state as Record<string, unknown> | null)?.__uniiverseWindow ?? null)).toBeNull();
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
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
    // The account's own items only, in both modes: every page is a destination in the bar.
    await expect(screen.getByRole("navigation", { name: "Your account" }).getByRole("link")).toHaveText(["Settings"]);
    await expect(screen.getByTestId("mode-switch")).toBeInViewport();
    if (path === "/admin") {
      // Admin Mode: "Settings" once on the phone, the account's; the bar names Platform Settings "Platform".
      await expect(screen.getByRole("link", { name: "Audit Logs" })).toHaveCount(0);
      // What shows: each link's text less what is read out only (sr-only).
      const shown = await page.evaluate(() =>
        [...document.querySelectorAll("[data-testid=phone-tabbar] a, [data-testid=account-sheet] a")]
          .map((a) => {
            const copy = a.cloneNode(true) as HTMLElement;
            for (const quiet of copy.querySelectorAll(".sr-only")) quiet.remove();
            return (copy.textContent ?? "").trim();
          })
          .filter((t) => /Settings/.test(t)),
      );
      expect(shown).toEqual(["Settings"]);
    }
    await expect(screen.getByText("Not endorsed by Riot Games.")).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(screen).toHaveCount(0);
    await expect(page.getByTestId("account-sheet-button")).toBeFocused();
  }
});

test("before the page's code runs, focus on the top bar's avatar never scrolls the page: the bar's controls take back the stylesheet's padding (R7, CI's account-screen jumps)", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "the phone's top bar");
  // JavaScript off holds the page as it is drawn before hydration, when a tap's focus lands first.
  const context = await browser.newContext({ ...info.project.use, baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/players");
    await page.evaluate(() => window.scrollTo(0, 300));
    const at = await page.evaluate(() => scrollY);
    expect(at).toBeGreaterThan(0);
    await page.getByTestId("account-sheet-button").focus();
    expect(await page.evaluate(() => scrollY), "the page stays where it was").toBe(at);
  } finally {
    await context.close();
  }
});

test("touches on the account screen never move the page behind; there is nothing to pull", async ({ page, context }) => {
  await page.goto("/players");
  const scrolled = await scrolledAtRest(page, 300);
  expect(scrolled).toBeGreaterThan(0);
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
  await expect(nav.getByRole("link")).toHaveText(["My Profile", "Team", "Champion Lookup", "Resources"]);
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
  // Champion Lookup is a destination of its own, marked on its page with a champion chosen, Resources not.
  await nav.getByRole("link", { name: "Champion Lookup" }).click();
  await expect(page).toHaveURL(/\/lookup$/);
  await page.goto("/lookup?champion=Mordekaiser&haste=20");
  await expect(nav.getByRole("link", { name: "Champion Lookup" })).toHaveAttribute("aria-current", "page");
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
  // Admin Mode: the sidebar's four destinations in the bar (the team's name kept beside them, saying the
  // mode, with the short names: BAR_FIT), every admin page under one of them; the avatar menu holds the
  // account's own items only.
  await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/admin");
  await expect(nav.getByRole("link")).toHaveText(["Dashboard", "Users & Permissions", "Platform Settings", "System"]);
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  await avatar.click();
  await expect(menu.getByRole("menuitem")).toHaveText(["Settings", "Install App", "Return to Player Mode", "Details"]);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  // System holds Health, Data & Integrations and Audit Logs, its tabs pinned in the page.
  await nav.getByRole("link", { name: "System" }).click();
  await expect(page).toHaveURL(/\/admin\/system$/);
  await page.getByTestId("admin-system-tabs").getByRole("link", { name: "Audit Logs" }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(nav.getByRole("link", { name: "System" })).toHaveAttribute("aria-current", "page");
});

test("a tablet's top bar gives way at a larger text size: the team's name, the whole names, the short ones, then the icons, by its own width, and never wider than the window", { tag: "@tablet" }, async ({ page, context, baseURL }) => {
  // BAR_FIT in mobile-nav.tsx, in rem of the bar's row less its gutters: Player Mode's name below
  // 42.5rem, its whole names below 36.25rem and its short names below 30.75rem; Admin Mode's name,
  // which says the mode, stays with the short names down to 39.75rem, its whole names from 49.75rem,
  // its short names down to 33.25rem. The gutters are 1rem a side, so they grow with the text: a
  // 768px tablet's row is 768px over the root's size less 2rem, 46rem at 100% text, 36.4rem at 125%,
  // 30rem at 150% and 22rem at 200%.
  const FIT = { player: { brand: 42.5, rest: 36.25, label: 30.75 }, admin: { brand: 39.75, rest: 49.75, label: 33.25 } } as const;
  const ROW = { 100: 46, 125: 36.4, 150: 30, 200: 22 } as const;
  // What the 768px tablet shows, written out, so a threshold above what fits fails here as well as one
  // below it: Player Mode keeps its whole names at 125% (the name gone); Admin Mode its name with the
  // short names at 100%, the short names alone at 125%.
  type Shows = { name: boolean; names: "full" | "short" | "icons" };
  const AT_768: Record<"player" | "admin", Record<100 | 125 | 150 | 200, Shows>> = {
    player: { 100: { name: true, names: "full" }, 125: { name: false, names: "full" }, 150: { name: false, names: "icons" }, 200: { name: false, names: "icons" } },
    admin: { 100: { name: true, names: "short" }, 125: { name: false, names: "short" }, 150: { name: false, names: "icons" }, 200: { name: false, names: "icons" } },
  };
  const read = () =>
    page.evaluate(() => {
      const row = document.querySelector<HTMLElement>("[data-testid=mobile-topbar] > div")!;
      const cs = getComputedStyle(row);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const list = document.querySelector<HTMLElement>("[data-testid=topbar-destinations] ul")!;
      const shown = (el: Element | null) => !!el && el.getBoundingClientRect().width > 1;
      const names = [...list.querySelectorAll("a")].map((a) => (!shown(a.querySelector("[data-name=label]")) ? "icons" : a.querySelector("[data-name=rest]") && !shown(a.querySelector("[data-name=rest]")) ? "short" : "full"));
      return {
        content: (row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / rem,
        name: shown(document.querySelector("[data-testid=mobile-brand-name]")),
        // A step's names: "full" where every name shows whole, "short" where those with a short name show it.
        names: names.every((n) => n === "icons") ? "icons" : names.some((n) => n === "short") ? "short" : "full",
        mixed: new Set(names.map((n) => n === "icons")).size > 1,
        listScrolls: list.scrollWidth > list.clientWidth + 1,
        rowOverflow: row.scrollWidth - row.clientWidth,
        bar: document.querySelector("[data-testid=mobile-topbar]")!.getBoundingClientRect().right - innerWidth,
      };
    });
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
        const m = await read();
        const fit = FIT[mode];
        expect(m.content, `${where}: the bar's row in rem`).toBeCloseTo(ROW[root], 1);
        expect(m.name, `${where}: the team's name (row ${m.content.toFixed(1)}rem)`).toBe(m.content >= fit.brand);
        expect(m.names, `${where}: the names (row ${m.content.toFixed(1)}rem)`).toBe(m.content < fit.label ? "icons" : m.content < fit.rest ? "short" : "full");
        expect(m.mixed, `${where}: every destination at the same step`).toBe(false);
        expect({ name: m.name, names: m.names }, `${where}: what a 768px tablet shows`).toEqual(AT_768[mode][root]);
        // What each step leaves fits: the list needs no scrolling, and neither the bar nor its row is
        // wider than the window (the page's own content is its pages' to fit: e2e/phone-wraps.spec.ts).
        expect(m.listScrolls, `${where}: the destinations fit`).toBe(false);
        expect(m.rowOverflow, `${where}: the bar's row`).toBeLessThanOrEqual(1);
        expect(m.bar, `${where}: the bar within the window`).toBeLessThanOrEqual(1);
      }).toPass({ timeout: 15_000 });
    }
  }
  // The installed app adds Back on a page reached from another (Settings opened directly: Back to
  // Team). Beside it each step comes sooner (BAR_FIT's besideBack: the whole names below 41rem, the
  // short ones below 35.5rem), so at 125% the four show their short names rather than scrolling.
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }));
  for (const [root, names] of [[100, "full"], [125, "short"]] as const) {
    await page.goto("/settings");
    await page.evaluate((r) => {
      document.documentElement.style.fontSize = `${r}%`;
    }, root);
    await expect(page.getByTestId("mobile-back")).toBeVisible();
    await expect(async () => {
      const m = await read();
      expect({ names: m.names, mixed: m.mixed, scrolls: m.listScrolls }, `installed, beside Back, at ${root}% text`).toEqual({ names, mixed: false, scrolls: false });
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

test("upright and held sideways: Back closes the account screen and the page stays; a page left closes it too, and coming back never reopens it", async ({ page, browser, baseURL }) => {
  const check = async (p: Page, where: string) => {
    const screen = p.getByTestId("account-sheet");
    await p.goto("/team");
    await p.getByTestId("team-chrome-tab-players").click();
    await expect(p, where).toHaveURL(/\/players$/);
    await expect(p.getByTestId("players-directory"), where).toBeVisible();
    await p.getByTestId("account-sheet-button").click();
    await expect(screen, where).toBeVisible();
    // Back (the browser's, Android's system Back) closes the screen: the page stays.
    await p.goBack();
    await expect(screen, `${where}: closed by Back`).toHaveCount(0);
    await expect(p, `${where}: still on the page`).toHaveURL(/\/players$/);
    // Back again leaves the page, as it would have without the screen.
    await p.goBack();
    await expect(p, where).toHaveURL(/\/team$/);
    await p.goForward();
    await expect(p, where).toHaveURL(/\/players$/);
    await expect(p.getByTestId("players-directory"), where).toBeVisible();
    await expect(screen, `${where}: not reopened by Forward`).toHaveCount(0);
  };
  await check(page, "upright");
  const sideways = await browser.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
  await sideways.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await check(await sideways.newPage(), "held sideways at 852 × 393");
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
  await pick(sheet.getByLabel("Game mode"), "solo");
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

test("under 700px tall, what the page brings back up lands clear of the top bar's returning row: a game's card after its window, and the next page's first game", async ({ page }) => {
  // The project's phone (375 × 667) is under 700px tall: the top bar's first row slides away as the
  // page scrolls down and comes back on any scroll up (docs/MOBILE.md, "The frame slides away"), so
  // a card brought up into view must stop under the whole bar, not under its sections row alone.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/players/${await idOf(page, "TOP")}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  const bar = page.getByTestId("mobile-topbar");
  await expect(bar).toHaveAttribute("data-slides", "row");
  const cards = page.getByTestId("match-card");
  /** Down the page by steps, as a reader scrolls, to `to` (the end when null): the row goes. */
  const readDown = (to: number | null) =>
    page.evaluate(async (until) => {
      const end = until ?? document.documentElement.scrollHeight;
      for (let y = window.scrollY; y <= end; y += 40) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      if (until === null) window.scrollTo(0, document.documentElement.scrollHeight);
    }, to);
  /** The first card's top less the bar's bottom, once the bar is at rest with its row back (a scroll up). */
  const clearOfBar = async () => {
    await expect(bar).toHaveAttribute("data-hidden", "false");
    await expect.poll(() => bar.evaluate((b) => b.getAnimations({ subtree: true }).length)).toBe(0);
    return page.evaluate(() => Math.round(document.querySelector("[data-testid=match-card]")!.getBoundingClientRect().top - document.querySelector("[data-testid=mobile-topbar]")!.getBoundingClientRect().bottom));
  };

  // The fifth game's window, stepped back to the first game and closed: the first card comes back.
  await readDown(await cards.nth(4).evaluate((e) => e.getBoundingClientRect().top + window.scrollY - 250));
  await expect(bar).toHaveAttribute("data-hidden", "row");
  await cards.nth(4).click({ position: { x: 24, y: 16 } });
  const win = page.getByTestId("match-detail");
  await expect(win).toBeVisible();
  const first = (await cards.first().getByTestId("match-row").getAttribute("data-match"))!;
  for (let i = 0; i < 4; i++) {
    const at = new URL(page.url()).searchParams.get("match");
    await win.getByTestId("match-detail-prev").click();
    await expect.poll(() => new URL(page.url()).searchParams.get("match")).not.toBe(at);
  }
  await expect(page).toHaveURL(new RegExp(`match=${first}`));
  await win.getByTestId("match-detail-close").click();
  await expect(win).toHaveCount(0);
  expect(await clearOfBar(), "the first card under the whole bar").toBeGreaterThanOrEqual(0);

  // The pager at the list's end: the next page opens at its first game, clear of the bar too.
  await readDown(null);
  await expect(bar).toHaveAttribute("data-hidden", "row");
  await page.getByTestId("match-pages").getByRole("button", { name: "Page 2" }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  expect(await clearOfBar(), "the next page's first game under the whole bar").toBeGreaterThanOrEqual(0);
});

test("under 700px tall, Done in the sheet the top bar's Filters opened lands the first game just under the bar as it will be: its row kept with the focus back in it, or gone where the focus was never there (a tap in Safari), just past the page's own filters too, with motion and without, at 100%, 150% and 200% text", async ({ page }) => {
  // The sheet hands the focus back to what had it as it opened, and the bar keeps its first row while
  // it has the focus. Just past the page's own filters the list's first game is below where the page
  // is, so landing it moves the page down, the way the row goes: the row then came back with the focus
  // over the game (R6 review BX2: 44px at 100% text, 70px at 150%, 88px at 200%). Opened with the focus
  // elsewhere (Safari focuses no button it taps; here a click with no focus), the row goes, and the
  // game must not stop a row lower than the bar.
  test.setTimeout(240_000);
  const path = `/players/${await idOf(page, "TOP")}/matches`;
  const cdp = await page.context().newCDPSession(page);
  const bar = page.getByTestId("mobile-topbar");
  const filters = page.getByTestId("topbar-filters");
  const sheet = page.getByTestId("filter-sheet");
  const cases = [
    ...(["no-preference", "reduce"] as const).flatMap((motion) => [100, 150, 200].map((text) => ({ motion, text, focused: true }))),
    ...(["no-preference", "reduce"] as const).flatMap((motion) => [100, 200].map((text) => ({ motion, text, focused: false }))),
  ];
  for (const { motion, text, focused } of cases) {
    const at = `${text}% text, ${motion === "reduce" ? "reduced motion" : "motion"}, ${focused ? "tapped" : "opened with the focus elsewhere"}`;
    await page.emulateMedia({ reducedMotion: motion });
    // The browser's own text size, which the media queries' rem follow too.
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * text) / 100 } });
    await page.goto(path);
    await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
    await expect(bar, at).toHaveAttribute("data-slides", "row");
    // Down by steps to just past the page's own filters (the row goes), then a short way up, as a
    // reader does to reach the bar: the row comes back, and the bar offers Filters.
    await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
      const own = document.querySelector("[data-testid=match-history] [data-filter-bar]")!;
      const to = own.getBoundingClientRect().bottom + window.scrollY + 40;
      for (let y = window.scrollY; y <= to; y += 20) {
        window.scrollTo(0, y);
        await frame();
      }
      window.scrollTo(0, to);
      await new Promise((r) => setTimeout(r, 300));
      for (let i = 0; i < 4; i++) {
        window.scrollBy(0, -6);
        await frame();
      }
    });
    await expect(bar, at).toHaveAttribute("data-hidden", "false");
    await expect(filters, at).toBeVisible();
    // Tapped once the row's slide back in is over and Filters is whole on the screen, as a finger finds
    // it. Tapped mid-slide, the tap's hit test can miss the moving button, and Playwright's retry then
    // scrolls the page to reach it, which brings the page's own filters back into view, and with them
    // the bar's name in place of Filters (PR #334's CI at 200% text: the button gone for good).
    await expect.poll(() => bar.evaluate((b) => b.getAnimations({ subtree: true }).length), { message: `${at}: the bar at rest`, intervals: [50] }).toBe(0);
    await expect(filters, at).toBeInViewport({ ratio: 1 });
    if (focused) await filters.tap();
    else await filters.dispatchEvent("click");
    await expect(sheet, at).toBeVisible();
    await sheet.getByTestId("refine-result").getByRole("radio", { name: "Wins" }).tap();
    await expect(page).toHaveURL(/result=win/);
    await sheet.getByTestId("filter-sheet-done").tap();
    await expect(sheet, at).toHaveCount(0);
    if (focused) await expect(filters, at).toBeFocused();
    else expect(await bar.evaluate((b) => b.matches(":focus-within")), `${at}: the focus not in the bar`).toBe(false);
    // Once the bar's motion is over and the page is still: the first game just under the bar (or as
    // near as the page's end allows).
    let last = "";
    await expect
      .poll(
        async () => {
          const now = await page.evaluate(() => {
            const b = document.querySelector<HTMLElement>("[data-testid=mobile-topbar]")!;
            const first = document.querySelector("[data-testid=match-card]")!.getBoundingClientRect();
            const end = document.documentElement.scrollHeight - window.innerHeight;
            return JSON.stringify({ y: Math.round(window.scrollY), gap: Math.round(first.top - b.getBoundingClientRect().bottom), atEnd: window.scrollY >= end - 1, moving: b.getAnimations({ subtree: true }).length > 0 });
          });
          const still = now === last && !JSON.parse(now).moving;
          last = now;
          return still;
        },
        { message: `${at}: the page at rest`, intervals: [150] },
      )
      .toBe(true);
    const landed = JSON.parse(last) as { gap: number; atEnd: boolean };
    expect(landed.gap, `${at}: the first game clear of the bar`).toBeGreaterThanOrEqual(0);
    expect(landed.gap <= 12 || landed.atEnd, `${at}: the first game just under it (${landed.gap}px)`).toBe(true);
  }
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 16 } });
});

test("under 700px tall, the page's scroll padding counts the top bar's first row from the moment the focus comes into the bar, which keeps that row while it has the focus", async ({ page }) => {
  // So what lands in the frame the focus comes back in (a filter sheet's list, its Filters handed the
  // focus back) stops under the whole bar, not under the row that stays with the focus (R6 review BX2).
  await page.goto(`/players/${await idOf(page, "TOP")}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("mobile-topbar")).toHaveAttribute("data-slides", "row");
  // Measured in one go: no frame passes between the focus coming in and the reading.
  const m = await page.evaluate(() => {
    const pad = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
    const before = pad();
    document.querySelector<HTMLElement>("[data-testid=account-sheet-button]")!.focus({ preventScroll: true });
    return { before, after: pad(), row: document.querySelector<HTMLElement>("[data-testid=mobile-topbar-row]")!.offsetHeight };
  });
  expect(m.row).toBeGreaterThan(0);
  expect(m.after - m.before, "the row, counted as the focus comes in").toBe(m.row);
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
  // One panel, a row per player, one column; the whole row is one link (the player Peek, PLAN S8a; the name opens the profile).
  const rows = page.getByTestId("players-directory").getByTestId("player-card-item");
  await expect(rows.first()).toBeVisible();
  const boxes = await rows.evaluateAll((els) => els.map((e) => ({ left: Math.round(e.getBoundingClientRect().left), height: e.getBoundingClientRect().height, link: e.querySelector("a[data-row-link]")!.getBoundingClientRect().height })));
  expect(new Set(boxes.map((b) => b.left)).size, "one column").toBe(1);
  for (const b of boxes) {
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.link, "the link covers its row").toBeGreaterThanOrEqual(b.height - 2);
  }
  // Recent form: a row per member, at least 64px (two lines, three when the gap takes its own line):
  // the record, dates and gap under the name, the role on the picture. One link covers the whole
  // row, so a tap anywhere on it (not only on the name) opens the member's Peek (PLAN S8a); the name opens the profile.
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
  await expect(page).toHaveURL(new RegExp(`/leaderboards\\?player=${id}$`));
  await expect(page.getByTestId("player-detail-hero")).toBeVisible();
});
