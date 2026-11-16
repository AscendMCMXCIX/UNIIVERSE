import { expect, type Locator, type Page } from "./test";

/*
  Matchup Intel (Resources → Matchup Intel, docs/MATCHUP_INTEL.md): its address, its two pickers
  and their windows. Shared by e2e/matchup-intel.spec.ts.
*/

/** The page for a choice of champions (either may be left out), once its heading is drawn. */
export async function openMatchupIntel(page: Page, champion?: string, vs?: string) {
  const q = new URLSearchParams();
  if (champion) q.set("champion", champion);
  if (vs) q.set("vs", vs);
  await page.goto(`/resources/matchups${q.size ? `?${q.toString()}` : ""}`);
  await expect(page.getByRole("heading", { level: 1, name: "Matchup Intel" })).toBeVisible();
}

/** A side's picker window, opened by its slot; clicked again until the page is interactive (a click before hydration does nothing). */
export async function openPicker(page: Page, slot: "you" | "enemy"): Promise<Locator> {
  const win = page.getByTestId("matchup-picker");
  await expect(async () => {
    if (!(await win.isVisible())) await page.getByTestId(`matchup-pick-${slot}`).click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return win;
}

/** The champions a picker window's roster shows, in order (by Data Dragon id). */
export const rosterIds = (win: Locator) => win.getByTestId("matchup-picker-grid").locator("button[data-champion]").evaluateAll((els) => els.map((e) => e.getAttribute("data-champion")));

/** Chooses a champion on one side: types `search` in its picker window and takes `id` from the results. */
export async function choose(page: Page, slot: "you" | "enemy", search: string, id: string) {
  const win = await openPicker(page, slot);
  await win.getByTestId("matchup-picker-search").fill(search);
  await win.getByTestId("matchup-picker-grid").locator(`button[data-champion="${id}"]`).click();
  await expect(win).toHaveCount(0);
  await expect(page.getByTestId(`matchup-pick-${slot}`)).toHaveAttribute("data-champion", id);
}

/** The enemy's ability rows, P Q W E R. */
export const enemyAbilities = (page: Page) => page.getByTestId("matchup-enemy-abilities").getByTestId("ability-row");

/** No page wider than the screen. */
export const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
