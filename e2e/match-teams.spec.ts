import { expect, test, type Page } from "./test";
import { expandedOf, openGame } from "./match-history";

/*
  Both teams on every match card (synthetic demo games: the other players are named "Demo Ally"
  and "Demo Rival", never real people). A player's Match History and Team → Matches use the same
  preview: blue then red, five a side, the player in bold, team members marked, the player's side
  tinted. Wide cards show names without any interaction; a player's Match History on phones keeps
  the icons in one line (the names stay readable to screen readers), while Team → Matches shows the
  names on every screen, and nothing overflows. The game still opens under its card.
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
  // The card is a box with one button for the whole game behind its content (the player links
  // cannot sit inside a button).
  const card = page.getByTestId("match-card").first();
  const row = card.getByTestId("match-row");
  await expect(row).toBeVisible();
  const teams = card.getByTestId("match-teams");
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
    // Phones: a card leaves both teams to the game's own screen (docs/MOBILE.md); the row still
    // describes them to screen readers (above), and the scoreboard lists all ten.
    await expect(teams).toBeHidden();
    expect(await name.evaluate((e) => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  } else {
    // Wider screens: names readable without hovering or opening anything.
    await expect(name).toBeVisible();
    await expect(name).toContainText(/\S/);
    // Compact: one band on wide lists (about 110 px), three short rows where the card stacks.
    const box = (await row.boundingBox())!;
    expect(box.height, "a card stays compact").toBeLessThan((page.viewportSize()?.width ?? 0) >= 1280 ? 140 : 170);
    // Members' names open their profile; the demo's synthetic players (DEMO_ match ids, no Riot
    // server) have no reliable Riot ID and stay plain text, never a guessed OP.GG link.
    const you = teams.locator("[data-you]").getByTestId("player-link");
    await expect(you).toHaveAttribute("data-link", "profile");
    await expect(you).toHaveAttribute("href", /^\/players\/[\w-]+$/);
    await expect(teams.locator('[data-testid="team-slot"]:not([data-member]) a')).toHaveCount(0);
    // Previews keep the keyboard on the cards: their links are for pointer and touch.
    await expect(you).toHaveAttribute("tabindex", "-1");
  }
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  // The game still opens from the card (anywhere but a player link), under it.
  await openGame(card);
});

test("Team → Matches: the same preview, with the team members marked", async ({ page }) => {
  test.skip(isPhone(page), "a phone's card keeps to the members who played; both teams are in the game's own screen (e2e/mobile-nav.spec.ts)");
  await page.goto("/matches");
  const game = page.getByTestId("together-game").first();
  await expect(game).toBeVisible();
  const teams = game.getByTestId("match-teams");
  // Two columns of five, as on a player's own match cards (beside the members on wide cards),
  // with every name readable on phones too: the full line-ups are what these cards are for.
  await expect(teams).toHaveAttribute("data-variant", "columns");
  await expect(teams.locator('[data-testid="team-slot"]')).toHaveCount(10);
  const names = teams.getByTestId("team-slot-name");
  for (const i of [0, 9]) {
    await expect(names.nth(i)).toBeVisible();
    expect(await names.nth(i).evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(24);
  }
  // At least the members listed on the card are marked in the preview, on their side.
  const members = Number(await game.getAttribute("data-members"));
  expect(await teams.locator("[data-own] [data-member]").count()).toBeGreaterThanOrEqual(members);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("player names: a member's opens their profile, the card still opens the game, the keyboard moves card by card", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "names are shown on wider screens");
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  const card = page.getByTestId("match-card").first();
  const row = card.getByTestId("match-row");
  await expect(row).toBeVisible();
  // One tab stop per card: Tab goes from one card's button straight to the next card's, never
  // into the preview links (they are for pointer and touch; the opened game has them in the tab order).
  // The list may still re-render once on arrival (it sizes its page to the window), so the check
  // is repeated until it holds; with a tabbable preview link it never would.
  await page.waitForLoadState("networkidle");
  await expect(async () => {
    await row.focus();
    await expect(row).toBeFocused({ timeout: 500 });
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("match-row");
    await expect(page.getByTestId("match-row").nth(1)).toBeFocused({ timeout: 500 });
    await page.keyboard.press("Shift+Tab");
    await expect(row).toBeFocused({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
  // Tooltips: the content lies over the card's button, so the pointer reaches each element with a
  // title (slots, item and spell icons) rather than the button.
  const hits = await card.locator("[title]").evaluateAll((els) =>
    els
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => {
        const r = e.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!at && (e === at || e.contains(at) || at.contains(e));
      }),
  );
  expect(hits.length).toBeGreaterThan(0);
  expect(hits.every(Boolean), "every titled element is under the pointer, not covered").toBe(true);
  // Space opens the game under the card and closes it again, like any toggle button.
  await page.keyboard.press("Space");
  const detail = expandedOf(card).getByTestId("match-breakdown");
  await expect(detail).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(expandedOf(card)).toHaveCount(0);
  await expect(row).toBeFocused();
  // Enter opens it.
  await page.keyboard.press("Enter");
  await expect(detail).toBeVisible();
  // The scoreboard: the player's own name links to their profile, in the tab order; the demo's
  // synthetic opponents stay plain text.
  const mine = detail.locator("[data-testid='participant'][data-player] [data-testid='player-link']");
  await expect(mine).toHaveAttribute("data-link", "profile");
  await expect(mine).not.toHaveAttribute("tabindex", "-1");
  await expect(detail.locator("[data-testid='participant']:not([data-player]) [data-testid='player-link'][data-link='opgg']")).toHaveCount(0);
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(expandedOf(card)).toHaveCount(0);
  // A member's name on the card opens their profile, not the match.
  await card.locator("[data-you]").getByTestId("player-link").click();
  await expect(page).toHaveURL(/\/(players\/[\w-]+|overview)$/);
  await expect(page.getByTestId("match-detail")).toHaveCount(0);
});
