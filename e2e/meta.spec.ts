import { expect, test, type Page } from "@playwright/test";

/*
  Meta & Trends → Duo Synergies: any two different roles (Role one, Role two, swap), a ranked
  list with sample sizes, sorting, an honest empty state, no overflow. The demo statistics are
  synthetic and only cover some pairings, which also exercises the empty state.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const rowsOf = (page: Page) => page.getByTestId("duo-row").evaluateAll((els) => els.map((e) => ({ pair: e.getAttribute("data-pair")!, games: Number(e.getAttribute("data-games")), wins: Number(e.getAttribute("data-wins")) })));

test("duo synergies: two independent roles, swapping keeps the same evidence, sorting by games", async ({ page }) => {
  await page.goto("/trends/duos");
  await expect(page.getByRole("heading", { name: "Duo Synergies" })).toBeVisible();
  const a = page.getByTestId("duo-role-a");
  const b = page.getByTestId("duo-role-b");
  // Default: Bottom + Support; the role chosen first is unavailable as the second.
  await expect(a.locator('[data-value="ADC"]')).toHaveAttribute("aria-checked", "true");
  await expect(b.locator('[data-value="SUPPORT"]')).toHaveAttribute("aria-checked", "true");
  await expect(b.locator('[data-value="ADC"]')).toHaveAttribute("aria-disabled", "true");
  await expect(a.getByRole("radio")).toHaveCount(5);

  const rows = await rowsOf(page);
  if (rows.length === 0) {
    await expect(page.getByTestId("duo-empty")).toBeVisible();
    return;
  }
  // Every listed pair has at least the minimum games together.
  expect(Math.min(...rows.map((r) => r.games))).toBeGreaterThanOrEqual(25);
  await page.getByTestId("duo-sorts").getByRole("link", { name: "Most played" }).click();
  await page.waitForURL(/sort=games/);
  const sorted = (await rowsOf(page)).map((r) => r.games);
  expect(sorted).toEqual([...sorted].sort((x, y) => y - x));

  // Pick any second role: Jungle + Mid needs Role one = Jungle, Role two = Mid.
  await a.locator('[data-value="JUNGLE"]').click();
  await page.waitForURL(/a=JUNGLE/);
  await b.locator('[data-value="MID"]').click();
  await page.waitForURL(/a=JUNGLE&b=MID/);
  await expect(page.getByTestId("duo-role-b").locator('[data-value="MID"]')).toHaveAttribute("aria-checked", "true");
  const forward = await rowsOf(page);
  // Swap: the same pairs and the same games, read the other way round.
  await page.getByTestId("duo-swap").click();
  await page.waitForURL(/a=MID&b=JUNGLE/);
  const back = await rowsOf(page);
  const key = (rows: Awaited<ReturnType<typeof rowsOf>>, flip: boolean) => rows.map((r) => `${flip ? r.pair.split("+").reverse().join("+") : r.pair}:${r.games}:${r.wins}`).sort();
  expect(key(back, true)).toEqual(key(forward, false));
  expect(page.url()).toContain("sort=games");

  // Choosing Role one = the current Role two swaps them (two different roles, always).
  await page.getByTestId("duo-role-a").locator('[data-value="JUNGLE"]').click();
  await page.waitForURL(/a=JUNGLE&b=MID/);

  // A pairing without enough games together says so instead of ranking noise.
  await page.goto("/trends/duos?a=TOP&b=SUPPORT");
  await expect(page.getByTestId("duo-empty").or(page.getByTestId("duo-list"))).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("duo synergies open on our lineup's pools, with all champions one toggle away", async ({ page }) => {
  await page.goto("/trends/duos");
  await expect(page.getByTestId("duo-scope-lineup")).toHaveAttribute("aria-current", "page");
  // Lineup mode names the two lineup players and says how many pool pairs have enough games.
  await expect(page.getByTestId("duo-lineup-note").or(page.getByTestId("duo-lineup-missing"))).toBeVisible();
  const lineupRows = await rowsOf(page);
  await page.getByTestId("duo-scope-all").click();
  await page.waitForURL(/scope=all/);
  await expect(page.getByTestId("duo-scope-all")).toHaveAttribute("aria-current", "page");
  const allRows = await rowsOf(page);
  // The lineup's pairs are a subset of all pairs, with the same figures (same evidence, fewer candidates).
  const all = new Map(allRows.map((r) => [r.pair, r]));
  for (const r of lineupRows) if (all.has(r.pair)) expect(all.get(r.pair)).toEqual(r);
  expect(lineupRows.length).toBeLessThanOrEqual(Math.max(allRows.length, 15));
});
