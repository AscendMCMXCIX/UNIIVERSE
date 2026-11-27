import { AxeBuilder } from "@axe-core/playwright";
import { breakdownKeyboardVerdicts, breakdownVerdicts, MULTIKILL_ROLE_LABEL, multikillVerdicts, readBreakdownFocus, readMultikillBoard, readMultikillBreakdown } from "../scripts/multikill-facts.mjs";
import { FILL_ROW_MAX_REM, oneScreenInput, oneScreenVerdicts, readOneScreen } from "../scripts/one-screen-facts.mjs";
import { RECORD_YOURS, RECORD_YOURS_VALUE } from "../src/components/leaderboards/record-yours";
import { expect, test, type Page } from "./test";
import { widenText } from "./wide-text";

/*
  Team Leaderboards (docs/LEADERBOARDS_MODEL.md, docs/TEAM_LEADERBOARDS.md), one page since 19 Nov 2026,
  one dashboard since 25 Nov 2026: Recent form (each player's latest 20 Summoner's Rift games, ranked
  by win rate), the multikills, the season records and the milestones, with no views to switch
  between and nothing folded. The demo viewer is the Owner, an administrator without a player
  profile. The games are synthetic demo games, never real Riot data: seven demo members are active
  (a game and a data update in the last 30 days), every one with a full 20-game window, three of them
  sharing fourth place; two members have no account and no game, and are not shown (nor are the
  members other specs add without games). The page places its four boards by its own width (one
  column under 59rem; from 59rem a 2 × 2 grid on one screen: Recent form beside the multikills, the
  season records beside the milestones, each pair as tall as each other); each board's rows follow
  the board's own width. The states the demo never shows (an inactive or returning player, your own
  row, a shared first place, the viewer's best, a record nobody holds, a split or unknown role, the
  team-wide fallback, the public boards) are checked as markup and in the view (recent-leaderboards,
  records, leaderboards-dashboard and recent-view tests, tests/db/leaderboards-active.test.ts); a
  member's page, with a best in every record cell, is measured here with that line drawn into the
  demo's cells.
*/

const BOARDS = "/leaderboards";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page wider than the viewport").toBeLessThanOrEqual(1);
}

/**
 * Rows' heights as drawn and as their content alone would make them: the shorter board of a grid row spreads its spare room over
 * its rows (board-fill.ts), so a row's drawn height can be more than its own. The growth is lifted for the measure and put back
 * in the same step, before anything is drawn.
 */
const rowHeights = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluateAll((rows) => {
    const drawn = rows.map((r) => r.getBoundingClientRect().height);
    const kept = rows.map((r) => (r as HTMLElement).style.flex);
    for (const r of rows) (r as HTMLElement).style.flex = "none";
    const own = rows.map((r) => r.getBoundingClientRect().height);
    rows.forEach((r, i) => ((r as HTMLElement).style.flex = kept[i]!));
    return rows.map((_, i) => ({ drawn: drawn[i]!, own: own[i]! }));
  });

/**
 * Words on the page broken across two lines (a name split inside a word, as at 1440 in the review's M4): each word of every
 * text node drawn, by the lines its boxes take. Truncated text takes one line, so it never counts.
 */
const brokenWords = (page: Page) =>
  page.getByTestId("leaderboards").evaluate((root) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      for (const m of (n.textContent ?? "").matchAll(/\S+/g)) {
        range.setStart(n, m.index!);
        range.setEnd(n, m.index! + m[0].length);
        const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        if (lines.size > 1) out.push(m[0]);
      }
    }
    return out;
  });

/** Elements in the page's main area that scroll inside themselves (an inner scrollbar): none on Leaderboards. */
const innerScrollers = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main *")]
      .filter((e) => {
        const s = getComputedStyle(e);
        return /(auto|scroll)/.test(s.overflowY + s.overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1);
      })
      .map((e) => e.dataset.testid ?? e.tagName.toLowerCase()),
  );

/** "1st", "2nd", "4th", "11th": the place in words, as the page writes it (formatOrdinal). */
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;


async function axe(page: Page, selector: string) {
  const scan = await new AxeBuilder({ page }).include(selector).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("one page, no views: Recent form leads, the season's records and achievements follow, the team's data status in the header", async ({ page }) => {
  await open(page, BOARDS);
  // No tabs or views to switch between, and no paragraph of explanation.
  await expect(page.getByTestId("leaderboards-views")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Records & achievements/ })).toHaveCount(0);
  await expect(page.getByTestId("records-volume-note")).toHaveCount(0);
  await expect(page.getByTestId("form-footnote")).toHaveAccessibleName("How Recent form counts");
  // Every board on the one page, in reading order, each under its own h2.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Leaderboards");
  const order = await page.evaluate(() => ["recent-form", "multikills", "season-records", "milestones"].map((id) => document.getElementById(id)!.getBoundingClientRect().top + window.scrollY));
  expect(order[0]!, "Recent form first").toBeLessThanOrEqual(Math.min(...order.slice(1)));
  await expect(page.locator("main h2")).toHaveText([/^Recent form/, "Multikills", "Season records", "Milestones"]);
  // Who is shown: the active players, counted in the header, the rule behind its ⓘ; the season beside them.
  await expect(page.getByTestId("scope-count")).toHaveText(/^\d+ active players?$/);
  await expect(page.getByTestId("scope-tip")).toHaveAccessibleDescription("Players with a game and a data update in the last 30 days.");
  await expect(page.getByTestId("records-season-label")).toHaveText(/^Season \d{4}$/);
  // Nothing folded or disclosed: no Show all, no expandable section, no inner scrollbar.
  await expect(page.locator("main").getByRole("button", { name: /Show all|\d+ more/ })).toHaveCount(0);
  await expect(page.locator("main [data-fold], main [aria-expanded=true]")).toHaveCount(0);
  expect(await innerScrollers(page), "no inner scrollbar").toEqual([]);
  for (const id of ["form-board", "records-book", "records-multikills", "records-milestones"]) await expect(page.getByTestId(id), id).toBeVisible();
  // Today's categories, filters and the admins' preview banner are gone.
  await expect(page.getByTestId("leaderboard-categories")).toHaveCount(0);
  await expect(page.getByTestId("leaderboards-preview")).toHaveCount(0);
  // How fresh the boards are: the team's status behind one ⓘ in the header, as on a profile.
  await expect(page.getByTestId("leaderboards-status-info")).toBeVisible();
  // An old address (today's category or filters) opens the page, ignoring what it asked for.
  await open(page, "/leaderboards?category=combat&metric=kda&queue=solo&lineup=1");
  await expect(page.getByTestId("form-board")).toBeVisible();
  await noOverflow(page);
});

test("Records & achievements' old address lands on the same page at its season records, in one history entry: Back leaves the page, Forward returns", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/team");
  await expect(page.locator("main")).toBeVisible();
  const entries = await page.evaluate(() => history.length);
  await open(page, "/leaderboards?view=records&season=16");
  // The view leaves the address (the season stays), the page lands on its records, focused for screen readers.
  await expect(page).toHaveURL(/\/leaderboards\?season=16#season-records$/);
  const section = page.locator("section#season-records");
  await expect(section).toBeFocused();
  await expect(section).toBeInViewport();
  // Under whatever is pinned over the page (the top bar, the section tabs).
  const pinned = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0);
  const top = (await section.boundingBox())!.y;
  expect(top, "the records under the bars").toBeGreaterThanOrEqual(pinned - 2);
  // At the window's top, unless the page ends before it can bring them there.
  const atEnd = await page.evaluate(() => window.scrollY + innerHeight >= document.documentElement.scrollHeight - 2);
  // On a phone the section stops clear of the pinned chip row too (its scroll margin, 3.5rem).
  const margin = await section.evaluate((el) => parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
  if (!atEnd) expect(top, "the records at the window's top").toBeLessThanOrEqual(pinned + margin + 24);
  // One entry for the page: the landing replaced the old address, it did not add one.
  expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  // The router keeps its own state in the replaced entry: after a link in the app, Back shows this page again, at its address
  // (an entry without the router's state is one it does not restore: the address said Leaderboards over the page left on screen).
  expect(await page.evaluate(() => !!(history.state as { __NA?: boolean } | null)?.__NA), "the router's state in the entry").toBe(true);
  // Players: the section tabs' (a tablet, a desktop), the top bar's row of Team's sections on a phone.
  await page.locator("[data-testid=team-tabs], [data-testid=team-chrome-tabs]").locator("a[href='/players']:visible").first().click();
  await expect(page).toHaveURL(/\/players$/);
  await expect(page.getByTestId("players-directory")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/leaderboards\?season=16#season-records$/);
  await expect(page.getByTestId("players-directory")).toHaveCount(0);
  await expect(page.getByTestId("records-book")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/leaderboards\?season=16#season-records$/);
  await expect(page.getByTestId("records-book")).toBeVisible();
  // A section its old index named (?view=records#multikills): that section, the view gone from the address.
  await open(page, "/leaderboards?view=records#multikills");
  await expect(page).toHaveURL(/\/leaderboards#multikills$/);
  await expect(page.locator("section#multikills")).toBeFocused();
  await expect(page.locator("section#multikills")).toBeInViewport();
  // Any other view: the same page from its top, the view gone from the address.
  for (const view of ["form", "anything"]) {
    await open(page, `/leaderboards?view=${view}`);
    await expect(page).toHaveURL(/\/leaderboards$/);
    expect(await page.evaluate(() => window.scrollY), `?view=${view}: at the top`).toBe(0);
    await expect(page.getByTestId("form-board")).toBeVisible();
  }
});

test("tablet and desktop: once the header has gone up, the pinned row holds the page's index, each chip jumping to its section", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the pinned row is from md");
  if (info.project.name === "desktop") await page.setViewportSize({ width: 1440, height: 600 });
  await open(page, BOARDS);
  await page.evaluate(async () => {
    for (let at = 0; at < document.documentElement.scrollHeight; at += 240) {
      window.scrollTo(0, at);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect(page.getByTestId("team-tabs")).toHaveAttribute("data-stuck", "");
  // Nothing to switch, nothing to filter: the row holds the section tabs, the page's index (UD.L1) and nothing else.
  const toolbar = page.getByTestId("page-toolbar");
  await expect(toolbar).toHaveCount(1);
  // Every tab whole: the last tab ends inside the tab list, clear of anything at the row's end.
  const clear = await page.evaluate(() => {
    const tabs = document.querySelector("[data-testid=team-tabs]")!;
    // The tabs' own list: the pinned row's index (from xl) is a list of links in the same row, after it.
    const ul = tabs.querySelector("ul")!;
    const list = ul.getBoundingClientRect();
    const last = [...ul.querySelectorAll("a")].at(-1)!.getBoundingClientRect();
    return last.right <= list.right + 0.5;
  });
  expect(clear, "Team's tabs whole in the pinned row").toBe(true);
  await expect(page.getByTestId("toolbar-leaderboards-views")).toHaveCount(0);
  // Below xl (a tablet) the index has no room beside Team's four tabs (Release 16: the tab list scrolled under it and a press on
  // "Matches" landed on "Recent form"), so the pinned row holds the tabs alone; the index under the header is at the page's top.
  if (info.project.name === "tablet") {
    await expect(toolbar.getByRole("link")).toHaveCount(0);
    return;
  }
  await expect(toolbar.getByRole("link")).toHaveText(["Recent form", "Multikills", "Season records", "Milestones"]);
  await toolbar.getByRole("link", { name: "Season records" }).click();
  await expect(page).toHaveURL(/#season-records$/);
  const tabs = (await page.getByTestId("team-tabs").boundingBox())!;
  await expect.poll(async () => (await page.locator("section#season-records").boundingBox())!.y).toBeGreaterThanOrEqual(tabs.y + tabs.height - 1);
  // Back at the top, the copy goes: a tablet's index under the header is in view; the desktop's board has none (every board on the first screen).
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(toolbar).toHaveCount(0);
  await expect(page.locator("[data-testid=header-section-index]:visible, [data-testid=section-index]:visible")).toHaveCount(info.project.name === "desktop" ? 0 : 1);
});

test("Leaderboards is a Team tab between Players and Matches", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the navigation layout is covered per device in responsive.spec");
  await page.goto("/team");
  await expect(page.getByTestId("team-tabs").getByRole("link")).toHaveText(["Overview", "Players", "Leaderboards", "Matches"]);
  await page.getByTestId("team-tab-leaderboards").click();
  await expect(page).toHaveURL(/\/leaderboards/);
  await expect(page.getByTestId("leaderboards")).toBeVisible();
});

test("Recent form ranks every full 20-game window by win rate, shared places and gaps in wins", async ({ page }) => {
  await open(page, BOARDS);
  await expect(page.getByTestId("form-scope")).toHaveText(/Latest 20 games from the last 60 days/);
  const rows = await page.getByTestId("form-row").evaluateAll((els) =>
    els.map((e) => {
      const place = e.querySelector('[data-testid="form-place"]');
      const gap = e.querySelector('[data-testid="form-gap"]');
      const bar = e.querySelector('[data-testid="form-bar"]');
      return {
        place: Number(e.getAttribute("data-place") ?? NaN),
        status: e.getAttribute("data-status"),
        rate: Number(e.getAttribute("data-win-rate")),
        games: Number(e.getAttribute("data-games")),
        wins: Number(e.getAttribute("data-wins")),
        tied: e.hasAttribute("data-tied"),
        you: e.hasAttribute("data-you"),
        note: e.querySelector('[data-testid="form-note"]')?.textContent ?? null,
        token: gap?.textContent ?? null,
        tokenHidden: gap?.getAttribute("aria-hidden") === "true",
        placeTitle: place?.getAttribute("title") ?? null,
        tie: place?.getAttribute("data-tie") ?? null,
        bars: e.querySelectorAll('[data-testid="form-bar"]').length,
        bar: bar ? { segments: Number(bar.getAttribute("data-segments")), filled: Number(bar.getAttribute("data-filled")), known: Number(bar.getAttribute("data-known")), parts: bar.children.length, hidden: bar.getAttribute("aria-hidden") === "true" } : null,
      };
    }),
  );
  const ranked = rows.filter((r) => r.status === "established");
  expect(ranked.length).toBeGreaterThanOrEqual(5);
  for (const r of ranked) expect(r.games).toBe(20);
  // In order: places never go down the list, win rates never go up; equal win rates share a place.
  for (let i = 1; i < ranked.length; i++) {
    expect(ranked[i]!.rate).toBeLessThanOrEqual(ranked[i - 1]!.rate);
    expect(ranked[i]!.place).toBe(ranked[i]!.rate === ranked[i - 1]!.rate ? ranked[i - 1]!.place : i + 1);
  }
  expect(ranked.filter((r) => r.tied).every((r) => ranked.some((o) => o !== r && o.place === r.place))).toBe(true);
  // First place has no note; every other place says its gap in wins, or that one win draws level.
  expect(ranked[0]!.note).toBeNull();
  for (const r of ranked.filter((x) => x.place > 1 && ranked.some((o) => o.rate > x.rate))) expect(r.note).toMatch(/^(\d+ wins? behind|Win your next game to draw level with|\S.* draws level with) /);
  // The gap shows short (D5), the sentence stays for screen readers: first place "—"; every other
  // place "k wins behind" (k = the gap in win rate over 5 points a win) or "A win ties Nth", the place
  // one win would share (5 points short of it, and the sentence says the next win draws level).
  expect(ranked[0]!.token).toBe("—");
  for (const r of ranked.filter((x) => ranked.some((o) => o.rate > x.rate))) {
    expect(r.token).toMatch(/^(\d+ wins? behind|A win ties \d+(st|nd|rd|th))$/);
    expect(r.tokenHidden, `${r.token}: the short gap is not read out`).toBe(true);
    const above = Math.min(...ranked.filter((o) => o.rate > r.rate).map((o) => o.rate));
    const level = /^A win ties (\d+)(?:st|nd|rd|th)$/.exec(r.token!);
    if (level) {
      expect(Number(level[1])).toBe(ranked.find((o) => o.rate === above)!.place);
      expect(above - r.rate).toBe(5);
      // Worded for the viewer (PLAN §1.12): "your" on their own row only, the player's name on anyone else's.
      expect(r.note).toMatch(r.you ? /^Win your next game to draw level with / : / draws level with .+ by winning their next game$/);
    } else {
      const k = Number(/^(\d+) wins? behind$/.exec(r.token!)![1]);
      expect(k).toBe((above - r.rate) / 5);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(r.note!.startsWith(`${k} ${k === 1 ? "win" : "wins"} behind `)).toBe(true);
    }
  }
  // A shared place reads "4=", titled "Tied for 4th", and its rows are joined start, mid…, end; an
  // untied row claims neither. The demo shares fourth place three ways.
  const groups = new Map<number, Array<string | null>>();
  for (const r of ranked) {
    if (r.tied) {
      expect(r.tie, `${r.place}=: in a run`).not.toBeNull();
      expect(r.placeTitle).toBe(`Tied for ${ordinal(r.place)}`);
      groups.set(r.place, [...(groups.get(r.place) ?? []), r.tie]);
    } else {
      expect(r.tie).toBeNull();
      expect(r.placeTitle).toBeNull();
    }
  }
  expect([...groups.values()].some((g) => g.length >= 2), "the demo shows a shared place").toBe(true);
  for (const g of groups.values()) expect(g).toEqual(["start", ...Array(g.length - 2).fill("mid"), "end"]);
  // The row's tooltip (the tie, the gap's sentence, the role's games) is an aria-hidden layer inside
  // its link: no list item takes its name from it, and the link is named by the member alone, with no description.
  await expect(page.getByTestId("form-rows").getByRole("listitem", { name: /\S/ })).toHaveCount(0);
  await expect(page.getByTestId("form-row").first().locator("[data-row-link]")).toHaveAccessibleDescription("");
  await expect(page.getByTestId("form-row").nth(3).locator("[data-row-link] > [title]")).toHaveAttribute("title", /^Tied for 4th\. /);
  // Each row's bar counts its 20 games, wins first, and is hidden from screen readers (the record says it).
  for (const r of ranked) {
    expect(r.bars).toBe(1);
    expect(r.bar).toEqual({ segments: 20, filled: r.wins, known: 20, parts: 20, hidden: true });
  }
  // The board stops at the measure (72rem) and keeps the header's left edge.
  const edge = await page.evaluate(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const board = document.querySelector("[data-testid=form-board]")!.getBoundingClientRect();
    const title = document.querySelector("main h1")!.getBoundingClientRect();
    return { width: board.width, measure: 72 * rem, left: board.left, header: title.left };
  });
  expect(edge.width).toBeLessThanOrEqual(edge.measure + 1);
  expect(Math.abs(edge.left - edge.header)).toBeLessThanOrEqual(1);
  // Restrained places: plain numbers, first in gold, no crown.
  await expect(page.getByTestId("form-row").first().getByTestId("form-place")).toHaveAttribute("data-leader", "true");
  await expect(page.getByTestId("form-row").first().getByRole("img", { name: "First place" })).toHaveCount(0);
  expect(await page.locator("[data-testid=form-place][data-leader]").evaluateAll((els) => els.every((e) => e.closest("[data-place='1']")))).toBe(true);
  // The caveats are behind the ⓘ in the board's title (its description, read without opening it), not a footnote under it.
  await expect(page.getByTestId("form-footnote")).toHaveAccessibleDescription("20 games is a small sample, so places within 2 wins are close. Bars show wins first, not the order the games were played.");
  await noOverflow(page);
  await axe(page, "[data-testid=form]");
});

test("each row says what counts: the record, the dates, the main role and the bar, each once", async ({ page }, info) => {
  await open(page, BOARDS);
  // One element per fact at every width, placed by the board's tier: never a phone copy and a column copy.
  const rows = page.getByTestId("form-row");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    for (const id of ["form-record", "form-dates", "form-role", "form-bar", "card-name"]) await expect(row.getByTestId(id), `row ${i}: ${id}`).toHaveCount(1);
    const wins = Number(await row.getAttribute("data-wins"));
    const games = Number(await row.getAttribute("data-games"));
    await expect(row.getByTestId("form-record")).toBeVisible();
    await expect(row.getByTestId("form-record")).toContainText(`${wins}W ${games - wins}L`);
    await expect(row.getByTestId("form-dates")).toContainText(/\d{1,2} [A-Z][a-z]{2} – \d{1,2} [A-Z][a-z]{2}/);
    // The role: a badge on the picture below a 58rem board, its own column from it; named either way.
    await expect(row.getByTestId("form-role")).toBeVisible();
    await expect(row.getByTestId("form-role")).toHaveText(/Top|Jungle|Mid|Bottom|Support/);
  }
  // Phones: the record and dates are the line under the name.
  if (info.project.name === "phone") {
    await expect(rows.first().getByTestId("form-meta").getByTestId("form-record")).toHaveCount(1);
    await expect(rows.first().getByTestId("form-meta").getByTestId("form-dates")).toHaveCount(1);
  }
  // The columns are named from a 36rem board up (aria-hidden: each row names its figures for screen readers).
  if (info.project.name === "desktop") await expect(page.getByTestId("form-heads")).toContainText("Win rate");
});

test("a phone row's second line never ends with a dangling ·: the gap sits at its right end, or on a line of its own", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the narrow widths are the phone's");
  await open(page, BOARDS);
  for (const [width, height] of [
    [320, 568],
    [360, 740],
    [375, 667],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const lines = await page.getByTestId("form-meta").evaluateAll((metas) =>
      metas.map((meta) => {
        // The line's visible parts in order (the leader's hidden gap has no box); parts on one line share their middle (items-center).
        const parts = [...meta.children].map((c) => ({ dot: c.textContent?.trim() === "·", box: c.getBoundingClientRect() })).filter((p) => p.box.width > 0);
        const mid = (b: DOMRect) => b.top + b.height / 2;
        const gap = meta.querySelector("[data-testid=form-gap]")?.parentElement;
        const gapBox = gap && gap.getBoundingClientRect().width > 0 ? gap.getBoundingClientRect() : null;
        return {
          dots: parts.filter((p) => p.dot).length,
          dangling: parts.filter((p, i) => p.dot && !(parts[i + 1] && Math.abs(mid(parts[i + 1]!.box) - mid(p.box)) <= 4)).length,
          gap: !!gapBox,
          gapAtEnd: gapBox ? Math.abs(gapBox.right - meta.getBoundingClientRect().right) <= 1 : true,
        };
      }),
    );
    expect(lines.length).toBeGreaterThan(0);
    // One "·", between the record and the dates; the gap follows them without one.
    expect(lines.map((l) => l.dots), `${width}px: one · per second line`).toEqual(lines.map(() => 1));
    expect(lines.filter((l) => l.gap).length, `${width}px: rows with a gap`).toBeGreaterThan(0);
    expect(lines.filter((l) => l.dangling).length, `${width}px: second lines ending with ·`).toBe(0);
    expect(lines.filter((l) => !l.gapAtEnd).length, `${width}px: gaps not at the line's right end`).toBe(0);
  }
});

test("the board's layout follows its own width: four, six or eight columns, never cut or wider than the page", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "explicit window sizes, either side of each tier");
  test.setTimeout(120_000);
  await open(page, BOARDS);
  // The main role's name before the dates on a 40–58rem board (the badge alone is too small to tell
  // Top from Bottom); below 40rem the badge alone, from 58rem the role's own column.
  const roleWord = page.locator("[data-testid=form-row][data-status=established]").first().getByTestId("form-dates").locator("span[aria-hidden]");
  const ROLE_WORD = /^(Top|Jungle|Mid|Bottom|Support) ·\s*$/;
  // 608–612px: a phone-width board either side of 36rem; 1248–1252px: either side of 58rem beside the open sidebar.
  for (const width of [608, 610, 612, 1248, 1250, 1252, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (width === 1248) {
      await expect(roleWord, `${width}px: the role's name before the dates`).toBeVisible();
      await expect(roleWord).toHaveText(ROLE_WORD);
    }
    // 1280 and 1440 (25 Nov 2026): Recent form's column beside the multikills, a 36.25rem and a 38.3rem board, the badge alone.
    if (width === 610 || width === 1280 || width === 1440) await expect(roleWord, `${width}px: no role's name before the dates`).toBeHidden();
    const f = await page.evaluate(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const rows = [...document.querySelectorAll<HTMLElement>("[data-testid=form-row]")];
      return {
        inner: document.querySelector<HTMLElement>("[data-testid=form-board]")!.clientWidth / rem,
        tracks: getComputedStyle(rows[0]!).gridTemplateColumns.split(" ").filter(Boolean).length,
        wider: rows.filter((r) => r.scrollWidth > r.clientWidth + 1).length,
        page: document.documentElement.scrollWidth - innerWidth,
      };
    });
    expect(f.tracks, `${width}px: a ${f.inner.toFixed(3)}rem board`).toBe(f.inner < 36 ? 4 : f.inner < 58 ? 6 : 8);
    expect(f.wider, `${width}px: rows wider than the board`).toBe(0);
    expect(f.page, `${width}px: page wider than the window`).toBeLessThanOrEqual(1);
  }
  // A portrait iPad's width: the medium layout, the role's name before the dates.
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(roleWord, "768px: the role's name before the dates").toBeVisible();
  await expect(roleWord).toHaveText(ROLE_WORD);
  // The desktop's compact rows (Release 16): 40px from a 36rem board (the name over the role and dates, or one line from 58rem),
  // the picture 32px; at 1280 × 800 and at 1920 × 1080.
  for (const [width, height] of [[1280, 800], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // Each row at its own height: where Recent form is the shorter board (1280, beside the multikills' two-line rows) its rows share the spare room.
    const own = await rowHeights(page, "form-row");
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const rows = (await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid=form-row]")].map((row) => { const name = row.querySelector<HTMLElement>("[data-testid=card-name]")!; return { picture: row.querySelector<HTMLElement>("[data-avatar-frame] > *")!.getBoundingClientRect().height, nameLines: Math.round(name.getBoundingClientRect().height / parseFloat(getComputedStyle(name).lineHeight)) }; }))).map((r, i) => ({ ...r, height: own[i]!.own / rem }));
    for (const r of rows) {
      // A long name may wrap (the row grows: "Demo Sub (Support)" in 1280's 36rem board); a name on one line keeps the row at 40px.
      // 2.5rem (40px at 1280, 44px at 1920, where the root is larger), and its hairline.
      if (r.nameLines === 1) expect(r.height, `${width}px: a compact row, in rem`).toBeLessThanOrEqual(2.66);
      if (width === 1920) expect(r.nameLines, `${width}px: every name on one line`).toBe(1);
      expect(r.picture, `${width}px: a 2rem picture`).toBeGreaterThan(30);
    }
  }
  // The widest windows: the board stops at the measure, on the header's left edge.
  for (const width of [2560, 3440]) {
    await page.setViewportSize({ width, height: 1440 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const edge = await page.evaluate(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const board = document.querySelector("[data-testid=form-board]")!.getBoundingClientRect();
      const title = document.querySelector("main h1")!.getBoundingClientRect();
      return { width: board.width, measure: 72 * rem, left: board.left, header: title.left };
    });
    expect(edge.width, `${width}px`).toBeLessThanOrEqual(edge.measure + 1);
    expect(Math.abs(edge.left - edge.header), `${width}px`).toBeLessThanOrEqual(1);
  }
});

test("nobody is listed without a place: Recent form lists the full windows of the active players alone, no provisional or \"not enough\" group", async ({ page }) => {
  await open(page, BOARDS);
  await expect(page.getByTestId("form-not-enough")).toHaveCount(0);
  await expect(page.getByTestId("form-not-enough-member")).toHaveCount(0);
  await expect(page.getByTestId("form-provisional")).toHaveCount(0);
  await expect(page.getByText(/Not enough recent games|Provisional|Not placed yet|No score yet/)).toHaveCount(0);
  const rows = await page.getByTestId("form-row").evaluateAll((els) => els.map((e) => ({ status: e.getAttribute("data-status"), games: Number(e.getAttribute("data-games")), place: e.getAttribute("data-place") })));
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) expect(r, "a full window with a place").toMatchObject({ status: "established", games: 20 });
  // Every player on a board is one of the active players the header counts (the demo's two members without a game, and any
  // member another spec added, are not on the page at all).
  const active = Number(await page.getByTestId("scope-count").getAttribute("data-count"));
  const shown = await page.evaluate(() => new Set([...document.querySelectorAll("main [data-player-id]")].map((e) => e.getAttribute("data-player-id"))).size);
  expect(shown).toBeLessThanOrEqual(active);
  expect(rows.length).toBeLessThanOrEqual(active);
  await expect(page.getByText(/Demo Newcomer|Demo Halfway/)).toHaveCount(0);
});

test("the data status ends the scope line, and never takes a line of its own", async ({ page }, info) => {
  await open(page, BOARDS);
  await expect(page.getByTestId("scope-label").getByTestId("leaderboards-status")).toHaveCount(1);
  test.skip(info.project.name !== "phone", "the narrow widths are the phone's");
  // Since 25 Nov 2026 the line reads "N active players ⓘ · Season ⓘ" (the owner's Leaderboards requirements: the
  // active players and the records' season), so the status no longer always fits on the count's line: it ends the
  // season's line instead, the two taking the next line together where they do not fit beside the count (a phone with
  // the status in words, "Syncing", as another spec's sync leaves it; a larger text size). The count's ⓘ stays with it.
  for (const [width, root, players] of [[320, 100, null], [375, 100, null], [320, 200, null], [375, 200, null], [320, 200, "10"], [320, 200, "1,000"]] as const) {
    const at = `${width}px at ${root}%${players ? `, ${players} active players` : ""}`;
    await page.setViewportSize({ width, height: 667 });
    // A larger team's count, as production's or another spec's linked accounts make it: the count's words wrap before the line runs past the screen.
    if (players) await page.getByTestId("scope-count").evaluate((e, n) => { e.textContent = `${n} active players`; }, players);
    await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, `${root}%`);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const f = await page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      // The count's last line of text (its words may wrap at 200% text; the ⓘ stands beside the last line): the
      // text's own line boxes, read with a Range (the count is a flex item, so its element has one box for all its lines).
      const range = document.createRange();
      range.selectNodeContents(document.querySelector("[data-testid=scope-count]")!);
      const countLines = range.getClientRects();
      const count = countLines[countLines.length - 1]!;
      const tip = box("[data-testid=scope-tip]");
      const season = box("[data-testid=records-season-label], [data-testid=records-season]");
      const status = box("[data-testid=leaderboards-status]");
      const mid = (r: DOMRect) => r.top + r.height / 2;
      return {
        tipWithCount: Math.abs(mid(tip) - mid(count)) <= 6,
        // Beside the season (on a line it shares with it), after it, never on a line alone.
        withSeason: status.top < season.bottom && status.bottom > season.top,
        afterSeason: status.left >= season.right - 0.5,
        inside: status.right <= document.documentElement.clientWidth + 0.5,
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(f, at).toEqual({ tipWithCount: true, withSeason: true, afterSeason: true, inside: true, sideways: 0 });
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

test("while it loads, the page shows the board's shape at the page's own width", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "1920 is where the app's generic loading state was narrower than the page");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/team");
  const tab = page.getByTestId("team-tab-leaderboards");
  // The tab's prefetch brings the loading state along; let it finish before holding the page back.
  await tab.hover();
  await page.waitForLoadState("networkidle");
  await page.route(
    (url) => url.pathname === BOARDS,
    async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue();
    },
  );
  await tab.click();
  const loading = page.locator("main [role=status][aria-label=Loading]");
  await expect(loading).toHaveAttribute("data-testid", "leaderboards-skeleton");
  const skeleton = (await loading.boundingBox())!;
  await expect(page.getByTestId("leaderboards")).toBeVisible({ timeout: 20_000 });
  const board = (await page.getByTestId("leaderboards").boundingBox())!;
  expect(Math.abs(skeleton.width - board.width), "the loading state is as wide as the page").toBeLessThanOrEqual(1);
  expect(Math.abs(skeleton.x - board.x)).toBeLessThanOrEqual(1);
});

/** Opens the page and waits for the season's records on it, its fonts in. */
async function openRecords(page: Page) {
  await open(page, BOARDS);
  await expect(page.getByTestId("records")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Each record's cell: its own width in rem (what its row's tiers measure), its own height, whether its
 * qualifier takes a line of its own. Two cells side by side share a grid row, which each stretches to
 * (the hairline between them runs the row's height), so a cell's box is the taller one's: the stretch
 * is lifted for the measure and put back in the same step, before anything is drawn.
 */
const recordCells = (page: Page) =>
  page.getByTestId("season-record").evaluateAll((rows) => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const lifted = rows.flatMap((r) => [r.closest("li")!, r.parentElement!, r as HTMLElement]);
    const kept = lifted.map((el) => [el.style.alignSelf, el.style.height] as const);
    for (const el of lifted) {
      if (el.tagName === "LI") el.style.alignSelf = "start";
      else el.style.height = "auto";
    }
    const cells = rows.map((row) => {
      const cell = row.closest("li")!;
      const label = row.querySelector("[data-testid=record-label]")!.getBoundingClientRect();
      const qualifier = row.querySelector("[data-testid=record-qualifier]")?.getBoundingClientRect() ?? null;
      const height = row.getBoundingClientRect().height;
      return { id: row.getAttribute("data-record"), rem: cell.clientWidth / rem, height, rowRem: height / rem, ownLine: !!qualifier && qualifier.top >= label.bottom - 2 };
    });
    lifted.forEach((el, i) => {
      [el.style.alignSelf, el.style.height] = kept[i]!;
    });
    return cells;
  });

test("the season records: seven cells in one panel, each opening its game; the multikill table ranked by its Score; the milestones", async ({ page }) => {
  // The cells' games are not prefetched (each would be a server render of its own, on every visit): only a click asks for one.
  const prefetched: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (/^\/players\/[^/]+\/matches$/.test(url.pathname) && (url.searchParams.has("_rsc") || r.headers()["rsc"] === "1")) prefetched.push(url.search);
  });
  await openRecords(page);
  const desktop = test.info().project.name === "desktop";
  // One panel holding the seven records; what they count and whose they are behind its ⓘ, the qualifiers on rows wide enough.
  const book = page.getByTestId("records-book");
  await expect(book.getByTestId("season-record")).toHaveCount(7);
  await expect(page.getByTestId("season-record")).toHaveCount(7);
  // One lead card on the page, Recent form's: the records are a plain panel.
  await expect(book).not.toHaveClass(/surface-lead/);
  await expect(page.locator("main .surface-lead")).toHaveCount(1);
  await expect(page.getByTestId("form-board")).toHaveClass(/surface-lead/);
  await expect(page.getByTestId("records-scope")).toHaveText(/^[\d,]+ games · ties: first to set it$/);
  await expect(page.getByTestId("records-tip")).toHaveAccessibleDescription("Records among players active in the last 30 days. Per-minute records need 15+ minute games; the KDA record 10 takedowns.");
  // Each record's qualifier on its row (read out where a narrow two-line cell has no room to draw it).
  await expect(book.locator("[data-record=damage-per-minute] [data-testid=record-qualifier]")).toContainText("to champions · 15+ min games");
  await expect(book.locator("[data-record=kda] [data-testid=record-qualifier]")).toContainText("10+ takedowns");
  // A record set on a champion leads with that champion's portrait: 48px in a narrow cell, 36px in the desktop's two-line cells.
  const portrait = page.locator("[data-testid=season-record][data-record=kills] [data-testid=record-picture]").locator("img, [role=img]").first();
  await expect(portrait).toBeVisible();
  expect((await portrait.boundingBox())!.height).toBeGreaterThanOrEqual(desktop ? 36 : 44);
  for (const c of await recordCells(page)) {
    // The desktop's board (a 59rem page): two lines beside a 36px picture, 2.75rem; a qualifier on a line of its own adds one.
    if (desktop) expect(c.rowRem, `${c.id}: a two-line cell`).toBeLessThanOrEqual(c.ownLine ? 3.9 : 2.9);
    else if (c.rem >= 40) expect(c.rowRem, `${c.id}: a record in a ${c.rem.toFixed(1)}rem cell, two lines`).toBeLessThanOrEqual(4.5);
    else if (c.rem < 36) expect(c.rowRem, `${c.id}: a record in a ${c.rem.toFixed(1)}rem cell, three lines`).toBeLessThanOrEqual(c.ownLine ? (c.rem >= 20 ? 8 : 7) : 6);
  }
  // The multikill table: the active players with a place, ranked by the Score (as shown), places shared on equal scores, first in
  // gold; each row's counts are Riot's own, each multikill once (the demo's comparison players make the score role-adjusted).
  const multis = await page.getByTestId("multikill-row").evaluateAll((els) =>
    els.map((e) => ({
      status: e.getAttribute("data-status"),
      place: Number(e.getAttribute("data-place") ?? 0),
      score: Number(e.getAttribute("data-score") ?? -1),
      counts: ["data-double", "data-triple", "data-quadra", "data-penta"].map((k) => Number(e.getAttribute(k))),
      riot: (e.getAttribute("data-riot") ?? "").split(",").map(Number),
      counted: Number(e.getAttribute("data-counted")),
      cells: [...e.querySelectorAll<HTMLElement>("[data-testid=multikill-kind]")].map((k) => [k.dataset.kind, k.firstChild?.textContent]),
      games: e.querySelector("[data-testid=multikill-games] [aria-hidden]")?.textContent ?? null,
      shown: e.querySelector("[data-testid=multikill-score]")?.textContent ?? null,
      leader: e.querySelector("[data-testid=multikill-place][data-leader]") !== null,
      crown: !!e.querySelector("[aria-label='First place']"),
    })),
  );
  expect(multis.length).toBeGreaterThan(2);
  for (let i = 1; i < multis.length; i++) {
    expect(multis[i]!.score, "ranked by the score").toBeLessThanOrEqual(multis[i - 1]!.score);
    expect(multis[i]!.place === multis[i - 1]!.place, "a place is shared exactly when the scores read the same").toBe(multis[i]!.score === multis[i - 1]!.score);
    expect([multis[i - 1]!.place, i + 1], "no place skipped").toContain(multis[i]!.place);
  }
  expect(multis[0]!.place).toBe(1);
  for (const m of multis) {
    // Ranked only: 20 or more games with counts; the demo's provisional member (12) and the one with 5 are not listed.
    expect(m.status).toBe("ranked");
    expect(m.counted).toBeGreaterThanOrEqual(20);
    expect(m.shown).toBe(String(m.score));
    expect(m.leader, "first place in gold").toBe(m.place === 1);
    expect(m.crown, "no crown").toBe(false);
    // Shown: each multikill once, at its largest (doubles − triples …), never Riot's nested counters as they are.
    const [d, t, q, p] = m.riot as [number, number, number, number];
    expect(m.counts, "each multikill once, from Riot's nested counters").toEqual([Math.max(0, d - t), Math.max(0, t - q), Math.max(0, q - p), p]);
    expect(m.cells, "the four kinds' cells, the row's own counts").toEqual(["double", "triple", "quadra", "penta"].map((k, i) => [k, String(m.counts[i])]));
    expect(m.games).toBe(String(m.counted));
  }
  await expect(page.getByTestId("multikill-basis")).toHaveText("Ranked by multikill performance relative to the champions and roles played.");
  await expect(page.getByTestId("multikill-explain")).toHaveAccessibleDescription("Multikills earn 2–5 points. The score compares a player's points with typical results for their champions and roles, accounting for games played.");
  await expect(page.getByTestId("multikill-score-legend")).toContainText("Below 100 below typical");
  await expect(page.getByTestId("multikill-score-legend")).toContainText("100 typical");
  await expect(page.getByTestId("multikill-score-legend")).toContainText("Above 100 above typical");
  await expect(page.getByTestId("multikill-score-legend")).toHaveAttribute("data-counting-rule", "nested");
  // No group of unplaced members, no most-of-each tiles: the kinds' columns show them.
  await expect(page.getByTestId("multikill-unplaced")).toHaveCount(0);
  await expect(page.getByTestId("multikill-most")).toHaveCount(0);
  // The columns from a 26rem board (sentence case, never label-caps); a phone's rows say the same in words.
  const tableRem = await page.getByTestId("records-multikills").evaluate((b) => b.clientWidth / parseFloat(getComputedStyle(document.documentElement).fontSize));
  // On the table (from 26rem) the legend's three parts read as one line from its start, each whole, 12px apart (never spread
  // across the board); a phone's board sets them as three columns (the phone test).
  if (tableRem >= 26) {
    const parts = await page.getByTestId("multikill-legend-part").evaluateAll((els) => els.map((e) => ({ top: e.getBoundingClientRect().top, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, height: e.getBoundingClientRect().height, line: parseFloat(getComputedStyle(e).lineHeight) })));
    for (const p of parts) expect(p.height, "each part whole on one line").toBeLessThanOrEqual(p.line + 1);
    if (Math.max(...parts.map((p) => p.top)) - Math.min(...parts.map((p) => p.top)) <= 1) for (let i = 1; i < parts.length; i++) expect(parts[i]!.left - parts[i - 1]!.right, "packed from the start, 12px apart").toBeLessThanOrEqual(13);
  }
  if (tableRem >= 26) {
    await expect(page.getByTestId("multikill-heads")).toBeVisible();
    const heads = (await page.getByTestId("multikill-heads").innerText()).split(/\s+/).filter(Boolean);
    expect(heads).toEqual(tableRem >= 40 ? ["#", "Player", "Games", "Doubles", "Triples", "Quadras", "Pentas", "Score"] : ["#", "Player", "Games", "2×", "3×", "4×", "5×", "Score"]);
  } else await expect(page.getByTestId("multikill-heads")).toBeHidden();
  await expect(page.getByTestId("records-multikills").locator(".label-caps")).toHaveCount(0);
  // The role icon beside each name: the most played position over the score's games, named so, its ⓘ every position's share.
  for (const role of await page.locator("[data-testid=multikill-row] [data-testid=multikill-role]").all()) {
    // The Production check's own pattern (a games count of 1,000 or more keeps its thousands separator: "of 1,024 games").
    await expect(role).toHaveAccessibleName(new RegExp(MULTIKILL_ROLE_LABEL));
    await expect(role).toHaveAccessibleDescription(/(Top|Jungle|Mid|Bottom|Support|Unknown) — \d+% \([\d,]+ games?\)/);
  }
  // A player's name keeps a line's room at every width: whole words, at most two lines, never cut.
  const names = await page.getByTestId("multikill-row").evaluateAll((rows) =>
    rows.filter((row) => row.checkVisibility()).map((row) => {
      const name = row.querySelector<HTMLElement>("[data-testid=card-name]")!;
      const box = name.getBoundingClientRect();
      return { name: name.textContent, lines: Math.round(box.height / parseFloat(getComputedStyle(name).lineHeight)), inside: box.right <= row.getBoundingClientRect().right + 0.5, cut: name.scrollWidth > name.clientWidth + 1 };
    }),
  );
  for (const n of names) {
    expect(n.lines, `${n.name}: at most two lines`).toBeLessThanOrEqual(2);
    expect(n.inside, `${n.name}: inside its row`).toBe(true);
    expect(n.cut, `${n.name}: whole`).toBe(false);
  }
  // Two cells side by side start level: each at its own top padding.
  const tops = await page.getByTestId("season-record").evaluateAll((rows) => rows.map((r) => [Math.round(r.closest("li")!.getBoundingClientRect().top), r.querySelector("[data-testid=record-label]")!.getBoundingClientRect().top - r.getBoundingClientRect().top]));
  for (const [row, offset] of tops) for (const [other, o] of tops) if (row === other) expect(Math.abs(offset! - o!), "level with the cell beside it").toBeLessThanOrEqual(1);
  // Compact rows: one line (40px, 44px on a touch screen) in the table; on a phone the 44px Score's line and the words under it (two lines where they wrap).
  // Each at its own height: where the table is the shorter board its rows share the spare room (board-fill.ts), at most 3.5rem each on average.
  const mkRows = await rowHeights(page, "multikill-row");
  for (const h of mkRows) expect(h.own, "a multikill row").toBeLessThanOrEqual(tableRem >= 26 ? 50 : 96);
  const rootRem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  const grown = mkRows.filter((h) => h.drawn > h.own + 1);
  if (grown.length) expect(grown.reduce((sum, h) => sum + h.drawn, 0) / grown.length, "grown rows: 3.5rem at most on average").toBeLessThanOrEqual(FILL_ROW_MAX_REM * rootRem + 1);
  // The milestones: at most eight cells, the most meaningful first, each the champion's portrait, the player over the champion
  // and its figure as format.ts shortens it (486K, 29 games); the rest counted, on the profiles.
  const milestones = page.getByTestId("records-milestones").getByTestId("milestone");
  expect(await milestones.count()).toBeGreaterThan(0);
  expect(await milestones.count()).toBeLessThanOrEqual(8);
  await expect(milestones.first().getByTestId("milestone-champion")).toHaveText(/^.+ · [\d,.]+[KM]? (mastery|games?)/);
  const tiers = await milestones.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-tier"))));
  // Each player's best before anyone's second: the first cells name distinct players.
  const players = await milestones.evaluateAll((els) => els.map((e) => e.getAttribute("data-player-id")));
  const firstRound = players.slice(0, new Set(players).size);
  expect(new Set(firstRound).size, "each player's best first").toBe(firstRound.length);
  expect(tiers.every((t) => t >= 1 && t <= 3)).toBe(true);
  if (await page.getByTestId("milestones-more").count()) await expect(page.getByTestId("milestones-more")).toHaveText(/^\d+ more on profiles$/);
  await expect(page.getByTestId("milestones-tip")).toHaveAccessibleDescription(/^25, 50 or 100 games on one champion this season, or 100K, 500K or 1M mastery points on one\./);
  await noOverflow(page);
  await axe(page, "[data-testid=leaderboards]");
  // Every cell has been in view (the page scrolled through them), and no game was asked for.
  for (const cell of await page.getByTestId("season-record").all()) await cell.scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  expect(prefetched, "the record cells' games prefetched").toEqual([]);
  // The whole row opens its game over the board (PLAN S6c, UD.L3): a docked Peek from md, the window on phones, at
  // /leaderboards?match= (one history entry), with "Open in Match History" inside; ‹ › step through the records' games,
  // and Escape or Back close it on /leaderboards with the focus back on the row.
  const kills = page.locator('[data-testid=season-record][data-record="kills"]');
  await expect(kills.locator("[data-row-link]")).toHaveAttribute("href", /^\/leaderboards\?match=/);
  await kills.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => history.length);
  const value = (await kills.getByTestId("record-value").boundingBox())!;
  await page.mouse.click(value.x + value.width / 2, value.y + value.height / 2);
  await expect(page).toHaveURL(/\/leaderboards\?match=/);
  const peek = page.getByTestId("record-game-peek");
  await expect(peek.getByTestId("record-game-history")).toHaveAttribute("href", /^\/players\/[^/]+\/matches\?match=/);
  await expect(peek.getByTestId("match-breakdown")).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  const first = new URL(page.url()).searchParams.get("match");
  await peek.getByTestId("record-game-peek-next").click();
  await expect.poll(() => new URL(page.url()).searchParams.get("match")).not.toBe(first);
  expect(await page.evaluate(() => history.length), "‹ › replace the entry").toBe(before + 1);
  await page.goBack();
  await expect(page).toHaveURL(/\/leaderboards$/);
  await expect(peek).toBeHidden();
  await page.mouse.click(value.x + value.width / 2, value.y + value.height / 2);
  await expect(peek.getByTestId("record-game-history")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/leaderboards$/);
  await expect(peek).toBeHidden();
  await expect(kills.locator("[data-row-link]")).toBeFocused();
  // The shared list's row links: on a touch screen each covers its row's dividing line too, so none is under 44px; with a mouse
  // each is its row inside the line, and the compact rows keep their minimum (40px, 44px on touch).
  const links = await page.locator("main [data-row-link]").evaluateAll((els) =>
    els
      .filter((e) => e.getBoundingClientRect().height > 0)
      .map((e) => ({ link: e.getBoundingClientRect().height, inside: e.parentElement!.clientHeight, minimum: parseFloat(getComputedStyle(e.parentElement!).minHeight) || 0, testId: e.parentElement!.dataset.testid ?? "" })),
  );
  expect(links.length).toBeGreaterThan(10);
  const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  for (const l of links) {
    if (touch) expect(Math.round(l.link), `${l.testId}: its link on a touch screen`).toBeGreaterThanOrEqual(44);
    else expect(Math.round(l.link), `${l.testId}: a mouse's link is the row inside its line`).toBe(Math.round(l.inside));
    if (l.testId === "multikill-row" || l.testId === "milestone") expect(l.minimum, `${l.testId}: the row's minimum`).toBe(touch ? 44 : l.testId === "multikill-row" ? 40 : 44);
  }
});

/** Where each board is on the page (document px), the grid's gap, Recent form's tier (its rows' columns: 4, 6 or 8), and the window. */
const boards = (page: Page) =>
  page.evaluate(() => {
    const box = (id: string) => {
      const b = document.querySelector(`[data-testid=${id}]`)!.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top + scrollY, bottom: b.bottom + scrollY, width: b.width, height: b.height };
    };
    const bottoms = (id: string) => [...document.querySelectorAll(`[data-testid=${id}]`)].map((e) => e.getBoundingClientRect().bottom + scrollY);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const formRow = document.querySelector<HTMLElement>("[data-testid=form-row]")!;
    return {
      rem,
      page: document.querySelector("[data-testid=leaderboards]")!.clientWidth / rem,
      gap: parseFloat(getComputedStyle(document.querySelector("[data-testid=leaderboards-grid]")!).rowGap),
      formTracks: getComputedStyle(formRow).gridTemplateColumns.split(" ").filter(Boolean).length,
      form: box("form-board"),
      records: box("records-book"),
      multikills: box("records-multikills"),
      milestones: box("records-milestones"),
      formRows: bottoms("form-row"),
      recordRows: bottoms("season-record"),
      height: document.documentElement.scrollHeight,
      window: innerHeight,
      /** The page's own bottom padding (#content's): the room under the boards is measured above it (Release 19: "spare", not "fits"). */
      pad: parseFloat(getComputedStyle(document.getElementById("content")!).paddingBottom),
    };
  });

/** The least room under the boards at the owner's sizes (Release 19: a one-screen layout never depends on a pixel or two; CI's text runs wider, e2e/wide-text.ts). */
const BOARD_SPARE = 12;

/**
 * A member's own bests, as a member with a best on every record sees them ("Your best: 9 · 4 Oct
 * 2026", where its holder sees "You hold this record"): the demo's viewer has no player profile, so
 * no cell carries one. Each cell gets what RecordRow draws at the end of its game (record-yours.ts): a
 * fourth line in a narrow cell; in a two-line cell (the desktop's board) "· Your best: 9" after the
 * holder and the champion, its date read out only.
 */
const addOwnBests = (page: Page) =>
  page.evaluate(
    ({ line, value }) => {
      for (const row of document.querySelectorAll("[data-testid=season-record]")) {
        const game = row.querySelector("[data-testid=record-game]");
        if (!game) continue;
        const dot = document.createElement("span");
        dot.setAttribute("aria-hidden", "true");
        dot.className = "hidden text-xs text-fg-subtle record-two:inline";
        dot.textContent = "·";
        const yours = document.createElement("span");
        yours.dataset.testid = "record-yours";
        yours.className = line;
        const figure = document.createElement("span");
        figure.className = value;
        figure.textContent = "9";
        const when = document.createElement("span");
        when.className = "record-two:sr-only";
        when.textContent = " · 4 Oct 2026";
        yours.append("Your best: ", figure, when);
        game.append(dot, yours);
      }
    },
    { line: RECORD_YOURS, value: RECORD_YOURS_VALUE },
  );

test("one screen from a 59rem page: a 2 × 2 grid, the rankings side by side and the achievements under them, each pair as tall as each other, all four ending in the window with room to spare at 1366 × 768, 1440 × 900, 1920 × 950 and 1920 × 1080, nothing folded, with CI's wider text too", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "explicit window sizes");
  test.setTimeout(360_000);
  // The last pass with CI's wider text (e2e/wide-text.ts), which stays on the tab from then on.
  for (const sidebar of ["expanded", "collapsed", "wide"] as const) {
    if (sidebar === "wide") await widenText(page);
    await context.addCookies([{ name: "uniiverse_sidebar", value: sidebar === "wide" ? "expanded" : sidebar, url: baseURL! }]);
    for (const [width, height, oneScreen] of [
      [1280, 800, false],
      // The owner's smallest desktop window.
      [1366, 768, true],
      [1440, 900, true],
      // A 14-inch MacBook Pro's window.
      [1512, 945, false],
      // The owner's browser on a 1920 × 1080 screen (its tabs, bookmarks bar and the taskbar taken off).
      [1920, 950, true],
      [1920, 1080, true],
      [2560, 1440, false],
      [3440, 1440, false],
    ] as const) {
      await page.setViewportSize({ width, height });
      await openRecords(page);
      const f = await boards(page);
      const at = `${width} × ${height}, sidebar ${sidebar === "wide" ? "expanded, wider text" : sidebar} (a ${f.page.toFixed(1)}rem page)`;
      await noOverflow(page);
      // Names whole (M4): no word broken across lines.
      expect(await brokenWords(page), `${at}: no word broken across two lines`).toEqual([]);
      // Nothing folded, nothing scrolling inside the page: no Show all, no inner scrollbar.
      await expect(page.locator("main").getByRole("button", { name: /Show all|\d+ more/ }), `${at}: no Show all`).toHaveCount(0);
      expect(await innerScrollers(page), `${at}: no inner scrollbar`).toEqual([]);
      // The one screen is sized for the active players the demo has (seven, as the owner's team). Other specs in a full run add
      // members without games, who are not shown (the 30-day rule); with more active players (a full nine) the arrangement is
      // checked, not the window.
      const seeded = Number(await page.getByTestId("scope-count").getAttribute("data-count")) <= 7;
      /** The 2 × 2 grid: Recent form beside the multikills, the records under Recent form beside the milestones; each pair one height. */
      const grid = (g: Awaited<ReturnType<typeof boards>>, who: string, fits: boolean) => {
        expect(Math.abs(g.form.top - g.multikills.top), `${who}: the multikills beside Recent form`).toBeLessThanOrEqual(1);
        expect(Math.abs(g.form.bottom - g.multikills.bottom), `${who}: Recent form and the multikills one height`).toBeLessThanOrEqual(1);
        expect(g.multikills.left, `${who}`).toBeGreaterThan(g.form.right);
        expect(Math.abs(g.records.left - g.form.left) + Math.abs(g.records.right - g.form.right), `${who}: the records in Recent form's column`).toBeLessThanOrEqual(1);
        expect(Math.abs(g.records.top - g.form.bottom - g.gap), `${who}: the records right under Recent form`).toBeLessThanOrEqual(1);
        expect(Math.abs(g.milestones.left - g.multikills.left) + Math.abs(g.milestones.right - g.multikills.right), `${who}: the milestones in the multikills' column`).toBeLessThanOrEqual(1);
        expect(Math.abs(g.milestones.top - g.records.top), `${who}: the milestones beside the records`).toBeLessThanOrEqual(1);
        expect(Math.abs(g.milestones.bottom - g.records.bottom), `${who}: the records and the milestones one height`).toBeLessThanOrEqual(1);
        // The owner's sizes: all four boards end in the window with room to spare (BOARD_SPARE above the page's own bottom padding:
        // Release 19), and the page does not scroll.
        if (oneScreen && seeded && fits) {
          for (const [name, b] of [["Recent form", g.form], ["the multikills", g.multikills], ["the records", g.records], ["the milestones", g.milestones]] as const) expect(g.window - g.pad - b.bottom, `${who}: room under ${name}`).toBeGreaterThanOrEqual(BOARD_SPARE);
          expect(g.height, `${who}: the page does not scroll`).toBeLessThanOrEqual(g.window);
        }
      };
      grid(f, at, true);
      // Recent form's tier: the name over the role and dates (six columns) in its column at every desktop size.
      expect(f.formTracks, `${at}: Recent form's tier`).toBe(6);
      // As a member sees it, with their own best on every record: the records' panel is no shorter, the grid holds; at 1440 × 900
      // and 1920 × 1080 everything still ends in the window (at 1366 × 768 a member's bests may add a short scroll: readability first).
      await addOwnBests(page);
      await page.waitForTimeout(100);
      const member = await boards(page);
      expect(member.records.height, `${at}: a member's records panel is no shorter`).toBeGreaterThanOrEqual(f.records.height - 1);
      expect(Math.abs(member.form.bottom - f.form.bottom), `${at}: Recent form as it was`).toBeLessThanOrEqual(1);
      grid(member, `${at}, a member's bests`, height >= 900);
    }
  }
});

test("on a phone: one column, the index of the sections below Recent form jumping to each under the top bar, three-line records, two-line multikill rows, milestone cells", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone's column");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openRecords(page);
  // One column, in reading order: the header, the index, Recent form, the multikills, the records, the milestones.
  const tops = await page.evaluate(() => ["section-index", "form-board", "records-multikills", "records-book", "records-milestones"].map((id) => document.querySelector(`[data-testid=${id}]`)!.getBoundingClientRect()));
  for (let i = 1; i < tops.length; i++) expect(tops[i]!.top, "one column, in order").toBeGreaterThanOrEqual(tops[i - 1]!.bottom - 1);
  for (const t of tops) expect(Math.abs(t.left - tops[0]!.left)).toBeLessThanOrEqual(1);
  // Each record: its words over the holder (the figure at that line's end) over the game, the picture beside them.
  const kills = page.locator("[data-testid=season-record][data-record=kills]");
  const [title, holder, game, value] = await Promise.all(["record-title", "record-holder", "record-context", "record-value"].map((id) => kills.getByTestId(id).boundingBox()));
  expect(holder!.y, "the holder under the record").toBeGreaterThanOrEqual(title!.y + title!.height - 1);
  expect(game!.y, "the game under the holder").toBeGreaterThanOrEqual(holder!.y + holder!.height - 1);
  const cellRem = await kills.evaluate((el) => el.closest("li")!.clientWidth / parseFloat(getComputedStyle(document.documentElement).fontSize));
  const line = cellRem >= 20 ? title! : holder!;
  expect(Math.abs(value!.y - line.y), cellRem >= 20 ? "the value at the record's line" : "the value on the holder's line").toBeLessThanOrEqual(cellRem >= 20 ? 3 : 12);
  // The full label on a phone (the short one is the desktop's two-line cell's).
  expect(await kills.getByTestId("record-label").innerText()).toBe("Most kills in a game");
  const cells = await recordCells(page);
  expect(cells).toHaveLength(7);
  for (const c of cells) {
    expect(c.rem, `${c.id}: a phone's cell is under 34rem`).toBeLessThan(34);
    expect(c.height, `${c.id}: ${c.ownLine ? "its qualifier on a line of its own" : "three lines"}`).toBeLessThanOrEqual(c.ownLine ? (c.rem >= 20 ? 128 : 112) : 96);
  }
  // The index: the sections below Recent form, each jump an entry of the page's own, the section under the top bar and focused.
  const index = page.getByTestId("section-index");
  await expect(index.getByRole("link")).toHaveText(["Multikills", "Season records", "Milestones"]);
  for (const [name, id] of [["Milestones", "milestones"], ["Multikills", "multikills"], ["Season records", "season-records"]] as const) {
    const entries = await page.evaluate(() => history.length);
    await index.getByRole("link", { name }).tap();
    await expect(page).toHaveURL(new RegExp(`/leaderboards#${id}$`));
    await expect.poll(() => page.evaluate(() => history.length), { message: `${name}: an entry of the page's own` }).toBe(entries + 1);
    const section = page.locator(`section#${id}`);
    await expect(section).toBeFocused();
    const barFoot = () => page.getByTestId("mobile-topbar").evaluate((b) => b.getBoundingClientRect().bottom);
    const under = async () => (await section.boundingBox())!.y - (await barFoot());
    await expect.poll(under, { message: `${name}: under the top bar` }).toBeGreaterThanOrEqual(-1);
    await page.waitForTimeout(300);
    const chips = page.getByTestId("leaderboards-chip-row");
    await expect(chips).toBeVisible();
    const row = (await chips.boundingBox())!;
    expect(Math.abs(row.y - (await barFoot())), `${name}: the chip row at the top bar's foot`).toBeLessThanOrEqual(1);
    expect((await section.boundingBox())!.y, `${name}: clear of the chip row`).toBeGreaterThanOrEqual(row.y + row.height - 1);
    const atEnd = await page.evaluate(() => window.scrollY + innerHeight >= document.documentElement.scrollHeight - 2);
    if (!atEnd) expect((await section.boundingBox())!.y, `${name}: just under it`).toBeLessThanOrEqual(row.y + row.height + 24);
    for (const h of await chips.getByRole("link").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h, "44px chips").toBeGreaterThanOrEqual(44);
    await expect(chips.locator("[aria-current=location]")).toHaveText(name === "Season records" ? "Records" : name);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId("leaderboards-chip-row")).toHaveCount(0);
  }
  // The milestones: one column of cells, the player over the champion and the figure, nothing wider than the phone.
  const milestone = page.getByTestId("milestone").first();
  const [player, champion] = await Promise.all(["milestone-player", "milestone-champion"].map((id) => milestone.getByTestId(id).boundingBox()));
  expect(champion!.y, "the champion under the player").toBeGreaterThanOrEqual(player!.y + player!.height - 1);
  // The multikills on a phone: no column headings; each row the place, the name with its role and the Score at the row's end on
  // the first line, the games and the kinds made in words across the line under it.
  const multikills = page.getByTestId("records-multikills");
  await expect(multikills.getByTestId("multikill-heads")).toBeHidden();
  await expect(multikills.locator(".label-caps")).toHaveCount(0);
  for (const row of await page.getByTestId("multikill-row").all()) {
    type Box = { x: number; y: number; width: number; height: number };
    const [name, words, score] = (await Promise.all([row.getByTestId("multikill-player"), row.getByTestId("multikill-words"), row.getByTestId("multikill-score-open")].map(async (l) => (await l.boundingBox())!))) as [Box, Box, Box];
    expect(words.y, "the words under the name and the score").toBeGreaterThanOrEqual(Math.max(name.y + name.height, score.y + score.height) - 2);
    expect(score.x, "the score at the row's end").toBeGreaterThan(name.x + name.width - 1);
    expect(score.height, "a 44px Score on a touch screen").toBeGreaterThanOrEqual(44);
    await expect(row.getByTestId("multikill-words")).toHaveText(/^\d+ games?(\s?·\s?\d+ (doubles?|triples?|quadras?|pentas?))*$/);
    // The line wraps between its items only, each whole, and no line starts with "·": each "·" ends the item before it ("· 2
    // pentas" started a line until the owner's review of 25 Nov 2026).
    const items = await row.locator("[data-testid=multikill-words] [data-word]").evaluateAll((els) => els.map((e) => ({ text: (e.textContent ?? "").replace(/\s+/g, " ").trim(), lines: new Set([...e.getClientRects()].map((r) => Math.round(r.top))).size })));
    for (const [i, w] of items.entries()) {
      expect(w.lines, `"${w.text}" whole on one line`).toBe(1);
      expect(w.text, "no item starts with a separator").not.toMatch(/^·/);
      if (i < items.length - 1) expect(w.text, "its separator at its end").toMatch(/·$/);
    }
    // The table's cells are not drawn on a phone.
    await expect(row.getByTestId("multikill-kind").first()).toBeHidden();
  }
  // The score legend's three parts, each whole, side by side in three columns on a phone (each score over its meaning), never two
  // on a line and the third alone under them (the owner's review of 25 Nov 2026); the games counted after them.
  const parts = await page.getByTestId("multikill-legend-part").evaluateAll((els) => els.map((e) => ({ text: (e.textContent ?? "").replace(/\s+/g, " ").trim(), top: e.getBoundingClientRect().top, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right })));
  expect(parts.map((p) => p.text)).toEqual(["Below 100 below typical", "100 typical", "Above 100 above typical"]);
  expect(Math.max(...parts.map((p) => p.top)) - Math.min(...parts.map((p) => p.top)), "the three parts on one row").toBeLessThanOrEqual(1);
  expect(parts[0]!.right <= parts[1]!.left && parts[1]!.right <= parts[2]!.left, "side by side, apart").toBe(true);
  await noOverflow(page);
});

test("tablet: one column, the season records two to a row, the streak a cell like the others, the index of the sections below Recent form", async ({ page }, info) => {
  test.skip(info.project.name !== "tablet", "a tablet's column");
  await openRecords(page);
  await expect(page.getByTestId("section-index")).toBeVisible();
  const cells = await page.getByTestId("season-record").evaluateAll((rows) => rows.map((r) => r.closest("li")!.getBoundingClientRect()));
  expect(cells).toHaveLength(7);
  // Two columns: the first six in three rows of two, the seventh (the streak) a cell of the left column like the others (Release 19:
  // it went across both, the STATUS follow-up of Release 18).
  for (let i = 0; i < 6; i += 2) {
    expect(Math.abs(cells[i]!.top - cells[i + 1]!.top), `cells ${i + 1} and ${i + 2} side by side`).toBeLessThanOrEqual(1);
    expect(cells[i + 1]!.left).toBeGreaterThan(cells[i]!.right - 1);
  }
  expect(Math.abs(cells[6]!.width - cells[0]!.width), "the streak as wide as the other cells").toBeLessThanOrEqual(1);
  expect(Math.abs(cells[6]!.left - cells[0]!.left), "in the left column").toBeLessThanOrEqual(1);
  // Recent form across the page, then the multikills, the records and the milestones under each other.
  const f = await boards(page);
  expect(f.multikills.top).toBeGreaterThanOrEqual(f.form.bottom);
  expect(f.records.top).toBeGreaterThanOrEqual(f.multikills.bottom);
  expect(f.milestones.top).toBeGreaterThanOrEqual(f.records.bottom);
  // The multikill table with its kinds' words as headings (a 40rem board and more).
  await expect(page.getByTestId("multikill-heads")).toContainText("Doubles");
  await noOverflow(page);
});

test("tablet and desktop: one Peek giving way to the other (a player, then a record's game, and back again) keeps one entry, so Back after closing leaves the board for the page before", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the docked Peeks: one project's time (the history rule is the same on a tablet)");
  await page.goto("/matches");
  await page.goto("/leaderboards");
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  const before = await page.evaluate(() => history.length);
  for (const order of [["player", "record"], ["record", "player"]] as const) {
    for (const what of order) {
      if (what === "player") await page.getByTestId("board-peek-open").first().click();
      // The records are in the column the docked player Peek lies over (Release 16): the record opened from the keyboard there.
      else {
        await page.locator('[data-testid=season-record][data-record="kills"] [data-row-link]').focus();
        await page.keyboard.press("Enter");
      }
      await expect(page).toHaveURL(what === "player" ? /\/leaderboards\?player=/ : /\/leaderboards\?match=/);
    }
    expect(await page.evaluate(() => history.length), `${order.join(" then ")}: one entry for the Peek`).toBe(before + 1);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/leaderboards$/);
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/matches$/);
});

test("a multikill row opens the player Peek led by the player's Score in short: the score, its place, the points and the final line (tap or click, the same on every device)", async ({ page }) => {
  await openRecords(page);
  const row = page.locator("[data-testid=multikill-row][data-status=ranked]").first();
  const score = await row.getAttribute("data-score");
  const counts = await row.evaluate((e) => ["data-double", "data-triple", "data-quadra", "data-penta"].map((k) => e.getAttribute(k)));
  await row.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  const opener = row.getByTestId("board-peek-open");
  // On the place, clear of the name, the role and the Score (each a press of its own, above the row's).
  if (test.info().project.name === "phone") await opener.tap({ position: { x: 12, y: 12 } });
  else await opener.click({ position: { x: 12, y: 12 } });
  await expect(page).toHaveURL(/\/leaderboards\?player=/);
  const detail = page.getByTestId("peek-multikills");
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId("breakdown-score")).toHaveText(new RegExp(`^${score}`));
  await expect(detail.getByTestId("breakdown-place")).toHaveText(/^(Tied for )?\d+(st|nd|rd|th) of \d+$/);
  // Each kind made (each multikill once, the row's own counts) and its points; the final line gives the score.
  expect(await detail.locator("[data-testid=breakdown-points] tbody tr td:first-of-type").allTextContents()).toEqual(counts.map((c, i) => `${c} × ${i + 2}`));
  const calc = detail.getByTestId("breakdown-calculation");
  const [earned, expected, cushion, shown] = await Promise.all(["data-earned", "data-expected", "data-cushion", "data-score"].map((a) => calc.getAttribute(a)));
  expect(Math.round((100 * (Number(earned) + Number(cushion))) / (Number(expected!.replace(/,/g, "")) + Number(cushion)))).toBe(Number(score));
  expect(shown).toBe(score);
  const box = (await detail.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/leaderboards$/);
});

test("the Score opens its breakdown, by mouse, keyboard and touch: the place, the role, the points, the +40, the final line giving the score shown, the comparison; it closes on Escape and a press outside", async ({ page }, info) => {
  await openRecords(page);
  const rows = page.locator("[data-testid=multikill-row]");
  const row = rows.nth(1);
  const button = row.getByTestId("multikill-score-open");
  const score = (await row.getAttribute("data-score"))!;
  await expect(button).toHaveAccessibleName(`Score ${score}: how it was worked out`);
  await expect(button).toHaveAttribute("aria-haspopup", "dialog");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await row.evaluate((e) => e.scrollIntoView({ block: "center" }));
  const breakdown = page.getByTestId("multikill-breakdown");
  /** The open breakdown's facts: its final line reproduces the score shown, every part present, nothing scrolling inside it. */
  const check = async () => {
    await expect(breakdown).toBeVisible();
    await expect(breakdown.getByTestId("breakdown-score")).toHaveText(new RegExp(`^${score}`));
    const calc = breakdown.getByTestId("breakdown-calculation");
    const [earned, expected, cushion, shown] = await Promise.all(["data-earned", "data-expected", "data-cushion", "data-score"].map((a) => calc.getAttribute(a)));
    expect(cushion).toBe("40");
    expect(shown).toBe(score);
    expect(Math.round((100 * (Number(earned) + 40)) / (Number(expected!.replace(/,/g, "")) + 40)), "the final line gives the score").toBe(Number(score));
    await expect(calc).toContainText(`100 × (${earned} + 40) ÷ (${expected} + 40) = ${score}`);
    // Points per kind ("29 × 2" … ), their total the earned points; typical points with a decimal; the plain +40 sentence.
    const points = await breakdown.locator("[data-testid=breakdown-points] tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent ?? "")));
    expect(points.map((p) => p[0]!.split(" × ")[1])).toEqual(["2", "3", "4", "5"]);
    expect(points.reduce((sum, p) => sum + Number(p[1]), 0)).toBe(Number(earned));
    await expect(breakdown.getByTestId("breakdown-expected")).toHaveText(/^[\d,]+\.\d+$/);
    await expect(breakdown).toContainText("Players with fewer games are kept closer to 100 so a few unusually good or bad games have less influence.");
    await expect(breakdown.getByTestId("breakdown-role-label")).toHaveText(/^(Most played: |Split: |Role unknown)/);
    await expect(breakdown.getByTestId("breakdown-comparison")).toContainText(/Typical results come from [\d,]+ games of other players in the team's stored season matches, excluding team members — not every League player\./);
    await expect(breakdown.getByTestId("breakdown-levels")).toContainText(/(By champion and role|By role \(champion under 50 games\)|All positions together|The team's own games): \d+ games?/);
    await expect(breakdown.getByTestId("breakdown-example")).toContainText("100 × (80 + 40) ÷ (60 + 40) = 120");
    await expect(breakdown).toContainText("Luck still matters");
    // No scrollbar inside it at this size: it opens whole (beside the Score, up to the window's height, or as a phone's sheet).
    const inner = await breakdown.evaluate((el) => [el, ...el.querySelectorAll<HTMLElement>("*")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length);
    if (info.project.name === "desktop") expect(inner, "no scrollbar inside the breakdown").toBe(0);
    const box = (await breakdown.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    await noOverflow(page);
  };
  const before = await page.evaluate(() => history.length);
  if (info.project.name === "phone") {
    // Touch: a tap opens the sheet; its ✕ closes it.
    await button.tap();
    await check();
    await expect(page).toHaveURL(/\/leaderboards$/);
    await page.getByTestId("multikill-breakdown-close").tap();
    await expect(breakdown).toBeHidden();
  } else {
    // A click opens it beside the Score (no Peek: the row's own press is not taken), Escape closes it with the focus back.
    await button.click();
    await check();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(page).toHaveURL(/\/leaderboards$/);
    await axe(page, "[data-testid=multikill-breakdown]");
    await page.keyboard.press("Escape");
    await expect(breakdown).toBeHidden();
    await expect(button).toBeFocused();
    // The keyboard: Enter on the focused Score opens it, the focus inside; a press outside closes it.
    await page.keyboard.press("Enter");
    await check();
    await expect.poll(() => breakdown.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.mouse.click(5, (page.viewportSize()!.height * 3) / 4);
    await expect(breakdown).toBeHidden();
  }
  // No history entry of its own.
  expect(await page.evaluate(() => history.length)).toBe(before);
  // The role icon's ⓘ: hover or focus shows every position's share; its name says the most played role.
  const role = rows.first().getByTestId("multikill-role");
  if ((await role.getAttribute("data-role-kind")) !== "unknown") {
    if (info.project.name === "phone") await role.tap();
    else await role.focus();
    await expect(page.getByTestId("multikill-role-bubble")).toContainText(/(Top|Jungle|Mid|Bottom|Support) — \d+% \([\d,]+ games?\)/);
  }
});

test("the Score breakdown keeps the keyboard's place: Tab past its end closes it and goes on to the next row, Shift+Tab closes it back on the Score", async ({ page }, info) => {
  // Drawn at the page's end (a portal, above the rows), the beside form is still read as if it came right after its Score
  // (WCAG 2.4.3; the review of 25 Nov 2026: Tab left the page with it open, and Shift+Tab landed on the page's last control).
  test.skip(info.project.name === "phone", "a phone's sheet keeps the focus inside it until it closes, as every sheet does");
  await openRecords(page);
  const rows = page.locator("[data-testid=multikill-row]");
  const button = rows.nth(1).getByTestId("multikill-score-open");
  const breakdown = page.getByTestId("multikill-breakdown");
  await rows.nth(1).evaluate((e) => e.scrollIntoView({ block: "center" }));
  const openByKey = async () => {
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(breakdown).toBeVisible();
    await expect.poll(() => breakdown.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  };
  // Tab: its ✕ (its one control), then out of it: closed, the focus on the next row (its first control), as Tab from the Score goes.
  await openByKey();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("multikill-breakdown-close")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(breakdown).toBeHidden();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => rows.nth(2).evaluate((r) => r.contains(document.activeElement))).toBe(true);
  // From there Shift+Tab is the page's own order again: back to the Score.
  await page.keyboard.press("Shift+Tab");
  await expect(button).toBeFocused();
  await expect(breakdown).toBeHidden();
  // Shift+Tab out of the panel itself: closed, the focus back on the Score.
  await openByKey();
  await page.keyboard.press("Shift+Tab");
  await expect(breakdown).toBeHidden();
  await expect(button).toBeFocused();
  // Shift+Tab from its ✕ as well.
  await openByKey();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("multikill-breakdown-close")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(breakdown).toBeHidden();
  await expect(button).toBeFocused();
  // Escape closes it wherever the focus is on the page, the focus back on the Score.
  await openByKey();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Escape");
  await expect(breakdown).toBeHidden();
  await expect(button).toBeFocused();
});

test("the Production check's multikill readers pass on the demo's page: the table, the first Score's breakdown and its keyboard way out", async ({ page }, info) => {
  // The check's own code (scripts/multikill-facts.mjs) on a real page, so a reader that cannot match the page fails here first
  // (the review of 25 Nov 2026: the legend's words, read as one run of text, never matched, so the fact failed on every page).
  await openRecords(page);
  const kind = info.project.name;
  const read = await page.evaluate(readMultikillBoard, MULTIKILL_ROLE_LABEL);
  expect(multikillVerdicts({ kind, read }).filter((v) => v.status !== "PASS")).toEqual([]);
  if (kind === "phone") return;
  const first = page.locator("[data-testid=multikill-row] [data-testid=multikill-score-open]").first();
  await first.scrollIntoViewIfNeeded();
  await first.click();
  await expect(page.getByTestId("breakdown-calculation")).toBeVisible();
  const breakdown = await page.evaluate(readMultikillBreakdown);
  expect(breakdownVerdicts({ kind, read: breakdown, rowScore: read.rows![0]!.score }).filter((v) => v.status !== "PASS")).toEqual([]);
  await page.keyboard.press("Escape");
  const panel = page.getByTestId("multikill-breakdown");
  await expect(panel).toBeHidden();
  const openByKey = async () => {
    await first.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => panel.evaluate((el) => el.contains(document.activeElement)).catch(() => false)).toBe(true);
  };
  await openByKey();
  for (let i = 0; i < 12 && (await panel.count()); i++) await page.keyboard.press("Tab");
  const forward = await page.evaluate(readBreakdownFocus);
  await openByKey();
  await page.keyboard.press("Shift+Tab");
  const back = await page.evaluate(readBreakdownFocus);
  expect(breakdownKeyboardVerdicts({ kind, forward, back }).map((v) => v.status)).toEqual(["PASS"]);
});

test("the shorter board of each grid row spreads its spare room over its rows: no blank band, the multikills' legend right under their last row", async ({ page }, info) => {
  // The review of 25 Nov 2026: the 2 × 2 grid's rows stretch both boards to one height, and the shorter one's spare room sat as one
  // band (about 95px above the multikills' legend at 1920 × 1080 with the demo's five ranked players beside seven Recent form rows).
  test.skip(info.project.name !== "desktop", "the 2 × 2 grid is the desktop's");
  await open(page, BOARDS);
  for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // The Production check's own reading and fact (scripts/one-screen-facts.mjs): each board's last line within 24px of its end,
    // unless its rows have grown to their cap (3.5rem a row on average); the legend within 4px of the last row.
    const read = await page.evaluate(readOneScreen, oneScreenInput("leaderboards"));
    for (const b of read.spare!) {
      expect(b.present && (b.rows ?? 0) > 0, `${width}: ${b.board} has rows`).toBe(true);
      expect(b.spare! <= 24 || b.grown, `${width}: ${b.board} leaves ${b.spare}px under its last line`).toBe(true);
    }
    expect(read.spare!.find((b) => b.board === "records-multikills")!.footGap!, `${width}: the legend right under the last row`).toBeLessThanOrEqual(4);
    expect(oneScreenVerdicts({ page: "leaderboards", size: `${width} × ${height}`, read }).filter((v) => v.status !== "PASS")).toEqual([]);
    // The multikills, the shorter board here: every row taller than its own content by one share (within a pixel), none past 3.5rem on average.
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const mk = await rowHeights(page, "multikill-row");
    const shares = mk.map((h) => h.drawn - h.own);
    expect(Math.min(...shares), `${width}: each multikill row has its share of the spare room`).toBeGreaterThan(1);
    expect(Math.max(...shares) - Math.min(...shares), `${width}: equal shares`).toBeLessThanOrEqual(1.5);
    expect(mk.reduce((sum, h) => sum + h.drawn, 0) / mk.length, `${width}: 3.5rem at most on average`).toBeLessThanOrEqual(FILL_ROW_MAX_REM * rem + 1);
    // Recent form, the taller board, keeps its rows at their own height.
    for (const h of await rowHeights(page, "form-row")) expect(h.drawn - h.own, `${width}: a Recent form row at its own height`).toBeLessThanOrEqual(1);
  }
});

