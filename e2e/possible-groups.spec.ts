import { expect, test, type Page } from "./test";
import { cardOf, closeGame, openGame, showGamePage } from "./match-history";

/*
  Possible groups in a game's scoreboard (demo data: two rivals who queue together meet each demo
  player in every third game; everyone else is new in every game). Groups load after the
  scoreboard, are worded as history (never "premade", never a percentage) and list their evidence
  games; one (i) under the scoreboard says what they are. A side without one says nothing (the
  owner's brief of 24 Nov 2026, §5: no permanent "not enough history" line), and nothing is ever
  presented as "no premade".
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
    if ((await breakdown.getByTestId("possible-group").count()) > 0) {
      await showGamePage(breakdown, "board");
      return { note, card, breakdown };
    }
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
  // The line gives the count; the sentence it stands for is under it once opened (below).
  const counted = Number((await group.getByTestId("possible-group-count").innerText()).match(/(\d+) games? together/)![1]);
  expect(counted).toBeGreaterThanOrEqual(3);
  // The two rows are marked; nobody on the other side is.
  await expect(red.locator('[data-testid="participant"][data-group="0"]')).toHaveCount(2);
  await expect(breakdown.getByTestId("team-blue").locator("[data-group]")).toHaveCount(0);
  // The evidence opens from the line, by keyboard too: one row per game (ten at most), newest first.
  const evidence = group.getByTestId("possible-group-evidence");
  await expect(evidence).toBeHidden();
  await group.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(evidence).toBeVisible();
  const said = (await group.getByTestId("possible-group-games").innerText()).match(/^These two players appeared on the same team in (\w+) previous recorded games\./)![1]!;
  const games = words.includes(said) ? words.indexOf(said) : Number(said);
  expect(games).toBe(counted);
  const rows = evidence.locator("li");
  await expect(rows).toHaveCount(Math.min(games, 10) + (games > 10 ? 1 : 0));
  await expect(rows.first()).toContainText(/Ranked (Solo\/Duo|Flex) · (Won|Lost)/);
  // One (i) under the scoreboard says what a possible group is, never a confirmed party; the side
  // without a group says nothing.
  await expect(note).toBeVisible();
  await expect(note).toContainText("Possible groups");
  await expect(note.getByTestId("groups-info")).toHaveAccessibleName("About possible groups");
  await expect(note.getByTestId("groups-info")).toHaveAccessibleDescription("Players frequently seen together in earlier games. Not confirmed premades.");
  expect(await breakdown.innerText()).not.toMatch(/not enough (recorded )?history|no other players to assess|inferred from/);
  // The demo member whose history this is is never part of a group.
  await expect(breakdown.locator('[data-testid="participant"][data-player][data-group]')).toHaveCount(0);
  const text = (await breakdown.innerText()).toLowerCase();
  // "Not confirmed premades." is the (i)'s own words; nothing else names a premade.
  expect(text.replace("not confirmed premades.", "")).not.toContain("premade");
  expect(await red.getByTestId("possible-groups").innerText()).not.toMatch(/%/);
  // The card still closes the game (the evidence toggle does not hold it open).
  await closeGame(card);
});

test("no history means nothing is said, never 'no premades'", async ({ page }) => {
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
      await expect(note).toBeHidden();
      await expect(breakdown.getByTestId("possible-groups")).toHaveCount(0);
      expect((await breakdown.innerText()).toLowerCase()).not.toMatch(/premade|not enough|possible group|inferred from/);
      return;
    }
    await closeGame(card);
  }
  throw new Error("expected a demo match without a possible group");
});

test("a game with the team on one side is never 'inferred from 0 earlier recorded games'", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-JUNGLE").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await page.waitForLoadState("networkidle");
  // The demo's Flex game with four members and one other player on blue (the newest card): nobody to assess there.
  const withFour = page.getByTestId("match-card").filter({ has: page.locator('[data-testid="match-members"][data-with="3"]') }).first();
  // Held by its game's id: an open card folds into its header (the post-game view), which has no members line.
  const card = cardOf(page, (await withFour.getByTestId("match-row").getAttribute("data-match"))!);
  const breakdown = await openGame(card);
  const note = breakdown.getByTestId("possible-groups-note");
  await expect(note).toHaveAttribute("data-state", "ok", { timeout: 15_000 });
  // Nobody to assess on blue, and (without a group on red) nothing to say: no line about either side.
  const text = await breakdown.innerText();
  expect(text).not.toMatch(/inferred from|no other players to assess|not enough (recorded )?history/);
  if ((await breakdown.getByTestId("possible-group").count()) === 0) await expect(note).toBeHidden();
  await closeGame(card);
});
