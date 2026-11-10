import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "./test";

/*
  Team Leaderboards (docs/LEADERBOARDS_MODEL.md): Recent form, each member's latest 20 Summoner's
  Rift games ranked by win rate, and Records & achievements for the season. The demo viewer is the
  Owner, an administrator without a player profile. The games are synthetic demo games, never real
  Riot data: every demo member has a full 20-game window, three of them share fourth place, and two
  members have too few recent games. The board's layout follows its own width (DataList's tiers:
  under 36rem, from 36rem, from 58rem); the states the demo never shows (a provisional window, your
  own row, a shared first place) are checked as markup in recent-leaderboards.test.ts.
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

test("Recent form is the default view, with the team's data status beside it", async ({ page }) => {
  await open(page, BOARDS);
  await expect(page.getByTestId("leaderboards-tab-form")).toHaveAttribute("aria-current", "page");
  // Today's categories, filters and the admins' preview banner are gone.
  await expect(page.getByTestId("leaderboard-categories")).toHaveCount(0);
  await expect(page.getByTestId("leaderboards-preview")).toHaveCount(0);
  // How fresh the boards are: the team's status behind one ⓘ under the title, as on a profile.
  await expect(page.getByTestId("leaderboards-status-info")).toBeVisible();
  // An old address (today's category or filters) opens the boards, ignoring what it asked for.
  await open(page, "/leaderboards?category=combat&metric=kda&queue=solo&lineup=1");
  await expect(page.getByTestId("leaderboards-tab-form")).toHaveAttribute("aria-current", "page");
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

test("Recent form ranks every full 20-game window by win rate, shared places and gaps in wins", async ({ page }) => {
  await open(page, BOARDS);
  await expect(page.getByTestId("scope-label")).toHaveText(/Latest 20 games from the last 60 days/);
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
  for (const r of ranked.filter((x) => x.place > 1 && ranked.some((o) => o.rate > x.rate))) expect(r.note).toMatch(/^(\d+ wins? behind|Win your next game to draw level with) /);
  // The gap shows short (D5), the sentence stays for screen readers: first place "—"; every other
  // place "k wins behind" (k = the gap in win rate over 5 points a win) or "Next win: N=", the place
  // one win would share (5 points short of it, and the sentence says the next win draws level).
  expect(ranked[0]!.token).toBe("—");
  for (const r of ranked.filter((x) => ranked.some((o) => o.rate > x.rate))) {
    expect(r.token).toMatch(/^(\d+ wins? behind|Next win: \d+=)$/);
    expect(r.tokenHidden, `${r.token}: the short gap is not read out`).toBe(true);
    const above = Math.min(...ranked.filter((o) => o.rate > r.rate).map((o) => o.rate));
    const level = /^Next win: (\d+)=$/.exec(r.token!);
    if (level) {
      expect(Number(level[1])).toBe(ranked.find((o) => o.rate === above)!.place);
      expect(above - r.rate).toBe(5);
      expect(r.note).toMatch(/^Win your next game to draw level with /);
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
  // Each row's bar counts its 20 games, wins first, and is hidden from screen readers (the record says it).
  for (const r of ranked) {
    expect(r.bars).toBe(1);
    expect(r.bar).toEqual({ segments: 20, filled: r.wins, known: 20, parts: 20, hidden: true });
  }
  // The board stops at the measure (72rem) and keeps the header's left edge.
  const edge = await page.evaluate(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const board = document.querySelector("[data-testid=form-board]")!.getBoundingClientRect();
    const views = document.querySelector("[data-testid=leaderboards-views]")!.getBoundingClientRect();
    return { width: board.width, measure: 72 * rem, left: board.left, header: views.left };
  });
  expect(edge.width).toBeLessThanOrEqual(edge.measure + 1);
  expect(Math.abs(edge.left - edge.header)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("form-row").first().getByRole("img", { name: "First place" })).toBeVisible();
  await expect(page.getByTestId("form-footnote")).toContainText("places within 2 wins of each other are close");
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

test("the board's layout follows its own width: four, six or eight columns, never cut or wider than the page", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "explicit window sizes, either side of each tier");
  test.setTimeout(120_000);
  await open(page, BOARDS);
  // 608–612px: a phone-width board either side of 36rem; 1248–1252px: either side of 58rem beside the open sidebar.
  for (const width of [608, 610, 612, 1248, 1250, 1252, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
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
      const views = document.querySelector("[data-testid=leaderboards-views]")!.getBoundingClientRect();
      return { width: board.width, measure: 72 * rem, left: board.left, header: views.left };
    });
    expect(edge.width, `${width}px`).toBeLessThanOrEqual(edge.measure + 1);
    expect(Math.abs(edge.left - edge.header), `${width}px`).toBeLessThanOrEqual(1);
  }
});

test("members without enough recent games are the board's last group, each linked to their profile", async ({ page }) => {
  await open(page, BOARDS);
  const members = page.getByTestId("form-board").getByTestId("form-not-enough-member");
  await expect(members).toHaveCount(2);
  for (const m of await members.all()) {
    await expect(m.getByTestId("card-name")).toHaveCount(1);
    await expect(m.locator("a[data-row-link][href^='/players/']")).toHaveCount(1);
    // What the eye reads (screen readers hear a comma for the dot).
    const shown = await m.evaluate((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelectorAll(".sr-only").forEach((s) => s.remove());
      return copy.textContent ?? "";
    });
    expect(shown).toMatch(/Needs \d+ more games? · (last game \d{1,2} [A-Z][a-z]{2} \d{4}|no games yet)/);
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

test("Records & achievements: season records open their game, multikills rarest first, milestones", async ({ page }) => {
  await open(page, BOARDS);
  await page.getByTestId("leaderboards-tab-records").click();
  await expect(page).toHaveURL(/\/leaderboards\?view=records/);
  await expect(page.getByTestId("records-volume-note")).toContainText("reward playing more");
  await expect(page.getByTestId("season-record")).toHaveCount(7);
  // A record set on a champion leads with that champion's portrait, beside the figure, at the size of a pool row's.
  const portrait = page.locator("[data-testid=season-record][data-record=kills] img, [data-testid=season-record][data-record=kills] [role=img]").first();
  await expect(portrait).toBeVisible();
  expect((await portrait.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const multis = await page.getByTestId("multikill-row").evaluateAll((els) => els.map((e) => ["data-penta", "data-quadra", "data-triple"].map((k) => Number(e.getAttribute(k)))));
  expect(multis.length).toBeGreaterThan(0);
  const key = (m: number[]) => m[0]! * 1e6 + m[1]! * 1e3 + m[2]!;
  for (let i = 1; i < multis.length; i++) expect(key(multis[i]!)).toBeLessThanOrEqual(key(multis[i - 1]!));
  await expect(page.getByTestId("milestones-mastery").getByTestId("milestone-member").first()).toBeVisible();
  // A member's name on the multikills table keeps a line's room at every width: whole words, at most
  // two lines, never a letter a line (on phones the member takes the row's first line, the figures the second).
  await page.evaluate(() => document.fonts.ready);
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
  await noOverflow(page);
  await axe(page, "[data-testid=records]");
  // A record opens its game in the holder's Match History (under its card, or in the match window).
  const kills = page.locator('[data-testid=season-record][data-record="kills"]');
  await expect(kills).toHaveAttribute("href", /^\/players\/[^/]+\/matches\?match=/);
  await kills.click();
  await expect(page).toHaveURL(/\/players\/[^/]+\/matches\?match=/);
  await expect(page.locator("[data-testid=match-detail], [data-testid=match-breakdown]").first()).toBeVisible();
});
