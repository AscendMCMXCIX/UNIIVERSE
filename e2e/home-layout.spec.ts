import { expect, test, type Locator, type Page } from "./test";
import { lineupAtRest } from "./lineup";
import { playerEntry } from "./players";

/*
  Team Overview and a profile's Overview as home screens (in-memory demo roster, synthetic data).
  Team: on a wide screen the five cards stand side by side under the team's header, the two
  centred together in the window (as much room above the header as below the cards, no bench or
  row of substitutes under them), and long names take a second line instead of being cut; on a
  short window the page starts at the top and scrolls. Profile: the data status, the season's figures with its
  multikills, and rank and form fill the first screen of a 1440 × 900 window, with the pools
  straight after; off roles are one-line summaries that open in place, their portraits still open
  the champion window, and the pools read as a display until Edit.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

// Against the layout viewport's width: a phone's (isMobile) window grows with what spills past it, so innerWidth would hide it.
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** An element's box once it is on screen (measuring before it renders gives no box). */
async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  return (await locator.boundingBox())!;
}

/**
 * Space above the header and below the cards inside the frame, where the frame ends, and where the
 * parts sit: the section tabs above it, the header and the cards.
 */
async function lineupSpace(page: Page) {
  const tabs = await box(page.getByTestId("team-tabs"));
  const frame = await box(page.getByTestId("lineup-frame"));
  const header = await box(page.getByTestId("team-header"));
  const track = await box(page.getByTestId("lineup-overview"));
  const stage = await box(page.getByTestId("lineup-stage"));
  return { above: header.y - frame.y, below: frame.y + frame.height - (stage.y + stage.height), frameBottom: frame.y + frame.height, tabsBottom: tabs.y + tabs.height, headerTop: header.y, headerBottom: header.y + header.height, trackTop: track.y, trackBottom: track.y + track.height, stageBottom: stage.y + stage.height };
}

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
] as const) {
  test(`Team Overview at ${width} × ${height}: five across under the header, centred together in the window, nothing under the cards`, async ({ page, context, baseURL }, info) => {
    test.skip(info.project.name !== "desktop", "wide screens");
    // The sidebar open, as it is by default.
    await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
    await page.setViewportSize({ width, height });
    await page.goto("/team");
    // Measured once the lineup is laid out and at rest (it streams in: e2e/lineup.ts).
    await lineupAtRest(page);
    const cards = page.getByTestId("lineup-cell");
    await expect(cards).toHaveCount(5);
    const boxes = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), height: r.height })));
    expect(new Set(boxes.map((b) => b.top)).size, "one row").toBe(1);
    // Portrait cards: taller than they are wide, the artwork growing with the window up to its cap
    // (20rem), never stretched to fill it.
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const art = await box(page.getByTestId("card-art").first());
    expect(art.height).toBeGreaterThanOrEqual(13 * 16);
    expect(art.height).toBeLessThanOrEqual(20 * rem + 1);
    // Centred: the frame fills the window (inside the page padding), with as much room above the
    // header as below the cards, the header right above them; nothing scrolls. The cards end the
    // lineup: no bench or row of substitutes under them.
    const space = await lineupSpace(page);
    expect(space.frameBottom, "the frame reaches the foot of the window").toBeGreaterThanOrEqual(height - 40);
    expect(space.trackTop - space.headerBottom).toBeLessThanOrEqual(32);
    await expect(page.getByTestId("lineup-bench")).toHaveCount(0);
    expect(Math.abs(space.stageBottom - space.trackBottom), "the stage ends with the cards").toBeLessThanOrEqual(1);
    expect(Math.abs(space.above - space.below), `above ${space.above}, below ${space.below}`).toBeLessThanOrEqual(2);
    expect(space.above).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
    // The stage's floor: lit from just under the cards (its top in their last 48px), decoration
    // hidden from screen readers.
    const floor = page.getByTestId("lineup-stage-floor");
    expect(await floor.getAttribute("aria-hidden")).toBe("true");
    const lit = await box(floor);
    expect(lit.y, "the floor starts under the cards").toBeGreaterThanOrEqual(space.trackBottom - 48);
    expect(lit.y).toBeLessThanOrEqual(space.trackBottom);
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
  // Measured once the lineup is laid out and at rest (it streams in: e2e/lineup.ts).
  await lineupAtRest(page);
  const space = await lineupSpace(page);
  // No centring gap pushes the page down: the header starts at the top, the cards right under it.
  expect(space.trackTop - space.headerBottom).toBeLessThanOrEqual(32);
  expect(Math.abs(space.above), "no space added above the header").toBeLessThanOrEqual(1);
  expect(space.headerTop - space.tabsBottom).toBeLessThanOrEqual(24);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeGreaterThan(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("Team Overview on a 1366 × 768 laptop with the sidebar open: all five in one centred row of equal cards", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "laptop widths");
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/team");
  // Measured once the lineup is laid out and at rest (it streams in: e2e/lineup.ts).
  await lineupAtRest(page);
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

test("Team Overview on a very wide screen: the lineup takes Team's column, centred, its first card under the first tab", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "wide screens");
  await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/team");
  // Measured once the lineup is laid out and at rest (it streams in: e2e/lineup.ts).
  await lineupAtRest(page);
  const track = await box(page.getByTestId("lineup-overview"));
  const main = await box(page.locator("main"));
  const tab = await box(page.getByTestId("team-tabs").locator("li").first());
  // From a 1920px window the header and cards take Team's column (100rem, in rem: the type scales
  // with very large screens, the lineup with it), never the window (S2c, UD.T2).
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(track.width).toBeLessThanOrEqual(100 * rem + 1);
  expect(track.width).toBeLessThan(main.width - 2 * 4 * rem);
  expect(Math.abs(track.x + track.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs(track.x - tab.x), "the first card under the first tab").toBeLessThanOrEqual(1);
  // Five cards still fit the window's height: the page does not scroll.
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
});

async function openTeammate(page: Page) {
  await page.goto("/players");
  // Players lists every player as a row of its roster, at every width (#277; docs/MOBILE.md).
  const card = playerEntry(page, "Demo Top");
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByTestId("pool-editor")).toBeVisible();
}

test("profile Overview: a 2×2 dashboard at 1440 (the season beside ranked progress, then the pools beside recent form), the earlier arrangement on smaller screens; off roles open in place", async ({ page }, info) => {
  await openTeammate(page);
  if (info.project.name === "desktop") {
    // 1440 × 900 (the owner's choice of 8 Nov 2026, from 1440 wide; Ranked progress above Recent form
    // since Release 16, at the owner's request): the season's card (with its multikills) and ranked
    // progress side by side, level; under the season's card the pools, under ranked progress recent
    // form, in the rail; all four ending on the first screen (the one-screen Overview).
    const four = () => Promise.all([box(page.getByTestId("season-figures")), box(page.getByTestId("recent-form")), box(page.getByTestId("ranked-progress")), box(page.getByTestId("champion-pools"))]);
    let scrollY = await page.evaluate(() => window.scrollY);
    let [figures, form, ranked, pools] = await four();
    expect(ranked.x, "ranked progress in the rail beside the season's card").toBeGreaterThan(figures.x + figures.width);
    expect(Math.abs(ranked.y - figures.y), "level with it: the rail's top on the season's card's").toBeLessThanOrEqual(1);
    expect(Math.abs(ranked.x - form.x), "recent form in the rail").toBeLessThanOrEqual(1);
    expect(form.y - (ranked.y + ranked.height), "under ranked progress").toBeGreaterThanOrEqual(0);
    expect(form.y - (ranked.y + ranked.height), "straight under it").toBeLessThanOrEqual(24);
    expect(Math.abs(pools.x - figures.x), "the pools under the season's card").toBeLessThanOrEqual(1);
    expect(pools.y - (figures.y + figures.height), "straight under it").toBeLessThanOrEqual(24);
    for (const [name, b] of [["the season's card", figures], ["ranked progress", ranked], ["recent form", form], ["the pools", pools]] as const) expect(b.y + b.height + scrollY, `${name} ends on the first screen`).toBeLessThanOrEqual(900);
    // The chart's dates never run together, the last one included: it is drawn end-anchored, so its
    // whole label runs left of its tick (the design review's G1-1: "12 Nov19 Nov" at 1440 and 1920).
    const axisGap = () => page.getByTestId("ranked-tick").evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect()).sort((a, b) => a.left - b.left).map((r, i, all) => (i ? r.left - all[i - 1]!.right : Infinity))));
    expect(await axisGap(), "the chart's date labels apart").toBeGreaterThanOrEqual(4);
    // The band's meta line from xl: the off role in words and the rank's queue, still one line (G1-6).
    const meta = page.getByTestId("profile-rank").locator("..");
    // Drawn, not only read out (an sr-only word is a 1px box).
    const drawn = (testId: string) => page.getByTestId(testId).first().evaluate((el) => [...el.querySelectorAll("span")].filter((s) => s.getBoundingClientRect().width > 2).map((s) => s.textContent).join(" "));
    expect(await drawn("additional-role"), "the off role's name and (off)").toMatch(/\w+.*\(off/);
    expect(await drawn("profile-rank"), "the rank's queue").toMatch(/Solo\/Duo|Flex/);
    expect((await box(meta)).height, "the meta line one line").toBeLessThanOrEqual(30);
    // A smaller window (1280 × 800, the sidebar open) keeps the earlier arrangement with the two cards' places swapped: ranked
    // progress beside the season's card, recent form across the whole width under the first row, then the pools across the width.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(async () => Math.round((await box(page.getByTestId("recent-form"))).x - (await box(page.getByTestId("season-figures"))).x)).toBe(0);
    scrollY = await page.evaluate(() => window.scrollY);
    [figures, form, ranked, pools] = await four();
    expect(ranked.x, "ranked progress beside the season's card").toBeGreaterThan(figures.x + figures.width);
    expect(form.y, "recent form under both").toBeGreaterThanOrEqual(Math.max(figures.y + figures.height, ranked.y + ranked.height));
    expect(Math.abs(form.x + form.width - (ranked.x + ranked.width)), "to the right edge of ranked progress").toBeLessThanOrEqual(1);
    expect(pools.y - (form.y + form.height), "the pools follow straight after recent form").toBeLessThanOrEqual(24);
    expect(Math.abs(pools.x - figures.x), "across the width").toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect.poll(axisGap, { message: "the date labels apart at 1920" }).toBeGreaterThanOrEqual(4);
    // One screen (Release 16) at 1920 × 1080 and at 1920 × 950 (the owner's browser on a 1920 × 1080 screen): every card ends in the window.
    for (const height of [1080, 950]) {
      await page.setViewportSize({ width: 1920, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight), { message: `1920 × ${height}: the page does not scroll` }).toBeLessThanOrEqual(height);
      for (const id of ["season-figures", "ranked-progress", "recent-form", "champion-pools"]) expect((await box(page.getByTestId(id))).y + (await box(page.getByTestId(id))).height, `1920 × ${height}: ${id} in the window`).toBeLessThanOrEqual(height);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  // The pools: one row per champion under one row of column names; no Experience labels.
  const primary = page.getByTestId("primary-pool");
  await expect(primary.getByTestId("primary-pool-columns")).toHaveCount(1);
  await expect(primary.getByTestId("pool-item").first().getByTestId("pool-card-stats")).toBeVisible();
  await expect(page.getByTestId("champion-pools")).not.toContainText(/Played a lot|Played regularly|Not played lately|Some experience/);
  // On a touch phone the off roles sit behind one Show under their heading (the next test).
  if (info.project.name === "phone") await page.getByTestId("off-roles-fold").click();
  // Off roles: one line each, with the champions as portraits; the rows are behind "Show".
  const off = page.getByTestId("secondary-pool");
  await expect(off).toHaveAttribute("data-open", "false");
  await expect(off.getByTestId("secondary-pool-preview")).toBeVisible();
  await expect(off.getByTestId("secondary-pool-list")).toBeHidden();
  const toggle = off.getByTestId("secondary-pool-expand");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  // A portrait links to All Champions with that champion's preview open, in the off role.
  const portrait = off.getByTestId("pool-preview-inspect").first();
  const champion = await portrait.locator("xpath=..").getAttribute("data-champion");
  await expect(portrait).toHaveAttribute("href", new RegExp(`/champions\\?.*champion=${champion}&crole=`));
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

// On a touch phone (posture.ts) Profile Overview keeps to about two screens (PLAN S8a): the primary
// pool shows its top three champions with All N, the off roles are one Show under their heading, and
// Ranked progress shows its heading and the current rank with a chevron for the rest. Nothing is
// dropped: each is one tap away. A tablet sees the whole page, with no Fold buttons.
test("profile Overview on a touch phone: the pools' top three, the off roles and ranked progress's details one tap away; tablets unchanged", async ({ page }, info) => {
  test.skip(info.project.name === "desktop", "the phone's Folds, and the tablet without them");
  await openTeammate(page);
  const phone = info.project.name === "phone";
  const primary = page.getByTestId("primary-pool");
  const rows = primary.getByTestId("pool-item");
  const total = await rows.count();
  expect(total, "the demo's primary pool is longer than three").toBeGreaterThan(3);
  const visibleRows = () => rows.evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 0).length);
  const allFold = page.getByTestId("primary-pool-fold");
  const offFold = page.getByTestId("off-roles-fold");
  const rankedFold = page.getByTestId("ranked-fold");
  if (!phone) {
    for (const f of [allFold, offFold, rankedFold]) await expect(f).toBeHidden();
    expect(await visibleRows()).toBe(total);
    await expect(page.getByTestId("secondary-pool")).toBeVisible();
    await expect(page.getByTestId("ranked-chart")).toBeVisible();
    await expect(page.getByTestId("ranked-change")).toBeVisible();
    return;
  }
  // The pool: the top three, then All N brings the rest in order, and Top 3 folds them again.
  expect(await visibleRows()).toBe(3);
  await expect(allFold).toHaveText(new RegExp(`^All ${total}`));
  await expect(allFold).toHaveAttribute("aria-expanded", "false");
  await allFold.click();
  expect(await visibleRows()).toBe(total);
  await expect(allFold).toHaveText(/^Top 3/);
  await allFold.click();
  expect(await visibleRows()).toBe(3);
  // Off roles: hidden under their heading until Show.
  await expect(page.getByTestId("secondary-pool")).toBeHidden();
  await offFold.click();
  await expect(offFold).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("secondary-pool")).toBeVisible();
  // Ranked progress: the heading, the current rank and the 30-day change stay (the UX review of
  // Release 13: the two figures the card is for); the switches and the chart are behind the chevron,
  // the account line and the highest rank behind the ⓘ beside the rank at every width.
  await expect(page.getByRole("heading", { name: /Ranked progress/ })).toBeVisible();
  await expect(page.getByTestId("ranked-current")).toBeVisible();
  await expect(page.getByTestId("ranked-change")).toBeVisible();
  for (const id of ["ranked-chart", "ranked-queue-solo"]) await expect(page.getByTestId(id), `${id} folded`).toBeHidden();
  await expect(rankedFold).toHaveAccessibleName(/^Show the details of ranked progress$/);
  const box44 = (await rankedFold.boundingBox())!;
  expect(Math.min(box44.width, box44.height), "a 44px target").toBeGreaterThanOrEqual(44);
  await rankedFold.click();
  for (const id of ["ranked-chart", "ranked-queue-solo"]) await expect(page.getByTestId(id), `${id} shown`).toBeVisible();
  await expect(rankedFold).toHaveAccessibleName(/^Hide the details of ranked progress$/);
  // Editing shows every champion, as before.
  await page.getByTestId("pools-edit").click();
  expect(await visibleRows()).toBe(total);
  await expect(allFold).toHaveCount(0);
  await page.getByTestId("pools-edit").click();
  expect(await visibleRows()).toBe(3);
  // Back to the page reopens what was open (kept on the history entry), so the reader lands where they were.
  await allFold.click();
  expect(await visibleRows()).toBe(total);
  await page.getByTestId("secondary-pool").scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => Math.round(window.scrollY));
  // The tab bar has slid away with the scroll: its link is followed as a tap on it would be.
  await page.getByTestId("phone-tabbar").getByRole("link").first().evaluate((a) => (a as HTMLAnchorElement).click());
  await expect(page.getByTestId("primary-pool")).toHaveCount(0);
  await page.goBack();
  await expect(allFold).toHaveAttribute("aria-expanded", "true");
  await expect(offFold).toHaveAttribute("aria-expanded", "true");
  expect(await visibleRows()).toBe(total);
  await expect(page.getByTestId("secondary-pool")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY)), { message: "the place on the page kept" }).toBeGreaterThan(y - 60);
});

// A pool's figures never shrink below their text (shrunk to a few pixels they read as one wrong
// number) and stay under their column names, which keep to one line; on the narrowest phone a row
// keeps the figures beside the name; while editing, a phone's list gives their room to the grip and
// ×; with larger text they wrap under the name rather than squeeze, the column names likewise under
// "Champion"; and where the list is too narrow for the columns at all (under 8.5rem, 175% and 200%
// text on a 320px phone), each figure names itself in words instead of being cut.
test("profile pools on a phone: every figure whole and under its column, editing and larger text included", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  await openTeammate(page);
  const pool = page.getByTestId("primary-pool");
  const facts = () =>
    pool.evaluate((el) => {
      const shown = (e: Element) => e.checkVisibility();
      /** Read out only: an sr-only label while it is hidden (under 8.5rem a figure's label is shown). */
      const readOutOnly = (e: Element) => {
        const label = e.closest(".sr-only");
        return !!label && getComputedStyle(label).position === "absolute";
      };
      /** The boxes of an element's visible text, line by line (not its read-out-only label). */
      const textBoxes = (e: Element) => {
        const boxes: DOMRect[] = [];
        const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const parent = n.parentElement!;
          if (!n.textContent?.trim() || readOutOnly(parent) || !parent.checkVisibility()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          boxes.push(...[...range.getClientRects()].filter((r) => r.width > 0));
        }
        return boxes;
      };
      /** An element's text as it reads on screen (without its read-out-only label). */
      const visibleText = (e: Element) => {
        let text = "";
        const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) if (!readOutOnly(n.parentElement!) && n.parentElement!.checkVisibility()) text += n.textContent;
        return text.replace(/\s+/g, " ").trim();
      };
      const extent = (boxes: DOMRect[]) => (boxes.length ? { left: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)) } : null);
      // A figure is cut when its text is wider than its cell, by any fraction ("Perfect" was 0.9px
      // over a 38px column: an element's scrollWidth rounds that away).
      const figures = [...el.querySelectorAll("[data-testid=pool-card-stats] > span")].filter(shown);
      const cut = figures.flatMap((cell) => {
        const text = extent(textBoxes(cell));
        return text && text.right - text.left > cell.getBoundingClientRect().width + 0.25 ? [cell.textContent?.trim() ?? ""] : [];
      });
      // The rest of a row (names wrap, never cut).
      cut.push(...[...el.querySelectorAll<HTMLElement>("[data-testid=pool-item] span")].filter((e) => shown(e) && e.clientWidth > 1 && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent?.trim() ?? ""));
      const centres = (box: Element | null) => (box && shown(box) ? [...box.children].filter(shown).map((c) => Math.round(c.getBoundingClientRect().left + c.getBoundingClientRect().width / 2)) : []);
      // The column names: Champion, then the figures' part (the span that holds three or more names).
      const columns = el.querySelector("[data-testid$=-columns]");
      const headStats = [...(columns?.children ?? [])].find((s) => s.children.length >= 3) ?? null;
      const names = [columns?.children[1], ...(headStats && shown(headStats) ? [...headStats.children] : [])].filter((c): c is Element => !!c && shown(c));
      // Each name on one line, and none running into the next (a name that clips is measured to its edge).
      const nameLines = names.map((c) => ({ name: c.textContent?.trim() ?? "", lines: new Set(textBoxes(c).map((b) => Math.round(b.top))).size }));
      const spans = names.flatMap((c) => {
        const text = extent(textBoxes(c));
        const clips = getComputedStyle(c).overflowX !== "visible";
        return text ? [{ name: c.textContent?.trim() ?? "", left: text.left, right: clips ? Math.min(text.right, c.getBoundingClientRect().right) : text.right, top: textBoxes(c)[0]!.top }] : [];
      });
      // On the same line (with larger text the figures' names wrap under "Champion").
      const overlaps = spans.slice(1).flatMap((s, i) => (s.left < spans[i]!.right - 0.5 && Math.abs(s.top - spans[i]!.top) < 2 ? [`${spans[i]!.name} / ${s.name}`] : []));
      const withGames = [...el.querySelectorAll("[data-testid=pool-item] [data-testid=pool-card-stats]")].find((s) => s.children.length >= 3) ?? null;
      // "Perfect" (no demo champion has a perfect KDA): a hidden copy of a KDA cell holding it, a
      // size smaller under 24rem as PoolRowStats writes it, measured whole against the cell.
      let perfect: { need: number; room: number } | null = null;
      const kda = withGames?.children[2];
      if (kda && shown(kda)) {
        const probe = kda.cloneNode(false) as HTMLElement;
        probe.classList.add("@max-sm:text-2xs");
        probe.textContent = "Perfect";
        Object.assign(probe.style, { position: "absolute", visibility: "hidden", width: "max-content" });
        kda.parentElement!.append(probe);
        perfect = { need: probe.getBoundingClientRect().width, room: kda.getBoundingClientRect().width };
        probe.remove();
      }
      // The list's width in rem (its container: under 8.5rem the figures name themselves); figures
      // past a row's padding edge (overflow-hidden rows clipped the KDA column there); the column
      // names past the list; "Champion" cut short; and a row's figures as they read on screen.
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const list = columns?.parentElement ?? el;
      const pastRow = [...el.querySelectorAll("[data-testid=pool-item]")].flatMap((li) => {
        const stats = li.querySelector("[data-testid=pool-card-stats]");
        if (!stats || !shown(stats)) return [];
        const edge = li.getBoundingClientRect().right - parseFloat(getComputedStyle(li).borderRightWidth) - parseFloat(getComputedStyle(li).paddingRight);
        const past = stats.getBoundingClientRect().right - edge;
        return past > 0.5 ? [`${li.getAttribute("data-champion")} ${Math.round(past)}px`] : [];
      });
      const champion = columns?.children[1];
      const championText = champion && shown(champion) ? extent(textBoxes(champion)) : null;
      return {
        cut,
        head: centres(headStats),
        row: withGames ? centres(withGames) : [],
        nameLines,
        overlaps,
        perfect,
        rowHeights: [...el.querySelectorAll("[data-testid=pool-item]")].map((li) => Math.round(li.getBoundingClientRect().height)),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        listRem: list.getBoundingClientRect().width / rem,
        headShown: !!columns && shown(columns),
        headPast: columns && shown(columns) ? columns.scrollWidth - columns.clientWidth : 0,
        championCut: !!championText && championText.right - championText.left > champion!.getBoundingClientRect().width + 0.25,
        pastRow,
        worded: withGames ? [...withGames.children].filter(shown).map(visibleText) : [],
      };
    });
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(async () => (await facts()).cut, `${width}: nothing cut`).toEqual([]);
    const f = await facts();
    expect(f.overflow, `${width}: no sideways page scroll`).toBeLessThanOrEqual(1);
    expect(f.row.length, `${width}: a row's figures measured`).toBeGreaterThanOrEqual(3);
    f.row.forEach((x, i) => expect(Math.abs(x - f.head[i]!), `${width}: figure ${i + 1} under its column name`).toBeLessThanOrEqual(3));
    expect(f.nameLines.length, `${width}: the column names measured`).toBeGreaterThanOrEqual(4);
    for (const n of f.nameLines) expect(n.lines, `${width}: "${n.name}" on one line`).toBe(1);
    expect(f.overlaps, `${width}: no column name runs into the next`).toEqual([]);
    expect(f.perfect, `${width}: a KDA cell measured`).not.toBeNull();
    expect(f.perfect!.need, `${width}: "Perfect" whole in its column (${f.perfect!.room}px)`).toBeLessThanOrEqual(f.perfect!.room + 0.25);
    // The narrowest phone: position, portrait, name and figures on one line in every row (44px;
    // with 8px gaps the line was 2px short and every row took two).
    if (width === 320) expect(Math.max(...f.rowHeights), `320: rows ${f.rowHeights.join(", ")}px, none wrapped`).toBeLessThanOrEqual(46);
  }
  // Larger text (125% at 360): still nothing cut and no sideways scroll.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "125%"; });
  await expect.poll(async () => (await facts()).cut, "125% text: nothing cut").toEqual([]);
  expect((await facts()).overflow, "125% text: no sideways page scroll").toBeLessThanOrEqual(1);
  // Larger text still. From 125% on a 320px phone the column names wrap under "Champion", whole,
  // over the figures (which wrap under the name the same way); where the list is narrower than
  // 8.5rem (175% and 200% on 320, 200% on 375) a row has no room for the columns at all (at 200% on
  // 320 the KDA column was cut and the names ran 100px past the list): the column names step aside
  // and each figure names itself in words. Nothing cut, nothing past its row, no sideways scroll.
  for (const [width, root] of [[320, 125], [320, 150], [393, 175], [320, 175], [320, 200], [375, 200], [393, 200]] as const) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate((r) => { document.documentElement.style.fontSize = `${r}%`; }, root);
    const at = `${width}px at ${root}%`;
    await expect.poll(async () => (await facts()).cut, `${at}: nothing cut`).toEqual([]);
    const f = await facts();
    expect(f.overflow, `${at}: no sideways page scroll`).toBeLessThanOrEqual(1);
    expect(f.pastRow, `${at}: every row's figures inside the row`).toEqual([]);
    expect(f.row.length, `${at}: a row's figures measured`).toBeGreaterThanOrEqual(3);
    if (f.listRem < 8.5) {
      expect(f.headShown, `${at} (list ${f.listRem.toFixed(2)}rem): the column names step aside`).toBe(false);
      expect(f.worded.slice(0, 3), `${at}: each figure named in words`).toEqual([expect.stringMatching(/^Games?: \S/), expect.stringMatching(/^Win rate: \S/), expect.stringMatching(/^KDA: \S/)]);
    } else {
      expect(f.headShown, `${at} (list ${f.listRem.toFixed(2)}rem): the column names shown`).toBe(true);
      expect(f.headPast, `${at}: the column names inside the list`).toBeLessThanOrEqual(1);
      expect(f.championCut, `${at}: "Champion" whole`).toBe(false);
      for (const n of f.nameLines) expect(n.lines, `${at}: "${n.name}" on one line`).toBe(1);
      expect(f.overlaps, `${at}: no column name runs into the next`).toEqual([]);
      f.row.forEach((x, i) => expect(Math.abs(x - f.head[i]!), `${at}: figure ${i + 1} under its column name`).toBeLessThanOrEqual(3));
      expect(f.worded.every((w) => /^([\d—]|Perfect)/.test(w)), `${at}: figures alone under their names (${f.worded.join(" | ")})`).toBe(true);
    }
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  // Editing at 390 (nothing is saved): the figures and their column names step aside for the grip
  // and ×, nothing cut; Done brings them back.
  await page.setViewportSize({ width: 390, height: 800 });
  const edit = page.getByTestId("pools-edit");
  await expect(async () => {
    if (!/Done/.test(await edit.innerText())) await edit.click();
    await expect(edit).toHaveText(/Done/, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(pool.getByTestId("pool-grip").first()).toBeVisible();
  await expect(pool.getByTestId("pool-card-stats").first()).toBeHidden();
  await expect.poll(async () => (await facts()).cut, "editing: nothing cut").toEqual([]);
  expect((await facts()).head, "editing: the figures' column names hidden too").toEqual([]);
  await edit.click();
  await expect(edit).toHaveText(/Edit/);
  await expect(pool.getByTestId("pool-card-stats").first()).toBeVisible();
});

// With larger text a profile's Overview stays as wide as the phone. Recent form's twenty bars share
// their card's width with no floor: one in rem grew with the text and ran them up to 61px past the
// card and the screen at 200% on 320px (the pools' column names ran past it too, above).
test("at 150% to 200% text on 320, 375 and 393px phones, a profile's Overview is no wider than the phone, Recent form's bars inside their card", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  await openTeammate(page);
  await expect(page.getByTestId("recent-form-strip")).toBeVisible();
  for (const width of [320, 375, 393]) {
    await page.setViewportSize({ width, height: 800 });
    for (const root of [150, 175, 200]) {
      await page.evaluate((r) => { document.documentElement.style.fontSize = `${r}%`; }, root);
      const at = `${width}px at ${root}%`;
      await expect.poll(() => overflow(page), `${at}: no sideways page scroll`).toBeLessThanOrEqual(1);
      const strip = await page.getByTestId("recent-form").evaluate((card) => {
        const cs = getComputedStyle(card);
        const inner = card.getBoundingClientRect().right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
        const bars = [...card.querySelectorAll("[data-testid=recent-form-strip] [data-result]")].map((b) => b.getBoundingClientRect());
        return { count: bars.length, past: Math.max(...bars.map((b) => b.right)) - inner, narrowest: Math.min(...bars.map((b) => b.width)) };
      });
      expect(strip.count, `${at}: the bars measured`).toBeGreaterThanOrEqual(5);
      expect(strip.past, `${at}: the newest bar inside the card`).toBeLessThanOrEqual(0.5);
      expect(strip.narrowest, `${at}: every bar still a bar`).toBeGreaterThanOrEqual(4);
    }
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

// Without recent form (one champion's games, too few for it), ranked progress spans the rail's two
// rows beside the season's card, the pools under that card. Its history used to open under its chart
// and grow the rail (the card had once stretched by 108px and the pools moved down); since 18 Nov 2026
// the card ends with its chart, so there is nothing left to open and nothing moves.
test("profile Overview's 2×2 without recent form: Ranked progress beside the season's card ends with its chart, with nothing to open, and the pools stay under that card", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the 2×2 is from a 1440px window");
  await page.goto("/players");
  const href = (await playerEntry(page, "Demo Top").first().getAttribute("href"))!;
  await page.goto(`${href}?scope=champion&champion=Ornn`);
  await expect(page.getByTestId("ranked-progress")).toBeVisible();
  await expect(page.getByTestId("recent-form"), "Ornn's games are too few for recent form").toHaveCount(0);
  /** A card's top on the page (not the window, in case a click scrolls) and its height. */
  const at = (testId: string) =>
    page.getByTestId(testId).evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { top: r.top + window.scrollY, left: r.left, right: r.right, height: r.height };
    });
  const [figures, pools, ranked] = [await at("season-figures"), await at("champion-pools"), await at("ranked-progress")];
  expect(ranked.left, "the 2×2: ranked progress in the rail beside the season's card").toBeGreaterThan(figures.right);
  expect(pools.top, "the pools under the season's card").toBeGreaterThan(figures.top + figures.height);
  await expect(page.getByTestId("ranked-details-toggle")).toHaveCount(0);
  await expect(page.getByTestId("ranked-progress").locator("details")).toHaveCount(0);
  // Its last part holds the chart (or the line saying there is nothing to draw).
  expect(await page.getByTestId("ranked-progress").evaluate((card) => !!card.lastElementChild?.querySelector("[data-testid=ranked-chart], [data-testid=ranked-no-chart]"))).toBe(true);
});
