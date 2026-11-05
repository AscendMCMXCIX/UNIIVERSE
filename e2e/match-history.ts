import { expect, type Locator, type Page } from "./test";

/*
  Match History's games open under their card (components/match-history/match-breakdown.tsx): the
  card is a toggle (its button's aria-expanded), and the breakdown (Scoreboard, Analysis, Timeline,
  Build) loads into the region below it. Team → Matches opens its games the same way. The match
  window is for Matchups, Encounters and links to a game that is not on the page shown, and on
  phones for every game: there a game takes the whole screen (docs/MOBILE.md), so these helpers
  open and close that window instead, and return the same breakdown from it.
*/

/** Phones (below md) open a game as the match window over the whole screen. */
export const opensFullScreen = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

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
  if (opensFullScreen(card.page())) return openWindowed(card.page(), () => card.click({ position: { x: 24, y: 16 }, timeout: 2_000 }));
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
  if (opensFullScreen(game.page())) return openWindowed(game.page(), () => game.getByTestId("together-card").click({ position: { x: 24, y: 12 }, timeout: 2_000 }));
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
  if (opensFullScreen(card.page())) {
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
 * A point 4px left of an objective under a Timeline chart (`gold-chart`), on no mark and with no
 * other mark within 6px, so that objective is the nearest; with the objective's minute. Null when no
 * objective has that room. Left of a mark, the minute under the finger is an earlier frame.
 */
export async function besideAMark(chart: Locator): Promise<{ x: number; y: number; minute: number } | null> {
  await chart.getByTestId("gold-chart-objectives").evaluate((el) => el.scrollIntoView({ block: "center" }));
  return chart.getByTestId("gold-chart-events").evaluate((strip) => {
    const marks = [...strip.querySelectorAll("[data-minute]")];
    const gap = (el: Element, x: number, y: number) => {
      const r = el.getBoundingClientRect();
      return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    };
    for (const mark of strip.querySelectorAll("[data-testid='timeline-objective']")) {
      const r = mark.getBoundingClientRect();
      const [x, y] = [r.left - 4, r.top + r.height / 2];
      const room = Math.min(...marks.filter((m) => m !== mark).map((m) => gap(m, x, y)));
      if (room > 6 && strip.contains(document.elementFromPoint(x, y))) return { x, y, minute: Number(mark.getAttribute("data-minute")) };
    }
    return null;
  });
}
