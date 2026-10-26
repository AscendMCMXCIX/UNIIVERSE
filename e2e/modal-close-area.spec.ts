import { devices, expect, test, type Browser, type Locator, type Page } from "./test";

/*
  Every window keeps its close button's corner to itself (the shared DetailModal and Dialog): nothing
  in the window comes within 12 px of the corner's controls (the close button, and the window's own
  Back or previous / next to its left, past a divider), the close button is a 44 px target on touch
  screens, and Escape closes the window with focus back on what opened it. The Encounters window's
  OP.GG link sits under the player's name, away from the close button. Demo roster, in-memory only.
*/

const CLEARANCE = 12;

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** The open window's corner, measured once its opening motion (which scales it) is over. */
async function corner(page: Page) {
  await expect.poll(() => page.evaluate(() => document.querySelector("dialog[open]")?.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length ?? -1)).toBe(0);
  return page.evaluate(() => {
    const d = document.querySelector("dialog[open]")!;
    const cluster = d.querySelector<HTMLElement>("[data-testid=modal-controls]")!;
    const close = cluster.querySelector<HTMLElement>('button[aria-label="Close"]')!;
    const k = cluster.getBoundingClientRect();
    const c = close.getBoundingClientRect();
    const w = d.getBoundingClientRect();
    const seen = (e: Element) => {
      const r = e.getBoundingClientRect();
      return r.width > 0.5 && r.height > 0.5 && getComputedStyle(e).visibility !== "hidden" && !e.closest(".sr-only");
    };
    // Whatever can be used or read: controls, and every element with text of its own.
    const content = [...d.querySelectorAll("*")].filter((e) => !cluster.contains(e) && !e.contains(cluster) && seen(e) && (e.matches("a, button, input, select, textarea, [role=tab]") || [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())));
    const gap = (r: DOMRect) => Math.max(0, k.left - r.right, r.left - k.right, k.top - r.bottom, r.top - k.bottom);
    let nearest = { gap: Infinity, what: "" };
    for (const e of content) {
      const g = gap(e.getBoundingClientRect());
      if (g < nearest.gap) nearest = { gap: g, what: e.getAttribute("data-testid") ?? e.textContent!.trim().slice(0, 40) };
    }
    const nav = [...cluster.children].filter((e) => e !== close && e.getAttribute("data-testid") !== "modal-controls-divider" && e.getBoundingClientRect().width > 0);
    return {
      nearest,
      close: { width: c.width, height: c.height, fromRight: w.right - c.right, fromTop: c.top - w.top, rightmost: c.right >= k.right - 0.5 },
      // From the window's own navigation to the close button, and whether a divider sets them apart.
      navGap: nav.length ? Math.min(...nav.map((e) => c.left - e.getBoundingClientRect().right)) : null,
      divider: !!cluster.querySelector("[data-testid=modal-controls-divider]"),
      clusterLeft: k.left,
    };
  });
}

async function expectClearCorner(page: Page, { nav = false }: { nav?: boolean } = {}) {
  const m = await corner(page);
  expect(m.nearest.gap, `nearest content to the corner: ${m.nearest.what}`).toBeGreaterThanOrEqual(CLEARANCE - 0.5);
  // The close button is the corner's last control, in the top-right corner.
  expect(m.close.rightmost).toBe(true);
  expect(m.close.fromRight).toBeLessThanOrEqual(16);
  expect(m.close.fromTop).toBeLessThanOrEqual(16);
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) expect(Math.min(m.close.width, m.close.height)).toBeGreaterThanOrEqual(44);
  if (nav) {
    expect(m.divider).toBe(true);
    expect(m.navGap!).toBeGreaterThanOrEqual(16);
  } else expect(m.divider).toBe(false);
  return m;
}

/** Escape closes the window, and focus goes back to what opened it. */
async function expectEscapeReturnsTo(page: Page, window: Locator, opener: Locator) {
  await page.keyboard.press("Escape");
  await expect(window).toBeHidden();
  await expect(opener).toBeFocused();
}

async function topPlayer(page: Page) {
  await page.goto("/team");
  return (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
}

test("the match window: the close button alone in its corner, Escape back to the game", async ({ page }) => {
  await page.goto(`/players/${await topPlayer(page)}/matches`);
  const card = page.getByTestId("match-card").first();
  await card.click({ position: { x: 24, y: 16 } });
  const win = page.getByTestId("match-detail");
  await expect(win.getByTestId("match-result")).toBeVisible();
  await expect(win.getByTestId("match-detail-close")).toBeFocused();
  await expectClearCorner(page);
  await expectEscapeReturnsTo(page, win, card.getByTestId("match-row"));
});

test("Encounters: OP.GG under the player's name, and the match window's Back set apart from the close button", async ({ page }) => {
  // Demo games have no real Riot server, so the window would have no OP.GG link: the test gives the
  // window's answer one (an address in OP.GG's form), to see where the link is placed.
  const OPGG = "https://op.gg/lol/summoners/oce/Demo%20Rival-OCE";
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) return route.continue();
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: body.includes('"renamed":') ? body.replace('"opgg":null', `"opgg":"${OPGG}"`) : body });
  });
  await page.goto(`/players/${await topPlayer(page)}/matches?view=encounters`);
  await expect(page.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
  const row = page.getByTestId("encounter-row").first();
  await row.click();
  const win = page.getByTestId("encounter-detail");
  await expect(win.getByTestId("encounter-detail-records")).toBeVisible();
  const m = await expectClearCorner(page);
  // The link is in the name's column: under the summary, left of the corner, and opens a new tab.
  const opgg = win.getByTestId("encounter-opgg");
  await expect(opgg).toHaveAttribute("href", OPGG);
  await expect(opgg).toHaveAttribute("target", "_blank");
  const [link, summary] = [(await opgg.boundingBox())!, (await win.getByTestId("encounter-detail-summary").boundingBox())!];
  expect(link.y).toBeGreaterThanOrEqual(summary.y + summary.height);
  expect(link.x + link.width).toBeLessThanOrEqual(m.clusterLeft - CLEARANCE);
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) expect(link.height).toBeGreaterThanOrEqual(44);

  // A game opens the match window with Back, left of the close button past a divider.
  await win.getByTestId("encounter-game").first().click();
  const match = page.getByTestId("match-detail");
  await expect(match.getByTestId("match-result")).toBeVisible();
  await expectClearCorner(page, { nav: true });
  await match.getByTestId("match-detail-back").click();
  await expect(win.getByTestId("encounter-detail-records")).toBeVisible();
  await expectEscapeReturnsTo(page, win, row);
});

test("Team's player window: previous and next set apart from the close button, the hero clear of them", async ({ page }) => {
  await page.goto("/team");
  const open = page.getByTestId("lineup-row-TOP").getByTestId("open-player-detail");
  await open.click();
  const win = page.getByTestId("player-detail");
  await expect(win.getByTestId("player-detail-hero")).toBeVisible();
  await expectClearCorner(page, { nav: true });
  await win.getByTestId("detail-next").click();
  await expectClearCorner(page, { nav: true });
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
});

test("the champion window and Player Card Studio keep the corner clear", async ({ page }) => {
  const id = await topPlayer(page);
  await page.goto(`/players/${id}`);
  const inspect = page.getByTestId("primary-pool").getByTestId("pool-item").first().getByTestId("pool-inspect");
  const champion = page.getByTestId("champion-detail");
  // The pool's buttons work once the page is interactive.
  await expect(async () => {
    if (!(await champion.isVisible())) await inspect.click({ timeout: 2_000 });
    await expect(champion).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(champion.getByTestId("champion-detail-name")).toBeVisible();
  await expectClearCorner(page);
  await expectEscapeReturnsTo(page, champion, inspect);

  const customise = page.getByTestId("profile-header").getByTestId("customise-card");
  const studio = page.getByTestId("card-studio-window");
  await customise.click();
  await expect(studio.getByTestId("card-studio")).toBeVisible();
  await expectClearCorner(page);
  await expectEscapeReturnsTo(page, studio, customise);
});

test("the sign-in window on the public page keeps the corner clear", async ({ browser, baseURL }, info) => {
  const { viewport, isMobile, hasTouch, deviceScaleFactor } = info.project.use;
  const context = await browser.newContext({ viewport, isMobile, hasTouch, deviceScaleFactor });
  await context.addCookies([{ name: "uniiverse_guest", value: "1", url: baseURL! }]);
  const page = await context.newPage();
  await page.goto("/public");
  const signIn = page.getByTestId("public-sign-in");
  const win = page.getByTestId("sign-in-window");
  await expect(async () => {
    if (!(await win.isVisible())) await signIn.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(win.getByLabel("Username")).toBeFocused();
  await expectClearCorner(page);
  await expectEscapeReturnsTo(page, win, signIn);
  await context.close();
});

test("a plain dialog keeps 12 px between its title and the close button", async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/admin/people");
  const open = page.locator("[data-testid=open-access]:not([disabled])").first();
  const dialog = page.locator("dialog[open]");
  await expect(async () => {
    if (!(await dialog.isVisible())) await open.click({ timeout: 2_000 });
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // The close button's negative margin (it lines its icon up with the padding) still leaves the space.
  const room = await dialog.getByTestId("dialog-close").evaluate((b) => parseFloat(getComputedStyle(b.parentElement!).columnGap) + parseFloat(getComputedStyle(b).marginLeft));
  expect(room).toBeGreaterThanOrEqual(CLEARANCE);
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) {
    const close = (await dialog.getByTestId("dialog-close").boundingBox())!;
    expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

async function sideways(browser: Browser, baseURL: string): Promise<Page> {
  const { defaultBrowserType: _, ...options } = devices["iPhone 15 landscape"];
  const context = await browser.newContext(options);
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL }]);
  return context.newPage();
}

test("held sideways, the floating corner keeps clear of the headers too", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "a phone held sideways, once");
  const page = await sideways(browser, baseURL!);
  await page.goto(`/players/${await topPlayer(page)}/matches`);
  await page.getByTestId("match-card").first().click({ position: { x: 24, y: 16 } });
  await expect(page.getByTestId("match-result")).toBeVisible();
  await expectClearCorner(page);
  await page.keyboard.press("Escape");
  await page.goto("/team");
  await page.getByTestId("lineup-row-TOP").getByTestId("open-player-detail").click();
  await expect(page.getByTestId("player-detail-hero")).toBeVisible();
  await expectClearCorner(page, { nav: true });
  await page.context().close();
});
