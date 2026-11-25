import { expect, test, type Page } from "./test";
import { discard, openStudioFromHeader as openStudio, previewFrame, section, showPreview } from "./studio";

/*
  Card Studio (Release 17: four sections open in any order, a large live preview of every place a
  card appears, artwork positioned in the preview, Undo and Redo): presets and the live preview,
  nothing saved until Save (Cancel and Escape keep the saved card), the saved look on the profile,
  Team and Players, aligned cards whatever the tagline, reduced motion, a banner's help that says who
  sees it, and the window's proportions at desktop sizes. Every test puts the card back to the
  standard look (later tests share this demo roster). Phones: studio-mobile.spec.ts; every control by
  touch: studio-touch.spec.ts; each preview against its page: studio-previews.spec.ts.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const FRAME_OF: Record<string, string> = { uniiverse: "none", minimal: "minimal", competitive: "angular", arcane: "glow", crimson: "double", monochrome: "outline", neon: "premium" };

/** The lineup's Top player: their profile (the demo viewer is the Owner, who may edit any card). */
async function openTopProfile(page: Page): Promise<string> {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}`);
  await expect(page.getByTestId("profile-header")).toBeVisible();
  return id;
}

async function resetCard(page: Page) {
  await openStudio(page);
  // Reset look is at once (Undo would bring the look back); the tagline and emblem stay, so clear them.
  await page.getByTestId("studio-reset-all").click();
  await section(page, "identity");
  await page.getByTestId("tagline-input").fill("");
  await page.getByRole("radiogroup", { name: "Emblem" }).getByRole("radio", { name: "None" }).click();
  await section(page, "artwork");
  for (const reset of await page.getByTestId("position-override-reset").all()) await reset.click();
  await page.getByTestId("save-card-style").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
  await expect(page.getByTestId("profile-header")).toHaveAttribute("data-frame", "none");
}

test("four sections, open in any order with nothing in sequence; presets change the preview only; Cancel and Escape keep the saved card", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await openTopProfile(page);
  const header = page.getByTestId("profile-header");
  const savedFrame = await header.getAttribute("data-frame");
  await openStudio(page);
  const studio = page.getByTestId("card-studio-window");
  await expect(page.locator("#studio-title")).toHaveText("Card Studio");
  // The sections are tabs, all reachable at once (someone else's card has no Socials: links are only ever your own).
  await expect(page.getByRole("tablist", { name: "Card Studio sections" }).getByRole("tab")).toHaveText(["Appearance", "Artwork", "Identity"]);
  await expect(page.getByTestId("studio-tab-socials")).toHaveCount(0);
  // Nothing reads as steps: no numbering, counters, Next or Back.
  await expect(studio).not.toContainText(/\bStep \d|\bNext\b|\bBack\b/);
  await expect(studio.getByRole("button", { name: /^(Next|Back)$/ })).toHaveCount(0);
  // Any section, then straight back: the preview opens on the place the Studio was opened from.
  await section(page, "identity");
  await section(page, "artwork");
  await section(page, "appearance");
  const preview = page.getByTestId("card-preview");
  await expect(preview).toHaveAttribute("data-context", "header");
  for (const [preset, frame] of Object.entries(FRAME_OF)) {
    await page.getByTestId(`preset-${preset}`).click();
    await expect(preview).toHaveAttribute("data-frame", frame);
    await expect(previewFrame(page).getByTestId("profile-header")).toHaveAttribute("data-frame", frame);
    await expect(page.getByTestId(`preset-${preset}`)).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByTestId("studio-status")).toHaveText("Unsaved changes");
  // Each place shows the same look.
  for (const ctx of ["team", "players", "peek", "public"] as const) {
    await showPreview(page, ctx, "desktop");
    await expect(preview).toHaveAttribute("data-frame", FRAME_OF.neon!);
  }
  // The chosen screen is marked as every choice of a few is (the shared text-led segments, Release 17): no ring
  // and no filled box, the words semibold over the accent underline.
  const marks = (el: Element) => {
    const c = getComputedStyle(el);
    const line = getComputedStyle(el, "::after");
    return { ring: c.boxShadow !== "none", fill: c.backgroundColor !== "rgba(0, 0, 0, 0)", weight: c.fontWeight, underline: line.opacity !== "0" && line.height === "2px" };
  };
  expect(await page.getByTestId("preview-desktop").evaluate(marks)).toEqual({ ring: false, fill: false, weight: "600", underline: true });
  expect(await page.getByTestId("preview-mobile").evaluate(marks)).toMatchObject({ ring: false, fill: false, underline: false });
  // Escape with unsaved changes asks first, in the action bar; Keep editing keeps the Studio and the changes.
  await page.getByTestId("studio-tab-appearance").focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("studio-confirm-discard")).toBeVisible();
  await expect(page.getByTestId("studio-confirm-keep")).toBeFocused();
  await page.getByTestId("studio-confirm-keep").click();
  await expect(page.getByTestId("card-studio")).toBeVisible();
  await expect(preview).toHaveAttribute("data-frame", FRAME_OF.neon!);
  // Cancel asks the same; Discard leaves the saved card as it was: nothing was saved.
  await discard(page);
  await expect(header).toHaveAttribute("data-frame", savedFrame ?? "none");
  await page.reload();
  await expect(page.getByTestId("profile-header")).toHaveAttribute("data-frame", savedFrame ?? "none");
});

test("Undo and Redo step through unsaved changes, by keyboard and by button, and start empty each time the Studio opens", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await openTopProfile(page);
  await openStudio(page);
  const undo = page.getByTestId("studio-undo");
  const redo = page.getByTestId("studio-redo");
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  const preview = page.getByTestId("card-preview");
  const start = await preview.getAttribute("data-frame");
  await page.getByTestId("preset-crimson").click();
  await expect(preview).toHaveAttribute("data-frame", "double");
  // Two taps are two steps (only a continuous gesture, a slider's drag or typing, is one).
  await page.getByTestId("preset-neon").click();
  await expect(preview).toHaveAttribute("data-frame", "premium");
  await page.getByTestId("preset-neon").focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(preview).toHaveAttribute("data-frame", "double");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(preview).toHaveAttribute("data-frame", "premium");
  await undo.click();
  await undo.click();
  await expect(preview).toHaveAttribute("data-frame", start ?? "none");
  await expect(undo).toBeDisabled();
  await expect(page.getByTestId("studio-status")).not.toHaveText("Unsaved changes");
  await redo.click();
  await expect(preview).toHaveAttribute("data-frame", "double");
  // In a text field the keys are the field's own: typing is undone there, not the look.
  await section(page, "identity");
  const tagline = page.getByTestId("tagline-input");
  await tagline.fill("Calm");
  await tagline.press("ControlOrMeta+z");
  await expect(preview).toHaveAttribute("data-frame", "double");
  // Moving between sections keeps every change.
  await section(page, "appearance");
  await expect(page.getByTestId("preset-crimson")).toHaveAttribute("aria-pressed", "true");
  await discard(page);
  await openStudio(page);
  await expect(page.getByTestId("studio-undo")).toBeDisabled();
  await page.getByTestId("studio-cancel").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
});

test("artwork is positioned in the preview: a drag moves the shared position, a layout of its own keeps its own, and it resets to the shared one", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await openTopProfile(page);
  await openStudio(page);
  await section(page, "artwork");
  await showPreview(page, "team", "desktop");
  const surface = page.getByTestId("art-surface");
  await expect(surface).toBeVisible();
  // The crop is drawn round the artwork's box.
  await expect(page.getByTestId("art-crop")).toBeAttached();
  const x0 = Number(await surface.getAttribute("data-focus-x"));
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 + 10 * i, box.y + box.height / 2);
  // While it moves, the rest of the picture shows faintly around the crop.
  await expect(page.getByTestId("art-ghost")).toBeVisible();
  await page.mouse.up();
  // Dragged right: the picture follows, showing more of its left (a lower focal point), in every layout.
  await expect.poll(async () => Number(await surface.getAttribute("data-focus-x"))).toBeLessThan(x0);
  const shared = Number(await surface.getAttribute("data-focus-x"));
  const sharedY = Number(await surface.getAttribute("data-focus-y"));
  await expect(page.getByRole("slider", { name: "Horizontal position" })).toHaveValue(String(shared));
  // The keyboard moves it too, and the wheel zooms (the preview's own Fit and Actual size never change the saved zoom).
  await surface.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(surface).toHaveAttribute("data-focus-x", String(shared + 5));
  await surface.hover();
  await page.mouse.wheel(0, -100);
  await expect(surface).toHaveAttribute("data-zoom", "1.05");
  await page.getByTestId("preview-actual").click();
  await expect(page.getByTestId("card-preview")).toHaveAttribute("data-scale", "1");
  await expect(surface).toHaveAttribute("data-zoom", "1.05");
  await page.getByTestId("preview-fit").click();
  // The phone's Team card gets a position of its own: the desktop card keeps the shared one.
  await showPreview(page, "team", "mobile");
  await page.getByTestId("position-own").click();
  await expect(surface).toHaveAttribute("data-own", "true");
  await page.getByRole("slider", { name: "Vertical position" }).fill("80");
  await expect(surface).toHaveAttribute("data-focus-y", "80");
  await expect(page.getByTestId("position-overrides")).toContainText("Team card, phone");
  await showPreview(page, "team", "desktop");
  await expect(surface).not.toHaveAttribute("data-own", "true");
  await expect(surface).not.toHaveAttribute("data-focus-y", "80");
  // Saved, the page uses each: the phone's own position below the five-across lineup, the shared one five across.
  await page.getByTestId("save-card-style").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
  await page.goto("/team");
  const art = page.getByTestId("lineup-row-TOP").getByTestId("card-art-image");
  await expect(art).toHaveAttribute("data-place", "card");
  const position = () => art.evaluate((img) => getComputedStyle(img).objectPosition);
  expect(await position()).toBe(`${shared + 5}% ${sharedY}%`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(position).toBe(`${shared + 5}% 80%`);
  await page.setViewportSize({ width: 1440, height: 900 });
  // Back to the shared position, and the standard card.
  await openTopProfile(page);
  await openStudio(page);
  await section(page, "artwork");
  await showPreview(page, "team", "mobile");
  await page.getByTestId("position-reset").click();
  await expect(page.getByTestId("art-surface")).not.toHaveAttribute("data-own", "true");
  await expect(page.getByTestId("position-overrides")).toHaveCount(0);
  await page.getByTestId("position-reset").click();
  await page.getByTestId("save-card-style").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
  await resetCard(page);
});

test("a saved card shows on the profile, Team and Players, and cards stay aligned", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  const id = await openTopProfile(page);
  await openStudio(page);
  // The Studio opens on Appearance: the presets first.
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-section", "appearance");
  await page.getByTestId("preset-competitive").click();
  await section(page, "identity");
  const tagline = page.getByTestId("tagline-input");
  // Too long: cut to 40 characters.
  await tagline.fill("A".repeat(60));
  await expect(page.getByTestId("field-tagline")).toContainText("40/40");
  // A rank claim is refused before saving.
  await tagline.fill("Challenger mid");
  await expect(page.getByTestId("tagline-problem")).toContainText(/rank|competitive/);
  await expect(page.getByTestId("save-card-style")).toBeDisabled();
  await tagline.fill("Calm in the chaos");
  await expect(page.getByTestId("save-card-style")).toBeEnabled();
  await page.getByRole("radiogroup", { name: "Emblem" }).locator("[data-value=flame]").click();
  await expect(previewFrame(page).getByTestId("profile-header").getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  // The Players list: the row as a desktop shows it (a faint strip of the chosen art), and as a phone shows it (no art).
  await showPreview(page, "players", "desktop");
  const row = previewFrame(page).getByTestId("roster-row-preview");
  await expect(row.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  await expect(row.locator("[data-row-art]")).toHaveCount(1);
  await showPreview(page, "players", "mobile");
  await expect(row.getByTestId("card-emblem")).toHaveAttribute("data-emblem", "flame");
  await expect(row.locator("[data-row-art]")).toBeHidden();
  // One animated effect, to see how a page of several cards treats it.
  await section(page, "appearance");
  // The effects fold opens by itself where an effect is on (the preset's motif).
  if (!(await page.getByTestId("fold-effects").evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByTestId("fold-effects").locator("summary").click();
  const shimmerSwitch = page.getByRole("switch", { name: "Accent shimmer" });
  if (!(await shimmerSwitch.isChecked())) await page.getByText("Accent shimmer").click();
  await expect(shimmerSwitch).toBeChecked();
  await page.getByTestId("save-card-style").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();

  const header = page.getByTestId("profile-header");
  await expect(header).toHaveAttribute("data-frame", "angular");
  await expect(header.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  await expect(header.getByTestId("card-emblem")).toHaveAttribute("data-emblem", "flame");

  // Team: the same look, and the names and figures still line up with the other cards.
  await page.goto("/team");
  const top = page.getByTestId("lineup-row-TOP");
  await expect(top).toHaveAttribute("data-frame", "angular");
  await expect(top.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  for (const r of ["TOP", "JUNGLE", "MID"]) await expect(page.getByTestId(`lineup-row-${r}`)).toBeVisible();
  const boxes = await Promise.all(["TOP", "JUNGLE", "MID"].map(async (r) => ({ card: await page.getByTestId(`lineup-row-${r}`).boundingBox(), stats: await page.getByTestId(`lineup-row-${r}`).getByTestId("card-season").boundingBox(), fit: await page.getByTestId(`lineup-row-${r}`).getByTestId("card-fit").boundingBox() })));
  const sameRow = boxes.filter((b) => Math.abs(b.card!.y - boxes[0]!.card!.y) < 2);
  for (const b of sameRow) {
    expect(Math.abs(b.card!.height - sameRow[0]!.card!.height), "equal card heights").toBeLessThanOrEqual(1);
    expect(Math.abs(b.stats!.y - sameRow[0]!.stats!.y), "figures start at the same height").toBeLessThanOrEqual(1);
    expect(Math.abs(b.fit!.y - sameRow[0]!.fit!.y), "rank and Main/Off Role line at the same height").toBeLessThanOrEqual(1);
  }
  await expect(top.locator("[data-status]")).toBeVisible();
  await expect(top.getByTestId("card-season")).toBeVisible();
  // Among several cards a decorative effect exists only while its card is pointed at or focused.
  const shimmer = top.getByTestId("card-shimmer");
  await expect(shimmer).toHaveCount(1);
  const animationOf = () => shimmer.evaluate((e) => getComputedStyle(e).animationName);
  expect(await animationOf()).toBe("none");
  await top.hover();
  await expect.poll(animationOf, { message: "the shimmer runs while pointed at" }).toBe("card-shimmer");
  await page.mouse.move(0, 0);
  await expect.poll(animationOf, { message: "and stops when the pointer leaves" }).toBe("none");

  // Players: the row keeps the look, and from tablets up a faint strip of the art.
  await page.goto("/players");
  const card = page.locator("main [data-testid='player-card-item']").filter({ has: page.locator(`a[href='/players/${id}']`) });
  await expect(card).toHaveAttribute("data-frame", "angular");
  await expect(card.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  await expect(card.getByTestId("card-name")).toHaveAttribute("data-name-style", "wide");
  await expect(card.locator("[data-row-art]")).toBeVisible();

  // The band on the profile's other sections keeps the tagline and the lineup status (from sm up), the Overview's height (UD.PO1).
  await page.goto(`/players/${id}`);
  const overview = (await page.getByTestId("profile-header").boundingBox())!.height;
  await page.goto(`/players/${id}/champions`);
  const band = page.getByTestId("profile-header");
  await expect(band).toHaveAttribute("data-compact");
  await expect(band.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  await expect(band.getByTestId("card-emblem")).toHaveAttribute("data-emblem", "flame");
  await expect(band.getByTestId("lineup-status")).toBeVisible();
  expect(Math.abs((await band.boundingBox())!.height - overview), "one band on every section").toBeLessThanOrEqual(1);

  // Leaderboards: the member's name on the board carries their emblem and name style.
  await page.goto("/leaderboards");
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  const formRow = page.locator(`[data-testid=form-row][data-player-id="${id}"]`);
  await expect(formRow.getByTestId("card-emblem")).toHaveAttribute("data-emblem", "flame");
  await expect(formRow.getByTestId("card-name")).toHaveAttribute("data-name-style", "wide");

  // Players on a phone: the same name style, emblem and tagline, and no art (never requested).
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await page.context().storageState() });
  const small = await phone.newPage();
  const art: string[] = [];
  small.on("request", (r) => {
    if (/\/cdn\/img\/champion\/tiles\//.test(r.url())) art.push(r.url());
  });
  await small.goto("/players");
  const row2 = small.locator("main [data-testid='player-card-item']").filter({ has: small.locator(`a[href='/players/${id}']`) });
  await expect(row2).toBeVisible();
  await expect(row2).toHaveAttribute("data-frame", "angular");
  await expect(row2.getByTestId("card-emblem")).toHaveAttribute("data-emblem", "flame");
  await expect(row2.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  await expect(row2.locator("[data-art-layer]")).toHaveCount(0);
  await expect(row2.locator("[data-row-art]")).toBeHidden();
  await small.waitForLoadState("networkidle");
  expect(art, "no row art requested on a phone").toEqual([]);
  await phone.close();

  // Back to the standard card.
  await page.goto(`/players/${id}`);
  await resetCard(page);
  await expect(page.getByTestId("profile-header").getByTestId("card-tagline")).toHaveCount(0);
});

test("a preset sets the look only: the artwork, its position, the tagline and emblem stay", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await openTopProfile(page);
  await openStudio(page);
  await section(page, "identity");
  await page.getByTestId("tagline-input").fill("Keep me");
  await page.getByRole("radiogroup", { name: "Emblem" }).locator("[data-value=moon]").click();
  await section(page, "artwork");
  await page.getByRole("slider", { name: "Zoom" }).fill("1.5");
  await section(page, "appearance");
  for (const preset of Object.keys(FRAME_OF)) await page.getByTestId(`preset-${preset}`).click();
  await section(page, "identity");
  await expect(page.getByTestId("tagline-input")).toHaveValue("Keep me");
  await expect(page.getByRole("radiogroup", { name: "Emblem" }).locator("[data-value=moon]")).toHaveAttribute("aria-checked", "true");
  await section(page, "artwork");
  await expect(page.getByRole("slider", { name: "Zoom" })).toHaveValue("1.5");
  await discard(page);
});

test("animated effects stop for reduced motion", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await openTopProfile(page);
  await openStudio(page);
  await page.getByTestId("fold-effects").locator("summary").click();
  await page.getByText("Accent shimmer").click();
  const shimmer = previewFrame(page).getByTestId("card-shimmer");
  await expect(shimmer).toHaveCount(1);
  expect(await shimmer.evaluate((e) => getComputedStyle(e).animationName)).toBe("card-shimmer");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => shimmer.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  await discard(page);
});

test("the banner's help says who sees it: teammates, and the public team page while in the lineup or a substitute", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await openTopProfile(page);
  await openStudio(page);
  await section(page, "artwork");
  await page.getByRole("radiogroup", { name: "Background" }).getByRole("radio", { name: "My banner" }).click();
  const panel = page.getByTestId("banner-panel");
  await expect(panel).toContainText("Shown to teammates, and on the public team page while you're in the lineup or a substitute.");
  await expect(panel).not.toContainText(/only members/i);
  await discard(page);
});

test("at desktop sizes the preview takes 40–50% of the window, the window fits the screen, and only the section scrolls", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await openTopProfile(page);
  for (const [w, h] of [
    [1280, 720],
    [1440, 900],
    [1920, 1080],
    [2560, 1440],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await openStudio(page);
    const m = await page.evaluate(() => {
      const win = document.querySelector("[data-testid=card-studio-window]")!.getBoundingClientRect();
      const pane = document.querySelector("[data-testid=studio-preview-pane]")!.getBoundingClientRect();
      // Every element of the window that scrolls (the section is the one meant to).
      const scrollers = [...document.querySelectorAll("dialog *")].filter((e) => {
        const s = getComputedStyle(e);
        return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1;
      }).map((e) => e.getAttribute("data-testid") ?? e.tagName);
      return { share: pane.width / win.width, fits: win.right <= innerWidth && win.bottom <= innerHeight && win.left >= 0 && win.top >= 0, sideways: document.documentElement.scrollWidth > innerWidth, scrollers };
    });
    expect(m.share, `${w}×${h}: the preview's share`).toBeGreaterThanOrEqual(0.4);
    expect(m.share, `${w}×${h}: the preview's share`).toBeLessThanOrEqual(0.5);
    expect(m.fits, `${w}×${h}: the window fits`).toBe(true);
    expect(m.sideways).toBe(false);
    for (const s of m.scrollers) expect(s, `${w}×${h}: only the section scrolls`).toMatch(/^studio-panel-/);
    // The Team card's preview is drawn larger than the card is (Fit), never cut.
    await showPreview(page, "team", "desktop");
    const stage = page.getByTestId("card-preview");
    expect(Number(await stage.getAttribute("data-scale"))).toBeGreaterThan(1);
    await expect(stage).toBeInViewport({ ratio: 1 });
    await page.getByTestId("studio-cancel").click();
    await expect(page.getByTestId("card-studio")).toBeHidden();
  }
});
