import { devices, expect, test, type Browser, type Locator, type Page } from "./test";
import { openMatchWindow } from "./match-history";
import { CLEARANCE, expectClearCorner, untilStill } from "./modal-corner";
import { openDanger, openPerson } from "./member-account";

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

/**
 * A task dialog's width (dialog.tsx, TASK_DIALOG_REM): from sm (640px) its size, capped by the window
 * less its margin (2rem, 3rem for Card Studio); below sm the phone's whole width, never wider.
 */
async function expectTaskWidth(page: Page, win: Locator, rem: number, marginRem: number, what: string) {
  const vw = page.viewportSize()!.width;
  await untilStill(page);
  const w = (await win.boundingBox())!.width;
  const want = vw < 640 ? vw : Math.min(rem * 16, vw - marginRem * 16);
  expect(Math.abs(w - want), `${what} at ${vw}px: ${Math.round(w)}px, not ${Math.round(want)}px`).toBeLessThanOrEqual(1.5);
  expect(w, `${what}: never wider than the window`).toBeLessThanOrEqual(vw);
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

test("Team's player window: previous and next set apart from the close button, the hero clear of them", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "from 640px the Team player opens as a docked Peek, its controls in its own header (detail-panel.spec.ts)");
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

test("Card Studio keeps the corner clear", async ({ page }) => {
  const id = await topPlayer(page);
  await page.goto(`/players/${id}`);
  const customise = page.getByTestId("profile-header").getByTestId("customise-card");
  const studio = page.getByTestId("card-studio-window");
  await customise.click();
  await expect(studio.getByTestId("card-studio")).toBeVisible();
  await expectClearCorner(page);
  // Card Studio is 100rem at most since Release 17 (the preview 40–50% of it), the window less 3rem below that.
  await expectTaskWidth(page, studio, 100, 3, "Card Studio");
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

test("a plain dialog keeps 12 px between its title and the close button; the task dialogs' widths: a picker 42rem, a form 30rem, each capped by the window", async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/admin/people/access");
  const open = page.getByRole("button", { name: "New level" });
  const dialog = page.locator("dialog[open]");
  await expect(async () => {
    if (!(await dialog.isVisible())) await open.click({ timeout: 2_000 });
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await untilStill(page);
  // Measured on screen: from the title's block (it takes all the width the header leaves it) to the close button.
  const room = await dialog.evaluate((d) => d.querySelector("[data-testid=dialog-close]")!.getBoundingClientRect().left - d.querySelector("[id^=dialog-title]")!.parentElement!.getBoundingClientRect().right);
  expect(room).toBeGreaterThanOrEqual(CLEARANCE);
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) {
    const close = (await dialog.getByTestId("dialog-close").boundingBox())!;
    expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // Its size (a picker: an editor with a table), 42rem; a confirmation's (a form), 30rem.
  await open.click();
  await expect(dialog).toBeVisible();
  await expectTaskWidth(page, dialog, 42, 2, "A new access level (picker)");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.goto("/admin/people");
  const view = await openPerson(page, "Demo Halfway");
  // Deactivate's question (a confirmation, nothing done until it is answered; Escape cancels it).
  await openDanger(view);
  await view.getByTestId("person-danger").getByRole("button", { name: "Deactivate" }).click();
  const confirm = page.getByRole("dialog", { name: /^Deactivate .+\?$/ });
  await expect(confirm).toBeVisible();
  await expectTaskWidth(page, confirm, 30, 2, "Deactivate's confirmation (form)");
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  // Cancelled: still active (Reactivate would show in Deactivate's place).
  await expect(view.getByTestId("person-danger").getByRole("button", { name: "Deactivate" })).toBeVisible();
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
