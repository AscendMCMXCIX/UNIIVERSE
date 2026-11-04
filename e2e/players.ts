import type { Locator, Page } from "./test";

/*
  The Players directory lists everyone as rows on a phone (below sm: `player-row`, docs/MOBILE.md)
  and as cards from sm up (`player-card`, the link laid over each card). Both carry the player's
  name in data-player-name and open the same profile.
*/

/** Phones list the directory as rows. */
export const listsAsRows = (page: Page) => (page.viewportSize()?.width ?? 1440) < 640;

/** The link that opens a player's profile from the directory at this width (by name, or the first). */
export function playerEntry(page: Page, name?: string): Locator {
  const kind = listsAsRows(page) ? "player-row" : "player-card";
  return page.locator(`main a[data-testid='${kind}']${name ? `[data-player-name="${name}"]` : ""}`);
}
