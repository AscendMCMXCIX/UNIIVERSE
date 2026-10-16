import { expect, type Locator } from "@playwright/test";

/**
 * Opens a filter bar that is folded behind its "Filters" button (phones, and tablets for
 * Leaderboards). Returns false when the filters are already inline.
 */
export async function openFilterBar(scope: Locator, toggleTestId = "filter-toggle"): Promise<boolean> {
  // Streamed pages swap their content in after load: wait for the bar itself first.
  await expect(scope).toBeVisible();
  const toggle = scope.getByTestId(toggleTestId);
  if (!(await toggle.isVisible())) return false;
  // Retried: a click before the page is interactive does nothing.
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  return true;
}
