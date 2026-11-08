import { devices, expect, test, type Browser, type Page } from "./test";
import { choosePassword, createMember } from "./member-account";
import { closeFilterSheet, openFilterBar } from "./filters";

/*
  THE PLAYERS ROSTER: ONE PANEL OF ROWS, EVERY ROW WHOLE. Each player is one row of one panel at
  every width (docs/MOBILE.md: lists are rows in one panel), laid out one, two or three across by the
  roster's own width, so 15 to 25 players stay within about a screen on tablets and desktops. The
  demo roster already holds most cases: players in and out of the lineup, with and without links, a
  pool of two, no roles at all, setup not finished, an off role. The first test adds the hardest row a
  member can make: a long name in wide capitals, a tagline, all three links, an emblem, a frame and a
  pool of twelve. Then, at desktop widths (sidebar open), a tablet, a phone held sideways and two
  phones:
  - the roster has one column below 38rem of its own width, two from 38rem, three from 76rem;
  - every row is a finger-sized target, and a row of two lines is 4rem tall;
  - rows side by side are the same height, and rows with as many lines keep their names and their
    second lines level;
  - no part covers another or leaves its row, and nothing runs past the page's edge;
  - the name is whole; the tagline keeps to one line, its whole text in its title;
  - a pool shows its first portraits whole, as many as fit, and counts the rest: never "+1", never a
    portrait cut, and no room left for one more;
  - every link icon is the same size, above the row's second line;
  - the member's row keeps everything they chose.
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
  await studio.locator(`[role=radio][data-value="${who.frame}"]`).first().click();
  await page.getByTestId("studio-step-identity").click();
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
  ["1280", { viewport: { width: 1280, height: 800 } }],
  ["1024", { viewport: { width: 1024, height: 768 } }],
  ["tablet-768", { viewport: { width: 768, height: 1024 }, hasTouch: true }],
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
      // The row's lines: its parts' rows (parts on one row are centred on it), and any more lines the name takes.
      const centres = [...meta.parentElement!.children].filter(shown).map((c) => box(c).top + box(c).height / 2).sort((a, b) => a - b);
      const nameLines = Math.round(box(name).height / parseFloat(getComputedStyle(name).lineHeight));
      const lines = centres.filter((c, i) => i === 0 || c - centres[i - 1]! > 6).length + nameLines - 1;
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
      const link = row.querySelector<HTMLElement>("a[data-testid=player-card]")!;
      return {
        player: row.dataset.playerName ?? "",
        frame: row.dataset.frame,
        top: r.top,
        left: r.left,
        height: r.height,
        lines,
        level: { name: box(name).top - r.top, meta: box(meta).top - r.top },
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

    // Columns from the roster's own width: one, two from 38rem, three from 76rem.
    const columns = new Set(m.rows.map((r) => Math.round(r.left))).size;
    const fits = m.width >= 76 * m.rem - 1 ? 3 : m.width >= 38 * m.rem - 1 ? 2 : 1;
    expect(columns, `${size}: columns for a ${Math.round(m.width)}px roster`).toBe(fits);

    // Side by side: the same height, and rows with as many lines keep their lines level.
    const gridRows = [...new Set(m.rows.map((r) => Math.round(r.top)))].map((top) => m.rows.filter((r) => Math.abs(r.top - top) <= 1));
    for (const side of gridRows.filter((g) => g.length > 1)) {
      const names = side.map((r) => r.player).join(", ");
      expect(spread(side.map((r) => r.height)), `${size}: ${names} are the same height`).toBeLessThanOrEqual(1);
      if (side.every((r) => r.lines === side[0]!.lines)) for (const key of ["name", "meta"] as const) expect(spread(side.map((r) => r.level[key])), `${size}: ${key} level along ${names}`).toBeLessThanOrEqual(1);
    }

    for (const r of m.rows) {
      const label = `${size}, ${r.player}`;
      expect(r.height, `${label}: a finger-sized row`).toBeGreaterThanOrEqual(44);
      // Two lines (the name's, then the role, rank and pool): 4rem, whoever the row is, unless a row beside it needs more.
      const side = m.rows.filter((o) => Math.abs(o.top - r.top) <= 1);
      if (side.every((o) => o.lines <= 2)) expect(Math.abs(r.height - 4 * m.rem), `${label}: a row of two lines is 4rem tall`).toBeLessThanOrEqual(1);
      expect(r.linkCovers, `${label}: the whole row is the link to the profile`).toBe(true);
      expect(r.overlaps, `${label}: nothing covers anything else`).toEqual([]);
      expect(r.outside, `${label}: every part inside the row`).toEqual([]);
      expect(r.nameCut, `${label}: the name is whole`).toBe(false);
      expect(r.taglineLines, `${label}: the tagline keeps to one line`).toBeLessThanOrEqual(1);
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

test("Players: the count is the title's scope line, the toolbar keeps to one row, and the roster to one panel", async ({ page, baseURL }, info) => {
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
    // Tablets and desktops: one row of controls, with a role chosen (and Reset beside them) too.
    const controlRows = () => toolbar.evaluate((bar) => new Set([...bar.querySelectorAll("[data-testid=players-search], [data-filter-controls] > *")].filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2))).size);
    expect(await controlRows(), "the toolbar keeps to one row").toBe(1);
    // Retried: a click before the page is interactive does nothing.
    await expect(async () => {
      await page.getByTestId("role-filter-MID").click();
      await expect(page.getByTestId("reset-filters")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    expect(await controlRows(), "one row with a role chosen").toBe(1);
    await page.getByTestId("reset-filters").click();
    await expect(page.getByTestId("reset-filters")).toHaveCount(0);
    // Two columns on a tablet and at 1440 with the sidebar open; a strip of each player's art.
    expect(await columns(), "two columns").toBe(2);
    expect(await first(), "the first rows high on the first screen").toBeLessThan(info.project.name === "tablet" ? 300 : 230);
    expect(await rows.locator("[data-row-art]").evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").length), "art strips from tablets up").toBeGreaterThan(0);
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

test("Players: with a role chosen, every row shows that role's champions, and an off role says so", async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.goto("/players");
  const row = (name: string) => page.locator(`main [data-testid=player-card-item][data-player-name="${name}"]`);
  const top = row("Demo Top");
  await expect(top).toBeVisible();
  // No role chosen: the main role's pool (Demo Top plays Top, and Mid as an off role).
  await expect(top.getByTestId("directory-pool")).toHaveAccessibleName("Top champions");
  await expect(top.getByTestId("roster-off-role")).toHaveCount(0);
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
  await expect(pool).toHaveAttribute("data-pool-size", "2");
  await expect(pool.getByRole("img", { name: "Galio" })).toBeVisible();
  await expect(pool.getByRole("img", { name: "Sylas" })).toBeVisible();
  await expect(top.getByTestId("roster-off-role")).toHaveAttribute("data-role", "MID");
  await expect(top.getByTestId("roster-off-role")).toContainText("Off");
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
  await expect(top.getByTestId("directory-pool")).toHaveAttribute("data-pool-size", "6");
});
