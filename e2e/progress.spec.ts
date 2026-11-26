import { expect, test, type Locator, type Page } from "./test";
import { playerEntry } from "./players";
import { optionsOf, pick, valueOf } from "./select";
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
  // Compact (the UX review of Release 13 undid the card stretched level with the pools): the chart
  // 7.5rem tall at every width, so a few LP never look like a swing; the card under 520px on a phone
  // (its details opened), well under half a tablet's screen, and under 400px in the 1440 desktop's rail.
  const height = (await ranked.boundingBox())!.height;
  expect(height, "Ranked progress's height").toBeLessThan(info.project.name === "phone" ? 520 : info.project.name === "tablet" ? 320 : 400);
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  // 7.5rem, or 6rem in a narrow card (a phone's: under 25.5rem, where the chart names divisions by code).
  const chartBox0 = (await ranked.getByTestId("ranked-chart-box").boundingBox())!;
  const chartRem = chartBox0.width < 25.5 * rem ? 6 : 7.5;
  expect(Math.abs(chartBox0.height - chartRem * rem), `the chart's height: ${chartRem}rem`).toBeLessThanOrEqual(1);
  // The rank and the 30-day change on one row, before the chart; the account line and the highest
  // rank behind the ⓘ beside the rank (read out with it), not on the card.
  const [cur, change, chartBox] = [await page.getByTestId("ranked-current").boundingBox(), await page.getByTestId("ranked-change").boundingBox(), await ranked.getByTestId("ranked-chart-box").boundingBox()];
  expect(change!.y + change!.height, "the 30-day change above the chart").toBeLessThanOrEqual(chartBox!.y);
  if (info.project.name !== "phone") {
    // Beside the rank: to its right, level with it (the change's caption starts above the rank's line ends).
    const block = (await ranked.locator("#ranked-movement").boundingBox())!;
    expect(block.x, "right of the rank").toBeGreaterThanOrEqual(cur!.x + cur!.width);
    expect(block.y, "level with the rank").toBeLessThan(cur!.y + cur!.height);
  }
  await expect(page.getByRole("button", { name: "About this rank" })).toBeVisible();
  // The record's year on screen at every width, a phone's too (Riot's count for the year, not this
  // season's; its "(Riot)" from a 21rem card), on one line with the record.
  const record = ranked.getByTestId("ranked-record");
  if (await record.count()) {
    await expect(ranked.getByTestId("ranked-record-year")).toBeVisible();
    await expect(record).toContainText(new RegExp(`^\\d+W \\d+L( · \\d+%)? · ${RANKED_YEAR}`));
    const lines = await record.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(lines, "the record on one line").toBe(1);
  }
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

  // One account here: no account select (several accounts: the test below).
  await expect(ranked.getByTestId("ranked-account-select")).toHaveCount(0);

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
 * Ranked progress's header and controls, as drawn: whether the ⓘ's touch area reaches the phone's
 * chevron (px² of overlap), whether the queue switch is under the rank (never in the header on a phone), and
 * where the controls' row starts against the rank's row.
 */
function headerParts(ranked: Locator) {
  return ranked.evaluate((el) => {
    const box = (q: string) => el.querySelector(q)?.getBoundingClientRect() ?? null;
    const tip = box("#ranked-progress-title button")!;
    const fold = box("[data-testid=ranked-fold]");
    const nav = box("nav[aria-label=Queue]")!;
    const rank = box("[data-testid=ranked-current]")!;
    const row = box("[data-testid=ranked-controls]")!;
    const card = el.getBoundingClientRect();
    const overlap = (a: DOMRect, b: DOMRect | null) => (b && b.width ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0);
    return { tipOnChevron: overlap(tip, fold), switchUnderRank: nav.top >= rank.bottom - 1, switchUnderTitle: nav.top >= box("#ranked-progress-title")!.bottom - 1, rowStart: Math.round(row.left - card.left), rankStart: Math.round((el.querySelector("[data-testid=ranked-current]")!.closest("div.flex") as HTMLElement).getBoundingClientRect().left - card.left), rowInside: row.right <= card.right + 0.5 };
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
    // The last part drawn: from md in a card of 24rem or more the body and the details are display: contents (the queue switch
    // on the title's row, Release 16), so their last part is the card's own.
    let last = card.lastElementChild!;
    while (getComputedStyle(last).display === "contents" && last.lastElementChild) last = last.lastElementChild;
    const lastBox = last.getBoundingClientRect();
    const inner = { top: outer.top + parseFloat(cs.borderTopWidth), bottom: outer.bottom - parseFloat(cs.borderBottomWidth) };
    return {
      chartFoot: Math.round((inner.bottom - chart.bottom) * 10) / 10,
      lastFoot: Math.round((inner.bottom - lastBox.bottom) * 10) / 10,
      headerTop: Math.round((header.top - inner.top) * 10) / 10,
      padBottom: parseFloat(cs.paddingBottom),
      lastHoldsChart: last.matches("[data-testid=ranked-chart], [data-testid=ranked-no-chart]") || !!last.querySelector("[data-testid=ranked-chart], [data-testid=ranked-no-chart]"),
      radius: parseFloat(cs.borderBottomLeftRadius) > 0 && parseFloat(cs.borderBottomRightRadius) > 0,
    };
  });
  expect(box.lastHoldsChart, `${where}: the chart is in the card's last part`).toBe(true);
  expect(Math.abs(box.lastFoot - box.padBottom), `${where}: the last part ends ${box.lastFoot}px above the card's inner foot, its padding ${box.padBottom}px`).toBeLessThanOrEqual(0.5);
  expect(box.chartFoot, `${where}: the chart's foot ${box.chartFoot}px from the card's inner foot`).toBeGreaterThanOrEqual(box.padBottom - 0.5);
  expect(Math.abs(box.padBottom - box.headerTop), `${where}: the same padding at the foot (${box.padBottom}px) as at the top (${box.headerTop}px)`).toBeLessThanOrEqual(0.5);
  expect(box.radius, `${where}: rounded corners at its foot`).toBe(true);
}

test("on a phone Ranked progress opens as one card: the title alone on its row, the queue switch and accounts in one row under the rank, at its start, nothing over the ⓘ", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  await page.goto(await profileOf(page, "Demo Top"));
  const ranked = page.getByTestId("ranked-progress");
  await expect(ranked).toBeVisible();
  // The owner's review of the opened card (Release 13): the switch had sat beside the title, pushed
  // to the right, on a row of its own at 320, the account choice on another. The narrowest phone and
  // a wide one, default text and larger: the switch under the rank, its row at the card's start as
  // the rank's is, inside the card; the ⓘ's touch area (44px on a touch screen) never over the
  // chevron, which takes a line of its own at 200% on a 320px phone rather than sit under it.
  const fold = page.getByTestId("ranked-fold");
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 640 });
    for (const size of ["100%", "125%", "150%", "200%"]) {
      await page.evaluate((s) => { document.documentElement.style.fontSize = s; }, size);
      const at = `${width}, ${size} text`;
      const parts = await headerParts(ranked);
      expect(parts.tipOnChevron, `${at}: the ⓘ's touch area clear of the chevron`).toBe(0);
      expect(parts.switchUnderTitle && parts.switchUnderRank, `${at}: the queue switch under the rank, not in the header`).toBe(true);
      expect(Math.abs(parts.rowStart - parts.rankStart), `${at}: the controls' row starts where the rank's does`).toBeLessThanOrEqual(1);
      expect(parts.rowInside, `${at}: the controls inside the card`).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${at}: nothing sideways`).toBeLessThanOrEqual(0);
    }
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

test("on the desktop's Overview Ranked progress's queue switch shares the title's row, at its end (one screen at 1440 × 900, Release 16)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the 2×2's rail");
  await page.goto(await profileOf(page, "Demo Top"));
  const ranked = page.getByTestId("ranked-progress");
  await expect(ranked).toBeVisible();
  const f = await ranked.evaluate((el) => {
    const box = (q: string) => el.querySelector(q)!.getBoundingClientRect();
    const title = box("#ranked-progress-title");
    const nav = box("nav[aria-label=Queue]");
    const rank = box("[data-testid=ranked-current]");
    const card = el.getBoundingClientRect();
    return { level: Math.abs(nav.top + nav.height / 2 - (title.top + title.height / 2)), aboveRank: nav.bottom <= rank.top + 1, right: card.right - nav.right, left: nav.left - title.right };
  });
  expect(f.level, "level with the title").toBeLessThanOrEqual(4);
  expect(f.aboveRank, "above the rank").toBe(true);
  expect(f.right, "at the row's end, inside the card's padding").toBeLessThanOrEqual(18);
  expect(f.left, "clear of the title").toBeGreaterThan(0);
});

test("with two Riot accounts, Ranked progress offers one account select beside the queue switch, and choosing one keeps the page and its address's account", async ({ page }, info) => {
  // A second account linked at runtime on the in-memory demo (the browser tests' Riot stand-in
  // confirms it: UNIIVERSE_FAKE_RIOT_IDS), to a demo member no other ranked test reads.
  const profile = await profileOf(page, "Demo Sub (Support)");
  await page.goto(`${profile}/accounts`);
  const panel = page.getByTestId("riot-accounts");
  await expect(panel).toBeVisible();
  if ((await panel.getByTestId("riot-account-row").count()) < 2) {
    await page.getByRole("button", { name: "Add Riot account" }).click();
    await page.getByPlaceholder("GameName#TAG").fill(`Second${info.project.name}#EUW`);
    await page.getByRole("button", { name: "Link account" }).click();
    await expect(panel.getByTestId("riot-account-row")).toHaveCount(2, { timeout: 30_000 });
  }
  await page.goto(profile);
  const ranked = page.getByTestId("ranked-progress");
  await expect(ranked).toBeVisible();
  if (info.project.name === "phone") await page.getByTestId("ranked-fold").click();
  const select = ranked.getByTestId("ranked-account-select");
  await expect(select).toBeVisible();
  // One row: the switch and the select on one line, the select right after the switch.
  const [nav, sel] = [await ranked.locator("nav[aria-label=Queue]").boundingBox(), await select.boundingBox()];
  expect(Math.abs(nav!.y + nav!.height / 2 - (sel!.y + sel!.height / 2)), "the select level with the switch").toBeLessThanOrEqual(2);
  expect(sel!.x, "after the switch").toBeGreaterThan(nav!.x + nav!.width - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "nothing sideways").toBeLessThanOrEqual(0);
  // Choosing the other account replaces the address with it (ra=), and the card says its rank or that there is none.
  const before = page.url();
  const options = await optionsOf(select);
  expect(options.length, "both accounts offered").toBe(2);
  expect(options.map((o) => o.label).join(" "), "by name, never Main or Primary").not.toMatch(/Main|Primary/);
  // The account shown is the select's value (the first with readings, which a newly linked account is not).
  const current = await valueOf(select);
  await pick(select, options.find((o) => o.value !== current)!.value);
  await expect(page).toHaveURL(/[?&]ra=/);
  expect(page.url()).not.toBe(before);
  await expect(ranked.getByTestId("ranked-current").or(ranked.getByTestId("ranked-empty"))).toBeVisible();
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
