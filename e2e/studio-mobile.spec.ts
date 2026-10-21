import { devices, expect, test, type Page } from "./test";

/*
  THE PLAYER CARD STUDIO ON A PHONE (Chromium's emulation of phones: touch, a mobile viewport and
  its scale; not real devices). The section bar says where you are and moves either way or straight
  to any section; the preview can be put away (remembered) or opened as the whole card in every
  view; edits stay while moving between sections and when the phone turns; Reset look, Cancel,
  Escape and the browser's Back ask before anything is lost; the on-screen keyboard (emulated: the
  browser's visual viewport made shorter, as a phone keyboard does) never covers the field or Save;
  and a phone held sideways keeps the preview beside the controls. Nothing here is saved: Demo Top's
  card stays as it was for the other tests.
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

/** Opens a section from the section bar's list. */
async function goTo(page: Page, id: string) {
  await page.getByTestId("studio-section-toggle").tap();
  await page.getByTestId(`studio-section-${id}`).tap();
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-step", id);
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
    for (const el of [win, ...win.querySelectorAll<HTMLElement>("[data-testid=studio-section-bar], [data-testid^=studio-panel-], [data-testid=studio-preview-pane]")]) {
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.getAttribute("data-testid")} scrolls sideways (${el.scrollWidth} > ${el.clientWidth})`);
    }
    for (const el of win.querySelectorAll<HTMLElement>("button, input, select, textarea, h3, h4, output")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < edge.left - 1 || r.right > edge.right + 1) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}": ${Math.round(r.left)}–${Math.round(r.right)} outside ${Math.round(edge.left)}–${Math.round(edge.right)}`);
    }
    return out;
  });

test("the section bar says where you are, steps either way and opens any section from its list", async ({ page }) => {
  await openTopProfile(page);
  await openStudio(page);
  const studio = page.getByTestId("card-studio");
  const toggle = page.getByTestId("studio-section-toggle");
  // One bar instead of a row of steps (nothing to scroll sideways).
  await expect(page.getByTestId("studio-section-bar")).toBeVisible();
  await expect(page.getByTestId("studio-steps")).toBeHidden();
  await expect(toggle).toContainText("Style");
  await expect(toggle).toContainText("1/6");
  await expect(page.getByTestId("studio-section-prev")).toBeDisabled();
  expect(await sideways(page)).toEqual([]);
  // Next and previous, one section at a time, each 44px or more for a finger (its laid-out size:
  // the window may still be scaling in from its opening motion).
  for (const id of ["studio-section-prev", "studio-section-next", "studio-section-toggle"]) {
    expect(await page.getByTestId(id).evaluate((el: HTMLElement) => el.offsetHeight), id).toBeGreaterThanOrEqual(44);
  }
  await page.getByTestId("studio-section-next").tap();
  await expect(studio).toHaveAttribute("data-step", "artwork");
  await expect(toggle).toContainText("Artwork");
  await expect(toggle).toContainText("2/6");
  await page.getByTestId("studio-section-prev").tap();
  await expect(studio).toHaveAttribute("data-step", "style");

  // The list: every section, the current one marked and focused; Escape puts the list away, not the Studio.
  await toggle.tap();
  const list = page.getByTestId("studio-sections");
  await expect(list).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(list.locator("[data-testid^=studio-section-]")).toHaveCount(6);
  await expect(list.getByTestId("studio-section-style")).toHaveAttribute("aria-current", "step");
  await expect(list.getByTestId("studio-section-style")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(studio).toBeVisible();
  await expect(toggle).toBeFocused();

  // Straight to any section; the last one has no next.
  await goTo(page, "effects");
  await expect(toggle).toContainText("6/6");
  await expect(page.getByTestId("studio-section-next")).toBeDisabled();
  expect(await sideways(page)).toEqual([]);

  // A section with changes is marked in the list.
  await goTo(page, "colours");
  await page.getByTestId("palettes").getByRole("button").nth(3).tap();
  await expect(page.getByTestId("palettes").getByRole("button").nth(3)).toHaveAttribute("aria-pressed", "true");
  await toggle.tap();
  await expect(list.getByTestId("studio-section-colours")).toContainText("Changed");
  await expect(list.getByTestId("studio-section-identity")).not.toContainText("Changed");
  // A tap anywhere outside the list puts it away (and reaches nothing underneath).
  const phoneView = (await page.getByTestId("preview-phone").boundingBox())!;
  await page.touchscreen.tap(phoneView.x + phoneView.width / 2, phoneView.y + phoneView.height / 2);
  await expect(list).toBeHidden();
  await expect(page.getByTestId("studio-preview-pane").getByTestId("card-preview")).toHaveAttribute("data-view", "team");
  await discard(page);
});

test("the preview can be put away (remembered) or opened as the whole card, and edits stay across sections", async ({ page }) => {
  await openTopProfile(page);
  const header = page.getByTestId("profile-header");
  const savedFrame = await header.getAttribute("data-frame");
  await openStudio(page);
  const pane = page.getByTestId("studio-preview-pane");
  const panel = page.locator("[data-testid^=studio-panel-]");
  await expect(pane).toHaveAttribute("data-shown", "true");
  const withPreview = (await panel.boundingBox())!.height;
  await page.getByTestId("studio-preview-toggle").tap();
  await expect(pane).toHaveAttribute("data-shown", "false");
  await expect(page.getByTestId("studio-preview-strip")).toBeVisible();
  const withStrip = (await panel.boundingBox())!.height;
  expect(withStrip, "putting the preview away gives the controls the room").toBeGreaterThan(withPreview + 60);
  // Remembered when the Studio opens again; Show brings it back.
  await page.getByTestId("studio-cancel").tap();
  await expect(page.getByTestId("card-studio")).toBeHidden();
  await openStudio(page);
  await expect(pane).toHaveAttribute("data-shown", "false");
  await page.getByTestId("studio-preview-toggle").tap();
  await expect(pane).toHaveAttribute("data-shown", "true");

  // Edits in one section stay while moving through the others, and the preview follows each at once.
  const preview = pane.getByTestId("card-preview");
  await page.getByTestId("preset-crimson").tap();
  await expect(preview).toHaveAttribute("data-frame", "double");
  await goTo(page, "identity");
  await page.getByTestId("tagline-input").fill("Calm in the chaos");
  await expect(preview.getByTestId("card-tagline")).toContainText("Calm in the chaos");
  await page.getByTestId("studio-section-next").tap();
  await page.getByTestId("studio-section-prev").tap();
  await goTo(page, "style");
  await expect(page.getByTestId("preset-crimson")).toHaveAttribute("aria-pressed", "true");
  await goTo(page, "identity");
  await expect(page.getByTestId("tagline-input")).toHaveValue("Calm in the chaos");
  await expect(preview).toHaveAttribute("data-frame", "double");

  // The whole card, larger than the compact preview, in every view; the action bar stays; Done returns.
  const compact = (await preview.boundingBox())!.width;
  await page.getByTestId("studio-full-card-open").first().tap();
  const full = page.getByTestId("studio-full-card");
  await expect(full).toBeVisible();
  await expect(page.getByTestId("studio-full-card-close")).toBeFocused();
  const big = full.getByTestId("card-preview");
  await expect(big).toHaveAttribute("data-frame", "double");
  await expect(big.getByTestId("card-tagline")).toContainText("Calm in the chaos");
  expect((await big.boundingBox())!.width).toBeGreaterThan(compact + 40);
  for (const v of ["phone", "directory", "team"] as const) {
    await full.getByTestId(`full-preview-${v}`).tap();
    await expect(big).toHaveAttribute("data-view", v);
    const scroller = full.locator(":scope > div").last();
    expect(await scroller.evaluate((e) => e.scrollWidth - e.clientWidth), `${v}: no sideways scrolling`).toBeLessThanOrEqual(1);
  }
  await expect(page.getByTestId("save-card-style")).toBeInViewport();
  await page.getByTestId("studio-full-card-close").tap();
  await expect(full).toBeHidden();
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-step", "identity");
  await expect(page.getByTestId("tagline-input")).toHaveValue("Calm in the chaos");

  // Nothing was saved.
  await discard(page);
  await expect(header).toHaveAttribute("data-frame", savedFrame ?? "none");
});

test("Reset look, Cancel, Escape and the browser's Back ask before anything is lost", async ({ page }) => {
  await openTopProfile(page);
  const profile = page.url();
  const header = page.getByTestId("profile-header");
  const savedFrame = await header.getAttribute("data-frame");
  await openStudio(page);
  const preview = page.getByTestId("studio-preview-pane").getByTestId("card-preview");
  const status = page.getByTestId("studio-status");
  await expect(status).toHaveText("Nothing changes until you save.");
  await page.getByTestId("preset-neon").tap();
  await expect(preview).toHaveAttribute("data-frame", "premium");
  await expect(status).toHaveText("Unsaved changes");

  // Reset look: a question in place of the action bar; Keep changes nothing, Reset look resets.
  await page.getByTestId("studio-reset-all").tap();
  const reset = page.getByTestId("studio-confirm-reset");
  await expect(reset).toContainText("Reset the whole look?");
  await expect(page.getByTestId("save-card-style")).toBeHidden();
  await expect(page.getByTestId("studio-confirm-keep")).toBeFocused();
  await page.getByTestId("studio-confirm-keep").tap();
  await expect(reset).toBeHidden();
  await expect(preview).toHaveAttribute("data-frame", "premium");
  await page.getByTestId("studio-reset-all").tap();
  await page.getByTestId("studio-confirm-yes").tap();
  await expect(preview).toHaveAttribute("data-frame", "none");
  await expect(page.getByTestId("save-card-style")).toBeVisible();

  // Cancel with changes asks; Keep editing keeps them.
  await page.getByTestId("preset-crimson").tap();
  await page.getByTestId("studio-cancel").tap();
  const leave = page.getByTestId("studio-confirm-discard");
  await expect(leave).toContainText("Discard your changes?");
  await page.getByTestId("studio-confirm-keep").tap();
  await expect(leave).toBeHidden();
  await expect(preview).toHaveAttribute("data-frame", "double");
  // Escape (the same close request as Android's back gesture) asks the same.
  await page.keyboard.press("Escape");
  await expect(leave).toBeVisible();
  await page.getByTestId("studio-confirm-keep").tap();
  // The browser's Back (a desktop's button, an iPhone's edge swipe) asks too, and stays on the page.
  await page.goBack();
  await expect(leave).toBeVisible();
  expect(page.url()).toBe(profile);
  await page.getByTestId("studio-confirm-keep").tap();
  await expect(page.getByTestId("card-studio")).toBeVisible();
  await expect(preview).toHaveAttribute("data-frame", "double");
  await page.goBack();
  await expect(leave).toBeVisible();
  await page.getByTestId("studio-confirm-yes").tap();
  await expect(page.getByTestId("card-studio")).toBeHidden();
  await expect(header).toHaveAttribute("data-frame", savedFrame ?? "none");
  // Nothing of the Studio is left in the history: Back now leaves the profile.
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
});

test("Artwork, Position and Effects on a phone: the chosen champion, readable sliders, what needs what", async ({ page }) => {
  await openTopProfile(page);
  await openStudio(page);
  // Artwork: the chosen champion with Change; the grid opens in place and closes on a pick.
  await goTo(page, "artwork");
  const chosen = page.getByTestId("artwork-champion");
  await expect(chosen).toBeVisible();
  await page.getByTestId("artwork-change-champion").tap();
  const grid = page.getByTestId("customise-champions");
  await expect(grid).toBeVisible();
  await expect(page.getByTestId("artwork-keep-champion")).toBeVisible();
  // Another champion than the chosen one (marked in the grid).
  await expect(grid.locator("button[data-champion][aria-pressed=true]")).toHaveCount(1);
  const other = grid.locator("button[data-champion][aria-pressed=false]").first();
  // Its name is the button's last line (above it, the portrait, or its initials while the image loads).
  const otherName = (await other.innerText()).trim().split("\n").pop()!;
  await other.tap();
  await expect(grid).toBeHidden();
  await expect(chosen).toContainText(otherName);
  // A skin: marked as chosen (a check on its thumbnail) and named beside the heading.
  const skin = page.getByTestId("skin-option").first();
  await expect(skin).toBeVisible();
  await skin.tap();
  await expect(skin).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("artwork-skin-name")).toHaveText((await skin.getAttribute("title"))!);

  // Position: each slider shows its value beside it, and the value follows the slider.
  await goTo(page, "position");
  const zoom = page.getByRole("slider", { name: "Zoom" });
  const value = page.getByTestId("field-zoom").locator("output");
  await zoom.focus();
  await page.keyboard.press("Home");
  await expect(value).toHaveText("100%");
  await page.keyboard.press("ArrowRight");
  await expect(value).toHaveText("105%");
  await expect(page.getByTestId("studio-preview-pane").getByTestId("card-preview")).toHaveAttribute("data-zoom", "1.05");
  for (const slider of await page.getByRole("slider").all()) expect(await slider.evaluate((el: HTMLElement) => el.offsetHeight)).toBeGreaterThanOrEqual(36);

  // Effects: what needs a colour wash says so and leads there; the intensity waits for an effect.
  await goTo(page, "effects");
  const drift = page.getByRole("switch", { name: /Moving colour wash/ });
  await expect(drift).toBeDisabled();
  await expect(page.getByText("Needs a colour wash, chosen under Colours.")).toBeVisible();
  const intensity = page.getByRole("slider", { name: "Effect intensity" });
  await expect(intensity).toBeDisabled();
  await page.locator("label[for=fx-glow]").tap();
  await expect(intensity).toBeEnabled();
  await page.getByTestId("effects-go-colours").tap();
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-step", "colours");
  await page.getByRole("radiogroup", { name: "Colour wash" }).getByRole("radio", { name: "Diagonal" }).tap();
  await goTo(page, "effects");
  await expect(drift).toBeEnabled();
  await expect(page.getByTestId("effects-go-colours")).toHaveCount(0);
  expect(await sideways(page)).toEqual([]);
  await discard(page);
});

/**
 * A phone's on-screen keyboard, emulated: headless Chromium has none, so the visual viewport (what a
 * keyboard shrinks) is replaced by one whose height the test sets with `keyboard(page, px)`.
 */
async function emulateKeyboard(page: Page) {
  await page.addInitScript(() => {
    let keyboard = 0;
    const events = new EventTarget();
    const viewport = {
      get width() {
        return window.innerWidth;
      },
      get height() {
        return window.innerHeight - keyboard;
      },
      offsetTop: 0,
      offsetLeft: 0,
      get pageTop() {
        return window.scrollY;
      },
      get pageLeft() {
        return window.scrollX;
      },
      scale: 1,
      onresize: null,
      onscroll: null,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    };
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => viewport });
    (window as unknown as { __keyboard: (h: number) => void }).__keyboard = (h: number) => {
      keyboard = h;
      events.dispatchEvent(new Event("resize"));
    };
  });
}
const keyboard = (page: Page, px: number) => page.evaluate((h) => (window as unknown as { __keyboard: (h: number) => void }).__keyboard(h), px);

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
  // The preview steps aside to a strip while typing, and the window fits above the keyboard.
  const strip = page.getByTestId("studio-preview-strip");
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("while you type");
  await expect.poll(async () => Math.round((await page.getByTestId("card-studio-window").boundingBox())!.height)).toBeLessThanOrEqual(above);
  await input.pressSequentially("Calm");
  for (const id of ["tagline-input", "save-card-style", "studio-cancel"]) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.y, `${id} below the top`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${id} above the keyboard`).toBeLessThanOrEqual(above + 1);
  }
  await expect(input).toBeFocused();
  await expect(strip.getByTestId("card-preview").getByTestId("card-tagline")).toContainText("Calm");
  // The keyboard goes away: the preview comes back and the window fills the screen again.
  await keyboard(page, 0);
  await expect(studio).not.toHaveAttribute("data-keyboard", "true");
  await expect(page.getByTestId("studio-preview-pane")).toHaveAttribute("data-shown", "true");
  await expect.poll(async () => Math.round((await page.getByTestId("card-studio-window").boundingBox())!.height)).toBeGreaterThan(above + 100);
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
  await goTo(page, "colours");
  // Turned sideways (the iPhone 15's window held sideways): the same section and the same edit.
  await page.setViewportSize({ width: 734, height: 343 });
  const studio = page.getByTestId("card-studio");
  await expect(studio).toHaveAttribute("data-step", "colours");
  const pane = page.getByTestId("studio-preview-pane");
  await expect(pane.getByTestId("card-preview")).toHaveAttribute("data-frame", "double");
  // The preview stands beside the controls; the window, the section bar and the action bar fit the screen.
  const previewBox = (await pane.boundingBox())!;
  const panelBox = (await page.getByTestId("studio-panel-colours").boundingBox())!;
  expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(panelBox.x + 1);
  const win = (await page.getByTestId("card-studio-window").boundingBox())!;
  expect(win.y).toBeGreaterThanOrEqual(-1);
  expect(win.y + win.height).toBeLessThanOrEqual(343 + 1);
  for (const id of ["studio-section-toggle", "save-card-style", "studio-cancel", "studio-reset-all", "studio-full-card-open"]) {
    await expect(page.getByTestId(id).first(), id).toBeInViewport({ ratio: 1 });
  }
  expect(await sideways(page)).toEqual([]);
  // The controls scroll on their own; the preview and the action bar stay.
  const panel = page.getByTestId("studio-panel-colours");
  await panel.evaluate((e) => e.scrollTo({ top: e.scrollHeight }));
  await expect(pane).toBeInViewport();
  await expect(page.getByTestId("save-card-style")).toBeInViewport({ ratio: 1 });
  // Upright again: still the same section and edit.
  await page.setViewportSize({ width: 393, height: 659 });
  await expect(studio).toHaveAttribute("data-step", "colours");
  await expect(pane.getByTestId("card-preview")).toHaveAttribute("data-frame", "double");
  expect(await sideways(page)).toEqual([]);
  await discard(page);
  await context.close();
});
