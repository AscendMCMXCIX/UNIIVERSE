import { expect, test, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

/*
  Multikills (domain/multikills): the profile's Season performance adds up Riot's multikill counts
  over the same games as its other figures and says how many of those games have them; Match
  History marks each game's largest multikill. Demo games are synthetic. Every game of Demo Top
  carries the counts; Demo Support's older games were "stored before the counts were kept", like
  most real accounts' until the figures backfill reaches them: some still to fetch, some no longer
  at Riot (server/demo/seed.ts).
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function profileOf(page: Page, name: string): Promise<string> {
  await page.goto("/players");
  return (await page.locator(`main a[data-testid='player-card'][data-player-name='${name}']`).first().getAttribute("href"))!;
}

const seasonGames = async (page: Page) => Number((await page.getByTestId("season-record").textContent())!.replace(/,/g, "").trim());

const KINDS = [
  ["double", "Double kills"],
  ["triple", "Triple kills"],
  ["quadra", "Quadra kills"],
  ["penta", "Pentakills"],
] as const;

test("the profile adds up multikills over the counted games and says which games they come from", async ({ page }) => {
  const href = await profileOf(page, "Demo Top");
  await page.goto(href);
  const strip = page.getByTestId("multikills");
  await expect(strip).toBeVisible();
  // Every game has its counts: no partial marker, no coverage bar.
  await expect(strip).toHaveAttribute("data-coverage", "complete");
  await expect(strip.getByTestId("multikill-partial")).toHaveCount(0);
  await expect(strip.getByTestId("multikill-coverage")).toHaveCount(0);
  // Four totals, each named (the name is read before the count), in one row on every width.
  for (const [key, label] of KINDS) await expect(strip.getByTestId(`multikill-${key}`)).toHaveText(new RegExp(`^${label}\\s*\\d+$`));
  const tiles = await strip.getByTestId("multikill-tiles").locator(":scope > div").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(new Set(tiles.map(Math.round)).size).toBe(1);
  const games = await seasonGames(page);
  await expect(strip.getByTestId("multikill-sample")).toHaveText(`From all ${games} games`);
  // By champion: closed at first, opened from a 24px toggle (WCAG 2.5.8), and closed again.
  const byChampion = strip.getByTestId("multikills-by-champion");
  const toggle = byChampion.locator("summary");
  await expect(toggle).toBeVisible();
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  const rows = byChampion.getByTestId("multikill-champion");
  await expect(rows.first()).toBeHidden();
  await toggle.click();
  await expect(rows.first()).toBeVisible();
  // Each row: the champion's portrait and name, its games, and its counts as words, never a table.
  await expect(rows.first().locator("img, [title]").first()).toBeVisible();
  await expect(rows.first()).toContainText(/in \d+ games?/);
  await expect(rows.first()).toContainText(/\d+ (penta|quadra|triple|double)/);
  await expect(byChampion.locator("table")).toHaveCount(0);
  await toggle.click();
  await expect(rows.first()).toBeHidden();
  // A narrower mode narrows them too.
  await page.goto(`${href}?mode=solo`);
  const solo = await seasonGames(page);
  expect(solo).toBeLessThan(games);
  await expect(page.getByTestId("multikill-sample")).toHaveText(`From all ${solo} games`);
});

test("partial counts say so: how many games they come from, which are still to come, and which never will", async ({ page }) => {
  const href = await profileOf(page, "Demo Support");
  await page.goto(href);
  const strip = page.getByTestId("multikills");
  await expect(strip).toHaveAttribute("data-coverage", "partial");
  await expect(strip.getByTestId("multikill-partial")).toHaveText("Partial");
  // The season's games (the Games figure) and the games with counts are told apart.
  const games = await seasonGames(page);
  const sample = (await strip.getByTestId("multikill-sample").textContent())!;
  const [, counted, of] = /^From (\d+) of (\d+) games$/.exec(sample) ?? [];
  expect(Number(of)).toBe(games);
  expect(Number(counted)).toBeGreaterThan(0);
  expect(Number(counted)).toBeLessThan(games);
  const note = strip.getByTestId("multikill-coverage-note");
  await expect(note).toContainText(/still being fetched from Riot .* not complete yet/);
  await expect(note).toContainText(/Riot no longer provides the records? of \d+ games?/);
  // The coverage bar names the same numbers for screen readers.
  await expect(strip.getByTestId("multikill-coverage").getByRole("img")).toHaveAccessibleName(new RegExp(`^From ${counted} of ${games} games; \\d+ no longer available from Riot$`));
  // The totals still show, from the games that have them, and the section fits the screen.
  for (const [key] of KINDS) await expect(strip.getByTestId(`multikill-${key}`)).toBeVisible();
  const box = (await strip.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
  expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // The marker, the bar and the totals pass axe (WCAG 2.1 A/AA): contrast, names, list structure.
  const scan = await new AxeBuilder({ page }).include("[data-testid=multikills]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});

test("Match History marks a game's largest multikill, and nothing else", async ({ page }) => {
  const href = await profileOf(page, "Demo Top");
  await page.goto(`${href}/matches`);
  await expect(page.getByTestId("match-card").first()).toBeVisible();
  const marks = page.getByTestId("match-multikill");
  await expect(marks.first()).toBeVisible();
  for (const text of await marks.allTextContents()) expect(text.trim()).toMatch(/^(Double kill|Triple kill|Quadra kill|Pentakill)$/);
  // The card's button names it too, for screen readers.
  const marked = page.getByTestId("match-card").filter({ has: marks.first() }).first();
  await expect(marked.getByTestId("match-row")).toHaveAttribute("aria-label", /, (double kill|triple kill|quadra kill|pentakill)\. Open the match details\.$/);
});

test("Team Matches marks each member's largest multikill beside their K/D/A", async ({ page }) => {
  await page.goto("/matches");
  await expect(page.getByTestId("together-game").first()).toBeVisible();
  const marks = page.locator("[data-testid='together-multikill']:visible");
  await expect(marks.first()).toBeVisible();
  for (const text of await marks.allTextContents()) expect(text.trim()).toMatch(/^(Double kill|Triple kill|Quadra kill|Pentakill)$/);
  // Each one inside a member's cell, never on its own.
  expect(await page.getByTestId("together-member").locator("[data-testid='together-multikill']:visible").count()).toBe(await marks.count());
});

test("Match History links the account's history on OP.GG, named as such, never as the game", async ({ page }) => {
  const href = await profileOf(page, "Demo Top");
  await page.goto(`${href}/matches`);
  const link = page.getByTestId("match-history-opgg");
  await expect(link).toBeVisible();
  await expect(link).toHaveText(/^View Match History on OP\.GG · Demo Top \(opens in a new tab\)$/);
  await expect(link).toHaveAttribute("href", "https://op.gg/lol/summoners/euw/Demo%20Top-DEMO");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  // A demo game's own window has no OP.GG link (no real Riot match id): see detail-panel.spec.ts.
});
