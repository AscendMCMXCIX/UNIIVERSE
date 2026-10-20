import { expect, test, type Page } from "@playwright/test";

/*
  Multikills (domain/multikills): the profile's Season performance adds up Riot's multikill counts
  over the same games as its other figures and says how many of those games have them; Match
  History marks each game's largest multikill. Demo games are synthetic, and every one of them
  carries the counts.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function demoTop(page: Page): Promise<string> {
  await page.goto("/players");
  return (await page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first().getAttribute("href"))!;
}

test("the profile adds up multikills over the counted games and says which games they come from", async ({ page }) => {
  const href = await demoTop(page);
  await page.goto(href);
  const strip = page.getByTestId("multikills");
  await expect(strip).toBeVisible();
  for (const [key, label] of [["double", "Double kills"], ["triple", "Triple kills"], ["quadra", "Quadra kills"], ["penta", "Pentakills"]])
    await expect(strip.getByTestId(`multikill-${key}`)).toHaveText(new RegExp(`^${label}\\s*\\d+$`));
  // Every demo game has the counts, so they come from as many games as the Games figure counts.
  const games = (await page.getByTestId("season-record").textContent())!.trim();
  await expect(strip.getByTestId("multikill-sample")).toHaveText(`from all ${games} games`);
  // A narrower mode narrows them too.
  await page.goto(`${href}?mode=solo`);
  const solo = (await page.getByTestId("season-record").textContent())!.trim();
  expect(Number(solo)).toBeLessThan(Number(games));
  await expect(page.getByTestId("multikill-sample")).toHaveText(`from all ${solo} games`);
});

test("Match History marks a game's largest multikill, and nothing else", async ({ page }) => {
  const href = await demoTop(page);
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
  // Inside a member's cell, never on its own.
  await expect(page.getByTestId("together-member").filter({ has: marks.first() })).toHaveCount(1);
});

test("Match History links the account's history on OP.GG, named as such, never as the game", async ({ page }) => {
  const href = await demoTop(page);
  await page.goto(`${href}/matches`);
  const link = page.getByTestId("match-history-opgg");
  await expect(link).toBeVisible();
  await expect(link).toHaveText(/^View Match History on OP\.GG · Demo Top \(opens in a new tab\)$/);
  await expect(link).toHaveAttribute("href", "https://op.gg/lol/summoners/euw/Demo%20Top-DEMO");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  // A demo game's own window has no OP.GG link (no real Riot match id): see detail-panel.spec.ts.
});
