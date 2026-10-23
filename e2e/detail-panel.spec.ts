import { expect, test, type Page } from "./test";
import { createMember } from "./member-account";

/*
  The shared centred detail window (DetailModal): match details open from a Match History row,
  centred over the dimmed page on desktop (the whole screen on phones), close with Escape and give
  focus back to the row; the page behind does not scroll or move while it is open. Team's player
  window works the same way. A real game's window links the player's history on OP.GG; Match
  History's own header does not (the filters end it). Demo games are synthetic demo data.
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

test("match details open in the shared panel, close with Escape and return focus to the game", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  // A click anywhere on the card (but a player link) opens the game; its button keeps the focus.
  const card = page.getByTestId("match-card").first();
  const row = card.getByTestId("match-row");
  await expect(row).toBeVisible();
  // Both teams are on the card; the full lineups, runes and timeline live in the panel.
  await expect(card.getByTestId("match-teams")).toBeAttached();
  await card.click({ position: { x: 24, y: 16 } });
  const panel = page.getByTestId("match-detail");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-size", "wide");
  await expectCentred(page, "match-detail");
  await expect(page.getByTestId("match-result")).toHaveText(/Victory|Defeat/);
  // Demo games have no real Riot server, so no OP.GG history link is made for them (domain/opgg).
  await expect(panel.getByTestId("match-detail-figures")).toBeVisible();
  await expect(panel.getByTestId("match-opgg-history")).toHaveCount(0);
  await expect(page).toHaveURL(/match=/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(row).toBeFocused();
  await expect(page).not.toHaveURL(/match=/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
  // A deep link opens the same game.
  const matchId = (await row.getAttribute("data-match"))!;
  await page.goto(`/players/${id}/matches?match=${matchId}`);
  await expect(page.getByTestId("match-detail")).toBeVisible();
  await page.getByTestId("match-detail-close").click();
  await expect(page.getByTestId("match-detail")).toBeHidden();
});

test("Match History's header ends with its filters: no OP.GG button under them, no space left for one", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  const history = page.getByTestId("match-history");
  await expect(history).toHaveAttribute("data-ready", "true");
  const [header, games] = [history.locator(":scope > div").nth(0), history.locator(":scope > div").nth(1)];
  await expect(header.locator("#match-history")).toBeVisible();
  await expect(header.getByTestId("match-filters")).toBeVisible();
  await expect(games.getByTestId("match-card").first()).toBeVisible();
  await expect(page.getByText("View Match History on OP.GG")).toHaveCount(0);
  await expect(header.locator("a[href*='op.gg']")).toHaveCount(0);
  // The games start one section gap (0.75rem) under the header.
  const [h, g, rem] = [(await header.boundingBox())!, (await games.boundingBox())!, await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))];
  expect(Math.abs(g.y - (h.y + h.height) - 0.75 * rem)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("a real game's window still links the player's history on OP.GG", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the window and its link are the same at every size");
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
  await page.getByTestId("match-card").first().click({ position: { x: 24, y: 16 } });
  const link = page.getByTestId("match-detail").getByTestId("match-opgg-history");
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

test("a match opened again shows what this page already loaded, over a dimmed (not blurred) page", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  let loads = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) loads++;
  });
  const card = page.getByTestId("match-card").first();
  // Click again until the page is interactive (a click before hydration does nothing).
  const result = page.getByTestId("match-result");
  await expect(async () => {
    if (!(await result.isVisible())) await card.click({ position: { x: 24, y: 16 }, timeout: 2_000 });
    await expect(result).toHaveText(/Victory|Defeat/, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("dialog[open]")!, "::backdrop").backdropFilter)).toBe("none");
  const first = loads;
  expect(first).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("match-detail")).toBeHidden();
  await card.click({ position: { x: 24, y: 16 } });
  await expect(page.getByTestId("match-result")).toHaveText(/Victory|Defeat/);
  expect(loads).toBe(first);
  await page.keyboard.press("Escape");
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
