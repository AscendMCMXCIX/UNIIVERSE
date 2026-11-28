import { expect, type Locator, type Page } from "./test";

/*
  Match History's games open under their card in the flow (components/match-history/inline-match.tsx): the
  card is a toggle (its button's aria-expanded), and the post-game view (the loadout, figures, lane
  and scoreboard) loads into the region below it. Team → Matches opens its games the same way. The match
  window is for Matchups, Encounters and links to a game that is not on the page shown, and on
  phones for every game: there a game takes the whole screen (docs/MOBILE.md), and in the one-screen
  workspace of a desktop window, where every game opens in the game window over the list; so these
  helpers open and close that window instead, and return the same breakdown from it.
*/

/** Phones (below md) open a game as the match window over the whole screen. */
export const opensFullScreen = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

/**
 * A desktop window in the one-screen workspace (docs/RESPONSIVE.md, "One-screen desktop pages": a fine pointer,
 * from 80rem wide, at least 41rem tall) opens every game of Match History and Team Matches in the game window
 * over the list (MatchDetailModal's workspace mode), never under its card: the list's section carries
 * data-workspace once the page knows. Asked once the page is interactive.
 */
export async function inWorkspace(page: Page): Promise<boolean> {
  if (opensFullScreen(page)) return false;
  const section = page.locator("[data-testid=match-history], [data-testid=played-together], [data-testid=encounters]").first();
  // The server's HTML marks the section for the CSS gate; once interactive the page knows (it drops the mark in the flow).
  await expect(section).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  return (await section.getAttribute("data-workspace")) !== null;
}

/**
 * A desktop window just under the one-screen gate's 41rem (640px tall, its width and so its cards' layout kept): the flow,
 * where a game opens under its card and a page holds ten games, held by the tests of that behaviour and of what a full page
 * shows (the workspace has its own: e2e/matches-workspace.spec.ts, e2e/one-screen.spec.ts). Call it before the page loads.
 */
export const FLOW_HEIGHT = 640;
export async function inTheFlow(page: Page) {
  const vp = page.viewportSize();
  if (vp && vp.width >= 1280 && vp.height >= 656) await page.setViewportSize({ width: vp.width, height: FLOW_HEIGHT });
}

/** Phones and the workspace open a game in a window (the whole screen, or the workspace's game window). */
export const opensInWindow = async (page: Page) => opensFullScreen(page) || (await inWorkspace(page));

/** Opens a game as the whole-screen match window (phones) and waits for its breakdown. */
async function openWindowed(page: Page, click: () => Promise<void>): Promise<Locator> {
  const win = page.getByTestId("match-detail");
  await expect(async () => {
    if (!(await win.isVisible())) await click();
    await expect(win).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  const breakdown = win.getByTestId("match-breakdown");
  await expect(breakdown).toBeVisible({ timeout: 15_000 });
  return breakdown;
}

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
  if (await opensInWindow(card.page())) return openWindowed(card.page(), () => card.click({ position: { x: 24, y: 16 }, timeout: 2_000 }));
  const row = card.getByTestId("match-row");
  await expect(async () => {
    if ((await row.getAttribute("aria-expanded")) !== "true") await card.click({ position: { x: 24, y: 16 }, timeout: 2_000 });
    await expect(row).toHaveAttribute("aria-expanded", "true", { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  const breakdown = expandedOf(card).getByTestId("match-breakdown");
  await expect(breakdown).toBeVisible({ timeout: 15_000 });
  return breakdown;
}

/** Opens a Team → Matches game (its list item, `together-game`) under its card and waits for its breakdown. */
export async function openTogether(game: Locator): Promise<Locator> {
  if (await opensInWindow(game.page())) return openWindowed(game.page(), () => game.getByTestId("together-card").click({ position: { x: 24, y: 12 }, timeout: 2_000 }));
  const button = game.getByTestId("together-open");
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true") await game.getByTestId("together-card").click({ position: { x: 24, y: 12 }, timeout: 2_000 });
    await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  const breakdown = game.getByTestId("match-expanded").getByTestId("match-breakdown");
  await expect(breakdown).toBeVisible({ timeout: 15_000 });
  return breakdown;
}

/**
 * Opens the shared match window the way a page still does: a link to a game that is not on the
 * page shown (the first game of the second page of the Top player's Match History).
 */
export async function openMatchWindow(page: Page): Promise<Locator> {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await page.getByTestId("match-next").click();
  await expect(page).toHaveURL(/page=2/);
  const elsewhere = (await page.getByTestId("match-row").first().getAttribute("data-match"))!;
  await page.goto(`/players/${id}/matches?match=${elsewhere}`);
  const win = page.getByTestId("match-detail");
  await expect(win).toBeVisible();
  return win;
}

/** Closes a game opened under its card (the card toggles it); on a phone, its whole-screen window. */
export async function closeGame(card: Locator) {
  if (await opensInWindow(card.page())) {
    const win = card.page().getByTestId("match-detail");
    await win.getByTestId("match-detail-close").click();
    await expect(win).toHaveCount(0);
    return;
  }
  await card.click({ position: { x: 24, y: 16 } });
  await expect(card.getByTestId("match-row")).toHaveAttribute("aria-expanded", "false");
  await expect(expandedOf(card)).toHaveCount(0);
}


/**
 * Scrolls an open Match History game until its card's own Previous, Next and Close have gone up under
 * what is pinned above the page: from then its footer shows the same three (one set at a time).
 */
export async function pastGameHeader(page: Page) {
  await page.evaluate(() => {
    const steps = document.querySelector("li[data-expanded] [data-game-step][data-where=header]");
    if (!steps) return;
    const pinned = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    window.scrollBy({ top: steps.getBoundingClientRect().bottom - pinned + 4, behavior: "instant" });
  });
}

/**
 * A phone's game window shows one page at a time (Player, Build, Scoreboard: post-game.tsx, the
 * owner's brief of 24 Nov 2026, §2); this shows the one asked for. Elsewhere (no pages) it does
 * nothing: every part is on the one screen.
 */
export async function showGamePage(breakdown: Locator, page: "player" | "build" | "board") {
  const tab = breakdown.getByTestId(`post-game-page-${page}`);
  // A window on a phone or under 481px tall gets its pages once the page has hydrated (usePhone is
  // false on the first render): wait for them there, so a busy machine cannot answer "no pages" early.
  const size = breakdown.page().viewportSize();
  // (The workspace's game window pages by measure, where the view does not fit it: its tabs are there or not by then.)
  const paged = (await breakdown.getAttribute("data-variant")) === "window" && !!size && (size.width < 768 || size.height <= 480);
  if (paged) await expect(tab).toBeVisible({ timeout: 10_000 });
  if (!(await tab.count())) return;
  if ((await tab.getAttribute("aria-checked")) !== "true") await tab.click();
  await expect(breakdown).toHaveAttribute("data-page", page);
}
