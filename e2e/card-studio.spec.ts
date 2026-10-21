import { expect, test, type Page } from "./test";

/*
  Player Card Studio: presets and a live preview, nothing saved until Save (Cancel and Escape keep
  the saved card), the saved look on the profile, Team and Players, aligned cards whatever the
  tagline, reduced motion, and a phone layout without sideways scrolling. Every test puts the card
  back to the standard look (later tests share this demo roster).
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

test("a saved card shows on the profile, Team and Players, and cards stay aligned", async ({ page }, info) => {
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

  // Players directory.
  await page.goto("/players");
  // The card is a container with one link to the profile laid over it.
  const card = page.locator("main [data-testid='player-card-item']").filter({ has: page.locator(`a[href='/players/${id}']`) });
  await expect(card).toHaveAttribute("data-frame", "angular");
  await expect(card.getByTestId("card-tagline")).toHaveText("“Calm in the chaos”");

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
