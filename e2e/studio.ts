import { expect, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { pick } from "./select";

/*
  Card Studio, for the browser tests: opening it, its four sections, and its previews. A preview is
  the page's own component drawn inside a frame (studio-preview.tsx), so what it shows is read
  through `previewFrame` (Playwright's frame locator); the stage's own element (`card-preview`)
  carries the context, the device, the scale and the look's frame as data attributes.
*/

export type StudioSection = "appearance" | "artwork" | "identity" | "socials";
export type PreviewContext = "header" | "team" | "players" | "peek" | "public";

/** Opens the Studio from the profile header's Customise (pressed until the page has hydrated). */
export async function openStudioFromHeader(page: Page, tap = false): Promise<void> {
  const studio = page.getByTestId("card-studio");
  await expect(async () => {
    // Opened by an earlier press that took longer than a moment (the Studio's code arriving): done.
    if (await studio.isVisible()) return;
    const button = page.getByTestId("profile-header").getByTestId("customise-card");
    if (tap) await button.tap({ timeout: 2_000 });
    else await button.click({ timeout: 2_000 });
    await expect(studio).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/** Opens a section from the tabs (any one, in any order). */
export async function section(page: Page, id: StudioSection, tap = false): Promise<void> {
  const tab = page.getByTestId(`studio-tab-${id}`);
  if (tap) await tab.tap();
  else await tab.click();
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-section", id);
}

/** The preview's frame: the page's component, drawn with the draft look. */
export function previewFrame(page: Page): FrameLocator {
  return page.frameLocator("[data-testid=studio-preview-frame]");
}

/** Shows a preview: the place and the screen. Waits until it has been measured and drawn. */
export async function showPreview(page: Page, context: PreviewContext, device: "desktop" | "mobile"): Promise<Locator> {
  const labels: Record<PreviewContext, string> = { header: "Profile header", team: "Team card", players: "Players list", peek: "Player Peek", public: "Public team page" };
  await pick(page.getByTestId("preview-context"), { label: labels[context] });
  await page.getByTestId(`preview-${device}`).click();
  const stage = page.getByTestId("card-preview");
  await expect(stage).toHaveAttribute("data-context", context);
  await expect(stage).toHaveAttribute("data-device", device);
  await expect(stage).toHaveAttribute("data-width", /\d+/);
  return stage;
}

/** Cancel with unsaved changes asks first (in the action bar); Discard closes and keeps the saved card. */
export async function discard(page: Page): Promise<void> {
  await page.getByTestId("studio-cancel").click();
  await page.getByTestId("studio-confirm-yes").click();
  await expect(page.getByTestId("card-studio")).toBeHidden();
}
