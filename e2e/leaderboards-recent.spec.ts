import { AxeBuilder } from "@axe-core/playwright";
import { RECORD_YOURS, RECORD_YOURS_VALUE } from "../src/components/leaderboards/record-yours";
import { expect, test, type Page } from "./test";

/*
  Team Leaderboards (docs/LEADERBOARDS_MODEL.md, docs/TEAM_LEADERBOARDS.md), one page since 19 Nov 2026:
  Recent form leads (each member's latest 20 Summoner's Rift games, ranked by win rate), the
  season's records and achievements follow (season records, multikills, milestones), with no views
  to switch between. The demo viewer is the Owner, an administrator without a player profile. The
  games are synthetic demo games, never real Riot data: every demo member has a full 20-game window,
  three of them share fourth place, and two members have too few recent games. The page places its
  four boards by its own width (one column under 59rem, Recent form across with the records beside
  the multikills from 59rem, two columns from 86rem: Recent form with the milestones under it, the
  records with the multikills under them); each board's rows follow the board's own width (Recent
  form: under 36rem, from 36rem, from 58rem; each record's cell: under 16rem, under 36rem, from
  36rem). The states the demo never shows (a provisional window, your own row, a shared first place,
  the viewer's best, a record nobody holds, the public boards) are checked as markup in
  recent-leaderboards.test.ts, records.test.ts and leaderboards-dashboard.test.ts; a member's page,
  with a best in every record cell, is measured here with that line drawn into the demo's cells.
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

/** "1st", "2nd", "4th", "11th": the place in words, as the page writes it (formatOrdinal). */
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** The board's inner width in rem (what its layout tiers measure). */
const boardRem = (page: Page) => page.getByTestId("form-board").evaluate((b) => b.clientWidth / parseFloat(getComputedStyle(document.documentElement).fontSize));

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
  const order = await page.evaluate(() => ["recent-form", "season-records", "multikills", "milestones"].map((id) => document.getElementById(id)!.getBoundingClientRect().top + window.scrollY));
  expect(order[0]!, "Recent form first").toBeLessThanOrEqual(Math.min(...order.slice(1)));
  await expect(page.locator("main h2")).toHaveText([/^Recent form/, "Season records", /^Multikills · Season \d{4}$/, "Milestones"]);
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
  await expect(toolbar.getByRole("link")).toHaveText(["Recent form", "Season records", "Multikills", "Milestones"]);
  await expect(page.getByTestId("toolbar-leaderboards-views")).toHaveCount(0);
  await toolbar.getByRole("link", { name: "Season records" }).click();
  await expect(page).toHaveURL(/#season-records$/);
  const tabs = (await page.getByTestId("team-tabs").boundingBox())!;
  await expect.poll(async () => (await page.locator("section#season-records").boundingBox())!.y).toBeGreaterThanOrEqual(tabs.y + tabs.height - 1);
  // Back at the top, the copy goes: the header's own index (or the one under it) is in view.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(toolbar).toHaveCount(0);
  await expect(page.locator("[data-testid=header-section-index]:visible, [data-testid=section-index]:visible")).toHaveCount(1);
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
  await expect(page.getByTestId("form-row").first().getByRole("img", { name: "First place" })).toBeVisible();
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
    if (width === 610 || width === 1440) await expect(roleWord, `${width}px: no role's name before the dates`).toBeHidden();
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
  // 1280×800 with the sidebar open keeps the one-line rows, the role named in its column.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-testid=form-row]")].map((row) => {
      const label = [...row.querySelectorAll<HTMLElement>("[data-testid=form-role] > span")].find((s) => /^(Top|Jungle|Mid|Bottom|Support)$/.test(s.textContent ?? ""));
      return { height: row.getBoundingClientRect().height, label: label ? label.getBoundingClientRect().width : 0 };
    }),
  );
  for (const r of wide) {
    expect(r.height).toBeLessThanOrEqual(56);
    expect(r.label, "the role's name shows").toBeGreaterThan(8);
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

test("members without enough recent games are the board's last group, each one press from the player (the Peek, or the profile without a main role), the name linked to their profile", async ({ page }) => {
  await open(page, BOARDS);
  const members = page.getByTestId("form-board").getByTestId("form-not-enough-member");
  // The demo's two, and any member another spec created before this one ran (no games yet): the
  // count depends on the order the specs run in, so only its floor is asserted.
  await expect(members.nth(1)).toBeVisible();
  expect(await members.count()).toBeGreaterThanOrEqual(2);
  for (const m of await members.all()) {
    await expect(m.getByTestId("card-name")).toHaveCount(1);
    // The row's own link: the player Peek for a member with a main role, else (none chosen yet: the demo's two) their profile.
    await expect(m.locator("a[data-row-link][href*='?player='], a[data-row-link][href^='/players/']")).toHaveCount(1);
    await expect(m.locator("a[data-testid=board-member-profile][href^='/players/']")).toHaveCount(1);
    // What the eye reads (screen readers hear a comma for the dot); the dot is held to its words by no-break spaces (\s).
    const shown = await m.evaluate((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelectorAll(".sr-only").forEach((s) => s.remove());
      return copy.textContent ?? "";
    });
    expect(shown).toMatch(/Needs \d+ more games?\s·\s(last game \d{1,2} [A-Z][a-z]{2} \d{4}|no games yet)/);
  }
  // Rows of 64px on a narrow board; chips from 36rem.
  const inner = await boardRem(page);
  for (const h of await members.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
    if (inner < 36) expect(h).toBeGreaterThanOrEqual(64);
    else expect(h).toBeLessThanOrEqual(48);
  }
});

test("the data status ends the scope line, and never takes a line of its own", async ({ page }, info) => {
  await open(page, BOARDS);
  await expect(page.getByTestId("scope-label").getByTestId("leaderboards-status")).toHaveCount(1);
  test.skip(info.project.name !== "phone", "the narrow widths are the phone's");
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 667 });
    const count = (await page.getByTestId("scope-count").boundingBox())!;
    const status = (await page.getByTestId("leaderboards-status").boundingBox())!;
    expect(Math.abs(count.y + count.height / 2 - (status.y + status.height / 2)), `${width}px: the ⓘ beside the member count`).toBeLessThanOrEqual(6);
  }
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

test("the season records: seven cells in one panel, each opening its game; the multikill score's ranking and the most of each kind; milestones", async ({ page }) => {
  // The cells' games are not prefetched (each would be a server render of its own, on every visit): only a click asks for one.
  const prefetched: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (/^\/players\/[^/]+\/matches$/.test(url.pathname) && (url.searchParams.has("_rsc") || r.headers()["rsc"] === "1")) prefetched.push(url.search);
  });
  await openRecords(page);
  // One panel holding the seven records: each record's qualifier says what it counts, the scope line how ties go (no ⓘ of definitions).
  const book = page.getByTestId("records-book");
  await expect(book.getByTestId("season-record")).toHaveCount(7);
  await expect(page.getByTestId("season-record")).toHaveCount(7);
  // One lead card on the page, Recent form's: the records are a plain panel beside or after it.
  await expect(book).not.toHaveClass(/surface-lead/);
  await expect(page.locator("main .surface-lead")).toHaveCount(1);
  await expect(page.getByTestId("form-board")).toHaveClass(/surface-lead/);
  await expect(page.getByTestId("records-scope")).toHaveText(/^Season \d{4} · All supported games · [\d,]+ games · ties: first to set it$/);
  await expect(book.getByTestId("records-definitions")).toHaveCount(0);
  // Each record's qualifier on its row.
  await expect(book.locator("[data-record=damage-per-minute] [data-testid=record-qualifier]")).toContainText("to champions · 15+ min games");
  await expect(book.locator("[data-record=cs-per-minute] [data-testid=record-qualifier]")).toContainText("15+ min games");
  await expect(book.locator("[data-record=kda] [data-testid=record-qualifier]")).toContainText("10+ takedowns");
  await expect(book.locator("[data-record=win-streak] [data-testid=record-qualifier]")).toContainText("in game order");
  // A record set on a champion leads with that champion's portrait, at least 44px.
  const portrait = page.locator("[data-testid=season-record][data-record=kills] [data-testid=record-picture]").locator("img, [role=img]").first();
  await expect(portrait).toBeVisible();
  expect((await portrait.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // Each cell's row follows the cell's own width: from 40rem two lines beside its 48px picture (the
  // record and its qualifier over the holder, champion, role, K/D/A and date: at most 4.5rem, 72px at
  // 100%); under 36rem three lines (at most 6rem, 96px at 100%), or 7rem (112px) where the qualifier
  // starts a line of its own. Between 36 and 40rem the damage record's qualifier may take a line of
  // its own (about 78px), so neither bound applies there.
  for (const c of await recordCells(page)) {
    if (c.rem >= 40) expect(c.rowRem, `${c.id}: a record in a ${c.rem.toFixed(1)}rem cell, two lines`).toBeLessThanOrEqual(4.5);
    // From a 20rem cell the value sits top right over its unit (one value position: UD.L2), so a long record's words may take a
    // second line beside it: the damage record, with its qualifier on lines of its own, at most 8rem.
    else if (c.rem < 36) expect(c.rowRem, `${c.id}: a record in a ${c.rem.toFixed(1)}rem cell, three lines`).toBeLessThanOrEqual(c.ownLine ? (c.rem >= 20 ? 8 : 7) : 6);
  }
  // The multikill board: ranked by the score (as shown), places shared on equal scores, the crown on first; each row's kinds
  // in words are Riot's own counts, rarest first (the demo's comparison players make the score role-adjusted).
  const multis = await page.getByTestId("multikill-row").evaluateAll((els) =>
    els.map((e) => ({
      status: e.getAttribute("data-status"),
      place: Number(e.getAttribute("data-place") ?? 0),
      score: Number(e.getAttribute("data-score") ?? -1),
      counts: ["data-penta", "data-quadra", "data-triple", "data-double"].map((k) => Number(e.getAttribute(k))),
      riot: (e.getAttribute("data-riot") ?? "").split(",").map(Number),
      counted: Number(e.getAttribute("data-counted")),
      kinds: [...e.querySelectorAll<HTMLElement>("[data-testid=multikill-kinds] [data-kind]")].map((k) => k.textContent),
      crown: !!e.querySelector("[aria-label='First place']"),
      scoreShown: e.querySelector("[data-testid=multikill-score]") !== null,
    })),
  );
  // The demo keeps Riot's counters nested (a pentakill also counts a double, a triple and a quadra), and the board says it reads them so.
  await expect(page.getByTestId("multikill-explain")).toHaveAccessibleDescription(/Riot's own counters also count a pentakill's double, triple and quadra; this board counts and shows each multikill once\./);
  const ranked = multis.filter((m) => m.status === "ranked");
  expect(ranked.length).toBeGreaterThan(2);
  for (let i = 1; i < ranked.length; i++) {
    expect(ranked[i]!.score, "ranked by the score").toBeLessThanOrEqual(ranked[i - 1]!.score);
    expect(ranked[i]!.place === ranked[i - 1]!.place, "a place is shared exactly when the scores read the same").toBe(ranked[i]!.score === ranked[i - 1]!.score);
  }
  expect(ranked[0]!.crown && ranked[0]!.place === 1).toBe(true);
  for (const m of multis) {
    // Shown: each multikill once, at its largest (doubles − triples …), never Riot's nested counters as they are.
    const [d, t, q, p] = m.riot as [number, number, number, number];
    expect(m.counts, "each multikill once, from Riot's nested counters").toEqual([p, Math.max(0, q - p), Math.max(0, t - q), Math.max(0, d - t)]);
    const words = ["penta", "quadra", "triple", "double"].flatMap((w, i) => (m.counts[i]! > 0 ? [`${m.counts[i]} ${w}${m.counts[i] === 1 ? "" : "s"}`] : []));
    expect(m.kinds, "the counts in words, rarest first").toEqual(words);
  }
  // Every group on the demo: ranked (20+ games with counts), provisional (10–19, place "–", a score), too few (under 10, no score).
  const provisional = multis.filter((m) => m.status === "provisional");
  const few = multis.filter((m) => m.status === "not-enough");
  expect(provisional.length).toBeGreaterThan(0);
  expect(few.length).toBeGreaterThan(0);
  for (const m of ranked) expect(m.counted).toBeGreaterThanOrEqual(20);
  for (const m of provisional) expect(m.counted >= 10 && m.counted < 20 && m.scoreShown && m.place === 0).toBe(true);
  for (const m of few) expect(m.counted < 10 && !m.scoreShown).toBe(true);
  await expect(page.getByTestId("multikill-unplaced-head")).toHaveText(/^Not placed yet\s·\sunder 20 games with multikill counts$/);
  await expect(page.getByTestId("multikill-unplaced").getByTestId("multikill-row")).toHaveCount(provisional.length + few.length);
  await expect(page.locator("[data-testid=multikill-row][data-status=not-enough] [data-testid=multikill-no-score]").first()).toHaveText("No score yet");
  expect(multis.map((m) => m.status), "ranked, then provisional, then too few").toEqual([...ranked, ...provisional, ...few].map((m) => m.status));
  await expect(page.getByTestId("multikill-basis")).toHaveText("Per game, against the same roles and champions · 100 is usual");
  await expect(page.getByTestId("multikill-explain")).toHaveAccessibleDescription(/each member's multikills per game against what the other players in the same games made on the same roles and champions \(allies and opponents, never a team member: [\d,]+ of their games\)/);
  // Three short points behind the ⓘ (each a line of its own), and the coverage after them.
  expect(await page.getByTestId("records-multikills").getByTestId("multikill-explain-point").count()).toBeGreaterThanOrEqual(3);
  // The most of each kind, double to penta: each with its count and holder(s), each multikill once.
  const most = page.getByTestId("multikill-most-kind");
  await expect(most).toHaveCount(4);
  const best = (i: number) => Math.max(...multis.map((m) => m.counts[i]!));
  for (const [kind, i] of [["double", 3], ["triple", 2], ["quadra", 1], ["penta", 0]] as const) {
    const tile = page.locator(`[data-testid=multikill-most-kind][data-kind=${kind}]`);
    if (best(i) > 0) await expect(tile.getByTestId("multikill-most-count")).toHaveText(String(best(i)));
    else await expect(tile).toContainText("None yet");
  }
  await expect(page.getByTestId("milestones-mastery").getByTestId("milestone-member").first()).toBeVisible();
  // A member's name on the multikills keeps a line's room at every width: whole words, at most two
  // lines, never a letter a line.
  const names = await page.getByTestId("multikill-row").evaluateAll((rows) =>
    rows.map((row) => {
      const name = row.querySelector<HTMLElement>("[data-testid=card-name]")!;
      const box = name.getBoundingClientRect();
      // The room is the member cell's name column (what a long name may fill), not the name's own box: a short name is narrower than its room.
      const column = row.querySelector<HTMLElement>("[data-testid=board-member-name]")!;
      return { name: name.textContent, room: column.getBoundingClientRect().width, lines: Math.round(box.height / parseFloat(getComputedStyle(name).lineHeight)), inside: box.right <= row.getBoundingClientRect().right + 0.5, cut: name.scrollWidth > name.clientWidth + 1 };
    }),
  );
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) {
    expect(n.room, `${n.name}: room for a name`).toBeGreaterThanOrEqual(80);
    expect(n.lines, `${n.name}: at most two lines`).toBeLessThanOrEqual(2);
    expect(n.inside, `${n.name}: inside its row`).toBe(true);
    expect(n.cut, `${n.name}: whole`).toBe(false);
  }
  // Two cells side by side start level: each at its own top padding, the shorter not centred in the
  // taller's row (the design review's G1-4: 18px lower).
  const tops = await page.getByTestId("season-record").evaluateAll((rows) => rows.map((r) => [Math.round(r.closest("li")!.getBoundingClientRect().top), r.querySelector("[data-testid=record-label]")!.getBoundingClientRect().top - r.getBoundingClientRect().top]));
  for (const [row, offset] of tops) for (const [other, o] of tops) if (row === other) expect(Math.abs(offset! - o!), "level with the cell beside it").toBeLessThanOrEqual(1);
  // Compact rows: two lines (about 46px), a member with all four kinds a third where they wrap; never taller (G1-10's names on one line at 1440).
  for (const h of await page.getByTestId("multikill-row").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h, "a multikill row").toBeLessThanOrEqual(test.info().project.name === "desktop" ? 64 : 66);
  // The milestones' figures as format.ts shortens them (486K), the rest of a member's counted, what
  // counts behind each kind's ⓘ.
  await expect(page.getByTestId("milestones-mastery").getByTestId("milestone-figure").first()).toHaveText(/^\d+(\.\d)?[KM]$/);
  await expect(page.getByTestId("milestones-mastery").getByTestId("milestone-more").first()).toHaveText(/^\+\d+and \d+ more on their profile$/);
  await expect(page.getByTestId("milestones-mastery-hint")).toHaveAccessibleDescription(/100K, 500K or 1M mastery points/);
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
  // A click on the row's figure, not on its words: the link covers the whole row (no link is drawn there).
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
  // Opened again and closed with Escape (✕ on a phone's window): the board, unmoved, and the focus on the row.
  await page.mouse.click(value.x + value.width / 2, value.y + value.height / 2);
  await expect(peek.getByTestId("record-game-history")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/leaderboards$/);
  await expect(peek).toBeHidden();
  await expect(kills.locator("[data-row-link]")).toBeFocused();
  // The shared list's row links: on a touch screen each covers its row's dividing line too, so none
  // is under 44px (43 before: Release 7's report); with a mouse each is its row inside the line, as
  // before, and the dense rows keep their 44px minimum (the rows' heights are not the links' to set).
  const links = await page.locator("main [data-row-link]").evaluateAll((els) =>
    els
      .filter((e) => e.getBoundingClientRect().height > 0)
      .map((e) => ({ link: e.getBoundingClientRect().height, inside: e.parentElement!.clientHeight, row: e.parentElement!.getBoundingClientRect().height, minimum: parseFloat(getComputedStyle(e.parentElement!).minHeight) || 0, testId: e.parentElement!.dataset.testid ?? "" })),
  );
  expect(links.length).toBeGreaterThan(10);
  const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  for (const l of links) {
    if (touch) expect(Math.round(l.link), `${l.testId}: its link on a touch screen`).toBeGreaterThanOrEqual(44);
    else expect(Math.round(l.link), `${l.testId}: a mouse's link is the row inside its line`).toBe(Math.round(l.inside));
    if (l.testId === "multikill-row" || l.testId === "milestone-member") expect(l.minimum, `${l.testId}: the dense row's minimum`).toBe(44);
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
    };
  });

/**
 * A member's own bests, as a member with a best on every record sees them ("Your best: 9 · 4 Oct
 * 2026", where its holder sees "You hold this record"): the demo's viewer has no player profile, so
 * no cell carries one. Each cell gets the line RecordRow draws (record-yours.ts): a fourth line in a
 * narrow cell, under the value from 36rem.
 */
const addOwnBests = (page: Page) =>
  page.evaluate(
    ({ line, value }) => {
      for (const row of document.querySelectorAll("[data-testid=season-record]")) {
        const yours = document.createElement("span");
        yours.dataset.testid = "record-yours";
        yours.className = line;
        const figure = document.createElement("span");
        figure.className = value;
        figure.textContent = "9";
        yours.append("Your best: ", figure, " · 4 Oct 2026");
        row.append(yours);
      }
    },
    { line: RECORD_YOURS, value: RECORD_YOURS_VALUE },
  );

test("the page's own width places its boards: Recent form across with the records beside the multikills at 1280 and 1440; from 86rem two columns, each board under the one before it in its own (a member's bests included), every ranking row and record on the first screen, the achievements starting on it", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "explicit window sizes");
  test.setTimeout(180_000);
  for (const sidebar of ["expanded", "collapsed"] as const) {
    await context.addCookies([{ name: "uniiverse_sidebar", value: sidebar, url: baseURL! }]);
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
      // A 14-inch MacBook Pro's window: with the sidebar folded the page is 86rem, where the two columns start.
      [1512, 945],
      [1920, 1080],
      [2560, 1440],
      [3440, 1440],
    ] as const) {
      await page.setViewportSize({ width, height });
      await openRecords(page);
      const f = await boards(page);
      const at = `${width} × ${height}, sidebar ${sidebar} (a ${f.page.toFixed(1)}rem page)`;
      // A short board never stretches beside a tall one; nothing is wider than the window.
      await noOverflow(page);
      if (f.page >= 86) {
        /** Two columns: Recent form, the milestones under it; the records beside it, the multikills under them; each board under the one before it, the gap apart. */
        const columns = (g: Awaited<ReturnType<typeof boards>>, who: string) => {
          expect(Math.abs(g.form.top - g.records.top), `${who}: the records beside Recent form`).toBeLessThanOrEqual(1);
          expect(g.records.left, `${who}`).toBeGreaterThan(g.form.right);
          expect(Math.abs(g.milestones.left - g.form.left) + Math.abs(g.milestones.right - g.form.right), `${who}: the milestones in Recent form's column`).toBeLessThanOrEqual(1);
          expect(Math.abs(g.milestones.top - g.form.bottom - g.gap), `${who}: the milestones right under Recent form, whatever the records' height`).toBeLessThanOrEqual(1);
          expect(Math.abs(g.multikills.left - g.records.left) + Math.abs(g.multikills.right - g.records.right), `${who}: the multikills in the records' column`).toBeLessThanOrEqual(1);
          expect(Math.abs(g.multikills.top - g.records.bottom - g.gap), `${who}: the multikills right under the records`).toBeLessThanOrEqual(1);
          // Every ranking row and record on the first screen, and the achievements start on it. (Where their last rows fall depends
          // on how many members the demo has by then: other specs add members, each a chip in Recent form's last group.)
          for (const b of [...g.formRows, ...g.recordRows]) expect(b, `${who}: on the first screen`).toBeLessThanOrEqual(g.window);
          expect(Math.min(g.multikills.top, g.milestones.top), `${who}: the achievements start on the first screen`).toBeLessThan(g.window);
        };
        columns(f, at);
        // Recent form keeps its one-line rows: its wide tier (eight columns), with its board's room inside its border at least 58rem.
        expect(f.formTracks, `${at}: Recent form's one-line rows`).toBe(8);
        await expect(page.getByTestId("form-heads").getByText("To the place above"), at).toBeVisible();
        expect((f.form.width - 2) / f.rem, `${at}: Recent form's board at least 58rem inside its border`).toBeGreaterThanOrEqual(58);
        // As a member sees it, with their own best on every record: taller cells where they are narrow lengthen the records'
        // column alone, and nothing waits under Recent form for them.
        await addOwnBests(page);
        const member = await boards(page);
        expect(member.records.height, `${at}: a member's records panel is no shorter`).toBeGreaterThanOrEqual(f.records.height);
        expect(Math.abs(member.form.bottom - f.form.bottom), `${at}: Recent form as it was`).toBeLessThanOrEqual(1);
        columns(member, `${at}, a member's bests`);
      } else {
        // Recent form across the page (at most the measure), the records beside the multikills, the milestones under the
        // multikills in their column (UD.L2), straight under them whatever the records' height.
        expect(f.records.top, `${at}: the records under Recent form`).toBeGreaterThanOrEqual(f.form.bottom);
        expect(Math.abs(f.records.top - f.multikills.top), `${at}: the records beside the multikills`).toBeLessThanOrEqual(1);
        expect(f.multikills.left, `${at}`).toBeGreaterThan(f.records.right);
        expect(Math.abs(f.milestones.left - f.multikills.left), `${at}: the milestones in the multikills' column`).toBeLessThanOrEqual(1);
        expect(f.milestones.top - f.multikills.bottom, `${at}: straight under the multikills`).toBeGreaterThanOrEqual(0);
        expect(f.milestones.top - f.multikills.bottom, `${at}: straight under the multikills`).toBeLessThanOrEqual(25);
        // The index at the header's end: reachable with no scroll to a section's top (UD.L1).
        await expect(page.getByTestId("header-section-index")).toBeVisible();
        // The ranking whole on the first screen.
        for (const b of f.formRows) expect(b, `${at}: every ranking row on the first screen`).toBeLessThanOrEqual(f.window);
      }
    }
  }
});

test("on a phone: one column, the index of the sections below Recent form jumping to each under the top bar, three-line records, chips without names, compact multikill rows", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone's column");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openRecords(page);
  // One column, in reading order: the header, the index, Recent form, the records, the multikills, the milestones.
  const tops = await page.evaluate(() => ["section-index", "form-board", "records-book", "records-multikills", "records-milestones"].map((id) => document.querySelector(`[data-testid=${id}]`)!.getBoundingClientRect()));
  for (let i = 1; i < tops.length; i++) expect(tops[i]!.top, "one column, in order").toBeGreaterThanOrEqual(tops[i - 1]!.bottom - 1);
  for (const t of tops) expect(Math.abs(t.left - tops[0]!.left)).toBeLessThanOrEqual(1);
  // Each record: its words over the holder (the figure at that line's end) over the game, the picture beside them.
  const kills = page.locator("[data-testid=season-record][data-record=kills]");
  const [title, holder, game, value] = await Promise.all(["record-title", "record-holder", "record-context", "record-value"].map((id) => kills.getByTestId(id).boundingBox()));
  expect(holder!.y, "the holder under the record").toBeGreaterThanOrEqual(title!.y + title!.height - 1);
  expect(game!.y, "the game under the holder").toBeGreaterThanOrEqual(holder!.y + holder!.height - 1);
  // The value: at the record's line's top right from a 20rem cell (one value position in every cell), else on the holder's line.
  const cellRem = await kills.evaluate((el) => el.closest("li")!.clientWidth / parseFloat(getComputedStyle(document.documentElement).fontSize));
  const line = cellRem >= 20 ? title! : holder!;
  expect(Math.abs(value!.y - line.y), cellRem >= 20 ? "the value at the record's line" : "the value on the holder's line").toBeLessThanOrEqual(cellRem >= 20 ? 3 : 12);
  // Every record: three lines, at most 96px; a qualifier that starts a line of its own (the demo's
  // damage record at 375px) adds one, at most 112px. One column of cells.
  const cells = await recordCells(page);
  expect(cells).toHaveLength(7);
  for (const c of cells) {
    expect(c.rem, `${c.id}: a phone's cell is under 36rem`).toBeLessThan(36);
    expect(c.height, `${c.id}: ${c.ownLine ? "its qualifier on a line of its own" : "three lines"}`).toBeLessThanOrEqual(c.ownLine ? (c.rem >= 20 ? 128 : 112) : 96);
  }
  // The index: the sections below Recent form, each jump an entry of the page's own, the section under the top bar and focused.
  const index = page.getByTestId("section-index");
  await expect(index.getByRole("link")).toHaveText(["Season records", "Multikills", "Milestones"]);
  for (const [name, id] of [["Milestones", "milestones"], ["Multikills", "multikills"], ["Season records", "season-records"]] as const) {
    // Chromium has the Navigation API, so each jump pushes an entry (the phone's Back steps past it).
    const entries = await page.evaluate(() => history.length);
    await index.getByRole("link", { name }).tap();
    await expect(page).toHaveURL(new RegExp(`/leaderboards#${id}$`));
    await expect.poll(() => page.evaluate(() => history.length), { message: `${name}: an entry of the page's own` }).toBe(entries + 1);
    const section = page.locator(`section#${id}`);
    await expect(section).toBeFocused();
    // Under the bar as it is once landed (under 700px tall its first row slides away as the page scrolls down, the sections row staying).
    const barFoot = () => page.getByTestId("mobile-topbar").evaluate((b) => b.getBoundingClientRect().bottom);
    const under = async () => (await section.boundingBox())!.y - (await barFoot());
    await expect.poll(under, { message: `${name}: under the top bar` }).toBeGreaterThanOrEqual(-1);
    await page.waitForTimeout(300);
    // The header has gone up, so the 44px chip row is pinned at the bar's foot, and the section stops clear of it too.
    const chips = page.getByTestId("leaderboards-chip-row");
    await expect(chips).toBeVisible();
    const row = (await chips.boundingBox())!;
    expect(Math.abs(row.y - (await barFoot())), `${name}: the chip row at the top bar's foot`).toBeLessThanOrEqual(1);
    expect((await section.boundingBox())!.y, `${name}: clear of the chip row`).toBeGreaterThanOrEqual(row.y + row.height - 1);
    // Just under it, unless the page ends before it can bring the section there (the milestones, last).
    const atEnd = await page.evaluate(() => window.scrollY + innerHeight >= document.documentElement.scrollHeight - 2);
    if (!atEnd) expect((await section.boundingBox())!.y, `${name}: just under it`).toBeLessThanOrEqual(row.y + row.height + 24);
    for (const h of await chips.getByRole("link").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h, "44px chips").toBeGreaterThanOrEqual(44);
    await expect(chips.locator("[aria-current=location]")).toHaveText(name === "Season records" ? "Records" : name);
    // Back to the index for the next jump: the chip row goes with the header back in view.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId("leaderboards-chip-row")).toHaveCount(0);
  }
  // Milestone chips: the champion's portrait and the figure, its name for screen readers only (D6).
  const chip = page.getByTestId("milestones-mastery").getByTestId("milestone").first();
  expect((await chip.getByTestId("milestone-champion").boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
  await expect(chip.getByTestId("milestone-figure")).toBeVisible();
  // The top milestone and "+N" on the member's line.
  const chipTops = await page.getByTestId("milestones-mastery").getByTestId("milestone-member").first().locator("[data-testid=milestone], [data-testid=milestone-more]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2));
  expect(Math.max(...chipTops) - Math.min(...chipTops), "one line of chips").toBeLessThanOrEqual(4);
  const memberName = (await page.getByTestId("milestones-mastery").getByTestId("milestone-member").first().locator("[data-testid=member-name], a").first().boundingBox())!;
  expect(Math.abs(chipTops[0]! - (memberName.y + memberName.height / 2)), "beside the name").toBeLessThanOrEqual(6);
  // The multikill board on a phone: no column headings; each row the place, picture, name over its kinds in words, and the
  // score at the row's end, beside the name, over its games; the most of each kind two by two under the ranking.
  const multikills = page.getByTestId("records-multikills");
  await expect(multikills.locator(".label-caps")).toHaveCount(0);
  for (const row of await page.locator("[data-testid=multikill-row]:has([data-testid=multikill-score])").all()) {
    type Box = { x: number; y: number; width: number; height: number };
    const [name, kinds, score, games, avatar] = (await Promise.all([row.getByTestId("board-member-name"), row.getByTestId("multikill-kinds"), row.getByTestId("multikill-score"), row.getByTestId("multikill-games"), row.locator("[data-avatar-frame]")].map(async (l) => (await l.boundingBox())!))) as [Box, Box, Box, Box, Box];
    expect(kinds.y, "the kinds under the name").toBeGreaterThanOrEqual(name.y + name.height - 1);
    expect(kinds.y - (name.y + name.height), "right under it, no gap between them").toBeLessThanOrEqual(4);
    expect(score.x, "the score at the row's end").toBeGreaterThan(name.x + name.width - 1);
    // The score and its games centred on the row, as the place and the picture are (a row whose kinds wrap is a line taller).
    const rowBox = (await row.boundingBox())!;
    expect(Math.abs((score.y + games.y + games.height) / 2 - (rowBox.y + rowBox.height / 2)), "the score and its games centred on the row").toBeLessThanOrEqual(3);
    expect(games.y, "its games under the score").toBeGreaterThanOrEqual(score.y + score.height - 1);
    expect(avatar.x + avatar.width, "the picture before the name").toBeLessThanOrEqual(name.x + 1);
  }
  const tiles = await page.getByTestId("multikill-most-kind").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.top), Math.round(r.left)]));
  expect(new Set(tiles.map((t) => t[0])).size, "two rows of tiles").toBe(2);
  await noOverflow(page);
});

test("tablet: one column, the season records two to a row, the streak across both, the index of the sections below Recent form", async ({ page }, info) => {
  test.skip(info.project.name !== "tablet", "a tablet's column");
  await openRecords(page);
  await expect(page.getByTestId("section-index")).toBeVisible();
  const cells = await page.getByTestId("season-record").evaluateAll((rows) => rows.map((r) => r.closest("li")!.getBoundingClientRect()));
  expect(cells).toHaveLength(7);
  // Two columns: the first six in three rows of two, the seventh across both.
  for (let i = 0; i < 6; i += 2) {
    expect(Math.abs(cells[i]!.top - cells[i + 1]!.top), `cells ${i + 1} and ${i + 2} side by side`).toBeLessThanOrEqual(1);
    expect(cells[i + 1]!.left).toBeGreaterThan(cells[i]!.right - 1);
  }
  expect(cells[6]!.width, "the streak across both columns").toBeGreaterThanOrEqual(cells[1]!.right - cells[0]!.left - 1);
  // Recent form across the page, then the records, the multikills and the milestones under each other.
  const f = await boards(page);
  expect(f.records.top).toBeGreaterThanOrEqual(f.form.bottom);
  expect(f.multikills.top).toBeGreaterThanOrEqual(f.records.bottom);
  expect(f.milestones.top).toBeGreaterThanOrEqual(f.multikills.bottom);
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
      else await page.locator('[data-testid=season-record][data-record="kills"] [data-row-link]').click();
      await expect(page).toHaveURL(what === "player" ? /\/leaderboards\?player=/ : /\/leaderboards\?match=/);
    }
    expect(await page.evaluate(() => history.length), `${order.join(" then ")}: one entry for the Peek`).toBe(before + 1);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/leaderboards$/);
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/matches$/);
});

test("a multikill row opens the player Peek led by the member's multikills: the score and its chance spread, each kind made over its usual (tap or click, the same on every device)", async ({ page }) => {
  await openRecords(page);
  const row = page.locator("[data-testid=multikill-row][data-status=ranked]").first();
  const score = await row.getAttribute("data-score");
  const counts = await row.evaluate((e) => ["data-double", "data-triple", "data-quadra", "data-penta"].map((k) => e.getAttribute(k)));
  // In the middle of the screen, clear of the pinned chip row and the tab bar.
  await row.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  const opener = row.getByTestId("board-peek-open");
  // On the place, clear of the name (a link of its own to the profile, above the row's press).
  if (test.info().project.name === "phone") await opener.tap({ position: { x: 12, y: 12 } });
  else await opener.click({ position: { x: 12, y: 12 } });
  await expect(page).toHaveURL(/\/leaderboards\?player=/);
  const detail = page.getByTestId("peek-multikills");
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId("peek-multikills-score")).toContainText(new RegExp(`^${score}\\s*multikill score.*±\\d+`));
  // Each kind made (each multikill once, the row's own counts) over its usual for their roles and champions.
  expect(await detail.getByTestId("peek-multikills-made").allTextContents()).toEqual(counts);
  await expect(detail.getByTestId("peek-multikills-usual")).toHaveCount(4);
  await expect(detail.getByTestId("peek-multikills-note")).toContainText("each multikill once, at its largest · usual for their roles and champions");
  // Within the screen, and the page no wider than it.
  const box = (await detail.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/leaderboards$/);
});
