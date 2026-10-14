import { expect, type Page } from "@playwright/test";

/**
 * Starts a Ranked Flex draft through the whole flow: setup → opponent scouting (left empty) →
 * side selection → the room. Returns the room's path.
 */
export async function startDraft(page: Page, side: "blue" | "red" = "blue"): Promise<string> {
  await page.goto("/draft");
  await page.getByTestId("start-draft").click();
  await page.waitForURL(/\/draft\/[0-9a-f-]+\/scout$/);
  await page.getByTestId("continue-to-draft").click();
  await page.waitForURL(/\/draft\/[0-9a-f-]+$/);
  await page.getByTestId(`side-${side}`).click();
  await page.getByTestId("begin-pick-ban").click();
  await expect(page.getByTestId("current-action")).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).pathname;
}
