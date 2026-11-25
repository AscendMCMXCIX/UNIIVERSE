import { devices, expect, test, type Browser, type Locator, type Page } from "./test";
import { rosterRowLines } from "../scripts/roster-lines.mjs";
import { choosePassword, createMember } from "./member-account";
import { closeFilterSheet, openFilterBar } from "./filters";
import { playerEntry } from "./players";

/*
  THE PLAYERS ROSTER: ONE PANEL OF ROWS, EVERY ROW WHOLE. Each player is one row of one panel at
  every width (docs/MOBILE.md: lists are rows in one panel), laid out one, two or three across by the
  roster's own width, so 15 to 25 players stay within about a screen on tablets and desktops. The
  demo roster already holds most cases: players in and out of the lineup, with and without links, a
  pool of two, no roles at all, setup not finished, an off role. The first test adds the hardest row a
  member can make: a long name in wide capitals, a tagline, all three links, an emblem, a frame and a
  pool of twelve. Then, at desktop widths (sidebar open), a tablet, a phone held sideways and two
  phones (and a large phone held sideways in Safari, 852px wide):
  - the roster has one column below 38rem of its own width, two from 38rem, three from 84rem;
  - every row is a finger-sized target, and a row of two lines is 4rem tall;
  - rows side by side are the same height and keep their names level, whatever either holds, and
    their second lines too where nothing above it took a line of its own (a long name, a tagline
    pushed under the name);
  - no part covers another or leaves its row, and nothing runs past the page's edge;
  - the name is whole; the tagline keeps to one line, its whole text in its title;
  - the status and links end the name's line (a tagline that does not fit beside the name goes
    under it), at the laptop and tablet widths where a long tagline once pushed them down too;
  - a pool shows its first portraits whole, as many as fit, and counts the rest: never "+1", never a
    portrait cut, and no room left for one more;
  - every link icon is the same size, above the row's second line;
  - the member's row keeps everything they chose.
  On the Production check's phone (390 × 844), with production's shape of row (a tagline on a name of
  one line, with no Riot note; here both beside a status and without one), a row with a tagline is three lines and every row of two
  lines is at most 72px, counted with the live check's own count (scripts/roster-lines.mjs), which
  must count every row as this spec does.
*/

test.describe.configure({ timeout: 420_000 });
test.use({ actionTimeout: 30_000 });

const MEMBER = { base: "Storm", display: "Stormbringer of the Northern Sky", tagline: "Fortune favours the bold and the warded", emblem: "bolt", nameStyle: "wide", frame: "premium", pool: 12 };

/** A Top player with everything a roster row can carry, set up as a member would. */
async function makeMember(browser: Browser, admin: Page, who: typeof MEMBER) {
  const { username, temporary } = await createMember(admin, who.base);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await choosePassword(page, username, temporary);
  const setup = page.getByTestId("setup-form");
  await setup.getByTestId("setup-display-name").fill(who.display);
  await setup.getByTestId("setup-continue").click();
  await setup.getByRole("radiogroup", { name: "Primary role" }).getByRole("button", { name: "Top" }).click();
  // The search stays open after each pick, and a champion picked leaves the list.
  await setup.getByTestId("primary-pool-toggle").click();
  const results = setup.getByTestId("primary-pool-results");
  for (let i = 0; i < who.pool; i++) {
    const first = results.getByRole("option").first();
    const id = (await first.getAttribute("data-champion"))!;
    await first.click();
    await expect(results.locator(`[data-champion="${id}"]`)).toHaveCount(0);
  }
  await page.keyboard.press("Escape");
  await setup.getByRole("button", { name: "Finish setup" }).click();
  await page.getByTestId("personalise-done").click();
  await expect(page.locator("aside").getByTestId("account-current-name")).toHaveText(who.display);
  await page.goto("/settings");
  const links = page.getByTestId("social-links-form");
  // Settings is drawn on the server: type the first link until the hydrated form has taken it.
  await expect(async () => {
    await links.getByLabel("YouTube", { exact: true }).fill(`youtube.com/@${who.base}Plays`);
    await expect(page.getByTestId("social-links-save")).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await links.getByLabel("Twitch", { exact: true }).fill(`${who.base.toLowerCase()}_live`);
  await links.getByLabel("Discord", { exact: true }).fill(`${who.base.toLowerCase()}.oce`);
  for (const kind of ["youtube", "twitch", "discord"]) await links.getByTestId(`social-public-${kind}`).click();
  await page.getByTestId("social-links-save").click();
  await expect(page.getByText("Social links saved.")).toBeVisible();
  await page.goto("/overview");
  await page.getByTestId("customise-card").first().click();
  const studio = page.getByTestId("card-studio");
  // The frame is under Appearance's Frame and border fold (Card Studio, Release 17).
  await studio.getByTestId("fold-frame").locator("summary").click();
  await studio.locator(`[role=radio][data-value="${who.frame}"]`).first().click();
  await page.getByTestId("studio-tab-identity").click();
  await page.getByTestId("tagline-input").fill(who.tagline);
  await page.getByRole("radiogroup", { name: "Emblem" }).locator(`[data-value=${who.emblem}]`).click();
  await page.getByRole("radiogroup", { name: "Name style" }).locator(`[data-value=${who.nameStyle}]`).click();
  await page.getByTestId("save-card-style").click();
  await expect(studio).toBeHidden();
  // Their own view of Players: their teammates, not themselves; the header offers their own profile,
  // and a search that finds nobody points there too.
  await page.goto("/players");
  await expect(page.getByTestId("players-directory").getByTestId("player-card-item").first()).toBeVisible();
  await expect(page.locator(`main [data-testid=player-card-item][data-player-name="${who.display}"]`)).toHaveCount(0);
  await expect(page.getByTestId("players-my-profile")).toHaveAttribute("href", "/overview");
  await expect(async () => {
    await page.getByTestId("players-search").fill("no such player anywhere");
    await expect(page.getByTestId("players-empty")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("players-empty").getByRole("link", { name: "Open My Profile" })).toHaveAttribute("href", "/overview");
  await context.close();
}

const SIZES: Array<[string, Parameters<Browser["newContext"]>[0]]> = [
  ["1920", { viewport: { width: 1920, height: 1080 } }],
  ["1440", { viewport: { width: 1440, height: 900 } }],
  ["1366", { viewport: { width: 1366, height: 768 } }],
  ["1280", { viewport: { width: 1280, height: 800 } }],
  // An iPad Air held sideways: a 1180px touch screen.
  ["touch-1180", { viewport: { width: 1180, height: 820 }, hasTouch: true }],
  ["1024", { viewport: { width: 1024, height: 768 } }],
  ["tablet-768", { viewport: { width: 768, height: 1024 }, hasTouch: true }],
  // Safari lays the page out at the whole screen's width held sideways (viewport-fit=cover): 852px on an iPhone 15.
  ["landscape-852", { viewport: { width: 852, height: 343 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }],
  ["landscape-734", { ...devices["iPhone 15 landscape"] }],
  ["phone-393", { ...devices["iPhone 15"] }],
  ["phone-320", { ...devices["iPhone SE"] }],
];

/** Every row of the roster, measured against its own edges: where each part sits, its lines, what overlaps, and its pool. */
async function measure(page: Page) {
  return page.getByTestId("players-directory").evaluate((panel) => {
    const box = (el: Element) => el.getBoundingClientRect();
    const shown = (el: Element | null): el is HTMLElement => !!el && box(el).width > 0 && box(el).height > 0 && getComputedStyle(el).display !== "none";
    const rows = [...panel.querySelectorAll<HTMLElement>("[data-testid=player-card-item]")].map((row) => {
      const r = box(row);
      const style = getComputedStyle(row);
      const inner = { left: r.left, right: r.right - parseFloat(style.borderRightWidth), top: r.top, bottom: r.bottom - parseFloat(style.borderBottomWidth) };
      const one = (selector: string) => {
        const el = row.querySelector(selector);
        return shown(el) ? box(el) : null;
      };
      const all = (selector: string) => [...row.querySelectorAll(selector)].filter(shown).map(box);
      const pool = row.querySelector<HTMLElement>("[data-testid=directory-pool]");
      const portraits = pool ? [...pool.querySelectorAll("[data-testid=pool-portrait]")].filter(shown).map(box) : [];
      const counts = pool ? [...pool.querySelectorAll<HTMLElement>("[data-testid=directory-pool-more]")].filter(shown) : [];
      const last = counts[0] ? box(counts[0]) : portraits.at(-1);
      const name = row.querySelector<HTMLElement>("[data-testid=card-name]")!;
      const tagline = row.querySelector<HTMLElement>("[data-testid=card-tagline]");
      const meta = row.querySelector<HTMLElement>("[data-testid=roster-meta]")!;
      const icons = [...row.querySelectorAll("[data-testid^=card-social-]")].filter(shown).map(box);
      // The row's lines: its parts' rows (parts on one row are centred on it; the second line and the
      // status count by their own parts, which wrap), and any more lines the name takes. The live
      // check counts them with scripts/roster-lines.mjs, which must agree (the phone test below).
      const status = row.querySelector("[data-testid=roster-status]");
      const column = row.querySelector("[data-testid=roster-name-line]");
      const leaves = [...meta.parentElement!.children].flatMap((c) => (c === meta || c === status || c === column ? [...c.children] : [c])).filter(shown);
      const distinct = (els: Element[]) => {
        const centres = els.map((c) => box(c).top + box(c).height / 2).sort((a, b) => a - b);
        return centres.filter((c, i) => i === 0 || c - centres[i - 1]! > 6).length;
      };
      const nameLines = Math.round(box(name).height / parseFloat(getComputedStyle(name).lineHeight));
      const lines = distinct(leaves) + nameLines - 1;
      // The lines above the second one (1 unless a long name or a tagline pushed under the name took more).
      const above = distinct(leaves.filter((c) => box(c).bottom <= box(meta).top + 1)) + nameLines - 1;
      const parts: Array<[string, DOMRect | null]> = [
        ["picture", one("[data-avatar-frame]")],
        ["name", one("[data-testid=card-name]")],
        ["you", one("[data-testid=card-you]")],
        ["tagline", tagline && shown(tagline) ? box(tagline) : null],
        ...all("[data-testid=directory-lineup], [data-testid=setup-incomplete]").map((b): [string, DOMRect] => ["badge", b]),
        ["links", one("[data-testid=card-social]")],
        ["roles", one("[data-testid=roster-roles], [data-testid=directory-no-roles]")],
        ["rank", one("[data-testid=rank-inline]")],
        ...portraits.map((p): [string, DOMRect] => ["portrait", p]),
        ...counts.map((m): [string, DOMRect] => ["count", box(m)]),
        ["chevron", one(":scope > svg")],
      ];
      const placed = parts.filter((p): p is [string, DOMRect] => p[1] !== null);
      const overlaps: string[] = [];
      for (let i = 0; i < placed.length; i++)
        for (let j = i + 1; j < placed.length; j++) {
          const [[n1, a], [n2, b]] = [placed[i]!, placed[j]!];
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push(`${n1} × ${n2}`);
        }
      const outside = placed.filter(([, b]) => b.left < inner.left - 0.5 || b.right > inner.right + 0.5 || b.top < inner.top - 0.5 || b.bottom > inner.bottom + 0.5).map(([n]) => n);
      // The row's own link (the player Peek, PLAN S8a; the profile's where a player has no main role yet).
      const link = row.querySelector<HTMLElement>("a[data-row-link]")!;
      return {
        player: row.dataset.playerName ?? "",
        frame: row.dataset.frame,
        top: r.top,
        left: r.left,
        height: r.height,
        lines,
        above,
        level: { name: box(name).top - r.top, meta: box(meta).top - r.top },
        // The badges and links: how far their top sits from the name's (on the name's line, never a line of their own).
        statusFromName: status && shown(status) ? Math.abs(box(status).top - box(name).top) : null,
        linkCovers: Math.abs(box(link).height - (inner.bottom - inner.top)) <= 1 && Math.abs(box(link).width - (inner.right - inner.left)) <= 1,
        nameText: name.textContent ?? "",
        nameCut: name.scrollHeight > name.clientHeight + 1 || name.scrollWidth > name.clientWidth + 1,
        taglineText: tagline?.textContent ?? "",
        taglineTitle: tagline?.title ?? "",
        taglineLines: tagline && shown(tagline) ? Math.round(box(tagline).height / parseFloat(getComputedStyle(tagline).lineHeight)) : 0,
        art: !!row.querySelector("[data-row-art]") && shown(row.querySelector("[data-row-art]")),
        poolSize: Number(pool?.dataset.poolSize ?? 0),
        portraits: portraits.length,
        inOrder: portraits.every((p, i) => i === 0 || p.left > portraits[i - 1]!.left),
        count: counts.map((m) => (m.textContent ?? "").replace(/ more champions$/, "")),
        roomLeft: pool && last ? box(pool).right - last.right : null,
        icons: icons.map((b) => ({ size: Math.round(b.width * 2) / 2, aboveMeta: b.bottom <= box(meta).top + 1 })),
        overlaps,
        outside,
      };
    });
    const list = panel.querySelector("ol")!;
    return { rem: parseFloat(getComputedStyle(document.documentElement).fontSize), width: box(list).width, rows, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
}

const spread = (values: number[]) => (values.length > 1 ? Math.max(...values) - Math.min(...values) : 0);

test("Players: every row whole and level with its neighbours, its pool whole, at every width", async ({ browser, page: admin, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one roster, checked at every size below");
  await admin.context().addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  // A retry runs on the same server, where the first attempt's member keeps the name.
  const who = info.retry ? { ...MEMBER, base: `${MEMBER.base}${info.retry}`, display: `${MEMBER.display.slice(0, 30)} ${info.retry}` } : MEMBER;
  await makeMember(browser, admin, who);
  // Creating the account switched the admin to Admin Mode: the roster is read in Player Mode.
  await admin.context().addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  const state = await admin.context().storageState();
  for (const [size, options] of SIZES) {
    const ctx = await browser.newContext({ ...options, storageState: state });
    await ctx.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
    const page = await ctx.newPage();
    await page.goto("/players");
    await expect(page.locator(`main [data-testid=player-card-item][data-player-name="${who.display}"]`)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const m = await measure(page);
    const wide = page.viewportSize()!.width >= 768;
    expect(m.overflow, `${size}: nothing past the page's edge`).toBeLessThanOrEqual(1);

    // Columns from the roster's own width: one, two from 38rem, three from 84rem (a column never under 28rem).
    const columns = new Set(m.rows.map((r) => Math.round(r.left))).size;
    const fits = m.width >= 84 * m.rem - 1 ? 3 : m.width >= 38 * m.rem - 1 ? 2 : 1;
    expect(columns, `${size}: columns for a ${Math.round(m.width)}px roster`).toBe(fits);

    // Side by side: the same height, and the names level whatever either row holds (the owner saw
    // content at different heights from player to player); the second lines too where neither row
    // has more than the name's line above it.
    const gridRows = [...new Set(m.rows.map((r) => Math.round(r.top)))].map((top) => m.rows.filter((r) => Math.abs(r.top - top) <= 1));
    for (const side of gridRows.filter((g) => g.length > 1)) {
      const names = side.map((r) => r.player).join(", ");
      expect(spread(side.map((r) => r.height)), `${size}: ${names} are the same height`).toBeLessThanOrEqual(1);
      expect(spread(side.map((r) => r.level.name)), `${size}: names level along ${names}`).toBeLessThanOrEqual(1);
      if (side.every((r) => r.above === 1)) expect(spread(side.map((r) => r.level.meta)), `${size}: second lines level along ${names}`).toBeLessThanOrEqual(1);
    }

    for (const r of m.rows) {
      const label = `${size}, ${r.player}`;
      expect(r.height, `${label}: a finger-sized row`).toBeGreaterThanOrEqual(44);
      // Two lines (the name's, then the role, rank and pool): 4rem, whoever the row is, unless a row beside it needs more.
      const side = m.rows.filter((o) => Math.abs(o.top - r.top) <= 1);
      if (side.every((o) => o.lines <= 2)) expect(Math.abs(r.height - 4 * m.rem), `${label}: a row of two lines is 4rem tall`).toBeLessThanOrEqual(1);
      expect(r.linkCovers, `${label}: the whole row is one link (the Peek, or the profile)`).toBe(true);
      expect(r.overlaps, `${label}: nothing covers anything else`).toEqual([]);
      expect(r.outside, `${label}: every part inside the row`).toEqual([]);
      expect(r.nameCut, `${label}: the name is whole`).toBe(false);
      expect(r.taglineLines, `${label}: the tagline keeps to one line`).toBeLessThanOrEqual(1);
      // The status and links end the name's line, whatever the tagline does (a tagline too long to
      // sit beside the name goes under it, never pushing them onto a line of their own).
      if (r.statusFromName !== null) expect(r.statusFromName, `${label}: the status on the name's line`).toBeLessThanOrEqual(4);
      // The art strip from tablets up, never on a phone (nothing is downloaded for it there).
      if (!wide) expect(r.art, `${label}: no art on a phone`).toBe(false);
      for (const icon of r.icons) expect(icon.aboveMeta, `${label}: links above the second line`).toBe(true);
      if (!r.poolSize) continue;
      // The first portraits, whole and in order, then the rest counted: never +1, no room for one more.
      expect(r.inOrder, `${label}: portraits in the pool's order`).toBe(true);
      expect(r.portraits, `${label}: at least one portrait`).toBeGreaterThan(0);
      if (r.portraits < r.poolSize) {
        expect(r.count, `${label}: the rest counted`).toEqual([`+${r.poolSize - r.portraits}`]);
        expect(r.poolSize - r.portraits, `${label}: never +1`).toBeGreaterThan(1);
        expect(r.roomLeft!, `${label}: no room for one more portrait`).toBeLessThan(2 * m.rem);
      } else expect(r.count, `${label}: a whole pool has no count`).toEqual([]);
    }
    // One icon size everywhere.
    expect(spread(m.rows.flatMap((r) => r.icons.map((i) => i.size))), `${size}: every link icon the same size`).toBeLessThanOrEqual(0.5);

    // Unfinished setup (Demo Halfway, Demo Newcomer) keeps to two lines, the smallest phones included
    // ("Setup" beside the name on narrow rows), so the row is 4rem like its neighbours (checked above).
    const setup = m.rows.filter((o) => o.player === "Demo Halfway" || o.player === "Demo Newcomer");
    expect(setup.length, `${size}: both members in setup are listed`).toBe(2);
    for (const r of setup) expect(r.lines, `${size}, ${r.player}: setup incomplete in two lines`).toBeLessThanOrEqual(2);

    // The member's own row keeps everything they chose.
    const mine = m.rows.find((r) => r.player === who.display)!;
    expect(mine.frame, `${size}: their frame`).toBe(who.frame);
    expect(mine.nameText, `${size}: their name, whole`).toBe(who.display);
    expect(mine.taglineText, `${size}: their tagline`).toBe(`“${who.tagline}”`);
    expect(mine.taglineTitle, `${size}: the whole tagline in its title`).toBe(who.tagline);
    // Their links from tablets up (phones leave them to the profile).
    expect(mine.icons.length, `${size}: their three links`).toBe(wide ? 3 : 0);
    expect(mine.poolSize, `${size}: their pool's size`).toBe(who.pool);
    if (wide) expect(mine.art, `${size}: their art behind the row`).toBe(true);
    await ctx.close();
  }
});

/** Saves a tagline on a player's card in the Card Studio, at 1440, as the demo's Owner (who may edit any card); "" takes it off. */
async function saveTagline(browser: Browser, baseURL: string, player: string, tagline: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL }]);
  const page = await context.newPage();
  await page.goto("/players");
  await page.goto((await playerEntry(page, player).getAttribute("href"))!);
  const studio = page.getByTestId("card-studio");
  // The button works once the page has hydrated.
  await expect(async () => {
    await page.getByTestId("profile-header").getByTestId("customise-card").click();
    await expect(studio).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByTestId("studio-tab-identity").click();
  await page.getByTestId("tagline-input").fill(tagline);
  await page.getByTestId("save-card-style").click();
  await expect(studio).toBeHidden();
  await expect(page.getByTestId("profile-header").getByTestId("card-tagline")).toHaveCount(tagline ? 1 : 0);
  await context.close();
}

test("Players on the Production check's phone: a row with a tagline is three lines, and a row of two lines at most 72px, as the live check counts them", async ({ browser, page, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "the live check's phone, 390 × 844");
  // Production's roster when #277 was deployed (17 Nov 2026) had at least one row of this shape: a
  // tagline on a name of one line, with no Riot note (its counts cannot say how many, or whether beside
  // a status). On a phone the tagline takes a line of its own under the second line (81.5px); the live
  // check's own count missed it, counted that row as one line (no status) or two (beside one) and
  // measured it against the 72px of two. Both shapes, from the demo's players.
  const shapes = [
    { player: "Demo ADC", tagline: "Fortune favours the bold and the warded", status: true },
    { player: "Demo Sub (Top)", tagline: "Calm in the chaos", status: false },
  ];
  const saved: string[] = [];
  try {
    for (const s of shapes) {
      await saveTagline(browser, baseURL!, s.player, s.tagline);
      saved.push(s.player);
    }
    await page.context().addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/players");
    for (const s of shapes) {
      const row = page.locator(`main [data-testid=player-card-item][data-player-name="${s.player}"]`);
      await expect(row.getByTestId("card-tagline")).toBeVisible();
      await expect(row.getByTestId("directory-riot"), `${s.player}: Riot data up to date`).toHaveCount(0);
      await expect(row.getByTestId("roster-status"), `${s.player}: ${s.status ? "a status" : "no status"}`).toHaveCount(s.status ? 1 : 0);
    }
    await page.evaluate(() => document.fonts.ready);
    const items = page.getByTestId("players-directory").getByTestId("player-card-item");
    const names = await items.evaluateAll((els) => els.map((e) => e.dataset.playerName ?? ""));
    const rows = (await items.evaluateAll(rosterRowLines)).map((r, i) => ({ ...r, player: names[i] ?? "" }));
    // The live check's fact: every row of two lines (the name's, then the role, rank and pool) at most 72px.
    const twoLine = rows.filter((r) => r.lines !== null && r.lines <= 2);
    expect(twoLine.length, "rows of two lines to measure").toBeGreaterThan(0);
    expect(twoLine.filter((r) => r.height > 72).map((r) => `${r.player}: ${r.height}px`), "rows of two lines over 72px, as the live check counts them").toEqual([]);
    // A row with a tagline: the name's line, the second line, then the tagline under it.
    for (const s of shapes) expect(rows.find((r) => r.player === s.player)?.lines, `${s.player}: three lines with the tagline`).toBe(3);
    // One count: the live check's counts every row as this spec's measure() does.
    expect(rows.map((r) => r.lines), "the live check's count, row by row").toEqual((await measure(page)).rows.map((r) => r.lines));
  } finally {
    for (const player of saved) await saveTagline(browser, baseURL!, player, "");
  }
});

const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;

/** How many rows the inline toolbar's controls take (the search and each control, by their centres). */
const controlRows = (toolbar: Locator) => toolbar.evaluate((bar) => new Set([...bar.querySelectorAll("[data-testid=players-search], [data-filter-controls] > *")].filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2))).size);

/** Chooses each role in turn in the inline toolbar, and checks the toolbar keeps to one row with each (Reset beside it). */
async function everyRoleOnOneRow(page: Page, label: string) {
  const toolbar = page.getByTestId("players-filters");
  expect(await controlRows(toolbar), `${label}: the toolbar keeps to one row`).toBe(1);
  for (const role of ROLES) {
    // Retried: a click before the page is interactive does nothing.
    await expect(async () => {
      await page.getByTestId(`role-filter-${role}`).click();
      await expect(page.getByTestId(`role-filter-${role}`)).toHaveAttribute("aria-checked", "true", { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByTestId("reset-filters")).toBeVisible();
    expect(await controlRows(toolbar), `${label}: one row with ${role} chosen`).toBe(1);
  }
  await page.getByTestId("reset-filters").click();
  await expect(page.getByTestId("reset-filters")).toHaveCount(0);
}

test("Players: the count is the title's scope line, the toolbar keeps to one row, and the roster to one panel", async ({ page, browser, baseURL }, info) => {
  await page.context().addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.goto("/players");
  const roster = page.getByTestId("players-directory");
  await expect(roster.getByTestId("player-card-item").first()).toBeVisible();
  // The header: the title, then the count (read out as it changes); no guide sentence between them.
  const scope = page.getByTestId("players-scope");
  await expect(scope).toHaveText(/^\d+ players$/);
  await expect(scope).toHaveAttribute("aria-live", "polite");
  const [title, line] = await Promise.all([page.getByRole("heading", { level: 1, name: "Players" }).boundingBox(), scope.boundingBox()]);
  expect(line!.y - (title!.y + title!.height), "the scope line sits under the title").toBeLessThanOrEqual(8);
  const toolbar = page.getByTestId("players-filters");
  const rows = roster.getByTestId("player-card-item");
  const columns = async () => new Set(await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))).size;
  const first = async () => (await rows.first().boundingBox())!.y;
  if (info.project.name === "phone") {
    // Phones: the search and Filters share a row; one column of rows; the first players on the first screen.
    await expect(toolbar.getByTestId("filter-toggle")).toBeVisible();
    expect(await columns(), "one column").toBe(1);
    expect(await first(), "the first row high on the first screen").toBeLessThan(260);
    expect(await rows.locator("[data-row-art]").evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").length), "no art on a phone").toBe(0);
  } else {
    // Tablets and desktops: one row of controls, whichever role is chosen (and Reset beside them):
    // the touch tablet keeps the chosen role to its icon too (an administrator's Archived chip is there).
    await everyRoleOnOneRow(page, info.project.name);
    // Two columns on a tablet and at 1440 with the sidebar open; a strip of each player's art.
    expect(await columns(), "two columns").toBe(2);
    expect(await first(), "the first rows high on the first screen").toBeLessThan(info.project.name === "tablet" ? 300 : 230);
    expect(await rows.locator("[data-row-art]").evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").length), "art strips from tablets up").toBeGreaterThan(0);
  }
  if (info.project.name === "desktop") {
    // The strip stays at 20% while its row is pointed at (D4: at most 0.2; the row's own hover marks it).
    const art = rows.filter({ has: page.locator("[data-testid=row-art-image]") }).first();
    const image = art.getByTestId("row-art-image");
    const opacity = () => image.evaluate((img) => Number(getComputedStyle(img).opacity));
    expect(await opacity(), "the strip at 20% at rest").toBeLessThanOrEqual(0.2);
    await art.hover();
    await page.waitForTimeout(400);
    expect(await opacity(), "and while its row is pointed at").toBeLessThanOrEqual(0.2);
    await page.mouse.move(0, 0);
    // A touch laptop or tablet at 1024px with the sidebar open: the toolbar keeps to one row with any role chosen.
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, storageState: await page.context().storageState() });
    await ctx.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
    const touch = await ctx.newPage();
    await touch.goto("/players");
    await expect(touch.getByTestId("players-directory").getByTestId("player-card-item").first()).toBeVisible();
    await everyRoleOnOneRow(touch, "1024 with touch, sidebar open");
    await ctx.close();
  }
  if (info.project.name === "tablet") {
    // A row's link icons take taps only inside their own row and on their own chip: 2px above the
    // row (the row above) is never this row's icon, and 1px inside an icon's right edge is that icon.
    const taps = await roster.evaluate((panel) => {
      const out: Array<{ above: boolean; edge: boolean }> = [];
      for (const row of panel.querySelectorAll<HTMLElement>("[data-testid=player-card-item]")) {
        const r = row.getBoundingClientRect();
        // Points are read on screen: rows a longer roster (other tests add members) pushes below the window wait.
        if (r.top < 2 || r.bottom > innerHeight) continue;
        for (const icon of [...row.querySelectorAll<HTMLElement>("[data-testid^=card-social-]")].filter((e) => e.getBoundingClientRect().width > 0)) {
          const b = icon.getBoundingClientRect();
          const above = document.elementFromPoint(b.left + b.width / 2, r.top - 2);
          const edge = document.elementFromPoint(b.right - 1, b.top + b.height / 2);
          out.push({ above: !!above && row.contains(above), edge: !!edge && icon.contains(edge) });
        }
      }
      return out;
    });
    expect(taps.length, "rows with link icons on a tablet").toBeGreaterThan(0);
    expect(taps.filter((t) => t.above), "no icon takes a tap meant for the row above").toEqual([]);
    expect(taps.filter((t) => !t.edge), "every icon takes a tap on its own chip").toEqual([]);
  }
  // The demo's nine players in view at once on a tablet and a desktop (other tests may have added more).
  if (info.project.name !== "phone") {
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(9);
    expect(await rows.nth(8).evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight + 1), "nine players on the first screen").toBe(true);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Players: with a role chosen, every row shows that role's champions, and an off role says so", async ({ page, baseURL }, info) => {
  await page.context().addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.goto("/players");
  const row = (name: string) => page.locator(`main [data-testid=player-card-item][data-player-name="${name}"]`);
  const top = row("Demo Top");
  await expect(top).toBeVisible();
  // No role chosen: the main role's pool (Demo Top plays Top, and Mid as an off role), at its size as
  // this run finds it (specs before this one share the demo database and may have added a champion).
  await expect(top.getByTestId("directory-pool")).toHaveAccessibleName("Top champions");
  await expect(top.getByTestId("roster-off-role")).toHaveCount(0);
  const mainPool = (await top.getByTestId("directory-pool").getAttribute("data-pool-size"))!;
  expect(Number(mainPool), "Demo Top's Top pool").toBeGreaterThan(0);
  // Phones choose the role in the filter sheet, wider screens in the toolbar (retried: a click before
  // the page is interactive does nothing).
  const folded = await openFilterBar(page.getByTestId("players-filters"));
  await expect(async () => {
    await page.getByTestId("role-filter-MID").click();
    await expect(page.getByTestId("players-scope")).toHaveText(/^\d+ of \d+ players · Mid as primary or off role$/, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  if (folded) await closeFilterSheet(page);
  // Listed for Mid as an off role: their Mid champions (Galio and Sylas), marked as an off role.
  const pool = top.getByTestId("directory-pool");
  await expect(pool).toHaveAccessibleName("Mid champions, off role");
  expect(Number(await pool.getAttribute("data-pool-size")), "their Mid pool, the demo's two at least").toBeGreaterThanOrEqual(2);
  await expect(pool.getByRole("img", { name: "Galio" })).toBeVisible();
  await expect(pool.getByRole("img", { name: "Sylas" })).toBeVisible();
  await expect(top.getByTestId("roster-off-role")).toHaveAttribute("data-role", "MID");
  await expect(top.getByTestId("roster-off-role")).toContainText("Off");
  if (info.project.name === "phone") {
    // The smallest phone (320px): the pool still shows its champions, never a count on its own (the
    // word "Off" gives its room to them; the icon, the chip and the pool's name still say it).
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(pool.getByRole("img", { name: "Galio" })).toBeVisible();
    expect(await pool.locator("[data-testid=pool-portrait]:visible").count(), "320px: at least one portrait").toBeGreaterThan(0);
    await expect(pool.getByTestId("directory-pool-more").filter({ visible: true })).toHaveCount(0);
    await expect(top.getByTestId("roster-off-role")).toContainText("Mid, Off role");
    await page.setViewportSize({ width: 375, height: 667 });
  }
  // Mid's own player: their main pool, no off-role mark; a player without Mid is not listed.
  await expect(row("Demo Mid").getByTestId("directory-pool")).toHaveAccessibleName("Mid champions");
  await expect(row("Demo Mid").getByTestId("roster-off-role")).toHaveCount(0);
  await expect(row("Demo Jungle")).toHaveCount(0);
  // Every role again: the main role's pool is back.
  const chip = page.getByTestId("players-filters-chips").getByRole("button", { name: /Mid/ });
  if (await chip.isVisible()) await chip.click();
  else await page.getByTestId("role-filter-ALL").click();
  await expect(page.getByTestId("players-scope")).toHaveText(/^\d+ players$/);
  await expect(top.getByTestId("directory-pool")).toHaveAccessibleName("Top champions");
  await expect(top.getByTestId("directory-pool")).toHaveAttribute("data-pool-size", mainPool);
});

test("Players in short narrow windows (a split screen, a small phone zoomed in): the search keeps its width beside Filters", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "windows of phone width");
  await page.context().addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  // Short windows too narrow for the title and the bar to share a row (they stack; 544px, a split
  // screen, just under the 35rem where they start sharing), and an SE held sideways, where they do.
  for (const [width, height, shared] of [[412, 400, false], [326, 477, false], [544, 400, false], [568, 320, true]] as const) {
    const label = `${width}×${height}`;
    await page.setViewportSize({ width, height });
    await page.goto("/players");
    const bar = page.getByTestId("players-filters");
    await expect(page.getByTestId("players-directory").getByTestId("player-card-item").first()).toBeVisible();
    // With a role chosen: the scope line widens the header to its limit, and a chip joins the bar.
    await openFilterBar(bar);
    await expect(async () => {
      await page.getByTestId("role-filter-MID").click();
      await expect(page.getByTestId("players-scope")).toHaveText(/Mid as primary or off role$/, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await closeFilterSheet(page);
    const facts = await page.evaluate(() => {
      const box = (el: Element | null) => el!.getBoundingClientRect();
      const input = box(document.querySelector("input[data-testid=players-search]"));
      const toggle = box(document.querySelector("main [data-filter-toggle]"));
      // The header's visible line (the h1 is read out only on phones: the sections row names the page).
      const title = box(document.querySelector("[data-testid=players-scope]"));
      const bar = box(document.querySelector("[data-testid=players-filters]"));
      const overlap = Math.min(input.right, toggle.right) - Math.max(input.left, toggle.left) > 0 && Math.min(input.bottom, toggle.bottom) - Math.max(input.top, toggle.top) > 0;
      return { rem: parseFloat(getComputedStyle(document.documentElement).fontSize), search: input.width, overlap, shared: bar.left >= title.right, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(facts.search, `${label}: the search keeps room to type`).toBeGreaterThanOrEqual((shared ? 9 : 10) * facts.rem);
    expect(facts.overlap, `${label}: Filters never covers the search`).toBe(false);
    expect(facts.overflow, `${label}: nothing past the window's edge`).toBeLessThanOrEqual(1);
    expect(facts.shared, `${label}: the title and the bar ${shared ? "share a row" : "stack"}`).toBe(shared);
  }
});

test("Players at 200% text: every row wraps rather than cuts, on a phone and a desktop", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "checked once, at both sizes");
  for (const [width, height] of [[390, 844], [1440, 900]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, ...(width < 768 ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
    const page = await ctx.newPage();
    // The browser's own text size, as a reader sets it (Chromium): twice the default.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Page.enable");
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32 } });
    await page.goto("/players");
    await expect(page.getByTestId("players-directory").getByTestId("player-card-item").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const facts = await page.getByTestId("players-directory").evaluate((panel) => {
      const edge = panel.getBoundingClientRect().right;
      const hidden = (el: Element) => {
        for (let e: Element | null = el; e && e !== panel; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.display === "none" || cs.visibility === "hidden" || (cs.position === "absolute" && (cs.clipPath === "inset(50%)" || cs.clip.startsWith("rect(0"))) || e.hasAttribute("data-row-art")) return true;
        }
        return false;
      };
      const texts = [...panel.querySelectorAll("*")].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && el.getClientRects().length && !hidden(el));
      return {
        root: parseFloat(getComputedStyle(document.documentElement).fontSize),
        past: texts.filter((el) => el.getBoundingClientRect().right > edge + 1).map((el) => el.textContent!.trim().slice(0, 24)),
        // Text cut short must say all of itself in a title (the tagline's one line).
        cut: texts.filter((el) => el.scrollWidth > el.clientWidth + 1 && !el.closest("[title]")).map((el) => el.textContent!.trim().slice(0, 24)),
        // The page's own content (its header, toolbar and roster; the frame's bars are the frame's own
        // matter) stays inside the window.
        outside: [...document.querySelectorAll("main *")].filter((el) => el.getClientRects().length && !hidden(el) && el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map((el) => el.getAttribute("data-testid") ?? el.tagName.toLowerCase()),
      };
    });
    const label = `${width}px at 200% text`;
    expect(facts.root, `${label}: the root follows the browser's text size`).toBeGreaterThanOrEqual(30);
    expect(facts.past, `${label}: no text past the roster's edge`).toEqual([]);
    expect(facts.cut, `${label}: no text cut without its title`).toEqual([]);
    expect(facts.outside, `${label}: nothing on the page past the window's edge`).toEqual([]);
    await ctx.close();
  }
});

test("the player Peek: a Players row and a Leaderboards row open it with ?player=, the name still opens the profile, Back closes it and the list does not move", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  for (const [path, rowSel] of [
    ["/players", "[data-testid=player-peek-open]"],
    ["/leaderboards", "[data-testid=board-peek-open]"],
  ] as const) {
    await page.goto(path);
    const rows = page.locator(rowSel);
    await expect(rows.nth(3)).toBeVisible();
    await rows.nth(3).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 40));
    const before = await page.evaluate(() => ({ y: window.scrollY, entries: history.length }));
    // Off the name (which is the profile's link): the row's own press.
    const box = (await rows.nth(3).boundingBox())!;
    const at = { x: box.width - 24, y: box.height / 2 };
    if (phone) await rows.nth(3).tap({ position: at });
    else await rows.nth(3).click({ position: at });
    await expect(page).toHaveURL(new RegExp(`${path}\\?player=[0-9a-f-]{36}$`));
    const peek = page.getByTestId("player-detail-hero");
    await expect(peek, `${path}: the player's card opened up`).toBeVisible();
    await expect(page.getByTestId("detail-profile-link")).toBeVisible();
    expect(await page.evaluate(() => history.length), `${path}: one entry pushed`).toBe(before.entries + 1);
    // Back closes it, and the list is where it was.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(peek).toHaveCount(0);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - before.y), `${path}: the list did not move`).toBeLessThanOrEqual(1);
  }
  // The name stays a link to the full profile, one press away.
  await page.goto("/players");
  const name = page.locator("main a[data-testid=player-card]").first();
  if (phone) await name.tap();
  else await name.click();
  await expect(page).toHaveURL(/\/players\/[0-9a-f-]{36}$/);
});

test("the docked player Peek at 1280: its pool list takes the short figure blocks, so every champion's name is whole and no column heading runs into another", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the docked panel's width at 1280 (34vw, 25rem of list)");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/players");
  for (const n of [0, 1, 2]) {
    // Off the name (the profile's link): the row's own press.
    const row = page.locator("[data-testid=player-peek-open]").nth(n);
    await expect(row).toBeVisible();
    await row.scrollIntoViewIfNeeded();
    const box = (await row.boundingBox())!;
    await row.click({ position: { x: box.width - 24, y: box.height / 2 } });
    const list = page.getByTestId("player-peek").getByTestId("pool-list");
    await expect(list.getByTestId("pool-champion").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const facts = await list.evaluate((ol) => {
      const box = ol.parentElement!;
      const heads = box.querySelector<HTMLElement>("[data-testid=pool-columns]");
      return {
        width: box.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize),
        headings: heads ? getComputedStyle(heads).display : "none",
        cut: [...ol.querySelectorAll<HTMLElement>("[data-testid=pool-champion-name]")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
        outside: [...ol.querySelectorAll<HTMLElement>("[data-testid=pool-champion-stats]")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > ol.getBoundingClientRect().right + 0.5).length,
      };
    });
    expect(facts.width, "the docked list is narrower than the columns need").toBeLessThan(28);
    expect(facts.headings, "no column headings over the short blocks").toBe("none");
    expect(facts.cut, "every name whole").toEqual([]);
    expect(facts.outside).toBe(0);
    // Closed before the next row (the docked panel lies over the rows' right-hand end).
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("player-detail-hero")).toHaveCount(0);
  }
});

test("on a phone the Players page keeps the height it had when its rows appeared: the closed Peek adds no gap once the page's code runs (R7: CI's account-screen jumps)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the Peek's window exists only on phones");
  // The page's height on the first frame after its rows are hydrated, before any later render (the
  // closed Peek's window, on a phone, is drawn by one).
  await page.addInitScript(() => {
    const w = window as unknown as { __firstRowsHeight?: number };
    const tick = () => {
      const row = document.querySelector("[data-testid=player-peek-open]");
      if (row && Object.keys(row).some((k) => k.startsWith("__reactFiber"))) w.__firstRowsHeight = document.documentElement.scrollHeight;
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto("/players");
  await expect(page.getByTestId("player-peek-open").first()).toBeVisible();
  await page.waitForTimeout(1500);
  const { first, now } = await page.evaluate(() => ({ first: (window as unknown as { __firstRowsHeight?: number }).__firstRowsHeight, now: document.documentElement.scrollHeight }));
  expect(first, "measured on the rows' first frame").toBeGreaterThan(0);
  expect(now, "the page's height after it settled").toBe(first);
});

test("the docked player Peek gives the focus back to the row that opened it, after Escape and after Back, where a member has rows on several boards (R7 review A1, A2)", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the phone's sheet returns the focus itself");
  await page.goto("/leaderboards");
  const rows = page.locator("[data-testid=board-peek-open]");
  await expect(rows.first()).toBeVisible();
  // A row whose member already has a row on an earlier board.
  const at = await rows.evaluateAll((els) => els.findIndex((el, i) => els.slice(0, i).some((e) => e.getAttribute("data-peek-row") === el.getAttribute("data-peek-row"))));
  expect(at, "a member with rows on two boards").toBeGreaterThan(0);
  const opener = rows.nth(at);
  const isOpener = () => page.evaluate((i) => document.activeElement === document.querySelectorAll("[data-testid=board-peek-open]")[i], at);
  for (const leave of ["Escape", "Back"] as const) {
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?player=/);
    await expect(page.getByTestId("player-detail-hero")).toBeVisible();
    if (leave === "Escape") await page.keyboard.press("Escape");
    else await page.goBack();
    await expect(page).not.toHaveURL(/\?player=/);
    await expect.poll(isOpener, `${leave}: the focus is back on the row that opened it`).toBe(true);
  }
  // ↓ from that row moves along its own board where the next member has a row there.
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("player-detail-hero")).toBeVisible();
  await opener.focus();
  await page.keyboard.press("ArrowDown");
  const same = await page.evaluate((i) => {
    const from = document.querySelectorAll("[data-testid=board-peek-open]")[i]!;
    const list = from.closest("ul, ol");
    const to = document.activeElement as HTMLElement | null;
    const id = to?.getAttribute("data-peek-row");
    const onBoard = !!id && !!list?.querySelector(`[data-peek-row="${CSS.escape(id)}"]`);
    return { onBoard, sameList: !!list && !!to && list.contains(to) };
  }, at);
  if (same.onBoard) expect(same.sameList, "↓ stays on the board that has the next member").toBe(true);
});

test("members' links fetch a profile ahead on intent only: none as Players and Leaderboards are seen, one once a pointer rests on a name", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a pointer's intent; touch starts the same fetch (IntentLink)");
  const ahead: string[] = [];
  page.on("request", (r) => {
    const h = r.headers();
    if (h["next-router-prefetch"] || h["next-router-segment-prefetch"]) ahead.push(new URL(r.url()).pathname);
  });
  for (const path of ["/players", "/leaderboards"]) {
    ahead.length = 0;
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    expect(ahead.filter((p) => /^\/players\/[0-9a-f-]{36}/.test(p)), `${path}: no profile fetched ahead on sight`).toEqual([]);
  }
  await page.goto("/players");
  await page.waitForLoadState("networkidle");
  ahead.length = 0;
  const name = page.locator("main a[data-testid=player-card][data-prefetch=intent]").first();
  const href = (await name.getAttribute("href"))!;
  await name.hover();
  await expect.poll(() => ahead.some((p) => p.startsWith(href)), { message: "fetched ahead once pointed at" }).toBe(true);
});
