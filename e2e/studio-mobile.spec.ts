import { devices, expect, test, type Page } from "./test";
import { emulateKeyboard, keyboard } from "./keyboard";
import { previewFrame } from "./studio";

/*
  CARD STUDIO ON A PHONE (Chromium's emulation of phones: touch, a mobile viewport and its scale;
  not real devices). The preview above the controls at a useful size, the four section tabs in one
  row, nothing scrolling sideways and only the section scrolling; edits kept between sections and
  when the phone turns; the artwork moved and zoomed by touch in the preview; Cancel, Escape and the
  browser's Back ask before anything is lost; the on-screen keyboard (emulated: the browser's visual
  viewport made shorter, as a phone keyboard does) never covers the field or Save; and a phone held
  sideways keeps the preview beside the controls. Nothing here is saved: Demo Top's card stays as it
  was for the other tests.
*/

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phones: the phone project, and the phone devices below");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** The lineup's Top player: their profile (the demo viewer is the Owner, who may edit any card). */
async function openTopProfile(page: Page) {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}`);
  await expect(page.getByTestId("profile-header")).toBeVisible();
}

async function openStudio(page: Page) {
  const studio = page.getByTestId("card-studio");
  // The button works once the page has hydrated; the Studio's code loads on the first tap.
  await expect(async () => {
    if (!(await studio.isVisible())) await page.getByTestId("profile-header").getByTestId("customise-card").tap({ timeout: 2_000 });
    await expect(studio).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

async function goTo(page: Page, id: string) {
  await page.getByTestId(`studio-tab-${id}`).tap();
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-section", id);
}

/** Cancel with unsaved changes asks first; Discard closes and keeps the saved card. */
async function discard(page: Page) {
  await page.getByTestId("studio-cancel").tap();
  await expect(page.getByTestId("studio-confirm-discard")).toBeVisible();
  await page.getByTestId("studio-confirm-yes").tap();
  await expect(page.getByTestId("card-studio")).toBeHidden();
}

/** Anything in the Studio's window reaching past its sides, anything in it that scrolls sideways, or the page itself. */
const sideways = (page: Page) =>
  page.getByTestId("card-studio-window").evaluate((win) => {
    const edge = win.getBoundingClientRect();
    const out: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push(`page: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    for (const el of [win, ...win.querySelectorAll<HTMLElement>("[data-testid=studio-sections], [data-testid^=studio-panel-], [data-testid=studio-preview-pane]")]) {
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.getAttribute("data-testid")} scrolls sideways (${el.scrollWidth} > ${el.clientWidth})`);
    }
    for (const el of win.querySelectorAll<HTMLElement>("button, input, select, textarea, h3, output")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < edge.left - 1 || r.right > edge.right + 1) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}": ${Math.round(r.left)}–${Math.round(r.right)} outside ${Math.round(edge.left)}–${Math.round(edge.right)}`);
    }
    return out;
  });

/** Every element of the window that scrolls up and down (only the section should). */
const scrollers = (page: Page) =>
  page.getByTestId("card-studio-window").evaluate((win) =>
    [...win.querySelectorAll<HTMLElement>("*")]
      .filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1)
      .map((e) => e.getAttribute("data-testid") ?? e.tagName),
  );

test("the preview above, the four tabs in one row, only the section scrolls, and nothing runs off the screen", async ({ page }) => {
  await openTopProfile(page);
  await openStudio(page);
  const tabs = page.getByRole("tablist", { name: "Card Studio sections" }).getByRole("tab");
  await expect(tabs).toHaveText(["Appearance", "Artwork", "Identity"]);
  const boxes = await tabs.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(new Set(boxes.map(Math.round)).size, "one row of tabs").toBe(1);
  // The preview: the phone's header (the Studio previews the screen it is on), the whole width, never a thumbnail.
  const stage = page.getByTestId("card-preview");
  await expect(stage).toHaveAttribute("data-device", "mobile");
  const width = page.viewportSize()!.width;
  expect((await stage.boundingBox())!.width, "the preview is most of the screen's width").toBeGreaterThanOrEqual(width * 0.8);
  for (const id of ["appearance", "artwork", "identity"]) {
    await goTo(page, id);
    expect(await sideways(page), id).toEqual([]);
    for (const s of await scrollers(page)) expect(s, `${id}: only the section scrolls`).toMatch(/^studio-panel-/);
    // At the section's end the preview, the tabs and Save are still on screen.
    await page.getByTestId(`studio-panel-${id}`).evaluate((e) => e.scrollTo(0, e.scrollHeight));
    await expect(stage).toBeInViewport();
    await expect(page.getByTestId("studio-sections")).toBeInViewport();
    await expect(page.getByTestId("save-card-style")).toBeInViewport({ ratio: 1 });
  }
  // The Team card in its phone carousel's size, scaled to fit the room above the controls (Fit), whole.
  await page.getByTestId("preview-context").selectOption("team");
  await expect(stage).toHaveAttribute("data-context", "team");
  await expect(stage).toHaveAttribute("data-width", String(width - 32));
  await expect(stage).toBeInViewport({ ratio: 1 });
  await page.getByTestId("studio-cancel").tap();
});

test("edits stay across sections, presets keep the artwork and identity, and Undo works by touch", async ({ page }) => {
  await openTopProfile(page);
  await openStudio(page);
  await page.getByTestId("preset-crimson").tap();
  await goTo(page, "identity");
  await page.getByTestId("tagline-input").fill("On the rift");
  await goTo(page, "appearance");
  await expect(page.getByTestId("preset-crimson")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("preset-neon").tap();
  await goTo(page, "identity");
  await expect(page.getByTestId("tagline-input")).toHaveValue("On the rift");
  await expect(previewFrame(page).getByTestId("card-tagline")).toHaveText("“On the rift”");
  await expect(page.getByTestId("card-preview")).toHaveAttribute("data-frame", "premium");
  await page.getByTestId("studio-undo").tap();
  await expect(page.getByTestId("card-preview")).toHaveAttribute("data-frame", "double");
  await page.getByTestId("studio-redo").tap();
  await expect(page.getByTestId("card-preview")).toHaveAttribute("data-frame", "premium");
  await discard(page);
});

test("the artwork moves under a finger and zooms with two in the preview", async ({ page, context }) => {
  await openTopProfile(page);
  await openStudio(page);
  await goTo(page, "artwork");
  await page.getByTestId("preview-context").selectOption("team");
  const surface = page.getByTestId("art-surface");
  await expect(surface).toBeVisible();
  const b = (await surface.boundingBox())!;
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
  const y0 = Number(await surface.getAttribute("data-focus-y"));
  const cdp = await context.newCDPSession(page);
  // One finger, moved up: the picture follows, showing more of its lower part (a higher focal point).
  // (The phone's card is wider than the picture's proportions: at zoom 100% it has room to move up and down only.)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 4 * i }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => Number(await surface.getAttribute("data-focus-y"))).toBeGreaterThan(y0);
  // Two fingers spread apart: the artwork zooms in (the page does not).
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 20, y, id: 1 }, { x: x + 20, y, id: 2 }] });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 20 - 5 * i, y, id: 1 }, { x: x + 20 + 5 * i, y, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await expect.poll(async () => Number(await surface.getAttribute("data-zoom"))).toBeGreaterThan(1);
  await expect(page.getByRole("slider", { name: "Zoom" })).not.toHaveValue("1");
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  await discard(page);
});

test("Cancel, Escape and the browser's Back ask before anything is lost; Reset look is undone by Undo", async ({ page }) => {
  await openTopProfile(page);
  const profile = page.url();
  const header = page.getByTestId("profile-header");
  const savedFrame = await header.getAttribute("data-frame");
  await openStudio(page);
  const preview = page.getByTestId("card-preview");
  const status = page.getByTestId("studio-status");
  await expect(status).not.toHaveText("Unsaved changes");
  await page.getByTestId("preset-neon").tap();
  await expect(preview).toHaveAttribute("data-frame", "premium");
  await expect(status).toHaveText("Unsaved changes");
  // Reset look: at once, no question (Undo brings the look back).
  await page.getByTestId("studio-reset-all").tap();
  await expect(preview).toHaveAttribute("data-frame", "none");
  await page.getByTestId("studio-undo").tap();
  await expect(preview).toHaveAttribute("data-frame", "premium");

  // Cancel with changes asks; Keep editing keeps them.
  await page.getByTestId("studio-cancel").tap();
  const leave = page.getByTestId("studio-confirm-discard");
  await expect(leave).toContainText("Discard your changes?");
  await page.getByTestId("studio-confirm-keep").tap();
  await expect(leave).toBeHidden();
  // Escape (the same close request as Android's back gesture) asks the same.
  await page.keyboard.press("Escape");
  await expect(leave).toBeVisible();
  await page.getByTestId("studio-confirm-keep").tap();
  // The browser's Back (a desktop's button, an iPhone's edge swipe) asks too, and stays on the page.
  await page.goBack();
  await expect(leave).toBeVisible();
  expect(page.url()).toBe(profile);
  await page.getByTestId("studio-confirm-keep").tap();
  await expect(preview).toHaveAttribute("data-frame", "premium");
  await page.goBack();
  await expect(leave).toBeVisible();
  await page.getByTestId("studio-confirm-yes").tap();
  await expect(page.getByTestId("card-studio")).toBeHidden();
  await expect(header).toHaveAttribute("data-frame", savedFrame ?? "none");
  // Nothing of the Studio is left in the history: Back now leaves the profile.
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
});

test("Artwork on a phone: the chosen champion, its skins in the section's own scrolling, readable sliders", async ({ page }) => {
  await openTopProfile(page);
  await openStudio(page);
  await goTo(page, "artwork");
  const chosen = page.getByTestId("artwork-champion");
  await expect(chosen).toBeVisible();
  await page.getByTestId("artwork-change-champion").tap();
  const grid = page.getByTestId("customise-champions");
  await expect(grid).toBeVisible();
  await expect(grid.locator("button[data-champion][aria-pressed=true]")).toHaveCount(1);
  const other = grid.locator("button[data-champion][aria-pressed=false]").first();
  const otherName = (await other.getAttribute("title"))!;
  await other.tap();
  await expect(grid).toBeHidden();
  await expect(chosen).toContainText(otherName);
  const skin = page.getByTestId("skin-option").first();
  await expect(skin).toBeVisible();
  await skin.tap();
  await expect(skin).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("artwork-skin-name")).toHaveText((await skin.getAttribute("title"))!);
  // No list inside the list: the skins scroll with the section.
  for (const s of await scrollers(page)) expect(s).toMatch(/^studio-panel-/);
  // Each slider shows its value beside it, and the value follows the slider.
  const zoom = page.getByRole("slider", { name: "Zoom" });
  const value = page.getByTestId("field-zoom").locator("output");
  await zoom.focus();
  await page.keyboard.press("Home");
  await expect(value).toHaveText("100%");
  await page.keyboard.press("ArrowRight");
  await expect(value).toHaveText("105%");
  await expect(page.getByTestId("art-surface")).toHaveAttribute("data-zoom", "1.05");
  for (const slider of await page.locator("input[type=range]").all()) if (await slider.isVisible()) expect(await slider.evaluate((el: HTMLElement) => el.offsetHeight)).toBeGreaterThanOrEqual(36);
  expect(await sideways(page)).toEqual([]);
  await discard(page);
});

test("while the keyboard is up (emulated), the field being typed in and Save stay on screen", async ({ page }) => {
  await emulateKeyboard(page);
  await openTopProfile(page);
  await openStudio(page);
  await goTo(page, "identity");
  const input = page.getByTestId("tagline-input");
  await input.tap();
  // A phone keyboard: about 40% of the screen (290px of 667 here).
  const screen = page.viewportSize()!.height;
  const above = screen - 290;
  await keyboard(page, 290);
  const studio = page.getByTestId("card-studio");
  await expect(studio).toHaveAttribute("data-keyboard", "true");
  // The preview gives the field its room while typing (a short strip), and the window fits above the keyboard.
  await expect.poll(async () => Math.round((await page.getByTestId("studio-stage").boundingBox())!.height)).toBeLessThanOrEqual(100);
  await expect.poll(async () => Math.round((await page.getByTestId("card-studio-window").boundingBox())!.height)).toBeLessThanOrEqual(above);
  await input.pressSequentially("Calm");
  for (const id of ["tagline-input", "save-card-style", "studio-cancel"]) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.y, `${id} below the top`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${id} above the keyboard`).toBeLessThanOrEqual(above + 1);
  }
  await expect(input).toBeFocused();
  await expect(previewFrame(page).getByTestId("card-tagline")).toContainText("Calm");
  // The keyboard goes away: the preview comes back and the window fills the screen again.
  await keyboard(page, 0);
  await expect(studio).not.toHaveAttribute("data-keyboard", "true");
  await expect.poll(async () => Math.round((await page.getByTestId("studio-stage").boundingBox())!.height)).toBeGreaterThan(130);
  await expect(input).toHaveValue("Calm");
  await discard(page);
});

test("held sideways: the preview beside the controls, everything in reach, and turning keeps the edits", async ({ browser, baseURL }) => {
  const { defaultBrowserType: _browser, ...iphone } = devices["iPhone 15"];
  const context = await browser.newContext(iphone);
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  const page = await context.newPage();
  await openTopProfile(page);
  await openStudio(page);
  await page.getByTestId("preset-crimson").tap();
  await goTo(page, "identity");
  // Turned sideways (the iPhone 15's window held sideways): the same section and the same edit.
  await page.setViewportSize({ width: 734, height: 343 });
  const studio = page.getByTestId("card-studio");
  await expect(studio).toHaveAttribute("data-section", "identity");
  const pane = page.getByTestId("studio-preview-pane");
  await expect(page.getByTestId("card-preview")).toHaveAttribute("data-frame", "double");
  const previewBox = (await pane.boundingBox())!;
  const panelBox = (await page.getByTestId("studio-panel-identity").boundingBox())!;
  expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(panelBox.x + 1);
  const win = (await page.getByTestId("card-studio-window").boundingBox())!;
  expect(win.y).toBeGreaterThanOrEqual(-1);
  expect(win.y + win.height).toBeLessThanOrEqual(343 + 1);
  for (const id of ["studio-tab-appearance", "save-card-style", "studio-cancel", "studio-reset-all", "preview-context"]) await expect(page.getByTestId(id).first(), id).toBeInViewport({ ratio: 1 });
  expect(await sideways(page)).toEqual([]);
  const panel = page.getByTestId("studio-panel-identity");
  await panel.evaluate((e) => e.scrollTo({ top: e.scrollHeight }));
  await expect(pane).toBeInViewport();
  await expect(page.getByTestId("save-card-style")).toBeInViewport({ ratio: 1 });
  // Upright again: still the same section and edit.
  await page.setViewportSize({ width: 393, height: 659 });
  await expect(studio).toHaveAttribute("data-section", "identity");
  await expect(page.getByTestId("card-preview")).toHaveAttribute("data-frame", "double");
  expect(await sideways(page)).toEqual([]);
  await discard(page);
  await context.close();
});
