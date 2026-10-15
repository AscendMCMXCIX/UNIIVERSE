import { expect, test, type Page } from "@playwright/test";

/*
  Team Leaderboards on the demo roster. The games behind it are synthetic demo games (seeded in
  demo mode only), never real Riot data. The demo viewer is the Owner, who has no player profile,
  so "your position" is covered by the database tests instead.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const num = (text: string | null) => Number((text ?? "").replace(/[^0-9.\-]/g, ""));

async function podium(page: Page) {
  const entries = page.getByTestId("podium-entry");
  const n = await entries.count();
  const out: Array<{ rank: number; value: number }> = [];
  for (let i = 0; i < n; i++) {
    const e = entries.nth(i);
    out.push({ rank: Number(await e.getAttribute("data-rank")), value: num(await e.getByTestId("podium-value").textContent()) });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page wider than the viewport").toBeLessThanOrEqual(1);
}

test("the default board is current-season ranked, with the top three in order and the full ranking below", async ({ page }) => {
  await page.goto("/leaderboards");
  await expect(page.getByTestId("leaderboards")).toBeVisible();
  await expect(page.getByTestId("category-overview")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("filter-queue")).toHaveValue("ranked");
  await expect(page.getByTestId("board")).toHaveAttribute("data-metric", "win-rate");
  const top = await podium(page);
  expect(top.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < top.length; i++) {
    expect(top[i]!.rank).toBeGreaterThanOrEqual(top[i - 1]!.rank);
    expect(top[i]!.value).toBeLessThanOrEqual(top[i - 1]!.value);
  }
  // The rest of the ranking continues after third place.
  const rows = page.getByTestId("board-row");
  if ((await rows.count()) > 0) expect(Number(await rows.first().getAttribute("data-rank"))).toBeGreaterThanOrEqual(top[top.length - 1]!.rank);
  await expect(page.getByTestId("last-updated")).toBeVisible();
  await expect(page.getByTestId("scope-footnote")).toContainText(/ranked/i);
  await noOverflow(page);
});

test("Leaderboards sits in the Team group between Players and Draft", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the navigation layout is covered per device in responsive.spec");
  await page.goto("/team");
  await page.getByRole("link", { name: "Leaderboards" }).first().click();
  await expect(page).toHaveURL(/\/leaderboards/);
  await expect(page.getByTestId("leaderboards")).toBeVisible();
});

test("switching category keeps the season, games, role and lineup filters", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  await page.goto("/leaderboards");
  await page.getByTestId("filter-queue").selectOption("solo");
  await expect(page).toHaveURL(/queue=solo/);
  await page.getByTestId("filter-role").locator('[data-value="MID"]').click();
  await expect(page).toHaveURL(/role=MID/);
  await page.getByTestId("filter-lineup").locator("input").check();
  await expect(page).toHaveURL(/lineup=1/);
  await page.getByTestId("category-farming").click();
  await expect(page).toHaveURL(/category=farming/);
  await expect(page).toHaveURL(/queue=solo/);
  await expect(page).toHaveURL(/role=MID/);
  await expect(page).toHaveURL(/lineup=1/);
  await expect(page.getByTestId("filter-queue")).toHaveValue("solo");
  await expect(page.getByTestId("filter-role").locator('[data-value="MID"]')).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("filter-lineup").locator("input")).toBeChecked();
  await expect(page.getByTestId("scope-label")).toContainText(/Solo\/Duo.*Mid games.*active lineup/);
  await expect(page.getByTestId("scope-footnote")).toContainText(/games in the role to be ranked/);
  // A role board either ranks someone or says plainly that nobody qualifies; never a blank page.
  await expect(page.getByTestId("podium").or(page.getByTestId("board-empty"))).toBeVisible();
  await noOverflow(page);
});

test("the active lineup filter leaves at most five players", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await page.goto("/leaderboards?category=overview&metric=games");
  const all = (await page.getByTestId("podium-entry").count()) + (await page.getByTestId("board-row").count());
  await page.getByTestId("filter-lineup").locator("input").check();
  await expect(page).toHaveURL(/lineup=1/);
  await expect(page.getByTestId("filter-lineup").locator("input")).toBeChecked();
  const lineup = (await page.getByTestId("podium-entry").count()) + (await page.getByTestId("board-row").count());
  expect(lineup).toBeLessThanOrEqual(5);
  expect(lineup).toBeLessThanOrEqual(all);
});

test("lower is better: the fewest deaths per game leads", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await page.goto("/leaderboards?category=overview&metric=deaths-per-game");
  await expect(page.getByTestId("board")).toHaveAttribute("data-metric", "deaths-per-game");
  const top = await podium(page);
  for (let i = 1; i < top.length; i++) expect(top[i]!.value).toBeGreaterThanOrEqual(top[i - 1]!.value);
});

test("figures kept only on newer games say so, and totals and averages are labelled", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  await page.goto("/leaderboards?category=combat&metric=penta-kills");
  await expect(page.getByTestId("data-note")).toContainText(/not counted as zero/);
  await expect(page.getByTestId("metric-kind")).toHaveText(/total/i);
  await page.getByTestId("metric-kills-per-game").click();
  await expect(page).toHaveURL(/metric=kills-per-game/);
  await expect(page.getByTestId("metric-kind")).toHaveText(/average/i);
  await expect(page).toHaveURL(/category=combat/);
});

test("records show the single best game, with who set it", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  await page.goto("/leaderboards?category=records");
  await expect(page.getByTestId("category-records")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("metric-kind")).toHaveText(/record/i);
  await expect(page.getByTestId("podium-entry").first()).toBeVisible();
  await noOverflow(page);
});
