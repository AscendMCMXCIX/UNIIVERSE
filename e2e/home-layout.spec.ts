import { expect, test, type Locator, type Page } from "./test";
import { playerEntry } from "./players";

/*
  Team Overview and a profile's Overview as home screens (in-memory demo roster, synthetic data).
  Team: on a wide screen the five cards stand side by side under the team's header, which sits
  right under the section tabs; the cards take the window's height down to the bench of
  substitutes under them (their art grows into it, up to 1.9 times a card's width), so no band of
  empty page sits above the header or under the cards, and long names take a second line instead
  of being cut; on a short window the page starts at the top and scrolls. Profile: the data status,
  the season's figures with its multikills, and rank and form fill the first screen of a
  1440 × 900 window, with the pools straight after; off roles are one-line summaries that open in
  place, their portraits still open the champion window, and the pools read as a display until Edit.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** An element's box once it is on screen (measuring before it renders gives no box). */
async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  return (await locator.boundingBox())!;
}

/** Where the lineup's parts sit: the section tabs above it, the team's header, the cards and the bench of substitutes under them. */
async function lineupParts(page: Page) {
  const tabs = await box(page.getByTestId("team-tabs"));
  const frame = await box(page.getByTestId("lineup-frame"));
  const header = await box(page.getByTestId("team-header"));
  const track = await box(page.getByTestId("lineup-overview"));
  const bench = await box(page.getByTestId("lineup-bench"));
  return { tabsBottom: tabs.y + tabs.height, frameTop: frame.y, headerTop: header.y, headerBottom: header.y + header.height, trackTop: track.y, trackBottom: track.y + track.height, benchTop: bench.y, benchBottom: bench.y + bench.height };
}

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
] as const) {
  test(`Team Overview at ${width} × ${height}: five across under the header, from the top of the page down to the bench, the cards taking the window's height`, async ({ page, context, baseURL }, info) => {
    test.skip(info.project.name !== "desktop", "wide screens");
    // The sidebar open, as it is by default: at 1280 that leaves a 60rem lineup, five across from 58rem.
    await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
    await page.setViewportSize({ width, height });
    await page.goto("/team");
    const cards = page.getByTestId("lineup-cell");
    await expect(cards).toHaveCount(5);
    const boxes = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), width: r.width, height: r.height })));
    expect(new Set(boxes.map((b) => b.top)).size, "one row").toBe(1);
    // Anchored: the header right under the section tabs, the cards right under it, the bench right under them.
    const parts = await lineupParts(page);
    expect(parts.headerTop - parts.tabsBottom, "the header sits under the tabs").toBeLessThanOrEqual(24);
    expect(parts.trackTop - parts.headerBottom).toBeLessThanOrEqual(32);
    expect(parts.benchTop - parts.trackBottom).toBeLessThanOrEqual(16);
    // The cards take the height the window leaves them: their art grows into it (a portrait, at
    // most 1.9 times the card's width, and 30rem), so nothing scrolls and no band of empty page is
    // left under the bench unless the art has reached its largest size.
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const art = await box(page.getByTestId("card-art").first());
    // The card is the art's container: 1.9 times its content box (inside its border).
    const largest = Math.min(1.9 * (await page.locator("[data-testid^=lineup-row-]").first().evaluate((card) => card.clientWidth)), 30 * rem);
    expect(art.height).toBeGreaterThanOrEqual(13 * rem - 1);
    expect(art.height).toBeLessThanOrEqual(largest + 1);
    expect(parts.benchBottom, "the bench ends on the first screen").toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
    const atLargest = art.height >= largest - 1;
    if (!atLargest) expect(height - parts.benchBottom, "no band of empty page under the bench").toBeLessThanOrEqual(4 * rem);
    // The decorative floor (a glow and the team's name under the cards) is gone: the bench is there.
    await expect(page.getByTestId("lineup-stage-floor")).toHaveCount(0);
    // Names are never cut: a long one wraps instead.
    const cut = await page.locator('[data-testid="lineup-overview"] [data-name-style]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length);
    expect(cut).toBe(0);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
}

test("Team Overview on a short window: the lineup follows the header and the page scrolls", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "wide screens");
  await page.setViewportSize({ width: 1440, height: 560 });
  await page.goto("/team");
  const parts = await lineupParts(page);
  // Nothing pushes the page down: the header starts at the top, the cards right under it.
  expect(parts.trackTop - parts.headerBottom).toBeLessThanOrEqual(32);
  expect(Math.abs(parts.headerTop - parts.frameTop), "no space added above the header").toBeLessThanOrEqual(1);
  expect(parts.headerTop - parts.tabsBottom).toBeLessThanOrEqual(24);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeGreaterThan(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("Team Overview in a short desktop window (1280 × 450): the cards' track scrolls inside the page, which never scrolls sideways", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "wide screens");
  // A window this short (devtools docked under it, a split screen) shows the lineup as one sideways
  // track, as a phone held sideways does: inside the content, never as wide as its five cards.
  await page.setViewportSize({ width: 1280, height: 450 });
  for (const path of ["/team", "/public"]) {
    await page.goto(path);
    const track = page.getByTestId("lineup-overview");
    await expect(track).toHaveAttribute("data-ready", "true");
    expect(await overflow(page), `${path}: the page never scrolls sideways`).toBeLessThanOrEqual(1);
    const room = await track.evaluate((el) => ({ scroll: el.scrollWidth, width: el.clientWidth, right: el.getBoundingClientRect().right }));
    expect(room.right, `${path}: the track ends inside the window`).toBeLessThanOrEqual(1280);
    expect(room.scroll, `${path}: the track holds more than it shows`).toBeGreaterThan(room.width + 100);
    // It scrolls on its own, to its last card.
    await track.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect.poll(() => track.evaluate((el) => el.scrollLeft), { message: `${path}: the track scrolls` }).toBeGreaterThan(0);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
});

test("Team Overview on a 1366 × 768 laptop with the sidebar open: all five in one centred row of equal cards", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "laptop widths");
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/team");
  const cells = page.getByTestId("lineup-cell");
  await expect(cells).toHaveCount(5);
  const boxes = await cells.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), bottom: r.bottom })));
  expect(new Set(boxes.map((b) => b.top)).size, "one row").toBe(1);
  expect(new Set(boxes.map((b) => b.width)).size, "equal widths").toBe(1);
  expect(new Set(boxes.map((b) => b.height)).size, "equal heights").toBe(1);
  // The whole lineup on the first screen, centred in the content area under a header of the same width.
  expect(Math.max(...boxes.map((b) => b.bottom))).toBeLessThanOrEqual(768);
  const track = await box(page.getByTestId("lineup-overview"));
  const header = await box(page.getByTestId("team-header"));
  const main = await box(page.locator("main"));
  expect(Math.abs(track.x + track.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs(header.width - track.width)).toBeLessThanOrEqual(2);
  // Narrow cards stay readable: names wrap whole (never cut) and ranks are not shortened.
  const cut = await page.locator('[data-testid="lineup-overview"] [data-name-style], [data-testid="lineup-overview"] [data-testid="rank-inline"] > span').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length);
  expect(cut).toBe(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("Team Overview on a very wide screen: the lineup keeps its maximum width, centred, with the bench's cells under their cards", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "wide screens");
  await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/team");
  const track = await box(page.getByTestId("lineup-overview"));
  const main = await box(page.locator("main"));
  // The cap is in rem (the type scales with very large screens, the lineup with it), never the
  // window: 100rem from a 90rem lineup, so the cards' art reads as portraits.
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(track.width).toBeLessThanOrEqual(100 * rem + 1);
  expect(track.width).toBeLessThan(main.width - 2 * 4 * rem);
  expect(Math.abs(track.x + track.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(2);
  // The bench's cells share the cards' columns: each role's cell under its card.
  const roles = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
  for (const [i, role] of roles.entries()) {
    const cell = await box(page.getByTestId("lineup-cell").nth(i));
    const under = await box(page.getByTestId(`bench-${role}`).or(page.getByTestId(`bench-empty-${role}`)));
    expect(Math.abs(under.x - cell.x), `${role}: left edges`).toBeLessThanOrEqual(1);
    expect(Math.abs(under.width - cell.width), `${role}: widths`).toBeLessThanOrEqual(1);
  }
});

async function openTeammate(page: Page) {
  await page.goto("/players");
  // Phones list the players as rows (docs/MOBILE.md); wider screens as cards.
  const card = playerEntry(page, "Demo Top");
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByTestId("pool-editor")).toBeVisible();
}

test("profile Overview: a 2×2 dashboard at 1440 (the season beside recent form, then the pools beside ranked progress), the earlier arrangement on smaller screens; off roles open in place", async ({ page }, info) => {
  await openTeammate(page);
  if (info.project.name === "desktop") {
    // 1440 × 900 (the owner's choice of 8 Nov 2026, from 1440 wide): the season's card (with its
    // multikills) and recent form side by side, level, both ending on the first screen; under the
    // season's card the pools, under recent form ranked progress, in the rail; all four starting on
    // the first screen.
    const four = () => Promise.all([box(page.getByTestId("season-figures")), box(page.getByTestId("recent-form")), box(page.getByTestId("ranked-progress")), box(page.getByTestId("champion-pools"))]);
    let scrollY = await page.evaluate(() => window.scrollY);
    let [figures, form, ranked, pools] = await four();
    expect(figures.y + figures.height + scrollY, "the season's card ends on the first screen").toBeLessThanOrEqual(900);
    expect(form.y + form.height + scrollY, "recent form ends on the first screen").toBeLessThanOrEqual(900);
    expect(form.x, "recent form in the rail beside the season's card").toBeGreaterThan(figures.x + figures.width);
    expect(Math.abs(form.y - figures.y), "level with it").toBeLessThanOrEqual(1);
    expect(Math.abs(ranked.x - form.x), "ranked progress in the rail").toBeLessThanOrEqual(1);
    expect(ranked.y - (form.y + form.height), "under recent form").toBeGreaterThanOrEqual(0);
    expect(ranked.y - (form.y + form.height), "straight under it").toBeLessThanOrEqual(24);
    expect(Math.abs(pools.x - figures.x), "the pools under the season's card").toBeLessThanOrEqual(1);
    expect(pools.y - (figures.y + figures.height), "straight under it").toBeLessThanOrEqual(24);
    for (const [name, b] of [["ranked progress", ranked], ["the pools", pools]] as const) expect(b.y + scrollY, `${name} starts on the first screen`).toBeLessThan(900);
    // A smaller window (1280 × 800, the sidebar open) keeps the earlier arrangement: ranked progress
    // across the whole width under the first row, then the pools across the width.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(async () => Math.round((await box(page.getByTestId("ranked-progress"))).x - (await box(page.getByTestId("season-figures"))).x)).toBe(0);
    scrollY = await page.evaluate(() => window.scrollY);
    [figures, form, ranked, pools] = await four();
    expect(ranked.y, "ranked progress under both").toBeGreaterThanOrEqual(Math.max(figures.y + figures.height, form.y + form.height));
    expect(Math.abs(ranked.x + ranked.width - (form.x + form.width)), "to the right edge of recent form").toBeLessThanOrEqual(1);
    expect(pools.y - (ranked.y + ranked.height), "the pools follow straight after ranked progress").toBeLessThanOrEqual(24);
    expect(Math.abs(pools.x - figures.x), "across the width").toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  // The pools: one row per champion under one row of column names; no Experience labels.
  const primary = page.getByTestId("primary-pool");
  await expect(primary.getByTestId("primary-pool-columns")).toHaveCount(1);
  await expect(primary.getByTestId("pool-item").first().getByTestId("pool-card-stats")).toBeVisible();
  await expect(page.getByTestId("champion-pools")).not.toContainText(/Played a lot|Played regularly|Not played lately|Some experience/);
  // Off roles: one line each, with the champions as portraits; the rows are behind "Show".
  const off = page.getByTestId("secondary-pool");
  await expect(off).toHaveAttribute("data-open", "false");
  await expect(off.getByTestId("secondary-pool-preview")).toBeVisible();
  await expect(off.getByTestId("secondary-pool-list")).toBeHidden();
  const toggle = off.getByTestId("secondary-pool-expand");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  // A portrait opens that champion's window, in the off role.
  const portrait = off.getByTestId("pool-preview-inspect").first();
  const champion = await portrait.locator("xpath=..").getAttribute("data-champion");
  await portrait.click();
  await expect(page.getByTestId("champion-detail")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`champ=${champion}`));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-detail")).toHaveCount(0);
  // Opening shows the full pool; closing folds it back.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(off.getByTestId("secondary-pool-list")).toBeVisible();
  await expect(off.getByTestId("secondary-pool-list").getByTestId("pool-item").first()).toBeVisible();
  await toggle.click();
  await expect(off.getByTestId("secondary-pool-list")).toBeHidden();
  // The pools read as a display: no grips, ×, role menus or Add until Edit, which brings them all
  // (every role open); Done puts them away again.
  const pools = page.getByTestId("profile-editor");
  const editButton = page.getByTestId("pools-edit");
  await expect(pools.getByTestId("pool-grip")).toHaveCount(0);
  await expect(pools.getByTestId("pool-remove")).toHaveCount(0);
  await expect(pools.getByTestId("role-grip")).toHaveCount(0);
  await expect(pools.getByRole("button", { name: /^Change the .* role$/ })).toHaveCount(0);
  await expect(page.getByTestId("add-off-role")).toHaveCount(0);
  await editButton.click();
  await expect(editButton).toHaveText(/Done/);
  await expect(off.getByTestId("secondary-pool-list")).toBeVisible();
  await expect(off.getByRole("button", { name: /Add/ }).first()).toBeVisible();
  await expect(pools.getByTestId("pool-remove").first()).toBeVisible();
  await expect(pools.getByRole("button", { name: /^Change the .* role$/ }).first()).toBeVisible();
  await expect(page.getByTestId("add-off-role")).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await editButton.click();
  await expect(editButton).toHaveText(/Edit/);
  await expect(pools.getByTestId("pool-grip")).toHaveCount(0);
  await expect(off.getByTestId("secondary-pool-list")).toBeHidden();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

// A pool's figures never shrink below their text (shrunk to a few pixels they read as one wrong
// number) and stay under their column names, which keep to one line; on the narrowest phone a row
// keeps the figures beside the name; while editing, a phone's list gives their room to the grip and
// ×; with larger text they wrap under the name rather than squeeze.
test("profile pools on a phone: every figure whole and under its column, editing and larger text included", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  await openTeammate(page);
  const pool = page.getByTestId("primary-pool");
  const facts = () =>
    pool.evaluate((el) => {
      const shown = (e: Element) => e.checkVisibility();
      /** The boxes of an element's visible text, line by line (not its read-out-only label). */
      const textBoxes = (e: Element) => {
        const boxes: DOMRect[] = [];
        const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const parent = n.parentElement!;
          if (!n.textContent?.trim() || parent.closest(".sr-only") || !parent.checkVisibility()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          boxes.push(...[...range.getClientRects()].filter((r) => r.width > 0));
        }
        return boxes;
      };
      const extent = (boxes: DOMRect[]) => (boxes.length ? { left: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)) } : null);
      // A figure is cut when its text is wider than its cell, by any fraction ("Perfect" was 0.9px
      // over a 38px column: an element's scrollWidth rounds that away).
      const figures = [...el.querySelectorAll("[data-testid=pool-card-stats] > span")].filter(shown);
      const cut = figures.flatMap((cell) => {
        const text = extent(textBoxes(cell));
        return text && text.right - text.left > cell.getBoundingClientRect().width + 0.25 ? [cell.textContent?.trim() ?? ""] : [];
      });
      // The rest of a row (names wrap, never cut).
      cut.push(...[...el.querySelectorAll<HTMLElement>("[data-testid=pool-item] span")].filter((e) => shown(e) && e.clientWidth > 1 && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent?.trim() ?? ""));
      const centres = (box: Element | null) => (box && shown(box) ? [...box.children].filter(shown).map((c) => Math.round(c.getBoundingClientRect().left + c.getBoundingClientRect().width / 2)) : []);
      // The column names: Champion, then the figures' part (the span that holds three or more names).
      const columns = el.querySelector("[data-testid$=-columns]");
      const headStats = [...(columns?.children ?? [])].find((s) => s.children.length >= 3) ?? null;
      const names = [columns?.children[1], ...(headStats && shown(headStats) ? [...headStats.children] : [])].filter((c): c is Element => !!c && shown(c));
      // Each name on one line, and none running into the next (a name that clips is measured to its edge).
      const nameLines = names.map((c) => ({ name: c.textContent?.trim() ?? "", lines: new Set(textBoxes(c).map((b) => Math.round(b.top))).size }));
      const spans = names.flatMap((c) => {
        const text = extent(textBoxes(c));
        const clips = getComputedStyle(c).overflowX !== "visible";
        return text ? [{ name: c.textContent?.trim() ?? "", left: text.left, right: clips ? Math.min(text.right, c.getBoundingClientRect().right) : text.right }] : [];
      });
      const overlaps = spans.slice(1).flatMap((s, i) => (s.left < spans[i]!.right - 0.5 ? [`${spans[i]!.name} / ${s.name}`] : []));
      const withGames = [...el.querySelectorAll("[data-testid=pool-item] [data-testid=pool-card-stats]")].find((s) => s.children.length >= 3) ?? null;
      // "Perfect" (no demo champion has a perfect KDA): a hidden copy of a KDA cell holding it, a
      // size smaller under 24rem as PoolRowStats writes it, measured whole against the cell.
      let perfect: { need: number; room: number } | null = null;
      const kda = withGames?.children[2];
      if (kda && shown(kda)) {
        const probe = kda.cloneNode(false) as HTMLElement;
        probe.classList.add("@max-sm:text-2xs");
        probe.textContent = "Perfect";
        Object.assign(probe.style, { position: "absolute", visibility: "hidden", width: "max-content" });
        kda.parentElement!.append(probe);
        perfect = { need: probe.getBoundingClientRect().width, room: kda.getBoundingClientRect().width };
        probe.remove();
      }
      return {
        cut,
        head: centres(headStats),
        row: withGames ? centres(withGames) : [],
        nameLines,
        overlaps,
        perfect,
        rowHeights: [...el.querySelectorAll("[data-testid=pool-item]")].map((li) => Math.round(li.getBoundingClientRect().height)),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(async () => (await facts()).cut, `${width}: nothing cut`).toEqual([]);
    const f = await facts();
    expect(f.overflow, `${width}: no sideways page scroll`).toBeLessThanOrEqual(1);
    expect(f.row.length, `${width}: a row's figures measured`).toBeGreaterThanOrEqual(3);
    f.row.forEach((x, i) => expect(Math.abs(x - f.head[i]!), `${width}: figure ${i + 1} under its column name`).toBeLessThanOrEqual(3));
    expect(f.nameLines.length, `${width}: the column names measured`).toBeGreaterThanOrEqual(4);
    for (const n of f.nameLines) expect(n.lines, `${width}: "${n.name}" on one line`).toBe(1);
    expect(f.overlaps, `${width}: no column name runs into the next`).toEqual([]);
    expect(f.perfect, `${width}: a KDA cell measured`).not.toBeNull();
    expect(f.perfect!.need, `${width}: "Perfect" whole in its column (${f.perfect!.room}px)`).toBeLessThanOrEqual(f.perfect!.room + 0.25);
    // The narrowest phone: position, portrait, name and figures on one line in every row (44px;
    // with 8px gaps the line was 2px short and every row took two).
    if (width === 320) expect(Math.max(...f.rowHeights), `320: rows ${f.rowHeights.join(", ")}px, none wrapped`).toBeLessThanOrEqual(46);
  }
  // Larger text (125% at 360): still nothing cut and no sideways scroll.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "125%"; });
  await expect.poll(async () => (await facts()).cut, "125% text: nothing cut").toEqual([]);
  expect((await facts()).overflow, "125% text: no sideways page scroll").toBeLessThanOrEqual(1);
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  // Editing at 390 (nothing is saved): the figures and their column names step aside for the grip
  // and ×, nothing cut; Done brings them back.
  await page.setViewportSize({ width: 390, height: 800 });
  const edit = page.getByTestId("pools-edit");
  await expect(async () => {
    if (!/Done/.test(await edit.innerText())) await edit.click();
    await expect(edit).toHaveText(/Done/, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(pool.getByTestId("pool-grip").first()).toBeVisible();
  await expect(pool.getByTestId("pool-card-stats").first()).toBeHidden();
  await expect.poll(async () => (await facts()).cut, "editing: nothing cut").toEqual([]);
  expect((await facts()).head, "editing: the figures' column names hidden too").toEqual([]);
  await edit.click();
  await expect(edit).toHaveText(/Edit/);
  await expect(pool.getByTestId("pool-card-stats").first()).toBeVisible();
});

// Without recent form (one champion's games, too few for it), ranked progress spans the rail's two
// rows: opening its history grows the rail's second row, never the season's card, and the pools
// under that card stay where they are (the card had stretched by 108px and the pools moved down).
test("profile Overview's 2×2 without recent form: opening Ranked progress's history moves neither the season's card nor the pools", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the 2×2 is from a 1440px window");
  await page.goto("/players");
  const href = (await playerEntry(page, "Demo Top").first().getAttribute("href"))!;
  await page.goto(`${href}?scope=champion&champion=Ornn`);
  await expect(page.getByTestId("ranked-progress")).toBeVisible();
  await expect(page.getByTestId("recent-form"), "Ornn's games are too few for recent form").toHaveCount(0);
  /** A card's top on the page (not the window, in case a click scrolls) and its height. */
  const at = (testId: string) =>
    page.getByTestId(testId).evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { top: r.top + window.scrollY, left: r.left, right: r.right, height: r.height };
    });
  const [figures, pools, ranked] = [await at("season-figures"), await at("champion-pools"), await at("ranked-progress")];
  expect(ranked.left, "the 2×2: ranked progress in the rail beside the season's card").toBeGreaterThan(figures.right);
  expect(pools.top, "the pools under the season's card").toBeGreaterThan(figures.top + figures.height);
  await page.getByTestId("ranked-details-toggle").click();
  await expect(page.getByTestId("ranked-details")).toHaveAttribute("open", "");
  await expect(page.getByTestId("ranked-table")).toBeVisible();
  const [figuresOpen, poolsOpen] = [await at("season-figures"), await at("champion-pools")];
  expect(Math.abs(figuresOpen.height - figures.height), "the season's card keeps its height").toBeLessThanOrEqual(1);
  expect(Math.abs(poolsOpen.top - pools.top), "the pools stay where they were").toBeLessThanOrEqual(1);
});
