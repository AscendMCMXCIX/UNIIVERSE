import { expect, test } from "./test";

/*
  R7/R8 on a teammate's profile (demo roster; the rank readings are synthetic demo data, seeded
  in demo mode only, from the demo games): the recent-form strip follows the filter's newest games,
  and Ranked progress shows the rank read so far, compactly, Solo/Duo and Flex separately.
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

  // Ranked progress, compact: the current rank and LP, how it moved, the highest recorded rank and a
  // chart of the stretch that was read only (from the first reading: nothing earlier is drawn), the
  // gaps of several games left unjoined (demo readings are synthetic, demo mode only).
  const ranked = page.getByTestId("ranked-progress");
  await expect(ranked).toBeVisible();
  await expect(page.getByTestId("ranked-queue-solo")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("ranked-tracking")).toContainText(/2026 Season \d · rank recorded since \d{1,2} [A-Z][a-z]{2} 2026/);
  // No period tabs: the seasons share one ladder, and nothing was read before the first reading.
  await expect(ranked.locator('[data-testid^="ranked-view-"]')).toHaveCount(0);
  const chart = page.getByTestId("ranked-chart");
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute("aria-label", /Rank recorded from .*; Riot reports no earlier ranks\./);
  await expect(ranked.getByTestId("ranked-untracked")).toHaveCount(0);
  expect(await ranked.getByTestId("ranked-line").count()).toBeGreaterThanOrEqual(2);
  // Several games between two readings: a band, and the line does not cross it.
  expect(await ranked.getByTestId("ranked-gap").count()).toBeGreaterThanOrEqual(1);
  expect(Number(await ranked.getByTestId("ranked-gap").first().getAttribute("data-games"))).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("ranked-peak-stat")).toContainText(/LP/);
  await expect(page.getByTestId("ranked-change")).toHaveText(/^([+\u2212]\d+ (LP|divisions?)|No change)$/);
  await expect(page.getByTestId("ranked-lp-bar")).toBeVisible();
  // Compact: under 520 px on a phone; on a 1440 desktop, in the 2×2's rail (20–26rem wide) where its
  // parts stand one above the other, under 480 px, so it ends with the pools beside it.
  const height = (await ranked.boundingBox())!.height;
  expect(height, "Ranked progress's height").toBeLessThan(info.project.name === "phone" ? 520 : 480);
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

  // The details, closed at first: the ranked year's coverage (the year's games week by week, the
  // part with readings lit, what cannot be recovered), every rank change and every reading.
  const details = page.getByTestId("ranked-details");
  await expect(details).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("ranked-table")).toBeHidden();
  await page.getByTestId("ranked-details-toggle").click();
  await expect(details).toHaveAttribute("open", "");
  await expect(page.getByTestId("ranked-coverage-days")).toHaveText(/^Rank known on \d+ of \d+ days$/);
  await expect(page.getByTestId("ranked-coverage-tracked")).toBeVisible();
  expect(await ranked.getByTestId("ranked-week").count()).toBeGreaterThan(3);
  await expect(page.getByTestId("ranked-coverage-note")).toContainText("cannot be recovered");
  await expect(page.getByTestId("ranked-coverage")).toContainText("Season 3");
  await expect(page.getByTestId("ranked-events").locator("li").first()).toContainText(/Promoted|Demoted/);
  expect(await page.getByTestId("ranked-table").locator("tbody tr").count()).toBeGreaterThan(3);
  await page.getByTestId("ranked-details-toggle").click();

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

  // An old link to a season view still opens Ranked progress, which shows what was read.
  await page.goto(`/players/${id}?rv=s1#ranked-progress`);
  await expect(page.getByTestId("ranked-chart")).toBeVisible();
  await page.getByTestId("ranked-queue-flex").click();
  await expect(page).not.toHaveURL(/rv=/);
  await page.getByTestId("ranked-queue-solo").click();

  // Flex is its own ladder.
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

test("on a large screen the chart's division names stay whole, and a narrow chart names them by code", async ({ page }, info) => {
  // The root size grows above 1536px (globals.css), and the labels with it: the gutter follows
  // (it was a fixed 64px, which cut "Platinum II" on the left above about 1700px).
  test.skip(info.project.name !== "desktop", "a desktop window, then a phone-wide one");
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  const labels = () =>
    page.getByTestId("ranked-chart").evaluate((svg) =>
      [...svg.querySelectorAll<SVGTextElement>("text[text-anchor=end]")].map((t) => ({ x: t.getBBox().x, text: t.textContent ?? "" })),
    );
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(`/players/${id}`);
  await expect(page.getByTestId("ranked-chart")).toBeVisible();
  // Measured: the drawing is as tall as its box (7.5rem) at this root size too.
  await expect.poll(async () => Math.abs(Number((await page.getByTestId("ranked-chart").getAttribute("viewBox"))!.split(" ")[3]) - (await page.getByTestId("ranked-chart").boundingBox())!.height)).toBeLessThanOrEqual(1);
  const wide = await labels();
  expect(wide.length, "division names drawn").toBeGreaterThan(0);
  for (const l of wide) expect(l.x, `"${l.text}" starts inside the drawing`).toBeGreaterThanOrEqual(0);
  // A phone-wide window: the same divisions by code (E2, P1, M), still whole.
  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(async () => (await labels()).every((l) => /^(I|B|S|G|P|E|D)[1-4]$|^(M|GM|C)$/.test(l.text))).toBe(true);
  for (const l of await labels()) expect(l.x, `"${l.text}" starts inside the drawing`).toBeGreaterThanOrEqual(0);
});
