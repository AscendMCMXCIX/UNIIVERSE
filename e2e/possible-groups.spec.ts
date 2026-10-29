import { expect, test, type Page } from "./test";
import { closeGame, openGame } from "./match-history";

/*
  Possible groups in a game's scoreboard (demo data: two rivals who queue together meet each demo
  player in every third game; everyone else is new in every game). Groups load after the
  scoreboard, are worded as history (never "premade", never a percentage), list their evidence
  games, and the sides without one say there is not enough history.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function openMatchWithGroup(page: Page) {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await page.waitForLoadState("networkidle");
  const cards = page.getByTestId("match-card");
  for (let i = 0; i < 6; i++) {
    const card = cards.nth(i);
    const breakdown = await openGame(card);
    const note = breakdown.getByTestId("possible-groups-note");
    await expect(note).not.toHaveAttribute("data-state", "loading", { timeout: 15_000 });
    if ((await breakdown.getByTestId("possible-group").count()) > 0) return { note, card, breakdown };
    await closeGame(card);
  }
  throw new Error("no demo match with a possible group in the first six games");
}

test("a recurring pair is shown as a possible duo with its evidence, never as a confirmed premade", async ({ page }) => {
  const { note, card, breakdown } = await openMatchWithGroup(page);
  const red = breakdown.getByTestId("team-red");
  const group = red.getByTestId("possible-group");
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute("data-size", "2");
  await expect(group).toContainText("Possible duo");
  await expect(group).toContainText("Demo Duo 1, Demo Duo 2");
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const said = (await group.getByTestId("possible-group-games").innerText()).match(/^These two players appeared on the same team in (\w+) previous recorded games\./)![1]!;
  const games = words.includes(said) ? words.indexOf(said) : Number(said);
  expect(games).toBeGreaterThanOrEqual(3);
  // The two rows are marked; nobody on the other side is.
  await expect(red.locator('[data-testid="participant"][data-group="0"]')).toHaveCount(2);
  await expect(breakdown.getByTestId("team-blue").locator("[data-group]")).toHaveCount(0);
  // The evidence opens from the line, by keyboard too: one row per game (ten at most), newest first.
  const evidence = group.getByTestId("possible-group-evidence");
  await expect(evidence).toBeHidden();
  await group.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(evidence).toBeVisible();
  const rows = evidence.locator("li");
  await expect(rows).toHaveCount(Math.min(games, 10) + (games > 10 ? 1 : 0));
  await expect(rows.first()).toContainText(/Ranked (Solo\/Duo|Flex) · (Won|Lost)/);
  // Neutral wording for the side without a group, and what the inference rests on.
  await expect(note).toContainText("Blue side: not enough recorded history to assess possible groups.");
  await expect(note).toContainText(/earlier recorded games found for them \(the 180 days before this match\)/);
  await expect(note).toContainText("not confirmed parties");
  await expect(note).toContainText("members are never labelled");
  // The demo member whose history this is is never part of a group.
  await expect(breakdown.locator('[data-testid="participant"][data-player][data-group]')).toHaveCount(0);
  const text = (await breakdown.innerText()).toLowerCase();
  expect(text).not.toContain("premade");
  expect(await red.getByTestId("possible-groups").innerText()).not.toMatch(/%/);
  // The card still closes the game (the evidence toggle does not hold it open).
  await closeGame(card);
});

test("no history means a neutral note, not 'no premades'", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await page.waitForLoadState("networkidle");
  // Only every third demo game has the pair: one of the first two has none.
  for (let i = 0; i < 2; i++) {
    const card = page.getByTestId("match-card").nth(i);
    const breakdown = await openGame(card);
    const note = breakdown.getByTestId("possible-groups-note");
    await expect(note).toHaveAttribute("data-state", "ok", { timeout: 15_000 });
    if ((await breakdown.getByTestId("possible-group").count()) === 0) {
      await expect(note).toContainText("Possible groups: not enough recorded history to assess.");
      await expect(breakdown.getByTestId("possible-groups")).toHaveCount(0);
      return;
    }
    await closeGame(card);
  }
  throw new Error("expected a demo match without a possible group");
});
