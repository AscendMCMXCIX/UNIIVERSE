import { devices, expect, test, type Browser, type Locator, type Page } from "./test";
import { openMatchWindow } from "./match-history";
import { CLEARANCE, expectClearCorner, untilStill } from "./modal-corner";

/*
  Every window keeps its close button's corner to itself (the shared DetailModal and Dialog): nothing
  in the window comes within 12 px of the corner's controls (the close button, and the window's own
  Back or previous / next to its left, past a divider), the close button is a 44 px target on touch
  screens, and Escape closes the window with focus back on what opened it. The Encounters window's
  OP.GG link sits with the player's name, away from the close button. Demo roster, in-memory only.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

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

test("the match window: the close button alone in its corner, Escape closes it", async ({ page }) => {
  // A link to a game that is not on the page shown opens it in the window (lists open their games
  // under their cards).
  const win = await openMatchWindow(page);
  await expect(win.getByTestId("match-result")).toBeVisible();
  await expect(win.getByTestId("match-detail-close")).toBeFocused();
  await expectClearCorner(page);
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
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
  await untilStill(page);
  // Measured on screen: from the title's block (it takes all the width the header leaves it) to the close button.
  const room = await dialog.evaluate((d) => d.querySelector("[data-testid=dialog-close]")!.getBoundingClientRect().left - d.querySelector("#dialog-title")!.parentElement!.getBoundingClientRect().right);
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
  await openMatchWindow(page);
  await expect(page.getByTestId("match-result")).toBeVisible();
  await expectClearCorner(page);
  await page.keyboard.press("Escape");
  await page.goto("/team");
  await page.getByTestId("lineup-row-TOP").getByTestId("open-player-detail").click();
  await expect(page.getByTestId("player-detail-hero")).toBeVisible();
  await expectClearCorner(page, { nav: true });
  await page.context().close();
});
