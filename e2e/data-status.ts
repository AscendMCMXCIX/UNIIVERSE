import { expect, type Locator, type Page } from "./test";

/*
  A page's data status (src/components/ui/data-status.tsx): the quiet words beside the scope line and
  one ⓘ (`<testId>-info`) that opens the rest in the shared breakdown (`<testId>-details`: beside it on
  a computer or tablet, a sheet on a phone). A press before the page's code runs is lost, so it is
  pressed again until the breakdown shows.
*/

/** Opens the data status's breakdown (`data-refresh` on a profile, `leaderboards-status` on Leaderboards) and returns it. */
export async function openDataStatus(page: Page, testId = "data-refresh"): Promise<Locator> {
  const info = page.getByTestId(`${testId}-info`);
  const details = page.getByTestId(`${testId}-details`);
  await info.scrollIntoViewIfNeeded();
  await expect(async () => {
    if (!(await details.isVisible())) await info.click();
    await expect(details).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(info).toHaveAttribute("aria-expanded", "true");
  return details;
}
