import { expect, test, type Locator, type Page } from "./test";
import { playerEntry } from "./players";

/*
  Team Overview and a profile's Overview as home screens (in-memory demo roster, synthetic data).
  Team: on a wide screen the five cards stand side by side under the team's header, which sits
  right under the section tabs; the cards take the window's height down to the bench of
  substitutes under them (their art grows into it, up to 1.9 times a card's width), so no band of
  empty page sits above the header or under the cards, and long names take a second line instead
  of being cut; on a short window the page starts at the top and scrolls. Profile: the data status,
  the season's figures with its multikills, and rank and form fill the first screen of a
  1440 × 900 window, with the pools straight after; off roles are one-line summaries that open in
  place, their portraits still open the champion window, and the pools read as a display until Edit.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** An element's box once it is on screen (measuring before it renders gives no box). */
async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  return (await locator.boundingBox())!;
}

/** Where the lineup's parts sit: the section tabs above it, the team's header, the cards and the bench of substitutes under them. */
async function lineupParts(page: Page) {
  const tabs = await box(page.getByTestId("team-tabs"));
  const frame = await box(page.getByTestId("lineup-frame"));
  const header = await box(page.getByTestId("team-header"));
  const track = await box(page.getByTestId("lineup-overview"));
  const bench = await box(page.getByTestId("lineup-bench"));
  return { tabsBottom: tabs.y + tabs.height, frameTop: frame.y, headerTop: header.y, headerBottom: header.y + header.height, trackTop: track.y, trackBottom: track.y + track.height, benchTop: bench.y, benchBottom: bench.y + bench.height };
}

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
] as const) {
  test(`Team Overview at ${width} × ${height}: five across under the header, from the top of the page down to the bench, the cards taking the window's height`, async ({ page, context, baseURL }, info) => {
    test.skip(info.project.name !== "desktop", "wide screens");
    // The sidebar open, as it is by default: at 1280 that leaves a 60rem lineup, five across from 58rem.
    await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
    await page.setViewportSize({ width, height });
    await page.goto("/team");
    const cards = page.getByTestId("lineup-cell");
    await expect(cards).toHaveCount(5);
    const boxes = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), width: r.width, height: r.height })));
    expect(new Set(boxes.map((b) => b.top)).size, "one row").toBe(1);
    // Anchored: the header right under the section tabs, the cards right under it, the bench right under them.
    const parts = await lineupParts(page);
    expect(parts.headerTop - parts.tabsBottom, "the header sits under the tabs").toBeLessThanOrEqual(24);
    expect(parts.trackTop - parts.headerBottom).toBeLessThanOrEqual(32);
    expect(parts.benchTop - parts.trackBottom).toBeLessThanOrEqual(16);
    // The cards take the height the window leaves them: their art grows into it (a portrait, at
    // most 1.9 times the card's width, and 30rem), so nothing scrolls and no band of empty page is
    // left under the bench unless the art has reached its largest size.
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const art = await box(page.getByTestId("card-art").first());
    // The card is the art's container: 1.9 times its content box (inside its border).
    const largest = Math.min(1.9 * (await page.locator("[data-testid^=lineup-row-]").first().evaluate((card) => card.clientWidth)), 30 * rem);
    expect(art.height).toBeGreaterThanOrEqual(13 * rem - 1);
    expect(art.height).toBeLessThanOrEqual(largest + 1);
    expect(parts.benchBottom, "the bench ends on the first screen").toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
    const atLargest = art.height >= largest - 1;
    if (!atLargest) expect(height - parts.benchBottom, "no band of empty page under the bench").toBeLessThanOrEqual(4 * rem);
    // The decorative floor (a glow and the team's name under the cards) is gone: the bench is there.
    await expect(page.getByTestId("lineup-stage-floor")).toHaveCount(0);
    // Names are never cut: a long one wraps instead.
    const cut = await page.locator('[data-testid="lineup-overview"] [data-name-style]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length);
    expect(cut).toBe(0);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
}

test("Team Overview on a short window: the lineup follows the header and the page scrolls", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "wide screens");
  await page.setViewportSize({ width: 1440, height: 560 });
  await page.goto("/team");
  const parts = await lineupParts(page);
  // Nothing pushes the page down: the header starts at the top, the cards right under it.
  expect(parts.trackTop - parts.headerBottom).toBeLessThanOrEqual(32);
  expect(Math.abs(parts.headerTop - parts.frameTop), "no space added above the header").toBeLessThanOrEqual(1);
  expect(parts.headerTop - parts.tabsBottom).toBeLessThanOrEqual(24);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeGreaterThan(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("Team Overview on a 1366 × 768 laptop with the sidebar open: all five in one centred row of equal cards", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "laptop widths");
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/team");
  const cells = page.getByTestId("lineup-cell");
  await expect(cells).toHaveCount(5);
  const boxes = await cells.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), bottom: r.bottom })));
  expect(new Set(boxes.map((b) => b.top)).size, "one row").toBe(1);
  expect(new Set(boxes.map((b) => b.width)).size, "equal widths").toBe(1);
  expect(new Set(boxes.map((b) => b.height)).size, "equal heights").toBe(1);
  // The whole lineup on the first screen, centred in the content area under a header of the same width.
  expect(Math.max(...boxes.map((b) => b.bottom))).toBeLessThanOrEqual(768);
  const track = await box(page.getByTestId("lineup-overview"));
  const header = await box(page.getByTestId("team-header"));
  const main = await box(page.locator("main"));
  expect(Math.abs(track.x + track.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs(header.width - track.width)).toBeLessThanOrEqual(2);
  // Narrow cards stay readable: names wrap whole (never cut) and ranks are not shortened.
  const cut = await page.locator('[data-testid="lineup-overview"] [data-name-style], [data-testid="lineup-overview"] [data-testid="rank-inline"] > span').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length);
  expect(cut).toBe(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("Team Overview on a very wide screen: the lineup keeps its maximum width, centred, with the bench's cells under their cards", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "wide screens");
  await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/team");
  const track = await box(page.getByTestId("lineup-overview"));
  const main = await box(page.locator("main"));
  // The cap is in rem (the type scales with very large screens, the lineup with it), never the
  // window: 100rem from a 90rem lineup, so the cards' art reads as portraits.
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(track.width).toBeLessThanOrEqual(100 * rem + 1);
  expect(track.width).toBeLessThan(main.width - 2 * 4 * rem);
  expect(Math.abs(track.x + track.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(2);
  // The bench's cells share the cards' columns: each role's cell under its card.
  const roles = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
  for (const [i, role] of roles.entries()) {
    const cell = await box(page.getByTestId("lineup-cell").nth(i));
    const under = await box(page.getByTestId(`bench-${role}`).or(page.getByTestId(`bench-empty-${role}`)));
    expect(Math.abs(under.x - cell.x), `${role}: left edges`).toBeLessThanOrEqual(1);
    expect(Math.abs(under.width - cell.width), `${role}: widths`).toBeLessThanOrEqual(1);
  }
});

async function openTeammate(page: Page) {
  await page.goto("/players");
  // Phones list the players as rows (docs/MOBILE.md); wider screens as cards.
  const card = playerEntry(page, "Demo Top");
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByTestId("pool-editor")).toBeVisible();
}

test("profile Overview: a dashboard with the season, its multikills and recent form on the first screen, ranked progress across the width under them, then the pools; off roles open in place", async ({ page }, info) => {
  await openTeammate(page);
  if (info.project.name === "desktop") {
    // 1440 × 900: the season's card (with its multikills) and recent form side by side, level, both
    // ending on the first screen; ranked progress starting there, across the whole width under
    // them (a year on one time axis needs it); the pools straight after it, across the width too.
    const scrollY = await page.evaluate(() => window.scrollY);
    const [figures, form, ranked, pools] = await Promise.all([box(page.getByTestId("season-figures")), box(page.getByTestId("recent-form")), box(page.getByTestId("ranked-progress")), box(page.getByTestId("champion-pools"))]);
    expect(figures.y + figures.height + scrollY, "the season's card ends on the first screen").toBeLessThanOrEqual(900);
    expect(form.y + form.height + scrollY, "recent form ends on the first screen").toBeLessThanOrEqual(900);
    expect(ranked.y + scrollY, "ranked progress starts on the first screen").toBeLessThan(900);
    expect(form.x, "recent form in the column beside the season's card").toBeGreaterThan(figures.x + figures.width);
    expect(Math.abs(form.y - figures.y), "level with it").toBeLessThanOrEqual(1);
    expect(ranked.y, "ranked progress under both").toBeGreaterThanOrEqual(Math.max(figures.y + figures.height, form.y + form.height));
    expect(Math.abs(ranked.x - figures.x), "from the left edge of the season's card").toBeLessThanOrEqual(1);
    expect(Math.abs(ranked.x + ranked.width - (form.x + form.width)), "to the right edge of recent form").toBeLessThanOrEqual(1);
    expect(pools.y - (ranked.y + ranked.height), "the pools follow straight after ranked progress").toBeLessThanOrEqual(24);
    expect(Math.abs(pools.x - figures.x), "across the width").toBeLessThanOrEqual(1);
  }
  // The pools: one row per champion under one row of column names; no Experience labels.
  const primary = page.getByTestId("primary-pool");
  await expect(primary.getByTestId("primary-pool-columns")).toHaveCount(1);
  await expect(primary.getByTestId("pool-item").first().getByTestId("pool-card-stats")).toBeVisible();
  await expect(page.getByTestId("champion-pools")).not.toContainText(/Played a lot|Played regularly|Not played lately|Some experience/);
  // Off roles: one line each, with the champions as portraits; the rows are behind "Show".
  const off = page.getByTestId("secondary-pool");
  await expect(off).toHaveAttribute("data-open", "false");
  await expect(off.getByTestId("secondary-pool-preview")).toBeVisible();
  await expect(off.getByTestId("secondary-pool-list")).toBeHidden();
  const toggle = off.getByTestId("secondary-pool-expand");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  // A portrait opens that champion's window, in the off role.
  const portrait = off.getByTestId("pool-preview-inspect").first();
  const champion = await portrait.locator("xpath=..").getAttribute("data-champion");
  await portrait.click();
  await expect(page.getByTestId("champion-detail")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`champ=${champion}`));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-detail")).toHaveCount(0);
  // Opening shows the full pool; closing folds it back.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(off.getByTestId("secondary-pool-list")).toBeVisible();
  await expect(off.getByTestId("secondary-pool-list").getByTestId("pool-item").first()).toBeVisible();
  await toggle.click();
  await expect(off.getByTestId("secondary-pool-list")).toBeHidden();
  // The pools read as a display: no grips, ×, role menus or Add until Edit, which brings them all
  // (every role open); Done puts them away again.
  const pools = page.getByTestId("profile-editor");
  const editButton = page.getByTestId("pools-edit");
  await expect(pools.getByTestId("pool-grip")).toHaveCount(0);
  await expect(pools.getByTestId("pool-remove")).toHaveCount(0);
  await expect(pools.getByTestId("role-grip")).toHaveCount(0);
  await expect(pools.getByRole("button", { name: /^Change the .* role$/ })).toHaveCount(0);
  await expect(page.getByTestId("add-off-role")).toHaveCount(0);
  await editButton.click();
  await expect(editButton).toHaveText(/Done/);
  await expect(off.getByTestId("secondary-pool-list")).toBeVisible();
  await expect(off.getByRole("button", { name: /Add/ }).first()).toBeVisible();
  await expect(pools.getByTestId("pool-remove").first()).toBeVisible();
  await expect(pools.getByRole("button", { name: /^Change the .* role$/ }).first()).toBeVisible();
  await expect(page.getByTestId("add-off-role")).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await editButton.click();
  await expect(editButton).toHaveText(/Edit/);
  await expect(pools.getByTestId("pool-grip")).toHaveCount(0);
  await expect(off.getByTestId("secondary-pool-list")).toBeHidden();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});
