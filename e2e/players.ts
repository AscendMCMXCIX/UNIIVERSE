import type { Locator, Page } from "./test";

/*
  The Players roster lists everyone as rows at every width (docs/MOBILE.md: a row per player in one
  panel): each row (`player-card-item`) has one link laid over it (`player-card`) that opens the
  profile. Both carry the player's name in data-player-name.
*/

/** The link that opens a player's profile from the roster (by name, or the first). */
export function playerEntry(page: Page, name?: string): Locator {
  return page.locator(`main a[data-testid='player-card']${name ? `[data-player-name="${name}"]` : ""}`);
}
