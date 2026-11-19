import { expect, test, type Locator, type Page } from "./test";
import { playerEntry } from "./players";

/* My Profile pieces: All Champions sorting (both ways, filters kept) and the profile header controls. */

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("All Champions: column headings sort both ways within the current filters; mastery points shown", async ({ page }) => {
  test.skip(test.info().project.name === "phone", "the phone layout uses the Sort by control (next test)");
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first().getAttribute("href");
  await page.goto(`${href}/champions`);
  const rows = page.getByTestId("top-champion");
  test.skip((await rows.count()) < 2, "needs stored games");
  const before = new URL(page.url()).search;
  const games = () => rows.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-games"))));
  // Games: most first by default, then least first.
  const desc = await games();
  expect(desc).toEqual([...desc].sort((a, b) => b - a));
  await page.getByTestId("sort-games").click();
  const asc = await games();
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  await expect(page.getByTestId("all-champions-header").locator("[data-sort=asc]")).toHaveCount(1);
  // Mastery points: a column of its own, sorted highest first; missing values last.
  await page.getByTestId("sort-mastery").click();
  const mastery = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-mastery")).map((v) => (v ? Number(v) : null)));
  const known = mastery.filter((v): v is number => v !== null);
  expect(known).toEqual([...known].sort((a, b) => b - a));
  expect(mastery.slice(known.length).every((v) => v === null)).toBe(true);
  await expect(rows.first().getByTestId("mastery-points")).toBeVisible();
  // Sorting never touches the filters (they live in the address).
  expect(new URL(page.url()).search).toBe(before);
  // No Experience: no column, no sort, no badges or their words (mastery and the figures stay).
  await expect(page.getByTestId("sort-proficiency")).toHaveCount(0);
  await expect(page.getByTestId("all-champions-header")).not.toContainText(/Experience/i);
  await expect(page.getByTestId("all-champions")).not.toContainText(/Played a lot|Played regularly|Not played lately|Some experience/);
  // The champion's preview neither.
  await expect(async () => {
    if (!(await page.getByTestId("champion-preview").count())) await rows.first().getByTestId("open-champion").click({ timeout: 2_000 });
    await expect(page.getByTestId("champion-preview-figures")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("champion-proficiency")).toHaveCount(0);
  await expect(page.getByTestId("champion-preview")).not.toContainText(/Played a lot|Played regularly|Not played lately|Some experience/);
});

test("All Champions on a phone: a Sort by control with a direction toggle, no sideways scrolling", async ({ page }) => {
  test.skip(test.info().project.name !== "phone", "phone only");
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first().getAttribute("href");
  await page.goto(`${href}/champions`);
  const rows = page.getByTestId("top-champion");
  test.skip((await rows.count()) < 2, "needs stored games");
  await page.locator("#all-champions-sort-by").selectOption("games");
  await page.getByTestId("all-champions-sort-dir").click();
  const asc = await rows.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-games"))));
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("All Champions on a phone: the tab names it, the scope's words on one line from 375px, search and Sort by (its mark shown) on one row from 360px, the sorted pair first in semibold", async ({ page }) => {
  test.skip(test.info().project.name !== "phone", "phone only");
  await page.goto("/players");
  const href = await playerEntry(page, "Demo Top").first().getAttribute("href");
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`${href}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.first()).toBeVisible();
  // The title is drawn as screen-reader text (sr-only: still the section's heading, never display:
  // none); the current tab, in the top bar, says where you are.
  const title = page.locator("#all-champions");
  await expect(page.getByRole("heading", { level: 2, name: "All champions" })).toHaveCount(1);
  expect(await title.evaluate((h) => h.getBoundingClientRect().width), "the title drawn as screen-reader text").toBeLessThanOrEqual(1);
  await expect(page.getByTestId("profile-chrome-tab-champions")).toHaveAttribute("aria-current", "page");
  // "6 champions · Season 2026 · All supported games": every champion in the filters (all of them listed once Show all is pressed).
  const more = page.getByTestId("all-champions-more");
  if (await more.count()) await more.click();
  const n = await rows.count();
  const scope = page.getByTestId("all-champions-scope");
  await expect(scope).toHaveText(new RegExp(`^${n} champions? · Season \\d{4} · All supported games$`));
  const lines = (el: HTMLElement) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight);
  // One line at 393px with its status's ⓘ (Demo Top's status is the ⓘ alone); the words alone from 375px.
  expect(await page.getByTestId("section-scope").evaluate(lines), "393px: the scope and its ⓘ on one line").toBeLessThan(1.5);
  const search = page.getByTestId("all-champions-search");
  const sort = page.getByTestId("all-champions-sort-mobile");
  const card = page.getByTestId("all-champions-table");
  // From a 20.5rem card (a 360px phone) the search and Sort by share one row: the words "Sort by"
  // read out only (the control's accessible name), the sort mark shown before the column's name.
  for (const width of [393, 375, 360]) {
    await page.setViewportSize({ width, height: 852 });
    const [s, o, c] = [(await search.boundingBox())!, (await sort.boundingBox())!, (await card.boundingBox())!];
    expect(Math.abs(s.y + s.height / 2 - (o.y + o.height / 2)), `${width}px: one row`).toBeLessThanOrEqual(2);
    expect(o.x + o.width, `${width}px: inside the card`).toBeLessThanOrEqual(c.x + c.width);
    expect(s.width, `${width}px: the search keeps room to type`).toBeGreaterThanOrEqual(width >= 375 ? 120 : 100);
    await expect(page.getByLabel("Sort by")).toBeVisible();
    expect(await sort.locator("label").evaluate((l) => l.getBoundingClientRect().width), `${width}px: the label read out only`).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("all-champions-sort-mark"), `${width}px: the sort mark shown`).toBeVisible();
    if (width >= 375) expect(await scope.evaluate(lines), `${width}px: the scope's words on one line`).toBeLessThan(1.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px: no sideways scroll`).toBeLessThanOrEqual(0);
  }
  // On a 320px phone the search keeps its own line, with Sort by and its label under it.
  await page.setViewportSize({ width: 320, height: 568 });
  const [s, o] = [(await search.boundingBox())!, (await sort.boundingBox())!];
  expect(o.y, "320px: Sort by under the search").toBeGreaterThanOrEqual(s.y + s.height - 1);
  expect(await sort.locator("label").evaluate((l) => l.getBoundingClientRect().width), "320px: the label shown").toBeGreaterThan(1);
  // Held sideways (a short window), the section's tabs are right above it: the title is read out only there too.
  await page.setViewportSize({ width: 852, height: 393 });
  expect(await title.evaluate((h) => h.getBoundingClientRect().width), "held sideways: the title read out only").toBeLessThanOrEqual(1);
  await expect(page.getByRole("heading", { level: 2, name: "All champions" })).toHaveCount(1);
  await page.setViewportSize({ width: 393, height: 852 });
  // Sorted by a figure other than games or win rate, that figure follows the role on each row (in
  // place of "In pool"); sorted by games, none.
  const figures = () => rows.evaluateAll((els) => els.map((r) => r.querySelector("[data-testid=champion-sorted-figure]")?.textContent?.trim() ?? null));
  await page.locator("#all-champions-sort-by").selectOption("kills");
  for (const f of await figures()) expect(f).toMatch(/^· Kills /);
  await page.locator("#all-champions-sort-by").selectOption("double");
  for (const f of await figures()) expect(f).toMatch(/^· Double kills /);
  await page.locator("#all-champions-sort-by").selectOption("games");
  for (const f of await figures()) expect(f).toBeNull();
});

test("at 200% text on a 320px phone, All Champions is no wider than the phone: each row stacks under the name, every name whole, and the profile header's rank inside the phone", async ({ page }) => {
  test.skip(test.info().project.name !== "phone", "a 320px phone");
  await page.goto("/players");
  const href = await playerEntry(page, "Demo Top").first().getAttribute("href");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${href}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.first()).toBeVisible();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: "the page as wide as the phone" }).toBeLessThanOrEqual(0);
  // Under a 17rem list the win rate and games go under the name instead of squeezing it out beside them.
  const facts = await rows.evaluateAll((els) =>
    els.map((r) => {
      const name = r.querySelector<HTMLElement>("[data-testid=open-champion]")!;
      const figures = r.children[1] as HTMLElement;
      return { text: name.textContent, cut: name.scrollWidth > name.clientWidth + 1, right: name.getBoundingClientRect().right, stacked: figures.getBoundingClientRect().top >= name.getBoundingClientRect().bottom - 1 };
    }),
  );
  for (const f of facts) {
    expect(f.cut, `${f.text}: whole, never cut with an ellipsis`).toBe(false);
    expect(f.right, `${f.text}: on screen`).toBeLessThanOrEqual(320);
    expect(f.stacked, `${f.text}: the win rate and games under the name`).toBe(true);
  }
  // The profile header (overflow-hidden, so the page's width cannot show it): its rank line puts the
  // LP under the rank rather than past the phone's edge (it reached 377px). Its words are measured,
  // not its box, which the header's narrow column can squeeze to nothing at this size.
  const rankRight = await page.getByTestId("profile-rank").evaluate((el) => {
    const words = document.createRange();
    words.selectNodeContents(el);
    return words.getBoundingClientRect().right;
  });
  expect(rankRight, "the rank's words inside the phone").toBeLessThanOrEqual(320.5);
});

test("All Champions on tablets and computers: a quiet bar under each champion's games, its share of every game in the filters, said on screen; a click on it opens the champion", async ({ page }) => {
  test.skip(test.info().project.name === "phone", "the table's Games column (phones list the games at the row's right)");
  await page.goto("/players");
  const href = await playerEntry(page, "Demo Top").first().getAttribute("href");
  const rows = page.getByTestId("top-champion");
  // The whole is every game in the filters: Demo Top's games in the season, then only those played in Top.
  for (const filter of ["", "?role=TOP"]) {
    await page.goto(`${href}/champions${filter}`);
    await expect(rows.first()).toBeVisible();
    const more = page.getByTestId("all-champions-more");
    if (await more.count()) await more.click();
    const cells = await rows.evaluateAll((els) =>
      els.map((r) => {
        const cell = r.querySelector<HTMLElement>("[data-testid=champion-games]")!;
        const bar = cell.querySelector<HTMLElement>("[data-testid=champion-games-share]")!;
        const [c, b, n] = [cell.getBoundingClientRect(), bar.getBoundingClientRect(), cell.firstElementChild!.getBoundingClientRect()];
        return { games: Number(r.dataset.games), share: Number(bar.dataset.value), title: cell.title, read: cell.querySelector(".sr-only")!.textContent, hidden: bar.getAttribute("aria-hidden"), inCell: b.left >= c.left - 0.5 && b.right <= c.right + 0.5, under: b.top >= n.bottom - 0.5, height: Math.round(r.getBoundingClientRect().height) };
      }),
    );
    expect(cells.length).toBeGreaterThan(1);
    // Demo Top has a main role, so every game in the filters has its champion's row: the rows' games add up to the whole.
    const total = cells.reduce((sum, c) => sum + c.games, 0);
    for (const c of cells) {
      const words = c.share > 0 && c.share < 0.005 ? "under 1%" : c.share < 1 && c.share >= 0.995 ? "over 99%" : `${(c.share * 100).toFixed(0)}%`;
      expect(c.share, `${filter || "the season"}: ${c.games} of ${total} games`).toBeCloseTo(c.games / total, 9);
      expect(c.title).toBe(`${c.games} game${c.games === 1 ? "" : "s"} · ${words} of the ${total} game${total === 1 ? "" : "s"} in these filters`);
      expect(c.read).toBe(`, ${words} of the games in these filters`);
      expect(c.hidden, "the bar is the figure in words for screen readers, not a second reading").toBe("true");
      expect(c.inCell && c.under, "under the figure, inside its column").toBe(true);
      expect(c.height, "the row keeps its height").toBeLessThanOrEqual(56);
    }
    // What the bar is, on screen for every reader where it is drawn: a key in the toolbar's row.
    const key = page.getByTestId("games-share-legend");
    await expect(key).toHaveText(`share of the ${total} games in these filters`);
    await expect(key.locator("[aria-hidden=true]"), "its swatch, a bar like the column's").toHaveCount(1);
    const [k, search] = [(await key.boundingBox())!, (await page.getByTestId("all-champions-search").boundingBox())!];
    expect(Math.abs(k.y + k.height / 2 - (search.y + search.height / 2)), "the key on the search's row").toBeLessThanOrEqual(2);
  }
  // The bar lets a click through to the row: a click on its fill opens the champion's preview.
  const fill = (await rows.first().getByTestId("champion-games-share").boundingBox())!;
  await expect(async () => {
    if (!(await page.getByTestId("champion-preview").count())) await page.mouse.click(fill.x + 3, fill.y + fill.height / 2);
    await expect(page.getByTestId("champion-preview-figures")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
});

test("All Champions from a 76rem list: the figures in groups, a clearly larger space before each group's first heading", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "a wide window");
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto("/players");
  const href = await playerEntry(page, "Demo Top").first().getAttribute("href");
  await page.goto(`${href}/champions`);
  await expect(page.getByTestId("top-champion").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const heads = await page.getByTestId("all-champions-header").evaluate((h) => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return {
      rem,
      cells: [...h.children]
        .filter((c) => getComputedStyle(c).display !== "none")
        .map((c) => {
          const b = c.querySelector("button")!;
          return { label: b.textContent!.replace(/, sorted.*/, ""), left: b.getBoundingClientRect().left, right: b.getBoundingClientRect().right };
        }),
    };
  });
  const labels = heads.cells.map((c) => c.label);
  // No Kills column at this width: it sorts like Games, and per-game kills are in KDA (CM AC-11).
  expect(labels).toEqual(["Champion", "Games", "Win rate", "KDA", "CS/min", "Double", "Triple", "Quadra", "Penta", "Mastery"]);
  // The empty space before each heading, from the one before it.
  const space = (label: string) => {
    const i = labels.indexOf(label);
    return (heads.cells[i]!.left - heads.cells[i - 1]!.right) / heads.rem;
  };
  const inside = ["Win rate", "CS/min", "Triple", "Quadra", "Penta"].map(space);
  for (const start of ["KDA", "Double", "Mastery"]) expect(space(start), `${start}: ${space(start).toFixed(2)}rem against at most ${Math.max(...inside).toFixed(2)}rem inside a group`).toBeGreaterThan(Math.max(...inside) + 0.4);
  // The 76rem grid's headings, sort arrows and figures whole and clear, here and at its narrowest
  // (a 1536px window beside the open sidebar: a 76rem list, every track at its minimum).
  for (const viewport of [{ width: 1680, height: 1000 }, { width: 1536, height: 900 }]) {
    await page.setViewportSize(viewport);
    const table = await championTable(page);
    const at = `${viewport.width}px`;
    expect(table.columns, `${at}: Champion and nine figure columns`).toBe(10);
    expect(Math.max(...table.heights), `${at}: rows ${table.heights.join(", ")}`).toBeLessThanOrEqual(56);
    expect(table.spilled, `${at}: headings inside their columns`).toEqual([]);
    expect(table.arrowsOver, `${at}: sort arrows clear of the headings beside them`).toEqual([]);
    expect(table.figuresCut, `${at}: figures whole`).toEqual([]);
  }
});

/** All Champions as drawn: its columns, its rows' heights and role lines, and whether every heading, sort arrow and figure is whole. */
async function championTable(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    const shown = (el: Element) => getComputedStyle(el).display !== "none";
    const rows = [...document.querySelectorAll<HTMLElement>("[data-testid=top-champion]")];
    const heads = [...document.querySelector("[data-testid=all-champions-header]")!.children].filter(shown).map((cell) => {
      const button = cell.querySelector("button")!;
      return { label: button.textContent!.replace(/, sorted.*/, ""), cell: box(cell), text: box(button), arrow: box(button.querySelector("svg")!) };
    });
    const line = (row: Element) => row.querySelector("[data-testid=champion-role-line]")!;
    return {
      columns: heads.length,
      heights: rows.map((r) => Math.round(box(r).height)),
      // "Support · In pool" on one line under the name, and the role's name whole.
      wrapped: rows.filter((r) => {
        const pool = line(r).querySelector("[data-testid=in-pool]");
        return !!pool && Math.abs(box(pool).top - box(line(r).firstElementChild!).top) > 4;
      }).map((r) => r.dataset.champion),
      rolesCut: rows.filter((r) => {
        const name = line(r).firstElementChild!.lastElementChild!;
        return name.scrollWidth > name.clientWidth + 1;
      }).map((r) => r.dataset.champion),
      // Each heading inside its own column, and each sort arrow (shown when sorted or pointed at) clear of the headings beside it.
      spilled: heads.filter((h) => h.text.left < h.cell.left - 0.5 || h.text.right > h.cell.right + 0.5).map((h) => h.label),
      arrowsOver: heads.flatMap((h, i) => [heads[i - 1], heads[i + 1]].filter((n) => !!n && Math.min(h.arrow.right, n.text.right) - Math.max(h.arrow.left, n.text.left) > 0.5).map((n) => `${h.label} over ${n!.label}`)),
      figuresCut: rows.flatMap((r) => [...r.children].filter((el) => shown(el) && el.tagName !== "DL" && !el.querySelector("[data-open-champion]") && el.scrollWidth > el.clientWidth + 1).map((el) => `${r.dataset.champion}: ${el.textContent}`)),
    };
  });
}

test("All Champions on tablets and computers: one compact row per champion for every role, with headings, sort arrows and figures whole", async ({ page, context, baseURL }) => {
  test.skip(test.info().project.name === "phone", "phones list each champion on two lines, its figures under it");
  // The table's columns start at a 44rem list: a 752px tablet, or a 1024px computer with the
  // sidebar open, leaves exactly that. Bottom and Support are the longest role names beside "In pool".
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
  const widths = test.info().project.name === "tablet" ? [768, 752] : [1440, 1024];
  for (const name of ["Demo ADC", "Demo Support"]) {
    await page.setViewportSize({ width: widths[0]!, height: 900 });
    await page.goto("/players");
    const href = await playerEntry(page, name).first().getAttribute("href");
    await page.goto(`${href}/champions`);
    await expect(page.getByTestId("top-champion").first()).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const table = await championTable(page);
      const at = `${name} at ${width}px`;
      expect(table.columns, `${at}: Champion and seven figure columns`).toBe(8);
      expect(Math.max(...table.heights), `${at}: rows ${table.heights.join(", ")}`).toBeLessThanOrEqual(56);
      expect(table.wrapped, `${at}: "In pool" on the role's line`).toEqual([]);
      expect(table.rolesCut, `${at}: role names whole`).toEqual([]);
      expect(table.spilled, `${at}: headings inside their columns`).toEqual([]);
      expect(table.arrowsOver, `${at}: sort arrows clear of the headings beside them`).toEqual([]);
      expect(table.figuresCut, `${at}: figures whole`).toEqual([]);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("the profile header: Main lineup is a status, Customise is one small control, rank has a crest", async ({ page }) => {
  await page.goto("/players");
  await playerEntry(page, "Demo Top").click();
  const header = page.getByTestId("profile-header");
  await expect(header).toBeVisible();
  await expect(header.getByTestId("profile-rank").getByTestId("rank-emblem")).toHaveCount(1);
  const status = header.getByTestId("lineup-status");
  if (await status.count()) {
    await expect(status).toContainText("Main lineup");
    expect(await status.evaluate((e) => e.tagName)).toBe("SPAN");
  }
  const customise = header.getByTestId("customise-card");
  await expect(customise).toHaveCount(1);
  await expect(customise).toHaveAccessibleName(/Customise/);
  const box = (await customise.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(48);
});

/**
 * An element's text as it shows on screen. Left out: text that is never drawn (an SVG's <title>,
 * such as the name a role icon's built-in shape carries, which only a tooltip shows; anything in an
 * element with no box, display: none) and the words that are read out only (sr-only, also behind a
 * variant).
 */
const shownText = (target: Locator) =>
  target.evaluate((el) => {
    let text = "";
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const parent = n.parentElement!;
      if (parent.closest("svg title, svg desc") || !parent.checkVisibility()) continue;
      if (getComputedStyle(parent).position === "absolute" && parent.getBoundingClientRect().width <= 1) continue;
      text += n.textContent;
    }
    return text.replace(/\s+/g, " ").trim();
  });

test("the profile header on a phone: an off role says so in words, and from 375px the picture spans the name's and the roles' rows", async ({ page }) => {
  test.skip(test.info().project.name !== "phone", "the phone header (375px)");
  // Riot's icon host out of reach, as on a run without internet (and in CI until the images
  // arrive): the off role's icon stays its built-in shape, which carries its name in an SVG <title>,
  // so the words on screen are read past that name every time, not by chance. The shapes, and the
  // rank crest's stand-in, are the size of Riot's images, so the header's measurements hold.
  await page.route(/raw\.communitydragon\.org/, (route) => route.abort());
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/players");
  await playerEntry(page, "Demo Top").click();
  const header = page.getByTestId("profile-header");
  await expect(header).toBeVisible();
  // Not by colour alone: "Mid (off)" on screen, "Mid (off role)" read out; the icon's name is not on screen.
  const off = header.getByTestId("additional-role").first();
  await expect(off).toBeVisible();
  await expect(off.locator("svg[data-role-icon] title"), "the off role's icon: the built-in shape, named in a <title>").toHaveCount(1);
  expect(await shownText(off)).toMatch(/^\S+ \(off\)$/);
  expect((await off.textContent())!.replace(/\s+/g, " ")).toMatch(/\(off role\)/);
  // The picture spans two rows: the roles, rank and status beside it, under the name, not under
  // the picture across the width. Demo Top's standard card (no tagline, no links): 142px.
  const [picture, name, roles] = await Promise.all([header.locator("[data-avatar-frame]").first().boundingBox(), header.locator("h1").boundingBox(), off.locator("xpath=..").boundingBox()]);
  expect(roles!.x, "the roles' line starts beside the picture").toBeGreaterThanOrEqual(picture!.x + picture!.width);
  expect(roles!.y, "under the name").toBeGreaterThanOrEqual(name!.y + name!.height - 1);
  expect((await header.boundingBox())!.height, "Demo Top's header at 375px").toBeLessThanOrEqual(148);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("the editable profile header with larger text: the name takes the width under the picture instead of a letter a line", async ({ page }) => {
  test.skip(test.info().project.name !== "phone", "a phone's browser text size, set over Chromium's DevTools protocol");
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/players");
  await playerEntry(page, "Demo Top").click();
  const header = page.getByTestId("profile-header");
  await expect(header.getByTestId("customise-card")).toBeVisible();
  // The browser's text size (24px, 150%), which rem media queries follow; an inline size on the
  // root would not reach them.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 24 } });
  await expect.poll(() => page.evaluate(() => matchMedia("(width < 17.5rem)").matches), "a window under 17.5rem at this text size").toBe(true);
  const name = header.locator("h1");
  await expect.poll(async () => (await name.boundingBox())!.width, "the name's width at 150% text").toBeGreaterThanOrEqual(120);
  // Clear of Customise, which stays at the picture's row end.
  const [n, chip] = [(await name.boundingBox())!, (await header.getByTestId("customise-card").boundingBox())!];
  const overlap = Math.max(0, Math.min(n.x + n.width, chip.x + chip.width) - Math.max(n.x, chip.x)) * Math.max(0, Math.min(n.y + n.height, chip.y + chip.height) - Math.max(n.y, chip.y));
  expect(overlap, "the name clear of Customise").toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 16 } });
});

test("whole roles reorder: drag an Off Role above the Primary Role, and move it back with the keyboard", async ({ page }) => {
  const project = test.info().project.name;
  // Each device edits its own player, chosen by name (the three share one demo database).
  const name = project === "phone" ? "Demo Support" : project === "tablet" ? "Demo Halfway" : "Demo Top";
  await page.goto("/players");
  await playerEntry(page, name).click();
  await expect(page.getByTestId("pool-editor")).toBeVisible();
  await page.getByTestId("pools-edit").click();
  const sections = page.getByTestId("role-section");
  if ((await sections.count()) < 2) {
    await page.getByTestId("add-off-role").click();
    await page.getByTestId("add-off-role-picker").getByRole("radio").and(page.locator(":not([disabled])")).first().click();
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  }
  const roles = () => sections.evaluateAll((els) => els.map((e) => e.getAttribute("data-role")));
  const before = await roles();
  const primaryPool = await page.getByTestId("primary-pool-list").getByTestId("pool-item").evaluateAll((els) => els.map((e) => e.getAttribute("data-champion")));
  // Pointer: the second role's grip, dragged above the first section.
  const grip = sections.nth(1).getByTestId("role-grip");
  await grip.scrollIntoViewIfNeeded();
  const g = (await grip.boundingBox())!;
  const top = (await sections.nth(0).boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, top.y + 4, { steps: 12 });
  await expect(page.getByTestId("role-drop-line")).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(roles).toEqual([before[1], before[0], ...before.slice(2)]);
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  // The old Primary Role is now the first Off Role, with its whole pool in the same order.
  const offPool = await page.getByTestId("secondary-pool-list").getByTestId("pool-item").evaluateAll((els) => els.map((e) => e.getAttribute("data-champion")));
  expect(offPool).toEqual(primaryPool);
  await page.reload();
  await expect.poll(roles).toEqual([before[1], before[0], ...before.slice(2)]);
  // Keyboard: pick up the first role, move it down one place, drop. Right after the reload the
  // markup can be there before React is listening, so Edit and the pick-up are retried until they
  // register (Space on a role that was picked up but not moved drops it in place: harmless).
  await expect(async () => {
    if ((await page.getByTestId("role-grip").count()) === 0) await page.getByTestId("pools-edit").click({ timeout: 1_000 });
    await sections.nth(0).getByTestId("role-grip").focus({ timeout: 1_000 });
    await page.keyboard.press("Space");
    await expect(page.getByTestId("role-announce")).toContainText("Picked up", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect.poll(roles).toEqual(before);
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
});
