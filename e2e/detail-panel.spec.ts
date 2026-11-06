import { expect, test, type Page } from "./test";
import { createMember } from "./member-account";
import { cardOf, closeGame, expandedOf, openGame, opensFullScreen } from "./match-history";

/*
  Match History's games open under their card (one at a time, the page free to scroll); a link to
  a game that is not on the page shown opens the shared centred detail window (DetailModal),
  centred over the dimmed page on desktop (the whole screen on phones), which closes with Escape.
  Team's player window works the same way. A real game's breakdown links the player's history on
  OP.GG; Match History's own header does not (the filters end it). Demo games are synthetic demo
  data.
*/

/** Centred on wider screens (once the opening motion has settled); the whole screen on phones. */
async function expectCentred(page: Page, testId: string) {
  const vp = page.viewportSize()!;
  await expect
    .poll(async () => {
      const b = (await page.getByTestId(testId).boundingBox())!;
      if (vp.width < 640) return b.width >= vp.width - 1 && b.height >= vp.height - 1;
      return Math.abs(b.x + b.width / 2 - vp.width / 2) < 2 && Math.abs(b.y + b.height / 2 - vp.height / 2) < 2;
    })
    .toBe(true);
}

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("a game opens under its card and closes from it, one at a time; a link to a game not on the page opens the shared window", async ({ page }) => {
  test.skip(opensFullScreen(page), "phones open every game as a whole screen: e2e/mobile-nav.spec.ts");
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  // A click anywhere on the card (but a player link) opens the game under it; its button keeps the focus.
  const card = page.getByTestId("match-card").first();
  const row = card.getByTestId("match-row");
  await expect(row).toBeVisible();
  await expect(card.getByTestId("match-teams")).toBeAttached();
  const breakdown = await openGame(card);
  await expect(breakdown).toHaveAttribute("data-variant", "inline");
  await expect(row).toBeFocused();
  await expect(row).toHaveAttribute("aria-controls", (await expandedOf(card).getAttribute("id"))!);
  await expect(breakdown.getByTestId("match-tab-scoreboard")).toHaveAttribute("aria-selected", "true");
  // No window, and the page still scrolls.
  await expect(page.getByTestId("match-detail")).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
  // The address names the open game (replaced, so Back still leaves the page).
  await expect(page).toHaveURL(/match=/);
  const matchId = (await row.getAttribute("data-match"))!;
  // One at a time: opening the next game closes this one; closing it clears the address.
  const next = page.getByTestId("match-card").nth(1);
  await openGame(next);
  await expect(expandedOf(card)).toHaveCount(0);
  await closeGame(next);
  await expect(page).not.toHaveURL(/match=/);
  // A link to a game on the page opens it under its card.
  await page.goto(`/players/${id}/matches?match=${matchId}`);
  await expect(expandedOf(cardOf(page, matchId)).getByTestId("match-breakdown")).toBeVisible();
  await expect(page.getByTestId("match-detail")).toHaveCount(0);
  // A link to a game on another page opens the shared window, centred (the whole screen on phones).
  await page.goto(`/players/${id}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await page.getByTestId("match-next").click();
  await expect(page).toHaveURL(/page=2/);
  const elsewhere = (await page.getByTestId("match-row").first().getAttribute("data-match"))!;
  await page.goto(`/players/${id}/matches?match=${elsewhere}`);
  const panel = page.getByTestId("match-detail");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-size", "wide");
  await expectCentred(page, "match-detail");
  await expect(page.getByTestId("match-result")).toHaveText(/Victory|Defeat/);
  await expect(panel.getByTestId("match-detail-figures")).toBeVisible();
  await expect(panel.getByTestId("match-breakdown")).toHaveAttribute("data-variant", "window");
  // Demo games have no real Riot server, so no OP.GG history link is made for them (domain/opgg).
  await expect(panel.getByTestId("match-opgg-history")).toHaveCount(0);
  // Over a dimmed, not blurred, page that does not scroll behind it.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("dialog[open]")!, "::backdrop").backdropFilter)).toBe("none");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page).not.toHaveURL(/match=/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
});

test("Match History's header ends with its filters: no OP.GG button under them, no space left for one", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  const history = page.getByTestId("match-history");
  await expect(history).toHaveAttribute("data-ready", "true");
  const [header, games] = [history.locator(":scope > div").nth(0), history.locator(":scope > div").nth(1)];
  const summary = history.getByTestId("history-summary");
  await expect(header.locator("#match-history")).toBeVisible();
  await expect(header.getByTestId("match-filters")).toBeVisible();
  await expect(games.getByTestId("match-card").first()).toBeVisible();
  await expect(page.getByText("View Match History on OP.GG")).toHaveCount(0);
  await expect(header.locator("a[href*='op.gg']")).toHaveCount(0);
  // The line about the newest games starts one section gap (0.75rem) under the header, and the games one gap under it.
  const [h, s, g, rem] = [(await header.boundingBox())!, (await summary.boundingBox())!, (await games.boundingBox())!, await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))];
  expect(Math.abs(s.y - (h.y + h.height) - 0.75 * rem)).toBeLessThanOrEqual(1);
  expect(Math.abs(g.y - (s.y + s.height) - 0.75 * rem)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("a real game's breakdown still links the player's history on OP.GG", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the breakdown and its link are the same at every size");
  // A new member: the browser tests' stand-in for Riot gives them three games on Refresh (server/riot/browser-test.ts).
  const { username } = await createMember(page, "Opgg");
  await page.context().addCookies([{ name: "uniiverse_view", value: "player", url: new URL(page.url()).origin }]);
  await page.goto("/players", { waitUntil: "networkidle" });
  const href = (await page.locator(`main a[data-testid='player-card'][data-player-name='${username}']`).first().getAttribute("href"))!;
  await page.goto(`${href}/matches`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await page.getByTestId("data-refresh-button").click();
  await expect(page.getByTestId("toast")).toContainText("3 new games", { timeout: 30_000 });
  await expect(page.getByTestId("match-card")).toHaveCount(3);
  await expect(page.getByText("View Match History on OP.GG")).toHaveCount(0);
  const link = (await openGame(page.getByTestId("match-card").first())).getByTestId("match-opgg-history");
  await expect(link).toHaveText(/^View Match History on OP\.GG/);
  await expect(link).toHaveAttribute("href", new RegExp(`^https://op\\.gg/lol/summoners/oce/${username}-OCE$`, "i"));
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});

test("Team: the chosen card lifts and the others step back; pools are viewed here and edited on the profile", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByTestId("team-name")).toBeVisible();
  const mid = page.getByTestId("lineup-row-MID");
  const id = (await mid.getAttribute("data-player-id"))!;
  const open = mid.getByTestId("open-player-detail");
  await open.click();
  const panel = page.getByTestId("player-detail");
  await expect(panel).toBeVisible();
  await expectCentred(page, "player-detail");
  await expect(mid).toHaveAttribute("data-selected", "true");
  await expect(page.locator("[data-testid^=lineup-row-][data-selected]")).toHaveCount(1);
  // The pool is listed, never edited here: the owner gets a link to the profile instead.
  await expect(panel.getByTestId("pool-list")).toBeVisible();
  await expect(page.getByTestId("edit-roster-champions")).toHaveCount(0);
  await expect(panel.getByTestId("edit-pool-on-profile")).toHaveAttribute("href", `/players/${id}#champion-pools`);
  // Next player: the selection follows the panel.
  await panel.getByTestId("detail-next").click();
  await expect(mid).not.toHaveAttribute("data-selected", "true");
  await expect(page.locator("[data-testid^=lineup-row-][data-selected]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-testid^=lineup-row-][data-selected]")).toHaveCount(0);
});

test("the Team player panel returns focus to its card when closed", async ({ page }) => {
  await page.goto("/team");
  const open = page.getByTestId("lineup-row-MID").getByTestId("open-player-detail");
  await open.click();
  await expect(page.getByTestId("player-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("player-detail")).toBeHidden();
  await expect(open).toBeFocused();
});

test("a game opened again shows what this page already loaded", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  // Every server action the page calls, in order: the game's record is the first one it asks for.
  const actions: string[] = [];
  page.on("request", (r) => {
    const action = r.headers()["next-action"];
    if (r.method() === "POST" && action) actions.push(action);
  });
  const card = page.getByTestId("match-card").first();
  const breakdown = await openGame(card);
  // Everything it asks for has answered (the record, the possible groups, any rank check).
  await expect(breakdown.getByTestId("possible-groups-note")).not.toHaveAttribute("data-state", "loading", { timeout: 15_000 });
  await expect(breakdown.getByTestId("ranks-note")).not.toHaveAttribute("data-state", "checking", { timeout: 15_000 });
  const [record, groups] = actions;
  expect(record).toBeTruthy();
  const before = actions.length;
  await closeGame(card);
  const again = await openGame(card);
  await expect(again.getByTestId("possible-groups-note")).not.toHaveAttribute("data-state", "loading");
  // The record and the possible groups come from what the page kept. (A rank check that came back
  // incomplete, skipped or failed, is asked again by design: match-detail-cache.tsx.)
  expect(actions.slice(before).filter((a) => a === record || a === groups)).toEqual([]);
  // Under its card the card keeps the focus; a phone's whole-screen game gives it back on closing.
  if (opensFullScreen(page)) await closeGame(card);
  await expect(card.getByTestId("match-row")).toBeFocused();
});

test("with reduced motion a window opens and closes without motion and its content is there at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/champions`);
  const open = page.getByTestId("open-champion").first();
  await open.click();
  await expect(page.getByTestId("champion-overview")).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("dialog[open]")!).animationName)).toBe("none");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-detail")).toBeHidden();
  await expect(open).toBeFocused();
});
