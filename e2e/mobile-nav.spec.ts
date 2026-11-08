import { expect, test, type Page } from "./test";
import { memberContext } from "./member-account";

/*
  The phone frame (docs/MOBILE.md): five destinations in the bottom tab bar, a top bar that says where
  you are (the team's mark, or Back named after where it leads, and the page's title once its heading
  has scrolled away), a profile's sections under it, the account sheet behind the avatar (which
  answers a tap made before the page's code has run), filters in a sheet with chips for what is
  narrowed, and a game opened as a whole screen that Back closes. Phones only, except the tests
  tagged @tablet (the tablet's menu drawer); in-memory demo roster.
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

test("Back from a teammate's profile returns to where you came from, named after it; opened directly, it leads to Players", async ({ page }) => {
  await page.goto("/players");
  await page.getByTestId("players-list").getByTestId("player-row").filter({ hasText: "Demo Mid" }).click();
  await expect(page).toHaveURL(/\/players\/[^/]+$/);
  // A teammate's profile belongs to Players.
  await expect(tabBar(page).getByTestId("tab-players")).toHaveAttribute("aria-current", "page");
  const back = page.getByTestId("mobile-back");
  await expect(back).toContainText("Players");
  await back.click();
  await expect(page).toHaveURL(/\/players$/);

  // From Leaderboards, Back is named after it.
  await page.goto("/leaderboards");
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  await page.getByTestId("form-row").first().click();
  await expect(page).toHaveURL(/\/players\/[^/]+$/);
  await expect(back).toContainText("Team Leaderboards");
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

test("the avatar opens the account sheet: Resources, Settings, Install App and Sign out live there", async ({ page }) => {
  await page.goto("/team");
  // No menu drawer on a phone: the tablet's menu button is not shown.
  await expect(page.getByTestId("menu-button")).toBeHidden();
  await page.getByTestId("account-sheet-button").click();
  const sheet = page.getByTestId("account-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Resources" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(sheet.getByText("Not endorsed by Riot Games.")).toBeVisible();
  // The sheet's rows are finger-sized.
  expect((await sheet.getByRole("link", { name: "Settings" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await sheet.getByRole("link", { name: "Resources" }).click();
  await expect(page).toHaveURL(/\/resources$/);
  await expect(sheet).toHaveCount(0);
  // Resources has no tab here, so it is a page reached from another: Back.
  await expect(page.getByTestId("mobile-back")).toBeVisible();
});

/**
 * How the open account sheet sits: whether its body scrolls, whether the whole sheet scrolls as one
 * instead (large text), whether it is docked to the bottom edge, its top, whether the patch and
 * Riot's notice end the body whole, and the clearance of the footer's actions (the mode switch,
 * Sign out) from the sheet's bottom edge.
 */
async function sheetFit(page: Page) {
  const sheet = page.getByTestId("account-sheet");
  await expect(sheet).toBeVisible();
  // Past the opening motion (220ms), so the box is where it rests.
  await expect(async () => expect(await sheet.evaluate((d) => getComputedStyle(d).transform)).toBe("none")).toPass();
  return sheet.evaluate((d) => {
    const body = d.querySelector<HTMLElement>("[data-sheet-scroll]")!;
    const box = d.getBoundingClientRect();
    const inner = body.getBoundingClientRect();
    const notes = d.querySelector("[data-testid=account-sheet-notes]")!.getBoundingClientRect();
    const actions = d.querySelector("[data-testid=account-sheet-actions]")!.getBoundingClientRect();
    return {
      scrolls: body.scrollHeight > body.clientHeight + 1,
      asOne: d.hasAttribute("data-flow"),
      docked: Math.abs(box.bottom - innerHeight) <= 1,
      top: box.top,
      width: box.width,
      notesEndBody: notes.top >= inner.top - 1 && notes.bottom <= inner.bottom + 1,
      actionsUnderBody: actions.top >= inner.bottom - 1,
      clearance: box.bottom - actions.bottom,
    };
  });
}

test("the account sheet fits a small phone in one screen, in Player Mode and Admin Mode: nothing scrolls, nothing is cut off", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const path of ["/team", "/admin"]) {
    if (path === "/admin") await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
    await page.goto(path);
    await page.getByTestId("account-sheet-button").click();
    const sheet = page.getByTestId("account-sheet");
    const fit = await sheetFit(page);
    expect(fit.scrolls).toBe(false);
    expect(fit.asOne).toBe(false);
    expect(fit.docked).toBe(true);
    // A strip of the page stays above it, to tap away.
    expect(fit.top).toBeGreaterThan(40);
    // The patch and Riot's notice end the body; the actions sit in the footer under it, at least
    // 1rem from the bottom edge, as a body's last line (the last line once sat on it in a browser).
    expect(fit.notesEndBody).toBe(true);
    expect(fit.actionsUnderBody).toBe(true);
    expect(fit.clearance).toBeGreaterThanOrEqual(16);
    if (path === "/admin") {
      // Admin Mode: the admin pages the tab bar does not hold, and nothing the tab bar repeats.
      await expect(sheet.getByRole("link", { name: "Audit Logs" })).toBeVisible();
      await expect(sheet.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
      await expect(sheet.getByTestId("mode-switch")).toBeInViewport();
    } else {
      await expect(sheet.getByRole("link", { name: "Resources" })).toBeInViewport();
    }
    await expect(sheet.getByText("Not endorsed by Riot Games.")).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId("account-sheet-button")).toBeFocused();
  }
});

test("held sideways, the account sheet stays docked at the bottom edge, fits, and a tap above it closes it", async ({ page }) => {
  await page.setViewportSize({ width: 734, height: 343 });
  await page.goto("/team");
  await page.getByTestId("account-sheet-button").click();
  const sheet = page.getByTestId("account-sheet");
  const fit = await sheetFit(page);
  // It used to become a centred window as tall as the screen, scrolling as a whole.
  expect(fit.docked).toBe(true);
  expect(fit.scrolls).toBe(false);
  expect(fit.asOne).toBe(false);
  expect(fit.clearance).toBeGreaterThanOrEqual(16);
  expect(fit.top).toBeGreaterThan(24);
  expect(fit.width).toBeLessThanOrEqual(704);
  await page.mouse.click(367, Math.round(fit.top / 2));
  await expect(sheet).toHaveCount(0);
});

test("the account sheet can be pulled down to close; a short pull settles back, and the page behind never moves", async ({ page, context }) => {
  await page.goto("/players");
  await page.evaluate(() => window.scrollTo(0, 300));
  const scrolled = await page.evaluate(() => scrollY);
  const sheet = page.getByTestId("account-sheet");
  const cdp = await context.newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  async function pull(x: number, from: number, to: number) {
    await touch("touchStart", x, from);
    for (let i = 1; i <= 8; i++) {
      await touch("touchMove", x, from + ((to - from) * i) / 8);
      await page.waitForTimeout(25);
    }
    await page.waitForTimeout(150); // a pause before letting go: no flick
    await touch("touchEnd", x, to);
  }
  await page.getByTestId("account-sheet-button").click();
  await sheetFit(page);
  const box = (await sheet.boundingBox())!;
  // A short pull on the handle: the sheet settles back where it was.
  await pull(box.x + box.width / 2, box.y + 8, box.y + 48);
  await expect(async () => expect(Math.abs((await sheet.boundingBox())!.y - box.y)).toBeLessThan(2)).toPass();
  // Drags on the dimmed page above it move nothing behind it.
  await pull(box.width / 2, 40, 160);
  await pull(box.width / 2, 160, 40);
  await expect(sheet).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  // A long pull on its header closes it; the page is where it was.
  await pull(box.x + box.width / 2, box.y + 40, box.y + 40 + Math.min(220, box.height));
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
});

test("a tap on the avatar before the page's code has run is kept: the avatar shows pressed, and the sheet opens once the code runs, exactly once", async ({ page }) => {
  await page.addInitScript(COUNT_OPENINGS);
  const scripts = await holdScripts(page);
  await page.goto("/team", { waitUntil: "domcontentloaded" });
  const avatar = page.getByTestId("account-sheet-button");
  const sheet = page.getByTestId("account-sheet");
  // The server's page, drawn, with none of the app's code: the tap is kept, and a second one too
  // queues nothing more.
  await avatar.tap();
  await avatar.tap();
  await expect(avatar).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => window.__earlyTaps)).toEqual(["sheet"]);
  await page.waitForTimeout(300);
  await expect(sheet).toHaveCount(0);
  scripts.release();
  await expect(sheet).toBeVisible();
  await expect(avatar).not.toHaveAttribute("aria-busy");
  // Exactly once: one opening, and still open a moment later.
  await page.waitForTimeout(600);
  await expect(sheet).toBeVisible();
  expect(await openings(page)).toEqual({ "account-sheet": 1 });
  // From then on the script stands aside, and the avatar works as ever.
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await avatar.tap();
  await expect(sheet).toBeVisible();
  expect(await openings(page)).toEqual({ "account-sheet": 2 });
});

test("at a 200% text size the account sheet keeps its header and Sign out in view, and only its body scrolls", async ({ page, browser }) => {
  // A member's account: Sign out is offered only with accounts (the demo's local owner has none).
  // The smallest phone, where large text leaves the sheet's body least room.
  const member = await memberContext(browser, page, { width: 320, height: 568 }, { base: "Large" });
  const phone = member.page;
  await phone.goto("/team");
  await phone.addStyleTag({ content: "html { font-size: 200% !important; }" });
  // From the keyboard: at this size the top bar is wider than the phone and the avatar sits past its
  // right edge (the bar's own text scaling, apart from the sheet's).
  await phone.getByTestId("account-sheet-button").focus();
  await phone.keyboard.press("Enter");
  const sheet = phone.getByTestId("account-sheet");
  await expect(sheet).toBeVisible();
  await expect(async () => expect(await sheet.evaluate((d) => getComputedStyle(d).transform)).toBe("none")).toPass();
  const fit = () =>
    sheet.evaluate((d) => {
      const body = d.querySelector<HTMLElement>("[data-sheet-scroll]")!;
      const box = d.getBoundingClientRect();
      const shown = (selector: string) => {
        const r = d.querySelector(selector)!.getBoundingClientRect();
        return r.top >= Math.max(0, box.top) - 1 && r.bottom <= Math.min(innerHeight, box.bottom) + 1;
      };
      return {
        onScreen: box.top >= 0 && box.bottom <= innerHeight + 1,
        sheetScrolls: d.scrollHeight > d.clientHeight + 1,
        bodyScrolls: body.scrollHeight > body.clientHeight + 1,
        title: shown("#account-sheet-title"),
        close: shown("[data-testid=account-sheet-close]"),
        signOut: shown("[data-testid=sign-out]"),
        signOutInBody: body.contains(d.querySelector("[data-testid=sign-out]")),
      };
    });
  expect(await fit()).toEqual({ onScreen: true, sheetScrolls: false, bodyScrolls: true, title: true, close: true, signOut: true, signOutInBody: false });
  // The body scrolls to its last line; the header and Sign out stay where they are.
  const signOut = (await sheet.getByTestId("sign-out").boundingBox())!;
  await sheet.locator("[data-sheet-scroll]").evaluate((b) => b.scrollTo(0, b.scrollHeight));
  await expect(sheet.getByText("Not endorsed by Riot Games.")).toBeInViewport();
  expect((await sheet.getByTestId("sign-out").boundingBox())!.y).toBe(signOut.y);
  expect(await fit()).toMatchObject({ title: true, close: true, signOut: true });
  await member.context.close();
});

/**
 * Each tile of the open account sheet, brought to the top of whatever scrolls (its body, or the whole
 * sheet while it scrolls as one), between there and the footer when the footer is in the way: is it
 * whole on screen?
 */
async function tilesShownWhole(page: Page): Promise<boolean[]> {
  return page.getByTestId("account-sheet").evaluate((d) => {
    const scroller = d.matches("[data-sheet-scroll]") ? (d as HTMLElement) : d.querySelector<HTMLElement>("[data-sheet-scroll]")!;
    const footer = d.querySelector("[data-testid=account-sheet-actions]")!.parentElement!;
    const band = () => {
      const s = scroller.getBoundingClientRect();
      const f = footer.getBoundingClientRect();
      const bottom = Math.min(innerHeight, s.bottom);
      return { top: Math.max(0, s.top), bottom: f.top < bottom && f.bottom > s.top ? Math.min(bottom, f.top) : bottom };
    };
    const whole = [...d.querySelectorAll<HTMLElement>("nav a, nav button")].map((tile) => {
      scroller.scrollTop += tile.getBoundingClientRect().top - band().top - 1;
      const r = tile.getBoundingClientRect();
      const b = band();
      return r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
    });
    scroller.scrollTop = 0;
    return whole;
  });
}

test("with large text on a phone held sideways, the account sheet scrolls as one where its header and footer would leave the body a strip: every tile can be shown whole", async ({ page, context, baseURL }) => {
  const cases = [
    // 125%: the body keeps room for a tile, so it scrolls alone between the header and the footer.
    { size: "125% text", viewport: { width: 734, height: 343 }, root: 125, asOne: false },
    // The header and footer took 63% of the sheet at 150% and 84% at 200%, and no tile could be
    // shown whole in the strip between them.
    { size: "150% text", viewport: { width: 734, height: 343 }, root: 150, asOne: true },
    { size: "200% text", viewport: { width: 734, height: 343 }, root: 200, asOne: true },
    // Safari's page zoom at 150% on an iPhone 15 held sideways: the page sees a smaller screen.
    { size: "page zoom 150%", viewport: { width: 489, height: 229 }, root: 100, asOne: true },
  ];
  for (const { size, viewport, root, asOne } of cases) {
    await page.setViewportSize(viewport);
    for (const mode of ["player", "admin"] as const) {
      const where = `${size}, ${mode === "admin" ? "Admin Mode" : "Player Mode"}`;
      await context.addCookies([{ name: "uniiverse_view", value: mode, url: baseURL! }]);
      await page.goto(mode === "admin" ? "/admin" : "/team");
      if (root !== 100) await page.addStyleTag({ content: `html { font-size: ${root}% !important; }` });
      await page.getByTestId("account-sheet-button").focus();
      await page.keyboard.press("Enter");
      const sheet = page.getByTestId("account-sheet");
      await expect(sheet).toBeVisible();
      await expect(async () => expect(await sheet.evaluate((d) => getComputedStyle(d).transform)).toBe("none")).toPass();
      if (asOne) await expect(sheet, where).toHaveAttribute("data-flow", "true");
      else await expect(sheet, where).not.toHaveAttribute("data-flow");
      // Docked at the bottom edge, its header at the top of the first screen.
      const box = (await sheet.boundingBox())!;
      expect(Math.abs(box.y + box.height - viewport.height), where).toBeLessThanOrEqual(1);
      await expect(sheet.locator("#account-sheet-title")).toBeInViewport();
      expect(await tilesShownWhole(page), where).not.toContain(false);
      // At the end of what scrolls: the patch, Riot's notice and the actions, clear of the edge.
      await (asOne ? sheet : sheet.locator("[data-sheet-scroll]")).evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await expect(sheet.getByText("Not endorsed by Riot Games.")).toBeInViewport();
      await expect(sheet.getByTestId("mode-switch")).toBeInViewport({ ratio: 1 });
      const actions = (await sheet.getByTestId("account-sheet-actions").boundingBox())!;
      expect(box.y + box.height - (actions.y + actions.height), where).toBeGreaterThanOrEqual(16);
      // One scroll area, never one inside another: while the sheet scrolls as one, its body does not.
      const scrollers = await sheet.evaluate((d) => [d, ...d.querySelectorAll<HTMLElement>("*")].filter((el) => el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)).length);
      expect(scrollers, where).toBe(1);
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
    }
  }
});

test.describe("a tablet before the page's code has run", () => {
  // The page is loaded twice; a service worker would serve the second load's navigation itself.
  test.use({ serviceWorkers: "block" });

  test("a tap on the menu button or on the avatar is kept, shown pressed, and opens the drawer or the account menu once the code runs, exactly once", { tag: "@tablet" }, async ({ page }) => {
    await page.addInitScript(COUNT_OPENINGS);
    let scripts = await holdScripts(page);
    await page.goto("/team", { waitUntil: "domcontentloaded" });
    const menuButton = page.getByTestId("menu-button");
    await menuButton.tap();
    await menuButton.tap();
    await expect(menuButton).toHaveAttribute("aria-busy", "true");
    expect(await page.evaluate(() => window.__earlyTaps)).toEqual(["drawer"]);
    scripts.release();
    const drawer = page.getByTestId("mobile-drawer-panel");
    await expect(drawer).toBeVisible();
    await expect(menuButton).not.toHaveAttribute("aria-busy");
    await page.waitForTimeout(600);
    await expect(drawer).toBeVisible();
    expect(await openings(page)).toEqual({ "mobile-drawer": 1 });
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    // The account menu behind the avatar goes the same way (its other trigger, the sidebar's tile,
    // is on the page too, hidden at this width: the tap opens the one tapped).
    await page.unrouteAll({ behavior: "ignoreErrors" });
    scripts = await holdScripts(page);
    await page.reload({ waitUntil: "domcontentloaded" });
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

test("Sign out from the tablet's menu is told to the browser's other tabs, and the next thing they do lands on sign-in", { tag: "@tablet" }, async ({ page, browser }) => {
  const member = await memberContext(browser, page, { width: 768, height: 1024 }, { base: "Tabs" });
  const [first, other] = [member.page, await member.context.newPage()];
  await first.goto("/team");
  await other.goto("/team");
  await expect(other.getByTestId("menu-button")).toBeVisible();
  // The other tab listens where the account guard does (account-guard.tsx) for the announcement.
  await other.evaluate(() => {
    const heard: string[] = [];
    (window as unknown as { __heard: string[] }).__heard = heard;
    new BroadcastChannel("uniiverse-account").onmessage = (e) => heard.push(String(e.data));
  });
  await first.getByTestId("menu-button").click();
  await first.getByTestId("mobile-drawer-panel").getByRole("button", { name: "Sign out" }).click();
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

test("a page's views share one track on the narrowest phones, a long label by its start and still named in full", async ({ page }) => {
  await page.goto("/leaderboards");
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  const form = page.getByTestId("leaderboards-tab-form");
  const records = page.getByTestId("leaderboards-tab-records");
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 667 });
    const [a, b] = [(await form.boundingBox())!, (await records.boundingBox())!];
    expect(Math.abs(a.y - b.y), `one line at ${width}px`).toBeLessThan(1);
    expect(b.x + b.width).toBeLessThanOrEqual(width);
  }
  await expect(records).toHaveAccessibleName("Records & achievements");
  await expect(records).toHaveText("Records & achievements");
  // What shows is "Records": the rest of the name is read out but takes no room.
  expect((await records.getByText("& achievements").boundingBox())!.width).toBeLessThanOrEqual(1);
});

test("Players and Leaderboards read as lists on a phone: a row per player, a row per member, each row one tap", async ({ page }) => {
  await page.goto("/players");
  const rows = page.getByTestId("players-list").getByTestId("player-row");
  await expect(rows.first()).toBeVisible();
  await expect(page.getByTestId("players-directory")).toBeHidden();
  for (const h of await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
  // Recent form: a row per member, the role, record and dates under the name; a tap anywhere on the
  // row (not only on the name) opens the member's profile.
  await page.goto("/leaderboards");
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  const row = page.getByTestId("form-row").first();
  await expect(row.getByTestId("form-meta")).toBeVisible();
  await expect(page.getByTestId("form-heads")).toBeHidden();
  const box = (await row.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  const id = await row.getAttribute("data-player-id");
  // The win rate at the row's right end: no link drawn there, but the row's link covers it.
  await page.touchscreen.tap(box.x + box.width - 12, box.y + box.height / 2);
  await expect(page).toHaveURL(new RegExp(`/players/${id}$`));
});
