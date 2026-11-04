import { expect, test } from "./test";

/*
  R7/R8 on a teammate's profile (demo roster; the rank readings are synthetic demo data, seeded
  in demo mode only, from the demo games): the recent-form strip follows the filter's newest games,
  and Ranked progress shows the 2026 ranked year, its seasons, Solo/Duo and Flex separately.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("a profile shows recent form and ranked progress per queue", async ({ page }, info) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}`);

  // Recent form: up to twenty squares, oldest to newest, opening Match History; a text summary for screen readers.
  const strip = page.getByTestId("recent-form-strip");
  await expect(strip).toBeVisible();
  const squares = await strip.locator("[data-result]").count();
  expect(squares).toBeGreaterThanOrEqual(5);
  expect(squares).toBeLessThanOrEqual(20);
  await expect(strip).toHaveAttribute("aria-label", /Last \d+ games: \d+ wins, \d+ losses/);
  await expect(strip).toHaveAttribute("href", `/players/${id}/matches`);
  // Not by colour alone: a win's bar rises above the line, a loss's hangs below it.
  const drop = await strip.locator("[data-result]").evaluateAll((els) => els.map((e) => ({ result: e.getAttribute("data-result"), offset: e.firstElementChild!.getBoundingClientRect().top - e.getBoundingClientRect().top })));
  for (const d of drop) expect(d.offset > 8, `${d.result}: its bar's place`).toBe(d.result === "L");
  await expect(page.getByTestId("recent-form-trend")).toBeVisible();
  // Recent KDA beside the whole sample (sample-aware: an arrow only on enough games and a clear gap).
  await expect(page.getByTestId("recent-form-kda")).toContainText(/\d\.\d vs \d\.\d/);

  // Ranked progress: the whole 2026 ranked year by default, Solo/Duo first, with where recording
  // began, what was read, the unrecorded stretch shaded behind a marked break, the gaps of several
  // games left unjoined, and the weeks' games under it (demo readings are synthetic, demo mode only).
  const ranked = page.getByTestId("ranked-progress");
  await expect(ranked).toBeVisible();
  await expect(page.getByTestId("ranked-queue-solo")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("ranked-view-year")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("ranked-tracking")).toContainText(/rank recorded since \d{1,2} [A-Z][a-z]{2} 2026/);
  const chart = page.getByTestId("ranked-chart");
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute("data-view", "year");
  await expect(chart).toHaveAttribute("aria-label", /Rank recorded from .*; not recorded before\./);
  await expect(ranked.getByTestId("ranked-untracked")).toHaveCount(1);
  await expect(ranked.getByTestId("ranked-axis-break")).toHaveCount(1);
  expect(await ranked.getByTestId("ranked-line").count()).toBeGreaterThanOrEqual(2);
  // Several games between two readings: a band, and the line does not cross it.
  expect(await ranked.getByTestId("ranked-gap").count()).toBeGreaterThanOrEqual(1);
  expect(Number(await ranked.getByTestId("ranked-gap").first().getAttribute("data-games"))).toBeGreaterThanOrEqual(2);
  expect(await ranked.getByTestId("ranked-week").count()).toBeGreaterThan(3);
  await expect(page.getByTestId("ranked-events").locator("li").first()).toContainText(/Promoted|Demoted/);
  await expect(page.getByTestId("ranked-peak-stat")).toContainText(/LP/);
  // The header shows the same current rank as Ranked progress.
  const current = (await page.getByTestId("ranked-current").innerText()).split("·")[0]!.trim();
  await expect(page.getByTestId("profile-rank")).toContainText(current);

  // The pointer (or a finger) on a reading shows it; so do the arrow keys, for a screen reader too.
  await chart.scrollIntoViewIfNeeded();
  const dot = ranked.getByTestId("ranked-reading").last();
  const at = (await dot.boundingBox())!;
  if (info.project.name === "phone") await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);
  else await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await expect(page.getByTestId("ranked-tip")).toContainText(/LP/);
  await page.mouse.move(0, 0);
  await chart.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("ranked-tip")).toContainText(/Read \d{1,2} [A-Z][a-z]{2} 2026/);
  await page.keyboard.press("Escape");
  // Every reading as a table, on request.
  await page.getByTestId("ranked-table-toggle").click();
  expect(await page.getByTestId("ranked-table").locator("tbody tr").count()).toBeGreaterThan(3);

  // Accounts are tabbed by their Riot names alone, every one the same way: never "Main", and no
  // "Primary" badge beside the main one (it simply comes first).
  const tabs = page.getByTestId("ranked-account");
  if ((await tabs.count()) > 1) {
    for (const text of await tabs.allInnerTexts()) {
      expect(text.trim()).not.toBe("Main");
      expect(text).not.toMatch(/Primary|·/);
    }
    const heights = await tabs.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);
  }

  // A season on its own: nothing was read in Season 1, so it is all "not recorded", with no peak.
  await page.getByTestId("ranked-view-s1").click();
  await expect(page).toHaveURL(/rv=s1/);
  await expect(page.getByTestId("ranked-chart")).toHaveAttribute("data-view", "s1");
  await expect(page.getByTestId("ranked-peak-stat")).toContainText("Not recorded");
  await expect(page.getByTestId("ranked-line")).toHaveCount(0);

  // Flex is its own ladder.
  await page.getByTestId("ranked-view-year").click();
  await page.getByTestId("ranked-queue-flex").click();
  await expect(page).toHaveURL(/rq=flex/);
  await expect(page.getByTestId("ranked-current")).toContainText(/Silver|Bronze|Gold/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the chart's box has its final height before the page is interactive, so nothing below it moves", async ({ browser, baseURL }, info) => {
  // The server's HTML before React takes over (the page's script chunks held back: streaming still
  // completes) and the interactive page: the chart's box is the same height in both, and the drawing
  // fills it exactly once measured. A box that changed height on hydrating moved everything below it
  // (the pools' Edit button jumped from under a tap).
  const { viewport, isMobile, hasTouch, deviceScaleFactor } = info.project.use;
  const heights: number[] = [];
  for (const interactive of [false, true]) {
    const context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch, deviceScaleFactor });
    await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
    const page = await context.newPage();
    await page.goto("/team");
    const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
    if (!interactive) await page.route("**/_next/static/chunks/**/*.js", (route) => route.abort());
    await page.goto(`/players/${id}`);
    const chart = page.getByTestId("ranked-chart");
    await expect(chart).toBeVisible();
    if (interactive) {
      // Measured: the drawing's own height (its viewBox) is the box's.
      await expect.poll(async () => Math.abs(Number((await chart.getAttribute("viewBox"))!.split(" ")[3]) - (await chart.boundingBox())!.height)).toBeLessThanOrEqual(1);
    }
    heights.push((await chart.boundingBox())!.height);
    await context.close();
  }
  expect(Math.abs(heights[0]! - heights[1]!), `before hydration ${heights[0]} px, interactive ${heights[1]} px`).toBeLessThanOrEqual(1);
});
