import { expect, test, type Page } from "./test";

/*
  Team Leaderboards on the demo roster. The games behind it are synthetic demo games (seeded in
  demo mode only), never real Riot data. The demo viewer is the Owner, who has no player profile,
  so "your position" is covered by the database and view tests instead.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 640;
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

/** The full ranking, in page order: [rank, value]. */
async function ranking(page: Page) {
  return page.getByTestId("board-row").evaluateAll((els) => els.map((e) => [Number(e.getAttribute("data-rank")), Number((e.querySelector('[data-testid="row-value"]')?.textContent ?? "").replace(/[^0-9.\-]/g, ""))] as [number, number]));
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page wider than the viewport").toBeLessThanOrEqual(1);
}

/** Opens a board page once it is interactive (data-ready): a tile or statistic chosen while it hydrates can be lost. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
}

/** The filters sit behind a one-line summary on phones and tablets. */
async function openFilters(page: Page) {
  await expect(page.getByTestId("leaderboard-filters")).toBeVisible();
  const toggle = page.getByTestId("filter-toggle");
  if (!(await toggle.isVisible())) return;
  // Retried: a click before the page is interactive does nothing.
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(page.getByTestId("filter-queue")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

test("Highlights is the default: ten tiles, each opening its full board", async ({ page }) => {
  await open(page, "/leaderboards");
  await expect(page.getByTestId("leaderboards")).toBeVisible();
  await expect(page.getByTestId("category-overview")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("category-overview")).toHaveText(/Highlights/);
  await expect(page.getByTestId("scope-label")).toContainText(/All supported games/);
  const tiles = page.getByTestId("highlight-tile");
  await expect(tiles).toHaveCount(10);
  await expect(page.getByTestId("board")).toHaveCount(0);
  // A tile's leader and value are the board's first place.
  const tile = tiles.filter({ has: page.locator('[data-testid="highlight-value"]') }).first();
  const metric = await tile.getAttribute("data-metric");
  const value = num(await tile.getByTestId("highlight-value").textContent());
  await tile.click();
  await expect(page.getByTestId("board")).toHaveAttribute("data-metric", metric!);
  const rows = await ranking(page);
  expect(rows[0]![1]).toBe(value);
  if ((page.viewportSize()?.width ?? 0) >= 1280) {
    await page.goto("/leaderboards");
    // Measured once shown: streamed content is in the page, hidden, until React reveals it.
    await expect(page.getByTestId("leaderboards")).toBeVisible();
    const box = await page.getByTestId("leaderboards").boundingBox();
    expect(box!.height, "Highlights fits a desktop screen").toBeLessThan(1000);
  }
  await noOverflow(page);
});

test("Highlights tiles read in order and never overlap: statistic, leader, value, place and runner-up", async ({ page }) => {
  await page.goto("/leaderboards");
  const tiles = page.getByTestId("highlight-tile");
  await expect(tiles).toHaveCount(10);
  // Measure the settled layout: images and web fonts loaded.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const width = page.viewportSize()!.width;
  const boxes = await tiles.evaluateAll((els) =>
    els.map((tile) => {
      const r = (sel: string) => tile.querySelector(sel)!.getBoundingClientRect();
      const label = tile.querySelector('[data-testid="highlight-label"]') as HTMLElement;
      const parts = [r('[data-testid="highlight-label"]'), r('[data-testid="highlight-identity"]'), r('[data-testid="highlight-value"]')];
      const t = tile.getBoundingClientRect();
      return {
        width: t.width,
        // Each part starts below the end of the one before it.
        ordered: parts.every((p, i) => i === 0 || p.top >= parts[i - 1]!.bottom - 0.5),
        inside: parts.every((p) => p.left >= t.left - 0.5 && p.right <= t.right + 0.5),
        // The statistic's name is never cut: no clamp, no ellipsis.
        fullLabel: label.scrollHeight <= label.clientHeight + 1 && label.scrollWidth <= label.clientWidth + 1,
      };
    }),
  );
  for (const b of boxes) {
    expect(b.ordered).toBe(true);
    expect(b.inside).toBe(true);
    expect(b.fullLabel).toBe(true);
    // Tiles adapt to the width instead of squeezing into five columns: at least 250 px, or the full width on phones.
    expect(b.width).toBeGreaterThanOrEqual(Math.min(250, width - 40));
  }
  // Tiles side by side line up: a long statistic name moves the whole line's leaders down together.
  const rows = await tiles.evaluateAll((els) => els.map((t) => [Math.round(t.getBoundingClientRect().top), Math.round(t.querySelector('[data-testid="highlight-identity"]')!.getBoundingClientRect().top)] as [number, number]));
  const leaderTop = new Map<number, Set<number>>();
  for (const [tile, leader] of rows) leaderTop.set(tile, (leaderTop.get(tile) ?? new Set()).add(leader));
  for (const tops of leaderTop.values()) expect(tops.size).toBe(1);
  await noOverflow(page);
});

test("a board is current-season, all supported games, with the leader and the full ranking in order", async ({ page }) => {
  await page.goto("/leaderboards?category=overview&metric=win-rate");
  await expect(page.getByTestId("leaderboards")).toBeVisible();
  await expect(page.getByTestId("category-overview")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("scope-label")).toContainText(/All supported games/);
  await openFilters(page);
  await expect(page.getByTestId("filter-queue")).toHaveValue("all");
  await expect(page.getByTestId("board")).toHaveAttribute("data-metric", "win-rate");
  // The full ranking: 1, 2, 3… with values never increasing (win rate: higher is better).
  const rows = await ranking(page);
  expect(rows.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i]![0]).toBeGreaterThanOrEqual(rows[i - 1]![0]);
    expect(rows[i]![1]).toBeLessThanOrEqual(rows[i - 1]![1]);
  }
  if (isPhone(page)) {
    // Phones: the leader first, large; no squeezed podium.
    await expect(page.getByTestId("leader-spotlight")).toBeVisible();
    await expect(page.getByTestId("podium")).toBeHidden();
  } else {
    const top = await podium(page);
    expect(top.map((t) => t.rank)).toEqual(rows.slice(0, top.length).map((r) => r[0]));
    expect(top.map((t) => t.value)).toEqual(rows.slice(0, top.length).map((r) => r[1]));
    await expect(page.getByTestId("leader-spotlight")).toBeHidden();
    // The list does not repeat the podium: the top three rows are only on phones.
    await expect(page.getByTestId("board-row").filter({ visible: true }).first()).not.toHaveAttribute("data-rank", "1");
  }
  // Every ranked player has a bar against the leader; the leader's is full.
  await expect(page.getByTestId("row-bar").first()).toHaveAttribute("style", /width:\s*100%/);
  // How fresh the boards are: the team's status behind one ⓘ under the title, as on a profile.
  await expect(page.getByTestId("leaderboards-status-info")).toBeVisible();
  await expect(page.getByTestId("last-updated")).toHaveCount(0);
  await noOverflow(page);
});

test("Leaderboards is a Team tab between Players and Matches", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the navigation layout is covered per device in responsive.spec");
  await page.goto("/team");
  await expect(page.getByTestId("team-tabs").getByRole("link")).toHaveText(["Overview", "Players", "Leaderboards", "Matches"]);
  await page.getByTestId("team-tab-leaderboards").click();
  await expect(page).toHaveURL(/\/leaderboards/);
  await expect(page.getByTestId("leaderboards")).toBeVisible();
});

test("switching category keeps the season, games, role and lineup filters", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  await open(page, "/leaderboards?category=overview&metric=win-rate");
  await openFilters(page);
  await page.getByTestId("filter-queue").selectOption("solo");
  await expect(page).toHaveURL(/queue=solo/);
  await page.getByTestId("filter-role").locator('[data-value="MID"]').click();
  await expect(page).toHaveURL(/role=MID/);
  await page.getByTestId("filter-lineup").click();
  await expect(page).toHaveURL(/lineup=1/);
  await page.getByTestId("category-farming").click();
  await expect(page).toHaveURL(/category=farming/);
  await expect(page).toHaveURL(/queue=solo/);
  await expect(page).toHaveURL(/role=MID/);
  await expect(page).toHaveURL(/lineup=1/);
  await openFilters(page);
  await expect(page.getByTestId("filter-queue")).toHaveValue("solo");
  await expect(page.getByTestId("filter-role").locator('[data-value="MID"]')).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("filter-lineup")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("scope-label")).toContainText(/Solo\/Duo.*Mid games.*active lineup/);
  await expect(page.getByTestId("scope-footnote")).toContainText(/games in the role to be ranked/);
  // A role board either ranks someone or says plainly that nobody qualifies; never a blank page.
  // (From tablets up, three or fewer ranked players are shown on the podium alone.)
  await expect(page.getByTestId("board-rows").or(page.getByTestId("board-empty")).or(page.getByTestId("podium")).filter({ visible: true }).first()).toBeVisible();
  // Back to the default scope: the URL no longer names a queue.
  await page.getByTestId("filter-queue").selectOption("all");
  await expect(page).not.toHaveURL(/queue=/);
  await noOverflow(page);
});

test("statistics can be stepped through without leaving the board", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  await open(page, "/leaderboards?category=combat");
  const first = await page.getByTestId("board").getAttribute("data-metric");
  await page.getByTestId("metric-next").click();
  await expect(page.getByTestId("board")).not.toHaveAttribute("data-metric", first!);
  await expect(page).toHaveURL(/category=combat/);
  const second = await page.getByTestId("board").getAttribute("data-metric");
  await expect(page.getByTestId(`metric-${second}`)).toHaveAttribute("aria-current", "true");
  await page.getByTestId("metric-previous").click();
  await expect(page.getByTestId("board")).toHaveAttribute("data-metric", first!);
});

test("the active lineup filter leaves at most five players", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await open(page, "/leaderboards?category=overview&metric=games");
  const all = await page.getByTestId("board-row").count();
  await page.getByTestId("filter-lineup").click();
  await expect(page).toHaveURL(/lineup=1/);
  await expect(page.getByTestId("filter-lineup")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.getByTestId("board-row").count()).toBeLessThanOrEqual(5);
  expect(await page.getByTestId("board-row").count()).toBeLessThanOrEqual(all);
});

test("lower is better: the fewest deaths per game leads", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await page.goto("/leaderboards?category=overview&metric=deaths-per-game");
  await expect(page.getByTestId("board")).toHaveAttribute("data-metric", "deaths-per-game");
  const rows = await ranking(page);
  for (let i = 1; i < rows.length; i++) expect(rows[i]![1]).toBeGreaterThanOrEqual(rows[i - 1]![1]);
  const top = await podium(page);
  for (let i = 1; i < top.length; i++) expect(top[i]!.value).toBeGreaterThanOrEqual(top[i - 1]!.value);
});

test("figures kept only on newer games say so, and totals and averages are labelled", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  await page.goto("/leaderboards?category=multikills&metric=penta-kills");
  await expect(page.getByTestId("category-multikills")).toHaveAttribute("aria-current", "page");
  // The demo has games without the counts (Demo Support's older ones): the note says how many have them.
  await expect(page.getByTestId("data-note")).toHaveText(/^\s*Counted from the [\d,]+ of [\d,]+ games in this view that carry this figure \(from .+ on\): the others are left out, not counted as zero\.$/);
  await expect(page.getByTestId("metric-kind")).toHaveText(/total/i);
  // The four multikill boards sit together in their own category.
  for (const id of ["double-kills", "triple-kills", "quadra-kills", "penta-kills"]) await expect(page.getByTestId(`metric-${id}`)).toBeVisible();
  await open(page, "/leaderboards?category=combat");
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
  await expect(page.getByTestId("board-row").first()).toContainText(/best of \d+ games/);
  await noOverflow(page);
});
