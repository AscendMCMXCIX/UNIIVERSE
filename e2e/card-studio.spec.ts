import { expect, test, type Page } from "@playwright/test";

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

async function advanced(page: Page, tab: "artwork" | "colours" | "identity" | "effects") {
  await page.getByTestId("studio-mode-advanced").click();
  await page.getByTestId(`studio-tab-${tab}`).click();
}

async function resetCard(page: Page) {
  await openStudio(page);
  await page.getByTestId("studio-reset-all").click();
  await advanced(page, "identity");
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
  // Escape with unsaved changes asks first; declining keeps the Studio open.
  page.once("dialog", (d) => void d.dismiss());
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("card-studio")).toBeVisible();
  // Cancel discards: nothing was saved.
  await page.getByTestId("studio-cancel").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
  await expect(header).toHaveAttribute("data-frame", savedFrame ?? "none");
  await page.reload();
  await expect(page.getByTestId("profile-header")).toHaveAttribute("data-frame", savedFrame ?? "none");
});

test("a saved card shows on the profile, Team and Players, and cards stay aligned", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  const id = await openTopProfile(page);
  await openStudio(page);
  // Quick is where the Studio opens: presets, artwork, palettes and frames.
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-mode", "quick");
  await page.getByTestId("preset-competitive").click();
  await advanced(page, "identity");
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
  const card = page.locator(`main a[href='/players/${id}']`).first();
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
  await advanced(page, "effects");
  await page.getByText("Accent shimmer").click();
  const shimmer = page.getByTestId("card-preview").getByTestId("card-shimmer");
  await expect(shimmer).toHaveCount(1);
  expect(await shimmer.evaluate((e) => getComputedStyle(e).animationName)).toBe("card-shimmer");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await shimmer.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  await page.getByTestId("studio-cancel").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
});

test("on a phone: one column, the preview stays in view, nothing scrolls sideways", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone layout");
  await openTopProfile(page);
  await openStudio(page);
  const width = page.viewportSize()!.width;
  // Nothing wider than the screen except the presets row, which scrolls on purpose.
  const wide = await page.evaluate((w) => [...document.querySelectorAll("dialog *")].filter((e) => !e.closest("[data-testid=studio-presets]") && e.getBoundingClientRect().right > w + 1).map((e) => e.outerHTML.slice(0, 80)), width);
  expect(wide).toEqual([]);
  for (const m of ["quick", "advanced"]) await expect(page.getByTestId(`studio-mode-${m}`)).toBeInViewport();
  // Quick: scroll the controls to the bottom (frames): the preview is still on screen.
  await page.locator("dialog [class*='overflow-y-auto']").first().evaluate((e) => e.scrollTo(0, e.scrollHeight));
  await expect(page.getByTestId("card-preview")).toBeInViewport();
  // A palette is one tap, and the custom colour under Advanced follows it (one draft).
  await page.getByTestId("palettes").getByRole("button", { name: /Ember/ }).click();
  await advanced(page, "colours");
  await expect(page.getByLabel("Primary colour: hex value")).toHaveValue("#ff8a3d");
  // The sliders are comfortable to use with a finger.
  await page.getByTestId("studio-tab-artwork").click();
  const slider = page.getByRole("slider", { name: "Zoom" });
  expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await page.getByTestId("studio-cancel").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
});
