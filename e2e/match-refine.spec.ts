import { expect, test, type Locator, type Page } from "./test";
import { openFilterBar } from "./filters";
import { openGame } from "./match-history";

/*
  Match History's own Refine choices (demo data, in memory): the result, the patch, the days
  played, a team member with or against the player and the highlights narrow the list; each shows
  as a chip that removes itself, rides along the shared filters and the address; and the list can
  be grouped into playing sessions, newest first. The Mid demo player shares games with the other
  demo players (Team → Matches), one of them with the Top player on the other side, and its own
  three newest games are one evening of back-to-back games (demo/seed).
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function midId(page: Page) {
  await page.goto("/team");
  return (await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!;
}

async function openHistory(page: Page, query = "") {
  const id = await midId(page);
  await page.goto(`/players/${id}/matches${query}`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  return id;
}

/** Refine's panel: behind its button on wide screens (it stays open after a choice), in the opened filter bar on phones. */
async function openRefine(page: Page): Promise<Locator> {
  const filters = page.getByTestId("match-filters");
  if (!(await openFilterBar(filters))) {
    const button = filters.getByTestId("refine-filters");
    // Retried: a click before the page is interactive does nothing.
    await expect(async () => {
      if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  }
  const panel = filters.getByTestId("refine-panel");
  await expect(panel).toBeVisible();
  return panel;
}

const total = async (page: Page) => Number(await page.getByTestId("match-history").getAttribute("data-total"));
const results = (page: Page) => page.getByTestId("match-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-result")));
const fitsWidth = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("Refine narrows to wins or losses; the choice shows as a chip, rides along the shared filters, and the chip removes it", async ({ page }) => {
  await openHistory(page);
  const all = await total(page);
  const panel = await openRefine(page);
  await panel.getByTestId("refine-result").getByRole("radio", { name: "Wins" }).click();
  await expect(page).toHaveURL(/result=win/);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  const wins = await total(page);
  expect(wins).toBeGreaterThan(0);
  expect(wins).toBeLessThan(all);
  expect(new Set(await results(page))).toEqual(new Set(["W"]));
  // A shared filter changed afterwards keeps the choice.
  const filters = page.getByTestId("match-filters");
  await filters.getByLabel("Game mode").selectOption("solo");
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page).toHaveURL(/result=win/);
  expect(new Set(await results(page))).toEqual(new Set(["W"]));
  // The chip (wide screens) or the reset removes it.
  const chip = filters.getByRole("button", { name: "Remove filter Wins" });
  if (await chip.isVisible()) {
    await chip.click();
    await expect(page).not.toHaveURL(/result=win/);
    await expect(page).toHaveURL(/mode=solo/);
  }
  await fitsWidth(page);
});

test("a team member's games, with them or against them, as their stored games place them", async ({ page }) => {
  await openHistory(page);
  const panel = await openRefine(page);
  const member = panel.getByTestId("refine-member");
  // Every member the player shared a game with is offered, with the count of games each way.
  const options = await member.locator("option").evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).textContent ?? ""));
  expect(options.slice(0, 3)).toEqual(["With or without them", "With any team member", "Against any team member"]);
  const against = options.find((o) => /^Against .+ \([1-9]\d*\)$/.test(o));
  expect(against, "the demo has one game with the Top player on the other side").toBeTruthy();
  const value = await member.locator("option", { hasText: against! }).getAttribute("value");
  await member.selectOption(value!);
  await expect(page).toHaveURL(/against=/);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  expect(await total(page)).toBe(Number(/\((\d+)\)$/.exec(against!)![1]));
  // The card shows the same member against the player.
  await expect(page.getByTestId("match-card").first()).toContainText("Against");
  // Any member with the player: every card names one with them.
  await openRefine(page);
  await page.getByTestId("refine-member").selectOption("with:any");
  await expect(page).toHaveURL(/with=any/);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  expect(await total(page)).toBeGreaterThan(0);
  for (const card of await page.getByTestId("match-card").all()) await expect(card).toContainText("With");
  await fitsWidth(page);
});

test("a patch, the days played and a highlight narrow the list; an address with a choice that cannot be read narrows nothing", async ({ page }) => {
  const id = await openHistory(page);
  const all = await total(page);
  let panel = await openRefine(page);
  const patch = panel.getByTestId("refine-patch");
  const firstPatch = await patch.locator("option").nth(1).getAttribute("value");
  await patch.selectOption(firstPatch!);
  await expect(page).toHaveURL(new RegExp(`patch=${firstPatch!.replace(".", "\\.")}`));
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  const onPatch = await total(page);
  expect(onPatch).toBeGreaterThan(0);
  expect(onPatch).toBeLessThanOrEqual(all);
  // The days: today only, then nothing before a day that has not come (the list says so, and Reset clears it).
  await page.goto(`/players/${id}/matches?from=2099-01-01`);
  await expect(page.getByTestId("match-empty")).toContainText("No stored game matches these filters.");
  // A highlight: games with a multikill of at least the size chosen.
  await page.goto(`/players/${id}/matches`);
  panel = await openRefine(page);
  await panel.getByTestId("refine-highlight").selectOption("double");
  await expect(page).toHaveURL(/hl=double/);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  expect(await total(page)).toBeLessThanOrEqual(all);
  // Unreadable choices are ignored, not guessed.
  await page.goto(`/players/${id}/matches?result=draw&patch=latest&from=2026-02-30&with=someone&hl=hexakill`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  expect(await total(page)).toBe(all);
  await fitsWidth(page);
});

test("Refine groups the list into playing sessions, newest first, each with its record; games stay where they were", async ({ page }) => {
  await openHistory(page);
  const before = await page.getByTestId("match-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-match")));
  // The layout under the header is unchanged until grouping is chosen.
  await expect(page.getByTestId("session")).toHaveCount(0);
  let group = (await openRefine(page)).getByTestId("refine-group");
  await expect(group.getByRole("radio", { name: "Every game" })).toHaveAttribute("aria-checked", "true");
  await group.getByRole("radio", { name: "By playing session" }).click();
  await expect(page).toHaveURL(/group=sessions/);
  await expect(group.getByRole("radio", { name: "By playing session" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  const sessions = page.getByTestId("session");
  await expect(sessions.first()).toBeVisible();
  expect(await sessions.count()).toBeGreaterThan(1);
  // The same games in the same order, now under their sessions.
  expect(await page.getByTestId("match-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-match")))).toEqual(before);
  // The demo's evening of back-to-back games is one session of three.
  const evening = page.locator("[data-testid='session'][data-games='3']").first();
  await expect(evening).toBeVisible();
  await expect(evening.getByTestId("match-card")).toHaveCount(3);
  await expect(evening.getByTestId("session-header")).toContainText(/3 games · \d+W \d+L/);
  await expect(evening.getByTestId("session-header")).toContainText(/\d{1,2}:\d{2} [ap]m – \d{1,2}:\d{2} [ap]m/);
  // A game still opens under its card inside a session, and grouping kept the address's game.
  await openGame(evening.getByTestId("match-card").first());
  await expect(page).toHaveURL(/group=sessions/);
  await fitsWidth(page);
  // Back to every game: one list.
  group = (await openRefine(page)).getByTestId("refine-group");
  await group.getByRole("radio", { name: "Every game" }).click();
  await expect(page).not.toHaveURL(/group=sessions/);
  await expect(page.getByTestId("session")).toHaveCount(0);
});
