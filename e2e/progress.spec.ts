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
  await chart.scrollIntoViewIfNeeded();
  const dot = ranked.getByTestId("ranked-reading").last();
  const at = (await dot.boundingBox())!;
  if (info.project.name === "phone") await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);
  else await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await expect(page.getByTestId("ranked-tip")).toContainText(/LP/);
  await page.mouse.move(0, 0);
  await chart.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("ranked-tip")).toContainText(/Read \d{1,2} [A-Z][a-z]{2} \d{4}/);
  const read = /Read (\d{1,2} [A-Z][a-z]{2} \d{4})/.exec(await page.getByTestId("ranked-tip").innerText())![1]!;
  expect(inDemoWindow(read), `read ${read}: within the demo's dates`).toBe(true);
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
  // (it was a fixed 64px, which cut "Platinum II" on the left above about 1700px). Demo Mid, whose
  // readings are Platinum IV to II, the longest names a division line carries (Demo Top's Silver
  // ones fit even the old gutter).
  test.skip(info.project.name !== "desktop", "a desktop window, then a phone-wide one");
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!;
  const labels = () =>
    page.getByTestId("ranked-chart").evaluate((svg) =>
      [...svg.querySelectorAll<SVGTextElement>("text[data-division]")].map((t) => ({ x: t.getBBox().x, text: t.textContent ?? "" })),
    );
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(`/players/${id}`);
  await expect(page.getByTestId("ranked-chart")).toBeVisible();
  // Measured: the drawing is as tall as its box (7.5rem) at this root size too.
  await expect.poll(async () => Math.abs(Number((await page.getByTestId("ranked-chart").getAttribute("viewBox"))!.split(" ")[3]) - (await page.getByTestId("ranked-chart").boundingBox())!.height)).toBeLessThanOrEqual(1);
  const wide = await labels();
  expect(wide.length, "division names drawn").toBeGreaterThan(0);
  for (const l of wide) expect(l.x, `"${l.text}" starts inside the drawing`).toBeGreaterThanOrEqual(0);
  // The longest names the wide chart writes ("Platinum II", "Emerald III", "Diamond IV") are what
  // the gutter must hold; at 2560 the root is about 22px.
  expect(wide.some((l) => / I{1,3}V?$|IV$/.test(l.text)), "the wide chart names divisions in full").toBe(true);
  // A phone-wide window: every line by its code, as match cards write a rank (P2, a tier's line by
  // its first division, E4; the apex M), never a bare letter or a short word beside codes; whole.
  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(async () => (await labels()).every((l) => /^(I|B|S|G|P|E|D)[1-4]$|^(M|GM|C)$/.test(l.text))).toBe(true);
  for (const l of await labels()) expect(l.x, `"${l.text}" starts inside the drawing`).toBeGreaterThanOrEqual(0);
});

/** A demo player's profile address, from the Players directory (rows on a phone, cards wider). */
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
 * The W–L cells of the readings that end past the box's inner right edge (their text's own extent,
 * from a Range: a cell's padding may overflow while its figures are whole), as "row: text".
 */
function winLossOutside(table: Locator) {
  return table.evaluate((box) => {
    const right = box.getBoundingClientRect().left + box.clientLeft + box.clientWidth;
    return [...box.querySelectorAll("tbody tr")].flatMap((tr, i) => {
      const cell = tr.querySelector("td:nth-child(3)");
      if (!cell) return [];
      const range = document.createRange();
      range.selectNodeContents(cell);
      const end = range.getBoundingClientRect().right;
      return end > right + 1 ? [`${i + 1}: ${cell.textContent?.trim()} ends ${Math.round(end - right)}px out`] : [];
    });
  });
}

/**
 * The "confirmed …" line under each first reading (where the Last confirmed column does not fit),
 * with the two instants as the table writes them in full: the first reading, and the Last confirmed
 * cell, which stays in the markup while hidden. Each of the line's parts (its child elements: the
 * day, the time) with the number of line boxes it takes.
 */
function confirmedLines(table: Locator) {
  return table.evaluate((box) =>
    [...box.querySelectorAll("tbody tr")].flatMap((tr) => {
      const first = tr.querySelector("td:first-child")!;
      const line = first.querySelector<HTMLElement>(":scope > span");
      if (!line) return [];
      return [
        {
          firstRead: [...first.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").trim(),
          lastConfirmed: tr.querySelector("td:nth-child(4)")!.textContent!.trim(),
          line: line.innerText.replace(/\s+/g, " ").trim(),
          // Lines, not rectangles: Chrome gives one rectangle per text run, and "14 Nov," is two ("14 Nov" and ","), side by side on one line.
          parts: [...line.children].map((part) => ({ text: part.textContent!.trim(), lines: new Set([...part.getClientRects()].map((r) => Math.round(r.top))).size })),
        },
      ];
    }),
  );
}

/**
 * Every confirmed line says only what it does not share with the first reading above it: the
 * time alone on the same day ("confirmed 3:04 pm"), the day and the time in the same year
 * ("confirmed 21 Oct, 3:04 pm"), the full date only in another year; and its day and its time each
 * stay on one line (never "pm" alone).
 */
async function expectConfirmedShort(table: Locator, at: string) {
  const rows = await confirmedLines(table);
  expect(rows.length, `${at}: readings confirmed later than first read`).toBeGreaterThan(0);
  const full = /^(\d{1,2} [A-Z][a-z]{2}) (\d{4}), (\d{1,2}:\d{2} [ap]m)$/;
  for (const r of rows) {
    const reading = `${at}, first read ${r.firstRead}, last confirmed ${r.lastConfirmed}`;
    const [, fromDay, fromYear] = full.exec(r.firstRead) ?? [];
    const [, day, year, time] = full.exec(r.lastConfirmed) ?? [];
    expect(fromDay && day, `${reading}: both written in full`).toBeTruthy();
    const said = fromYear !== year ? `${day} ${year}, ${time}` : fromDay !== day ? `${day}, ${time}` : time;
    expect(r.line, reading).toBe(`confirmed ${said}`);
    expect(r.parts.at(-1)?.text, `${reading}: the time a part of its own`).toBe(time);
    expect(r.parts.filter((p) => p.lines !== 1), `${reading}: each part on one line`).toEqual([]);
  }
}

test("on a phone Ranked progress's header never lets the queue switch cover the title or its ⓘ, and the readings keep W–L in their box", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  await page.goto(await profileOf(page, "Demo Top"));
  const ranked = page.getByTestId("ranked-progress");
  await expect(ranked).toBeVisible();
  // The narrowest phone, default text and larger: the switch beside the title while even the
  // wrapped title ("Ranked", "progress ⓘ") fits there, under it otherwise, never over the ⓘ or a word.
  await page.setViewportSize({ width: 320, height: 640 });
  for (const size of ["100%", "125%", "150%"]) {
    await page.evaluate((s) => { document.documentElement.style.fontSize = s; }, size);
    const clash = await headerClash(ranked);
    expect(clash.lines, `${size} text: the title's words measured`).toBeGreaterThan(0);
    expect(clash.tip, `${size} text: the ⓘ clear of the queue switch`).toBe(0);
    expect(clash.words, `${size} text: the title's words clear of the queue switch`).toBe(0);
    if (size === "100%") expect(clash.oneRow, "320, default text: the switch on the title's row").toBe(true);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });

  // History and coverage open: every W–L figure inside the readings' box (the "confirmed …" line
  // under each first reading no longer widens its column): Demo Top on this project's phone (375),
  // Demo Mid on an iPhone 15 (393), whose rows are the widest.
  const table = page.getByTestId("ranked-table");
  const openDetails = async () => {
    const details = page.getByTestId("ranked-details");
    await expect(async () => {
      if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByTestId("ranked-details-toggle").click();
      await expect(table).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  };
  await page.setViewportSize({ width: 375, height: 667 });
  await openDetails();
  expect(await table.locator("tbody tr").count(), "Demo Top: readings listed").toBeGreaterThan(3);
  expect(await winLossOutside(table), "Demo Top at 375: W–L inside the box").toEqual([]);
  await expectConfirmedShort(table, "Demo Top at 375");
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(await profileOf(page, "Demo Mid"));
  await expect(page.getByTestId("ranked-progress")).toBeVisible();
  await openDetails();
  expect(await table.locator("tbody tr").count(), "Demo Mid: readings listed").toBeGreaterThan(3);
  expect(await winLossOutside(table), "Demo Mid at 393: W–L inside the box").toEqual([]);
  await expectConfirmedShort(table, "Demo Mid at 393");
});
