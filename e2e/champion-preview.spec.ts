import { expect, test, type Locator, type Page } from "./test";
import { NARROW_MOUSE_WINDOWS, expectInReach } from "./reach";

/*
  All Champions' preview on the demo roster (synthetic demo games with lane opponents and timeline
  frames, in-memory only), as the owner asked on 25 Nov 2026: one row per champion with the position
  icon of every position it was played in (most games first; each icon names its position, games,
  win rate and record, and opens the champion in it); the preview a pane BESIDE the list on a
  computer (the list narrowing to its champions, positions, games and win rates, nothing laid over
  it: until then a panel docked at the window's right edge covered the table), a sheet on a phone, an
  upright tablet and a short window. Its content: the champion (mastery marked as every position's),
  the positions it was played in (a choice switches every figure and the opponents, the address
  replaced), that position's games, win rate, W/L, KDA, CS/min, damage, vision and multikills, then
  ONE table of every lane opponent (no folds, no Best/Worst tabs) with a search and three orders, the
  small samples quiet and ranked last by win rate, and an opponent's games beside the table (or one
  step in place of it in a narrow preview), never an accordion. The address holds it: the first open
  pushes one entry, switching champion, position or opponent replaces it, so Back always closes;
  Close, Escape and the row again close it too. Old champion-window addresses land here.
*/

async function demoMember(page: Page, name = "Demo Top") {
  await page.goto("/players");
  const href = await page.locator(`main a[data-testid='player-card'][data-player-name='${name}']`).first().getAttribute("href");
  return new URL(href!, "http://x").pathname;
}

/** Opens a row's preview, clicking again until the page is interactive (a click before hydration does nothing). */
async function openRow(page: Page, row: Locator, by: Locator = row.getByTestId("open-champion")) {
  const content = page.getByTestId("champion-preview-content");
  const champion = await row.getAttribute("data-champion");
  await expect(async () => {
    const shown = (await content.count()) ? await content.getAttribute("data-champion") : null;
    if (shown !== champion) await by.click({ timeout: 2_000 });
    await expect(content).toHaveAttribute("data-champion", champion!, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Where the open preview sits on a computer: a pane in the page (no window) beside the list's card,
 * within the screen's width, the row's name clear of it, nothing wider than the screen.
 */
async function beside(page: Page, row: Locator) {
  return row.evaluate((li) => {
    const pane = document.querySelector<HTMLElement>("aside[data-preview-pane][data-testid=champion-preview]");
    if (!pane || !pane.getBoundingClientRect().width) return { found: false };
    const p = pane.getBoundingClientRect();
    const card = document.querySelector("[data-testid=all-champions-table]")!.getBoundingClientRect();
    const name = li.querySelector("[data-open-champion]")!.getBoundingClientRect();
    return {
      found: true,
      window: !!document.querySelector("dialog[open]"),
      within: p.left >= -0.5 && p.right <= innerWidth + 0.5 && p.bottom <= innerHeight + 0.5,
      besideList: card.right <= p.left + 0.5,
      nameClear: name.right <= p.left,
      sideways: document.documentElement.scrollWidth - innerWidth > 1,
    };
  });
}
const BESIDE = { found: true, window: false, within: true, besideList: true, nameClear: true, sideways: false };
const pane = (page: Page) => page.locator("aside[data-preview-pane][data-testid=champion-preview]");

const nameXs = (rows: Locator) => rows.evaluateAll((els) => els.map((e) => Math.round(e.querySelector("[data-open-champion]")!.getBoundingClientRect().x)));
const rowBoxes = (rows: Locator) => rows.evaluateAll((els) => els.map((e) => [Math.round(e.getBoundingClientRect().top + scrollY), Math.round(e.getBoundingClientRect().height)]));
/** A row's position icons as the screen draws them (controls with a mouse, marks on a touch screen), in order: their position and games. */
const icons = (row: Locator) => row.locator("[data-testid=champion-role]:visible, [data-testid=champion-role-mark]:visible").evaluateAll((els) => els.map((e) => ({ role: e.getAttribute("data-role")!, games: Number(e.getAttribute("data-games")) })));
const recordGames = async (page: Page) => Number(((await page.getByTestId("champion-preview-record-line").textContent()) ?? "").match(/^(\d+) games?/)?.[1] ?? NaN);

test("desktop: the preview opens in a pane beside the list; the list narrows but no row or name moves; click, ↑/↓, ‹ ›, Back, Escape and Close", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the desktop's list with a mouse (the tablet's below)");
  const profile = await demoMember(page);
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(2)).toBeVisible();
  const boxes = await rowBoxes(rows);
  const xs = await nameXs(rows);
  const entries = await page.evaluate(() => history.length);
  // Actions answer light: every reply of the preview's server actions is small.
  const replies: number[] = [];
  page.on("response", async (r) => {
    if (r.request().method() === "POST" && r.request().headers()["next-action"]) replies.push((await r.body().catch(() => Buffer.alloc(0))).length);
  });
  await openRow(page, rows.nth(0));
  await expect(pane(page)).toBeVisible();
  await page.getByTestId("champion-preview-foot").waitFor();
  await expect.poll(() => beside(page, rows.nth(0))).toEqual(BESIDE);
  // Nothing in the list moves: every row's place and height, every champion's name, the page's scroll.
  expect(await rowBoxes(rows)).toEqual(boxes);
  expect(await nameXs(rows)).toEqual(xs);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(rows.nth(0)).toHaveAttribute("data-selected", "true");
  // The list beside it shows the champions, their positions, games and win rates; the table's other columns are the preview's.
  await expect(page.getByTestId("all-champions-header").getByRole("button")).toHaveText(["Champion", "Games", "Win rate"]);
  await expect(page.getByTestId("sort-kda")).toHaveCount(0);
  // Opened from the row: the champion's most played position, chosen in the preview, its games the icon's.
  const first = (await icons(rows.nth(0)))[0]!;
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-role", first.role);
  await expect(page.getByTestId("champion-preview-roles").locator("[aria-checked=true]")).toHaveAttribute("data-role", first.role);
  expect(await recordGames(page)).toBe(first.games);
  // The figures: the position's record, then KDA, CS/min, damage and vision, and its kills on one line.
  await expect(page.getByTestId("champion-preview-stats").locator("dt")).toHaveText(["KDA", "CS/min", "Damage/min", "Vision"]);
  await expect(page.getByTestId("champion-preview-kills")).toHaveText(/^Kills [\d,*—]+ · Multikills (\d+ double · \d+ triple · \d+ quadra · \d+ penta\*?|not counted yet)/);
  expect((await page.getByTestId("champion-preview-kills").boundingBox())!.height, "one line").toBeLessThanOrEqual(24);
  // Mastery is the champion's, every position's.
  await expect(page.getByTestId("champion-preview-mastery")).toContainText(/Mastery [\d.]+K? all positions/);
  await expect(page.getByTestId("champion-preview-opponent-head")).toBeVisible();
  for (const h of await page.getByTestId("champion-preview-opponent").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h, "a dense opponent row").toBeLessThanOrEqual(40);
  await expect(page.getByTestId("champion-preview-foot")).toContainText("Lane opponent: the enemy Riot placed in");
  // An opponent's games beside the table at 1440 (no accordion, nothing under its row), the table still there.
  await page.getByTestId("champion-preview-opponent").first().getByRole("button").click();
  const detail = page.getByTestId("champion-preview-pairing");
  await expect(page.getByTestId("champion-preview-game").first()).toBeVisible();
  await expect(page.getByTestId("champion-preview-pairing-kda")).toContainText(/KDA \d+\.\d\d|Perfect KDA/);
  const [table, side] = [(await page.getByTestId("champion-preview-opponent-table").boundingBox())!, (await detail.boundingBox())!];
  expect(side.x, "the detail beside the table").toBeGreaterThanOrEqual(table.x + table.width - 1);
  await expect(page.getByTestId("champion-preview-opponent").first().getByRole("button")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  // Another row switches it; ↑/↓ move it; the address is replaced, never pushed.
  await rows.nth(1).getByTestId("open-champion").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(2).getAttribute("data-champion"))!);
  await expect(rows.nth(2).getByTestId("open-champion")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  expect(await rowBoxes(rows)).toEqual(boxes);
  expect(Math.max(...replies)).toBeLessThanOrEqual(5_000);
  // ‹ › in the pane's header step along the rows too.
  await pane(page).getByTestId("champion-preview-next").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(2).getAttribute("data-champion"))!);
  await pane(page).getByTestId("champion-preview-prev").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  // Keys inside the preview are its own: ↓ on its order leaves the champion as it is.
  const order = page.locator("[data-testid^=opponent-sort-]").first();
  await order.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  // A click elsewhere on the page leaves it open: it is part of the page now, not a layer over it.
  await page.getByTestId("all-champions-scope").click();
  await expect(pane(page)).toBeVisible();
  // The same at 1280, 1366, 1920 and 2560, the sidebar open and collapsed: beside the list, within the screen, nothing wider than it.
  for (const sidebar of ["expanded", "collapsed"]) {
    await page.context().addCookies([{ name: "uniiverse_sidebar", value: sidebar, url: page.url() }]);
    await page.reload();
    await expect(page.getByTestId("champion-preview-content")).toBeVisible();
    for (const { width, height } of [{ width: 1280, height: 800 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => beside(page, rows.nth(1)), `${width}px, the sidebar ${sidebar}`).toEqual(BESIDE);
    }
  }
  await page.context().clearCookies({ name: "uniiverse_sidebar" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${profile}/champions`);
  const closed = await page.evaluate(() => history.length);
  await openRow(page, rows.nth(1));
  // Back closes it after the switches, and the list is as it was.
  await rows.nth(2).getByTestId("open-champion").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(2).getAttribute("data-champion"))!);
  await page.goBack();
  await expect(page.getByTestId("champion-preview")).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  expect(await rowBoxes(rows)).toEqual(boxes);
  expect(await nameXs(rows)).toEqual(xs);
  // Escape closes it too, and focus returns to its row; so does its Close, and the row pressed again.
  await openRow(page, rows.nth(0));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-preview")).toHaveCount(0);
  await expect(rows.nth(0).getByTestId("open-champion")).toBeFocused();
  await expect(page).not.toHaveURL(/champion=/);
  await openRow(page, rows.nth(0));
  const close = pane(page).getByTestId("champion-preview-close");
  await expect(close).toHaveText("Close");
  await close.click();
  await expect(page.getByTestId("champion-preview")).toHaveCount(0);
  await expect(rows.nth(0).getByTestId("open-champion")).toBeFocused();
  await openRow(page, rows.nth(0));
  await rows.nth(0).getByTestId("open-champion").click();
  await expect(page.getByTestId("champion-preview")).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  expect(await page.evaluate(() => history.length), "every close went Back: no entry added").toBe(closed);
});

test("desktop: in a short scrolled window, opening, switching and closing never move the list", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a mouse in a short window");
  await page.setViewportSize({ width: 1440, height: 600 });
  const profile = await demoMember(page, "Demo Mid");
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(5)).toBeAttached();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const last = rows.nth((await rows.count()) - 1);
  const y0 = (await last.boundingBox())!.y;
  const scroll0 = await page.evaluate(() => scrollY);
  expect(scroll0, "the list is scrolled").toBeGreaterThan(0);
  await openRow(page, last);
  // Pinned under the section tabs, as tall as the window leaves: its bottom within the window.
  await expect.poll(() => beside(page, last)).toEqual(BESIDE);
  expect(Math.abs((await last.boundingBox())!.y - y0), "the pressed row where it was").toBeLessThanOrEqual(1);
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("champion-preview-content")).not.toHaveAttribute("data-champion", (await last.getAttribute("data-champion"))!);
  expect(Math.abs((await last.boundingBox())!.y - y0), "the list did not move on a switch").toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-preview-content")).toHaveCount(0);
  expect(Math.abs((await last.boundingBox())!.y - y0), "nor on closing").toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => scrollY)).toBe(scroll0);
});

test("the opponents: one table of every lane opponent, a search, three orders with the small samples last by win rate, and an opponent's games without an accordion", async ({ page }, info) => {
  const profile = await demoMember(page);
  await page.goto(`${profile}/champions`);
  const row = page.getByTestId("top-champion").first();
  await openRow(page, row);
  const content = page.getByTestId("champion-preview-content");
  await expect(content.getByTestId("champion-preview-figures")).toContainText(/\d+ games? · \d+W \d+L/);
  const opponents = content.getByTestId("champion-preview-opponent");
  await expect(opponents.first()).toBeVisible();
  // No folds and no "more" toggles: every opponent is a row of the one table.
  await expect(content.getByTestId("champion-preview-more")).toHaveCount(0);
  await expect(content.getByTestId("champion-preview-more-listed")).toHaveCount(0);
  const read = () => opponents.evaluateAll((els) => els.map((e) => ({ id: (e as HTMLElement).dataset.champion!, games: Number((e as HTMLElement).dataset.games), small: e.hasAttribute("data-small"), text: e.textContent ?? "", rate: Number((e.querySelector("[data-testid=opponent-win-rate]")?.textContent ?? "").match(/^(\d+)%/)?.[1] ?? NaN) })));
  const all = await read();
  // Each with its games and a win rate; under 3 games a small sample, said to screen readers.
  for (const o of all) {
    expect(o.text).toMatch(/\d+ games?/);
    expect(o.rate).not.toBeNaN();
    expect(o.small).toBe(o.games < 3);
    if (o.small) expect(o.text).toContain("(small sample)");
  }
  // Most games first by default.
  expect(all.map((o) => o.games)).toEqual([...all.map((o) => o.games)].sort((a, b) => b - a));
  // The orders are the app's segmented control: the chosen one semibold over the accent underline, no ring.
  const sorts = content.locator("[data-testid^=opponent-sort-]");
  await expect(sorts).toHaveText(["Most games", "Highest win rate", "Lowest win rate"]);
  expect(await sorts.evaluateAll((els) => els.map((e) => [e.getAttribute("aria-checked"), getComputedStyle(e).fontWeight, getComputedStyle(e).boxShadow]))).toEqual(await sorts.evaluateAll((els) => els.map((e) => (e.getAttribute("aria-checked") === "true" ? ["true", "600", "none"] : ["false", "500", "none"]))));
  // Highest and lowest win rate rank opponents with 3+ games, then the small samples after a divider.
  for (const [key, dir] of [["high", -1], ["low", 1]] as const) {
    await content.getByTestId(`opponent-sort-${key}`).click();
    const sorted = await read();
    expect(sorted.map((o) => o.id).sort()).toEqual(all.map((o) => o.id).sort());
    const ranked = sorted.filter((o) => !o.small);
    const small = sorted.filter((o) => o.small);
    expect(sorted.slice(0, ranked.length), `${key}: the ranked opponents first`).toEqual(ranked);
    for (const list of [ranked, small]) for (let i = 1; i < list.length; i++) expect(dir * (list[i]!.rate - list[i - 1]!.rate), `${key}: by win rate`).toBeGreaterThanOrEqual(0);
    await expect(content.getByTestId("champion-preview-small-divider")).toHaveCount(ranked.length && small.length ? 1 : 0);
  }
  await content.getByTestId("opponent-sort-games").click();
  // The search, where the table has four opponents or more: by name, "no match" said.
  const search = content.locator("input[data-testid=opponent-search]");
  if (all.length >= 4) {
    const name = ((await opponents.first().locator("button span.truncate").textContent()) ?? "").trim();
    await search.fill(name.slice(0, 3));
    await expect.poll(async () => (await read()).map((o) => o.id)).toContain(all[0]!.id);
    await search.fill("zzzz");
    await expect(opponents).toHaveCount(0);
    await expect(content.getByTestId("champion-preview-no-match")).toBeVisible();
    await search.fill("");
    await expect(opponents).toHaveCount(all.length);
  } else await expect(search).toHaveCount(0);
  // An opponent: its games and the link to Champion Intel with both champions side by side, the address replaced.
  const firstId = all[0]!.id;
  const champion = (await row.getAttribute("data-champion"))!;
  const entries = await page.evaluate(() => history.length);
  await opponents.first().getByRole("button").click();
  await expect(page).toHaveURL(new RegExp(`vs=${firstId}`));
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await expect(content.getByTestId("champion-preview-game").first()).toBeVisible();
  await expect(content.getByTestId("champion-preview-lookup")).toHaveAttribute("href", `/lookup?champion=${champion}&champion2=${firstId}`);
  if (info.project.name === "desktop") {
    // Beside the table: the table stays, and "Clear" (or the row again) puts the opponent back.
    await expect(content.getByTestId("champion-preview-opponent-table")).toBeVisible();
    await content.getByTestId("champion-preview-pairing-close").click();
    await expect(page).not.toHaveURL(/vs=/);
    await expect(content.getByTestId("champion-preview-pick-opponent")).toBeVisible();
  } else {
    // A narrow preview (the sheet): one step in place of the table, "All opponents" back to it, the focus on its row.
    await expect(content.getByTestId("champion-preview-opponent-table")).toBeHidden();
    await expect(content.getByTestId("champion-preview-opponents-back")).toBeFocused();
    await content.getByTestId("champion-preview-opponents-back").click();
    await expect(content.getByTestId("champion-preview-opponent-table")).toBeVisible();
    await expect(page).not.toHaveURL(/vs=/);
    await expect(opponents.first().getByRole("button")).toBeFocused();
  }
});

test("positions: a champion played in one, two, three and five positions shows each position's icon, most games first; each opens the preview in it, and the preview switches between them", async ({ page }, info) => {
  // Demo Sub (Top) plays Sion in all five positions (and one game with no recorded position), Malphite in three, Ornn in two and Mordekaiser in one (server/demo/seed.ts, DEMO_OTHER_POSITIONS).
  const profile = await demoMember(page, "Demo Sub (Top)");
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.first()).toBeVisible();
  const counts: number[] = [];
  for (const r of await rows.all()) {
    const list = await icons(r);
    counts.push(list.length);
    expect(list.map((x) => x.games), "most games first").toEqual([...list.map((x) => x.games)].sort((a, b) => b - a));
    expect(new Set(list.map((x) => x.role)).size, "each position once").toBe(list.length);
    // The positions and the games without one add up to the row's games (the totals of every position).
    const noRole = Number((await r.getAttribute("data-no-role")) ?? 0);
    expect(list.reduce((s, x) => s + x.games, 0) + noRole).toBe(Number(await r.getAttribute("data-games")));
  }
  expect(counts.sort()).toEqual([1, 2, 3, 5]);
  const sion = rows.filter({ has: page.locator("[data-testid=champion-role-mark]:nth-child(5)") });
  await expect(sion).toHaveCount(1);
  const list = await icons(sion);
  const content = page.getByTestId("champion-preview-content");
  const mouse = info.project.name === "desktop";
  if (mouse) {
    // With a mouse each icon is a control: it names its position, games, win rate and record (its accessible name, and a tooltip), and opens the champion in that position.
    const second = sion.getByTestId("champion-role").nth(1);
    await expect(second).toHaveAccessibleName(new RegExp(`as (Top|Jungle|Mid|Bottom|Support): ${list[1]!.games} games? · \\d+% win rate · \\d+W \\d+L$`));
    await second.hover({ position: { x: 10, y: 10 } });
    await second.hover({ position: { x: 12, y: 12 } });
    await expect(page.getByTestId("champion-role-tip")).toHaveText(new RegExp(`^(Top|Jungle|Mid|Bottom|Support) · ${list[1]!.games} games? · \\d+% win rate · \\d+W \\d+L$`));
    await page.mouse.move(1, 1);
    await expect(page.getByTestId("champion-role-tip")).toHaveCount(0);
    await openRow(page, sion, second);
  } else {
    // On a touch screen the icons are marks (a 44px target each would not fit the row): the row opens
    // the champion in its most played position, and the preview's position choice switches it.
    await expect(sion.locator("button[data-testid=champion-role]:visible")).toHaveCount(0);
    await openRow(page, sion);
    await expect(content).toHaveAttribute("data-role", list[0]!.role);
    await page.getByTestId("champion-preview-role").and(page.locator(`[data-role=${list[1]!.role}]`)).click();
  }
  await expect(content).toHaveAttribute("data-role", list[1]!.role);
  await expect(page).toHaveURL(new RegExp(`crole=${list[1]!.role}`));
  await expect(page.getByTestId("champion-preview-roles").locator("[aria-checked=true]")).toHaveAttribute("data-role", list[1]!.role);
  expect(await recordGames(page)).toBe(list[1]!.games);
  // Every position played, most games first, each with its games; the game with none said, in the totals only.
  await expect(page.getByTestId("champion-preview-role")).toHaveCount(5);
  expect(await page.getByTestId("champion-preview-role").evaluateAll((els) => els.map((e) => e.getAttribute("data-role")))).toEqual(list.map((x) => x.role));
  await expect(page.getByTestId("champion-preview-no-role")).toHaveText(/^1 more game has no recorded position: it counts in Sion's totals only\.$/);
  await expect(page.getByTestId("champion-preview-total")).toHaveText(`${await sion.getAttribute("data-games")} games in all`);
  // Switching: every figure and the opponents follow at once; the address is replaced, never pushed.
  const entries = await page.evaluate(() => history.length);
  await page.getByTestId("champion-preview-opponent").first().waitFor();
  for (const target of [list[0]!, list[4]!]) {
    await page.getByTestId("champion-preview-role").and(page.locator(`[data-role=${target.role}]`)).click();
    await expect(content).toHaveAttribute("data-role", target.role);
    await expect(page).toHaveURL(new RegExp(`crole=${target.role}`));
    await expect.poll(() => recordGames(page)).toBe(target.games);
    await expect(page.getByTestId("champion-preview-coverage")).toContainText(/(Top|Jungle|Mid|Bottom|Support) games?/);
    // Its opponents: the games against them are this position's (no more than its games).
    await expect(page.getByTestId("champion-preview-foot").or(page.getByTestId("champion-preview-no-opponents"))).toBeVisible();
    const known = await page.getByTestId("champion-preview-opponent").evaluateAll((els) => els.reduce((s, e) => s + Number((e as HTMLElement).dataset.games), 0));
    expect(known).toBeLessThanOrEqual(target.games);
    expect(await page.evaluate(() => history.length)).toBe(entries);
  }
  // In the list, the open position's icon is the pressed one.
  if (mouse) await expect(sion.locator(`[data-testid=champion-role][data-role=${list[4]!.role}]`)).toHaveAttribute("aria-pressed", "true");
  // The champion's own button opens its most played position.
  if (mouse) {
    await page.keyboard.press("Escape");
    await expect(content).toHaveCount(0);
    await openRow(page, sion);
    await expect(content).toHaveAttribute("data-role", list[0]!.role);
  }
});

test("old addresses land on the preview: Matchups, a deep link with an opponent, the Overview's pools", async ({ page, context, baseURL }) => {
  const profile = await demoMember(page);
  await page.goto(`${profile}/matchups?mode=solo`);
  await expect(page).toHaveURL(/\/champions\?.*champion=/);
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page.getByTestId("champion-preview-content")).toBeVisible();
  // A deep link with an opponent renders its games.
  const url = new URL(page.url());
  const champion = url.searchParams.get("champion")!;
  const vs = await page.getByTestId("champion-preview-opponent").first().getAttribute("data-champion");
  await page.goto(`${profile}/champions?champion=${champion}&tab=matchups&vs=${vs}`);
  await expect(page.getByTestId("champion-preview-pairing")).toBeVisible();
  // The Overview's old window key opens All Champions' preview.
  await page.goto(`${profile}?champ=${champion}&crole=TOP`);
  await expect(page).toHaveURL(new RegExp(`/champions\\?.*champion=${champion}`));
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", champion);
  // A position the champion was not played in opens its most played one.
  await page.goto(`${profile}/champions?champion=${champion}&crole=SUPPORT`);
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-role", "TOP");
  // A pool card is a link to All Champions with that champion's preview open, in the pool's role.
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.goto(profile);
  const card = page.getByTestId("primary-pool").getByTestId("pool-item").first();
  const id = (await card.getAttribute("data-champion"))!;
  await expect(async () => {
    if (!/\/champions\?/.test(page.url())) await card.getByTestId("pool-inspect").click({ timeout: 2_000 });
    await expect(page).toHaveURL(new RegExp(`/champions\\?.*champion=${id}.*crole=TOP`), { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", id);
});

test("phones: a sheet; ‹ › switch, Back closes it and the list keeps its place", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the sheet is for phones");
  const profile = await demoMember(page);
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(1)).toBeVisible();
  // 64px rows at most: the name over its positions, the win rate over the games.
  for (const h of await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeLessThanOrEqual(64);
  // The position icons are marks on a touch screen (no target smaller than a finger): the row is the one target.
  await expect(page.getByTestId("champion-role-mark").first()).toBeVisible();
  await expect(page.locator("button[data-testid=champion-role]:visible")).toHaveCount(0);
  const y = await page.evaluate(() => scrollY);
  await openRow(page, rows.nth(0));
  // The sheet (a window), never the pane.
  const preview = page.locator("dialog[open][data-testid=champion-preview]");
  await expect(preview).toBeVisible();
  await expect(pane(page)).toHaveCount(0);
  await expect(preview.getByTestId("champion-preview-roles")).toBeInViewport();
  await preview.getByTestId("champion-preview-next").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  await page.goBack();
  await expect(preview).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  expect(await page.evaluate(() => scrollY)).toBe(y);
  // ✕ closes it too.
  await openRow(page, rows.nth(0));
  await preview.getByTestId("champion-preview-close").click();
  await expect(preview).toHaveCount(0);
});

test("tablets: upright, no room for both: the sheet, its targets 44px; held sideways, the pane beside the list", async ({ page }, info) => {
  test.skip(info.project.name !== "tablet", "a touch tablet (768 × 1024, then 1024 × 768)");
  const profile = await demoMember(page);
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(1)).toBeVisible();
  const y = await page.evaluate(() => scrollY);
  await openRow(page, rows.nth(0));
  const sheet = page.locator("dialog[open][data-testid=champion-preview]");
  await expect(sheet).toBeVisible();
  await page.getByTestId("champion-preview-foot").waitFor();
  // Its ✕, the positions, an opponent's row, an opened opponent's link and its games: 44px targets on a touch screen.
  const close = (await sheet.getByTestId("champion-preview-close").boundingBox())!;
  expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(44);
  for (const h of await page.getByTestId("champion-preview-role").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
  expect((await page.getByTestId("champion-preview-opponent").first().getByRole("button").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId("champion-preview-opponent").first().getByRole("button").click();
  await expect(page.getByTestId("champion-preview-lookup")).toBeVisible();
  for (const id of ["champion-preview-lookup", "champion-preview-opponents-back", "champion-preview-game"]) expect((await page.getByTestId(id).first().boundingBox())!.height, `${id}: a 44px target on touch`).toBeGreaterThanOrEqual(44);
  await page.goBack();
  await expect(page.getByTestId("champion-preview")).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  expect(await page.evaluate(() => scrollY)).toBe(y);
  // Held sideways (1024 × 768): room for both, so the pane, its Close a 44px target.
  await page.setViewportSize({ width: 1024, height: 768 });
  await openRow(page, rows.nth(1));
  await expect.poll(() => beside(page, rows.nth(1))).toEqual(BESIDE);
  const paneClose = (await pane(page).getByTestId("champion-preview-close").boundingBox())!;
  expect(paneClose.height).toBeGreaterThanOrEqual(44);
  await pane(page).getByTestId("champion-preview-close").click();
  await expect(page.getByTestId("champion-preview")).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
});

test("a game opened from the preview has a history entry of its own: Back closes the game and the preview stays, Back again closes the preview", async ({ page }) => {
  const profile = await demoMember(page);
  await page.goto(`${profile}/champions`);
  const row = page.getByTestId("top-champion").first();
  await openRow(page, row);
  const champion = (await row.getAttribute("data-champion"))!;
  const content = page.getByTestId("champion-preview-content");
  const win = page.locator("dialog[open][data-testid=match-detail]");
  const openAGame = async () => {
    const opponent = content.getByTestId("champion-preview-opponent").first();
    if (!(await content.getByTestId("champion-preview-game").count())) await opponent.getByRole("button").click();
    await content.getByTestId("champion-preview-game").first().click();
    await expect(win).toBeVisible();
    await expect(page).toHaveURL(/[?&]match=/);
  };
  await openAGame();
  // Back (the browser's, a phone's system Back): the game closes, the preview is still there, the same champion.
  await page.goBack();
  await expect(win).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]match=/);
  await expect(page).toHaveURL(new RegExp(`champion=${champion}`));
  await expect(content).toBeVisible();
  await expect(content).toHaveAttribute("data-champion", champion);
  // ✕ closes the game alone too, and takes its entry away: the next Back closes the preview.
  await openAGame();
  await win.getByTestId("match-detail-close").click();
  await expect(win).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]match=/);
  await expect(content).toBeVisible();
  await page.goBack();
  await expect(content).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
});

test("a window 640–767px wide with a mouse (the phone's frame): the preview opens as a window, its ✕ and ‹ › in reach", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a mouse in a narrow window: the desktop project, resized");
  const profile = await demoMember(page);
  for (const size of NARROW_MOUSE_WINDOWS) {
    await page.setViewportSize(size);
    await page.goto(`${profile}/champions`);
    await openRow(page, page.getByTestId("top-champion").first());
    const preview = page.locator("dialog[open][data-testid=champion-preview]");
    await expect(preview, `${size.width}×${size.height}`).toBeVisible();
    await expect(pane(page)).toHaveCount(0);
    await expectInReach(page, [preview.getByTestId("champion-preview-close"), preview.getByTestId("champion-preview-next")]);
    await preview.getByTestId("champion-preview-close").click();
    await expect(preview).toHaveCount(0);
  }
});

test("from a scrolled list: a row below the first screen opens its preview, Escape (desktop) or Back (phone, tablet) closes it, and the row, the sort and the search are where they were", async ({ page }, info) => {
  // The demo's longest list is 8 champions; a short window makes it scroll. "Show all" appears from
  // 21 champions (FIRST in all-champions.tsx), which no demo profile has: the next test reaches it with a test cookie.
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: 480 });
  // The demo's Mid: the longest list (8 champions).
  const profile = await demoMember(page, "Demo Mid");
  await page.goto(`${profile}/champions`);
  await expect(page.getByTestId("top-champion").first()).toBeVisible();
  const most = await page.getByTestId("top-champion").count();
  expect(most, "a list that can scroll").toBeGreaterThanOrEqual(6);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(most - 1)).toBeAttached();
  // A sort other than the default (games): by win rate, by its column or the phone's select.
  const sortWin = page.getByTestId("sort-win");
  if (await sortWin.isVisible()) await sortWin.click();
  else await page.locator("select#all-champions-sort-by").selectOption("win");
  const order = () => rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.champion));
  await expect.poll(async () => (await order()).length).toBe(most);
  const sorted = await order();
  const close = async () => {
    // Escape once the preview is on screen (in a window 480px tall, the sheet: a key pressed before the window has opened reaches nothing).
    await expect(page.getByTestId("champion-preview-content")).toBeVisible();
    if (info.project.name === "desktop") await page.keyboard.press("Escape");
    else await page.goBack();
    await expect(page.getByTestId("champion-preview-content")).toHaveCount(0);
    await expect(page).not.toHaveURL(/champion=/);
  };
  // The last row, scrolled to from the top of the page: below the first screen until then.
  await page.evaluate(() => window.scrollTo(0, 0));
  const last = rows.nth(most - 1);
  expect((await last.boundingBox())!.y, "the row starts below the first screen").toBeGreaterThan(480);
  await last.scrollIntoViewIfNeeded();
  const at = async () => ({ y: Math.round((await last.boundingBox())!.y), scroll: await page.evaluate(() => Math.round(window.scrollY)) });
  const before = await at();
  expect(before.scroll, "the list is scrolled").toBeGreaterThan(0);
  await openRow(page, last);
  await close();
  // Back restores the scroll as the history entry settles: the row back where it was within 3px.
  await expect.poll(async () => Math.abs((await at()).y - before.y), { message: "the row where it was" }).toBeLessThanOrEqual(3);
  expect(await order(), "the sort kept").toEqual(sorted);
  // With a search: the same, and the search's words and its rows kept.
  const search = page.locator("input[data-testid=all-champions-search]");
  const word = sorted[sorted.length - 1]!.slice(0, 3);
  await search.fill(word);
  await expect.poll(async () => (await order()).length, "the search narrows the list").toBeLessThan(most);
  const found = await order();
  await openRow(page, rows.first());
  await close();
  await expect(search).toHaveValue(word);
  await expect.poll(order, { message: "the search's rows kept" }).toEqual(found);
});

test("after Show all: a row reached through it opens its preview, closes, and comes back to its place with the whole list still shown", async ({ page, baseURL }, info) => {
  // No demo profile plays the 21 champions "Show all" needs (FIRST in all-champions.tsx): the
  // in-memory demo's test cookie folds the list after 3 rows instead (server/demo/test-hooks.ts).
  await page.context().addCookies([{ name: "uniiverse-test-champions-first", value: "3", url: baseURL! }]);
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: 480 });
  const profile = await demoMember(page, "Demo Mid");
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.first()).toBeVisible();
  await expect(rows).toHaveCount(3);
  const more = page.getByTestId("all-champions-more");
  await expect(more).toHaveText(/Show all \d+ champions/);
  const total = Number((await more.textContent())!.match(/\d+/)![0]);
  expect(total, "more rows than the fold").toBeGreaterThan(3);
  await more.click();
  await expect(rows).toHaveCount(total);
  await expect(more).toHaveCount(0);
  const last = rows.nth(total - 1);
  await last.scrollIntoViewIfNeeded();
  const at = async () => ({ y: Math.round((await last.boundingBox())!.y), scroll: await page.evaluate(() => Math.round(window.scrollY)) });
  const before = await at();
  expect(before.scroll, "the list is scrolled").toBeGreaterThan(0);
  await openRow(page, last);
  // Escape once the preview is on screen (in a window 480px tall, the sheet: a key pressed before the window has opened reaches nothing).
  await expect(page.getByTestId("champion-preview-content")).toBeVisible();
  if (info.project.name === "desktop") await page.keyboard.press("Escape");
  else await page.goBack();
  await expect(page.getByTestId("champion-preview-content")).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  await expect(rows, "the whole list still shown").toHaveCount(total);
  await expect.poll(async () => Math.abs((await at()).y - before.y), { message: "the row where it was" }).toBeLessThanOrEqual(3);
});
