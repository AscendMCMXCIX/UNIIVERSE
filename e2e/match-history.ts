import { expect, type Locator, type Page } from "./test";

/*
  Match History's games open under their card (components/match-history/match-breakdown.tsx): the
  card is a toggle (its button's aria-expanded), and the breakdown (Scoreboard, Analysis, Timeline,
  Build) loads into the region below it. The match window is for Team Matches, Matchups, Encounters
  and links to a game that is not on the page shown.
*/

/** A card of the page by its match id. */
export const cardOf = (page: Page, matchId: string) => page.getByTestId("match-card").filter({ has: page.locator(`[data-match="${matchId}"]`) });

/** The region under a card (present only while the game is open). */
export const expandedOf = (card: Locator) => card.locator("xpath=..").getByTestId("match-expanded");

/**
 * Opens a game under its card and waits for its breakdown. A click before the page is interactive
 * does nothing, so it clicks again until the card says it is open (never twice once it is: a
 * second click would close it).
 */
export async function openGame(card: Locator): Promise<Locator> {
  const row = card.getByTestId("match-row");
  await expect(async () => {
    if ((await row.getAttribute("aria-expanded")) !== "true") await card.click({ position: { x: 24, y: 16 }, timeout: 2_000 });
    await expect(row).toHaveAttribute("aria-expanded", "true", { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  const breakdown = expandedOf(card).getByTestId("match-breakdown");
  await expect(breakdown).toBeVisible({ timeout: 15_000 });
  return breakdown;
}

/** Closes a game opened under its card (the card toggles it). */
export async function closeGame(card: Locator) {
  await card.click({ position: { x: 24, y: 16 } });
  await expect(card.getByTestId("match-row")).toHaveAttribute("aria-expanded", "false");
  await expect(expandedOf(card)).toHaveCount(0);
}
