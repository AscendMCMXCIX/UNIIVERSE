import { expect, test, type Locator, type Page } from "./test";
import { playerEntry } from "./players";
import { RANKED_YEAR } from "../src/domain/ranked-year";

/*
  R7/R8 on a teammate's profile (demo roster; the rank readings are synthetic demo data, seeded
  in demo mode only, from the demo games): the recent-form strip follows the filter's newest games,
  and Ranked progress shows the rank read so far, compactly, Solo/Duo and Flex separately.
*/

/*
  Dates, without naming a year: the demo's games and rank readings are dated back from the moment it
  was seeded, about 78 days at most (server/demo/seed.ts), so a date the profile shows ("7 Oct 2026",
  in the installation's time zone) must fall in the 100 days before now, or on the day after it.
*/
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;
function inDemoWindow(date: string): boolean {
  const m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(date);
  const month = m ? MONTHS.indexOf(m[2]!) : -1;
  if (!m || month < 0) return false;
  const at = Date.UTC(Number(m[3]), month, Number(m[1]));
  return at >= Date.now() - 100 * DAY && at <= Date.now() + DAY;
}

/**
 * On a touch phone Ranked progress is a Fold (PLAN S8a's Overview heights): its heading and the
 * current rank show, and its chevron brings back the account line, the switches, the movement, the
 * highest rank and the chart. Elsewhere there is no chevron and everything shows.
 */
async function openRankedFold(page: Page, phone: boolean) {
  const fold = page.getByTestId("ranked-fold");
  if (!phone) {
    await expect(fold).toBeHidden();
    return;
  }
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "true");
}

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
  await openRankedFold(page, info.project.name === "phone");
  await expect(page.getByTestId("ranked-queue-solo")).toHaveAttribute("aria-current", "page");
  // The ranked year is the app's (domain/ranked-year); the first reading's date is the demo's.
  const tracking = page.getByTestId("ranked-tracking");
  await expect(tracking).toContainText(new RegExp(`${RANKED_YEAR} Season \\d · rank recorded since \\d{1,2} [A-Z][a-z]{2} \\d{4}`));
  const since = /rank recorded since (\d{1,2} [A-Z][a-z]{2} \d{4})/.exec(await tracking.innerText())![1]!;
  expect(inDemoWindow(since), `rank recorded since ${since}: within the demo's dates`).toBe(true);
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
  // Compact: under 520 px on a phone; on a tablet, which keeps the arrangement without the 2×2,
  // well under half its screen (320 px); on a 1440 desktop, in the 2×2's rail (28rem wide with the
  // sidebar open, 30rem wider; the rail's 20rem floor never applies, since the 2×2 needs a 68rem
  // dashboard) where its parts stand one above the other, under 480 px, so it ends with the pools
  // beside it.
  const height = (await ranked.boundingBox())!.height;
  expect(height, "Ranked progress's height").toBeLessThan(info.project.name === "phone" ? 520 : info.project.name === "tablet" ? 320 : 480);
  // The header shows the same current rank as Ranked progress.
  const current = (await page.getByTestId("ranked-current").innerText()).split("·")[0]!.trim();
  await expect(page.getByTestId("profile-rank")).toContainText(current);

  // The pointer (or a finger) on a reading shows it; so do the arrow keys, for a screen reader too.
  // The chart answers once its script runs, which first measures the chart's box: the drawing (its
  // viewBox) then becomes as wide as the box, where the server drew it 480 wide (the box is 309 to
  // 414px wide in these projects). A pointer that arrived before then reached no handler, and
  // nothing moved it again, so the reading never showed (on GitHub, 19 Nov): the pointer goes to
  // the reading once the drawing is measured.
  await chart.scrollIntoViewIfNeeded();
  await expect.poll(async () => Number((await chart.getAttribute("viewBox"))!.split(" ")[2]) - Math.round((await chart.boundingBox())!.width), "the chart measured: its script is running").toBe(0);
  const dot = ranked.getByTestId("ranked-reading").last();
  const at = (await dot.boundingBox())!;
  if (info.project.name === "phone") await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);
  else await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await expect(page.getByTestId("ranked-tip")).toContainText(/LP/);
  await page.mouse.move(0, 0);
  await chart.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("ranked-tip")).toContainText(/Checked \d{1,2} [A-Z][a-z]{2} \d{4}/);
  const read = /Checked (\d{1,2} [A-Z][a-z]{2} \d{4})/.exec(await page.getByTestId("ranked-tip").innerText())![1]!;
  expect(inDemoWindow(read), `read ${read}: within the demo's dates`).toBe(true);
  await page.keyboard.press("Escape");

  // The card ends with the chart (18 Nov 2026): no History and coverage disclosure under it, so no
  // year strip, rank changes or readings table (the readings themselves are unchanged).
  await expectEndsWithChart(ranked, "Demo Top");

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
  // On a phone the address's #ranked-progress opens its Fold.
  if (info.project.name === "phone") await expect(page.getByTestId("ranked-fold")).toHaveAttribute("aria-expanded", "true");
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
    if (info.project.name === "phone") {
      // A phone's chart is folded in the server's HTML (CSS, not script), so it cannot move what is
      // below it while the page hydrates; opened, its drawing fills its box.
      if (!interactive) {
        await expect(page.getByTestId("ranked-current")).toBeVisible();
        await expect(chart).toBeHidden();
        await context.close();
        continue;
      }
      await openRankedFold(page, true);
    }
    await expect(chart).toBeVisible();
    if (interactive) {
      // Measured: the drawing's own height (its viewBox) is the box's.
      await expect.poll(async () => Math.abs(Number((await chart.getAttribute("viewBox"))!.split(" ")[3]) - (await chart.boundingBox())!.height)).toBeLessThanOrEqual(1);
    }
    heights.push((await chart.boundingBox())!.height);
    await context.close();
  }
  if (info.project.name === "phone") return;
  expect(Math.abs(heights[0]! - heights[1]!), `before hydration ${heights[0]} px, interactive ${heights[1]} px`).toBeLessThanOrEqual(1);
});

test("on a large screen the chart's division names stay whole, and a narrow chart names them by code", async ({ page }, info) => {
  // The root size grows above 1536px (globals.css), and the labels with it: the gutter follows
  // (it was a fixed 64px, which cut "Platinum II" on the left above about 1700px). Demo Mid, whose
  // readings are Platinum IV to II, the longest names a division line carries (Demo Top's Silver
  // ones fit even the old gutter). From lg the labels are 12px at least (the desktop's floor), so
  // 1440 is measured too: with a 4rem gutter "Platinum IV" started 6px left of the drawing there.
  test.skip(info.project.name !== "desktop", "a desktop window, then a phone-wide one");
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!;
  const labels = () =>
    page.getByTestId("ranked-chart").evaluate((svg) =>
      [...svg.querySelectorAll<SVGTextElement>("text[data-division]")].map((t) => ({ x: t.getBBox().x, text: t.textContent ?? "" })),
    );
  for (const [width, height] of [[2560, 1440], [1440, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(`/players/${id}`);
    await expect(page.getByTestId("ranked-chart")).toBeVisible();
    // Measured: the drawing is as tall as its box (7.5rem) at this root size too.
    await expect.poll(async () => Math.abs(Number((await page.getByTestId("ranked-chart").getAttribute("viewBox"))!.split(" ")[3]) - (await page.getByTestId("ranked-chart").boundingBox())!.height)).toBeLessThanOrEqual(1);
    const wide = await labels();
    expect(wide.length, `${width}: division names drawn`).toBeGreaterThan(0);
    for (const l of wide) expect(l.x, `${width}: "${l.text}" starts inside the drawing`).toBeGreaterThanOrEqual(0);
    // The longest names the wide chart writes ("Platinum II", "Emerald III", "Diamond IV") are what
    // the gutter must hold; at 2560 the root is about 21px.
    expect(wide.some((l) => / I{1,3}V?$|IV$/.test(l.text)), `${width}: the wide chart names divisions in full`).toBe(true);
  }
  // A phone-wide window: every line by its code, as match cards write a rank (P2, a tier's line by
  // its first division, E4; the apex M), never a bare letter or a short word beside codes; whole.
  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(async () => (await labels()).every((l) => /^(I|B|S|G|P|E|D)[1-4]$|^(M|GM|C)$/.test(l.text))).toBe(true);
  for (const l of await labels()) expect(l.x, `"${l.text}" starts inside the drawing`).toBeGreaterThanOrEqual(0);
});

/** A demo player's profile address, from the Players roster (a row per player at every width, one link over each). */
async function profileOf(page: Page, name: string): Promise<string> {
  await page.goto("/players");
  const entry = playerEntry(page, name).first();
  await expect(entry).toBeVisible();
  return (await entry.getAttribute("href"))!;
}

/**
 * Where the queue switch meets the title: how much of the ⓘ's button and of the title's own words
 * (each line's box, from a Range; not the tip's text, which is read out only) lies under the
 * switch, in px², and whether the switch starts above the title's last line (one row).
 */
function headerClash(ranked: Locator) {
  return ranked.evaluate((el) => {
    const h2 = el.querySelector<HTMLElement>("#ranked-progress-title")!;
    const nav = el.querySelector("nav[aria-label=Queue]")!.getBoundingClientRect();
    const under = (r: DOMRect) => Math.max(0, Math.min(r.right, nav.right) - Math.max(r.left, nav.left)) * Math.max(0, Math.min(r.bottom, nav.bottom) - Math.max(r.top, nav.top));
    const words: DOMRect[] = [];
    const walk = document.createTreeWalker(h2, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent?.trim() || n.parentElement?.closest(".sr-only, button")) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      words.push(...range.getClientRects());
    }
    const tip = h2.querySelector("button")!.getBoundingClientRect();
    return { tip: under(tip), words: words.reduce((sum, r) => sum + under(r), 0), lines: words.length, oneRow: nav.top < h2.getBoundingClientRect().bottom };
  });
}

/**
 * Ranked progress ends with its chart (or the line saying there is nothing to draw): no disclosure,
 * no year strip, rank changes or readings table in the card; the card's last part holds the chart,
 * whose foot is at least the card's padding from the card's inner foot (the chart may stand beside
 * the rank's column and end above it), the padding at the foot is the header's at the top, and the
 * card keeps its rounded corners.
 */
async function expectEndsWithChart(ranked: Locator, where: string) {
  for (const gone of ["ranked-details", "ranked-details-toggle", "ranked-coverage", "ranked-events", "ranked-key", "ranked-table"]) await expect(ranked.getByTestId(gone), `${where}: no ${gone}`).toHaveCount(0);
  await expect(ranked.locator("details, summary"), `${where}: no disclosure`).toHaveCount(0);
  await expect(ranked, where).not.toContainText("History and coverage");
  const box = await ranked.evaluate((card) => {
    const cs = getComputedStyle(card);
    const outer = card.getBoundingClientRect();
    const chart = card.querySelector("[data-testid=ranked-chart], [data-testid=ranked-no-chart]")!.getBoundingClientRect();
    const header = card.firstElementChild!.getBoundingClientRect();
    const last = card.lastElementChild!;
    const lastBox = last.getBoundingClientRect();
    const inner = { top: outer.top + parseFloat(cs.borderTopWidth), bottom: outer.bottom - parseFloat(cs.borderBottomWidth) };
    return {
      chartFoot: Math.round((inner.bottom - chart.bottom) * 10) / 10,
      lastFoot: Math.round((inner.bottom - lastBox.bottom) * 10) / 10,
      headerTop: Math.round((header.top - inner.top) * 10) / 10,
      padBottom: parseFloat(cs.paddingBottom),
      lastHoldsChart: !!last.querySelector("[data-testid=ranked-chart], [data-testid=ranked-no-chart]"),
      radius: parseFloat(cs.borderBottomLeftRadius) > 0 && parseFloat(cs.borderBottomRightRadius) > 0,
    };
  });
  expect(box.lastHoldsChart, `${where}: the chart is in the card's last part`).toBe(true);
  expect(Math.abs(box.lastFoot - box.padBottom), `${where}: the last part ends ${box.lastFoot}px above the card's inner foot, its padding ${box.padBottom}px`).toBeLessThanOrEqual(0.5);
  expect(box.chartFoot, `${where}: the chart's foot ${box.chartFoot}px from the card's inner foot`).toBeGreaterThanOrEqual(box.padBottom - 0.5);
  expect(Math.abs(box.padBottom - box.headerTop), `${where}: the same padding at the foot (${box.padBottom}px) as at the top (${box.headerTop}px)`).toBeLessThanOrEqual(0.5);
  expect(box.radius, `${where}: rounded corners at its foot`).toBe(true);
}

test("on a phone Ranked progress's header never lets the queue switch cover the title or its ⓘ", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  await page.goto(await profileOf(page, "Demo Top"));
  const ranked = page.getByTestId("ranked-progress");
  await expect(ranked).toBeVisible();
  // The narrowest phone and a wide one, default text and larger: the switch beside the title while
  // even the wrapped title ("Ranked", "progress ⓘ") fits there, under it otherwise, never over the ⓘ
  // or a word. The ⓘ measured is its touch area, 44px on a touch screen: it reaches about 0.7rem
  // under the title's line, and 0.875rem past the mark beside the switch (430 wide at 150%, where the
  // title ends in its ⓘ; on Release 6 before the header's touch gaps the switch sat 6.5px into it at
  // 320 with 125% text, 7.5px at 150%, and 0.7px beside it at 430 with 150%).
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 640 });
    for (const size of ["100%", "125%", "150%", "200%"]) {
      await page.evaluate((s) => { document.documentElement.style.fontSize = s; }, size);
      const clash = await headerClash(ranked);
      const at = `${width}, ${size} text`;
      expect(clash.lines, `${at}: the title's words measured`).toBeGreaterThan(0);
      expect(clash.tip, `${at}: the ⓘ clear of the queue switch`).toBe(0);
      expect(clash.words, `${at}: the title's words clear of the queue switch`).toBe(0);
      if (size === "100%") expect(clash.oneRow, `${width}, default text: the switch on the title's row`).toBe(true);
    }
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

test("Ranked progress ends with its chart at every width: no History and coverage, its corners and padding whole", async ({ page }, info) => {
  // The phone (375, and the narrowest, 320), the tablet and the 1440 desktop (the 2×2's rail), with
  // the default text and larger: the card's last part holds the chart, as far from the card's foot as
  // the header is from its top.
  const widths = info.project.name === "phone" ? [375, 320] : [page.viewportSize()!.width];
  for (const name of ["Demo Top", "Demo Mid"]) {
    await page.goto(await profileOf(page, name));
    const ranked = page.getByTestId("ranked-progress");
    await expect(ranked).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: page.viewportSize()!.height });
      for (const size of ["100%", "150%"]) {
        await page.evaluate((s) => { document.documentElement.style.fontSize = s; }, size);
        await expectEndsWithChart(ranked, `${name} at ${width}px, ${size} text`);
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    }
  }
});
