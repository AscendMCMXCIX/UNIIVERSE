import { expect, test, type Page } from "./test";

/*
  Player Card Studio: presets and a live preview, nothing saved until Save (Cancel and Escape keep
  the saved card), the saved look on the profile, Team and Players, aligned cards whatever the
  tagline, reduced motion, a banner's help that says who sees it, and a phone layout without
  sideways scrolling. Every test puts the card back to the standard look (later tests share this
  demo roster).
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

async function openStudio(page: Page) {
  // Wait for hydration: the button only works once the page is interactive.
  await expect(async () => {
    await page.getByTestId("profile-header").getByTestId("customise-card").click();
    await expect(page.getByTestId("card-studio")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** Opens a step: from the step bar on a desktop, from the section list on phones and tablets. */
async function step(page: Page, id: "style" | "artwork" | "position" | "colours" | "identity" | "links" | "effects") {
  const pill = page.getByTestId(`studio-step-${id}`);
  if (await pill.isVisible()) await pill.click();
  else {
    await page.getByTestId("studio-section-toggle").click();
    await page.getByTestId(`studio-section-${id}`).click();
  }
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-step", id);
}

/** Cancel with unsaved changes asks first (in the action bar); Discard closes and keeps the saved card. */
async function discard(page: Page) {
  await page.getByTestId("studio-cancel").click();
  await page.getByTestId("studio-confirm-yes").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
}

async function resetCard(page: Page) {
  await openStudio(page);
  // Reset look asks first.
  await page.getByTestId("studio-reset-all").click();
  await page.getByTestId("studio-confirm-yes").click();
  await step(page, "identity");
  await page.getByTestId("tagline-input").fill("");
  await page.getByRole("radiogroup", { name: "Emblem" }).getByRole("radio", { name: "None" }).click();
  await page.getByTestId("save-card-style").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
  await expect(page.getByTestId("profile-header")).toHaveAttribute("data-frame", "none");
}

test("presets change the live preview only; Cancel and Escape keep the saved card", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await openTopProfile(page);
  const header = page.getByTestId("profile-header");
  const savedFrame = await header.getAttribute("data-frame");
  await openStudio(page);
  const preview = page.getByTestId("card-preview");
  for (const [preset, frame] of Object.entries(FRAME_OF)) {
    await page.getByTestId(`preset-${preset}`).click();
    await expect(preview).toHaveAttribute("data-frame", frame);
    await expect(page.getByTestId(`preset-${preset}`)).toHaveAttribute("aria-pressed", "true");
  }
  // The other preview sizes show the same look.
  await page.getByTestId("preview-phone").click();
  await expect(page.getByTestId("card-preview")).toHaveAttribute("data-view", "phone");
  await page.getByTestId("preview-directory").click();
  await expect(page.getByTestId("card-preview")).toHaveAttribute("data-view", "directory");
  // Escape with unsaved changes asks first, in the action bar; Keep editing keeps the Studio and the changes.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("studio-confirm-discard")).toBeVisible();
  await expect(page.getByTestId("studio-confirm-keep")).toBeFocused();
  await page.getByTestId("studio-confirm-keep").click();
  await expect(page.getByTestId("card-studio")).toBeVisible();
  await expect(page.getByTestId("studio-confirm-discard")).toHaveCount(0);
  // The last preset is still there (the Team card view shows its frame).
  await page.getByTestId("preview-team").click();
  await expect(page.getByTestId("card-preview")).toHaveAttribute("data-frame", FRAME_OF.neon!);
  // Cancel asks the same; Discard leaves the saved card as it was: nothing was saved.
  await discard(page);
  await expect(header).toHaveAttribute("data-frame", savedFrame ?? "none");
  await page.reload();
  await expect(page.getByTestId("profile-header")).toHaveAttribute("data-frame", savedFrame ?? "none");
});

test("a saved card shows on the profile, Team and Players, and cards stay aligned", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  const id = await openTopProfile(page);
  await openStudio(page);
  // The Studio opens on its first step: presets, background and frame.
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-step", "style");
  await page.getByTestId("preset-competitive").click();
  await step(page, "identity");
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
  await expect(page.getByTestId("card-preview").getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  // The Players view previews the player's row on Players, twice: as a tablet shows it (a faint strip
  // of the chosen art) and as a phone shows it (no art), with the same name, emblem and tagline.
  await page.getByTestId("preview-directory").click();
  const wideRow = page.getByTestId("card-preview-row-wide");
  await expect(wideRow.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  await expect(wideRow.locator("[data-row-art]")).toHaveCount(1);
  const rowPreview = page.getByTestId("card-preview-row");
  await expect(rowPreview.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  await expect(rowPreview.getByTestId("card-emblem")).toHaveAttribute("data-emblem", "flame");
  await expect(rowPreview.locator("[data-art-layer], [data-row-art]")).toHaveCount(0);
  await page.getByTestId("preview-team").click();
  // One animated effect, to see how a page of several cards treats it.
  await step(page, "effects");
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
  // Measured once shown: streamed content is in the page, hidden, until React reveals it.
  for (const r of ["TOP", "JUNGLE", "MID"]) await expect(page.getByTestId(`lineup-row-${r}`)).toBeVisible();
  const boxes = await Promise.all(["TOP", "JUNGLE", "MID"].map(async (r) => ({ card: await page.getByTestId(`lineup-row-${r}`).boundingBox(), stats: await page.getByTestId(`lineup-row-${r}`).getByTestId("card-season").boundingBox(), fit: await page.getByTestId(`lineup-row-${r}`).getByTestId("card-fit").boundingBox() })));
  const sameRow = boxes.filter((b) => Math.abs(b.card!.y - boxes[0]!.card!.y) < 2);
  for (const b of sameRow) {
    expect(Math.abs(b.card!.height - sameRow[0]!.card!.height), "equal card heights").toBeLessThanOrEqual(1);
    expect(Math.abs(b.stats!.y - sameRow[0]!.stats!.y), "figures start at the same height").toBeLessThanOrEqual(1);
    expect(Math.abs(b.fit!.y - sameRow[0]!.fit!.y), "rank and Main/Off Role line at the same height").toBeLessThanOrEqual(1);
  }
  // Competitive information stays visible on the decorated card.
  await expect(top.locator("[data-status]")).toBeVisible();
  await expect(top.getByTestId("card-season")).toBeVisible();
  // Among several cards a decorative effect exists only while its card is pointed at or focused:
  // nothing animates (or holds a layer) on its own, and it leaves with the pointer.
  const shimmer = top.getByTestId("card-shimmer");
  await expect(shimmer).toHaveCount(1);
  const animationOf = () => shimmer.evaluate((e) => getComputedStyle(e).animationName);
  expect(await animationOf()).toBe("none");
  await top.hover();
  await expect.poll(animationOf, { message: "the shimmer runs while pointed at" }).toBe("card-shimmer");
  await page.mouse.move(0, 0);
  await expect.poll(animationOf, { message: "and stops when the pointer leaves" }).toBe("none");

  // Players: the player's row, with one link to the profile laid over it, keeps their look, and from
  // tablets up a faint strip of their art (Gwen, the featured champion) behind the picture and name.
  await page.goto("/players");
  const card = page.locator("main [data-testid='player-card-item']").filter({ has: page.locator(`a[href='/players/${id}']`) });
  await expect(card).toHaveAttribute("data-frame", "angular");
  await expect(card.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  await expect(card.getByTestId("card-name")).toHaveAttribute("data-name-style", "wide");
  await expect(card.locator("[data-row-art]")).toBeVisible();

  // The compact band on the profile's other sections keeps the tagline and the lineup status (from sm up), within its height.
  await page.goto(`/players/${id}/champions`);
  const band = page.getByTestId("profile-header");
  await expect(band).toHaveAttribute("data-compact");
  await expect(band.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  await expect(band.getByTestId("card-emblem")).toHaveAttribute("data-emblem", "flame");
  await expect(band.getByTestId("lineup-status")).toBeVisible();
  expect((await band.boundingBox())!.height, "the band stays a band").toBeLessThanOrEqual(80);

  // Leaderboards: the member's name on the board carries their emblem and name style, as on the card.
  await page.goto("/leaderboards");
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  const formRow = page.locator(`[data-testid=form-row][data-player-id="${id}"]`);
  await expect(formRow.getByTestId("card-emblem")).toHaveAttribute("data-emblem", "flame");
  await expect(formRow.getByTestId("card-name")).toHaveAttribute("data-name-style", "wide");

  // Players on a phone: the same row shows the same name style, emblem and tagline, and no art (the
  // strip is left out of the page's layout, so its lazy picture is never requested: rows stay light).
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await page.context().storageState() });
  const small = await phone.newPage();
  const art: string[] = [];
  small.on("request", (r) => {
    if (/\/cdn\/img\/champion\/tiles\//.test(r.url())) art.push(r.url());
  });
  await small.goto("/players");
  const row = small.locator("main [data-testid='player-card-item']").filter({ has: small.locator(`a[href='/players/${id}']`) });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-frame", "angular");
  await expect(row.getByTestId("card-emblem")).toHaveAttribute("data-emblem", "flame");
  await expect(row.getByTestId("card-name")).toHaveAttribute("data-name-style", "wide");
  await expect(row.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");
  await expect(row.locator("[data-art-layer]")).toHaveCount(0);
  await expect(row.locator("[data-row-art]")).toBeHidden();
  await small.waitForLoadState("networkidle");
  expect(art, "no row art requested on a phone").toEqual([]);
  await phone.close();

  // Back to the standard card.
  await page.goto(`/players/${id}`);
  await resetCard(page);
  await expect(page.getByTestId("profile-header").getByTestId("card-tagline")).toHaveCount(0);
});

test("animated effects stop for reduced motion", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await openTopProfile(page);
  await openStudio(page);
  await step(page, "effects");
  await page.getByText("Accent shimmer").click();
  const shimmer = page.getByTestId("card-preview").getByTestId("card-shimmer");
  await expect(shimmer).toHaveCount(1);
  expect(await shimmer.evaluate((e) => getComputedStyle(e).animationName)).toBe("card-shimmer");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await shimmer.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  await discard(page);
});

test("the banner's help says who sees it: teammates, and the public team page while in the lineup or a substitute", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await openTopProfile(page);
  await openStudio(page);
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-step", "style");
  await page.getByRole("radiogroup", { name: "Background" }).getByRole("radio", { name: "My banner" }).click();
  // The public team page draws the lineup's and the substitutes' cards with their banner (server/public/team.ts, publicLook).
  const panel = page.getByTestId("banner-panel");
  await expect(panel).toContainText("Shown to teammates, and on the public team page while you're in the lineup or a substitute.");
  await expect(panel).not.toContainText(/only members/i);
  await discard(page);
});

test("on a phone: one column, the preview stays in view, nothing scrolls sideways", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone layout");
  await openTopProfile(page);
  await openStudio(page);
  const width = page.viewportSize()!.width;
  // Nothing wider than the screen: the presets wrap, and the sections are one bar, not a strip of steps.
  const wide = await page.evaluate((w) => [...document.querySelectorAll("dialog *")].filter((e) => e.getBoundingClientRect().right > w + 1).map((e) => e.outerHTML.slice(0, 80)), width);
  expect(wide).toEqual([]);
  await expect(page.getByTestId("studio-steps")).toBeHidden();
  await expect(page.getByTestId("studio-section-bar")).toBeInViewport();
  // Style: only the controls scroll; at their end the preview, the section bar and Save are still on screen.
  await page.getByTestId("studio-panel-style").evaluate((e) => e.scrollTo(0, e.scrollHeight));
  await expect(page.getByTestId("card-preview")).toBeInViewport();
  await expect(page.getByTestId("studio-section-bar")).toBeInViewport();
  await expect(page.getByTestId("save-card-style")).toBeInViewport({ ratio: 1 });
  // A palette is one tap, and the custom colour on the same step follows it (one draft).
  await step(page, "colours");
  await page.getByTestId("palettes").getByRole("button", { name: /Ember/ }).click();
  await expect(page.getByLabel("Primary colour: hex value")).toHaveValue("#ff8a3d");
  // The sliders are comfortable to use with a finger.
  await step(page, "position");
  const slider = page.getByRole("slider", { name: "Zoom" });
  expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await discard(page);
});

test("on desktop sizes every step fits beside the preview without scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await openTopProfile(page);
  for (const [w, h] of [
    [1366, 768],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await openStudio(page);
    for (const id of ["style", "artwork", "position", "colours", "identity", "effects"] as const) {
      await step(page, id);
      const panel = page.getByTestId(`studio-panel-${id}`);
      const over = await panel.evaluate((e) => e.scrollHeight - e.clientHeight);
      expect(over, `${id} at ${w}×${h} needs no scrolling`).toBeLessThanOrEqual(1);
      await expect(page.getByTestId("card-preview")).toBeInViewport({ ratio: 1 });
    }
    // Next and Back walk the steps in order.
    await page.getByTestId("studio-prev").click();
    await expect(page.getByTestId("card-studio")).toHaveAttribute("data-step", "identity");
    await page.getByTestId("studio-cancel").click();
    await expect(page.getByTestId("card-studio")).toBeHidden();
  }
});

test("a slider moves the preview without waiting for the whole Studio", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await openTopProfile(page);
  await openStudio(page);
  await step(page, "position");
  const zoom = page.getByRole("slider", { name: "Zoom" });
  const box = (await zoom.boundingBox())!;
  // A quick drag across the track: the preview ends at the slider's final value.
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + (box.width * i) / 20, box.y + box.height / 2);
  await page.mouse.up();
  const value = await zoom.inputValue();
  await expect(page.getByTestId("card-preview")).toHaveAttribute("data-zoom", String(Number(value)));
  await discard(page);
});
