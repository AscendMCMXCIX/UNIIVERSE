import { expect, test, type Page } from "@playwright/test";

/*
  Both teams on every match card (synthetic demo games: the other players are named "Demo Ally"
  and "Demo Rival", never real people). A player's Match History and Team → Matches use the same
  preview: blue then red, five a side, the player in bold, team members marked, the player's side
  tinted. Wide cards show names without any interaction; phones keep the icons in one line (the
  names stay readable to screen readers) and nothing overflows. The match window still opens.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 768;
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("Match History: every stored game shows both teams, the player marked on their side", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  const row = page.getByTestId("match-row").first();
  await expect(row).toBeVisible();
  const teams = row.getByTestId("match-teams");
  await expect(teams.locator('[data-side="blue"] [data-testid="team-slot"]')).toHaveCount(5);
  await expect(teams.locator('[data-side="red"] [data-testid="team-slot"]')).toHaveCount(5);
  // Exactly one player is "you" (the player whose history this is), on the tinted side.
  await expect(teams.locator("[data-you]")).toHaveCount(1);
  await expect(teams.locator("[data-own] [data-you]")).toHaveCount(1);
  // The row describes the teams to screen readers.
  const described = await row.getAttribute("aria-describedby");
  expect(described).toBeTruthy();
  await expect(page.locator(`#${described}`)).toContainText(/Blue team/);
  const name = teams.locator('[data-side="red"] [data-testid="team-slot"]').first().getByTestId("team-slot-name");
  if (isPhone(page)) {
    // Phones: the icons in one line per card; the names are there for screen readers only.
    expect(await name.evaluate((e) => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  } else {
    // Wider screens: names readable without hovering or opening anything.
    await expect(name).toBeVisible();
    await expect(name).toContainText(/\S/);
    // Compact: one band on wide lists (about 110 px), three short rows where the card stacks.
    const box = (await row.boundingBox())!;
    expect(box.height, "a card stays compact").toBeLessThan((page.viewportSize()?.width ?? 0) >= 1280 ? 140 : 170);
  }
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  // The match window still opens from the card.
  await row.click();
  await expect(page.getByTestId("match-detail")).toBeVisible();
});

test("Team → Matches: the same preview, with the team members marked", async ({ page }) => {
  await page.goto("/matches");
  const game = page.getByTestId("together-game").first();
  await expect(game).toBeVisible();
  const teams = game.getByTestId("match-teams");
  await expect(teams).toHaveAttribute("data-variant", "strip");
  await expect(teams.locator('[data-testid="team-slot"]')).toHaveCount(10);
  // At least the members listed on the card are marked in the preview, on their side.
  const members = Number(await game.getAttribute("data-members"));
  expect(await teams.locator("[data-own] [data-member]").count()).toBeGreaterThanOrEqual(members);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});
