import { expect, test, type Page } from "./test";
import { cardOf, expandedOf, openGame, opensFullScreen } from "./match-history";
import { createMember } from "./member-account";
import { pagerFold, pagerItems, pagerRem } from "../src/components/match-history/pager";

/*
  Match History's layout on every size (29 Oct 2026): the profile card is one compact band on the
  profile's other sections and in full on its Overview; a phone's scoreboard row is three lines
  (the items share the damage's line); an open game ends with a control that closes it and brings
  its card back into view; a narrow card keeps the time of its game in view, even on a 320px phone;
  and on a phone the Refine fields after Result wait behind "More filters". Since 8 Nov 2026: a
  wide card's figures never run under the build or the teams, whose names stay, and its columns
  stay level from card to card, a K/D/A of three two-digit numbers too; the longest champion
  names stay whole; an item whose image fails shows its initials, an empty slot stays a plain
  tile, and a build that was not recorded draws nothing (the page says it once); the pager's
  buttons are finger-sized on touch screens, and on a narrow phone both arrows stay on its line;
  and icon-only teams tint only their icons.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 768;
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function profileOf(page: Page, role: string) {
  await page.goto("/team");
  return `/players/${(await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id"))!}`;
}

test("the profile card is a compact band on the other sections and in full on the Overview", async ({ page }) => {
  const profile = await profileOf(page, "MID");
  await page.goto(profile);
  const header = page.getByTestId("profile-header");
  await expect(header).toBeVisible();
  await expect(header).not.toHaveAttribute("data-compact");
  const full = (await header.boundingBox())!;
  for (const section of ["matches", "champions", "accounts"]) {
    await page.goto(`${profile}/${section}`);
    await expect(header).toHaveAttribute("data-compact");
    // The name, the role and the rank stay; the band is far shorter than the card.
    await expect(header.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(header.getByTestId("profile-rank")).toBeVisible();
    const band = (await header.boundingBox())!;
    expect(band.height, section).toBeLessThanOrEqual(80);
    expect(band.height).toBeLessThan(full.height * 0.6);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
  // Back on the Overview (a tab, no reload): the full card again. (On a phone the sections ride in the top bar.)
  await page.getByTestId((page.viewportSize()?.width ?? 1440) < 768 ? "profile-chrome-tab-overview" : "profile-tab-overview").click();
  await expect(header).not.toHaveAttribute("data-compact");
});

test("an open game ends with a control that closes it and brings its card into view, with the focus on it", async ({ page }) => {
  test.skip(opensFullScreen(page), "phones open a game as a whole screen, closed by Back or its close button: e2e/mobile-nav.spec.ts");
  const profile = await profileOf(page, "TOP");
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  const card = page.getByTestId("match-card").nth(1);
  const matchId = (await card.getByTestId("match-row").getAttribute("data-match"))!;
  await openGame(card);
  const close = expandedOf(cardOf(page, matchId)).getByTestId("match-close");
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeVisible();
  // A finger-sized target on touch screens.
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await close.click();
  const row = cardOf(page, matchId).getByTestId("match-row");
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(expandedOf(cardOf(page, matchId))).toHaveCount(0);
  await expect(row).toBeFocused();
  await expect(async () => {
    const box = (await cardOf(page, matchId).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeLessThan(page.viewportSize()!.height);
  }).toPass({ timeout: 5_000 });
});

test("a phone's scoreboard row is three lines: the name and KDA, the champion and rank, the items with the damage, then the figures", async ({ page }) => {
  test.skip(!isPhone(page), "the phone layout");
  const profile = await profileOf(page, "SUPPORT");
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  const breakdown = await openGame(page.getByTestId("match-card").first());
  const rows = breakdown.locator('[data-testid="participant"]:not([data-removed])');
  await expect(rows.first()).toBeVisible();
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    const box = (await row.boundingBox())!;
    expect(box.height, `row ${i}`).toBeLessThanOrEqual(96);
    // The items sit on the damage's line, inside the row.
    const items = (await row.getByTestId("participant-items-phone").boundingBox())!;
    expect(items.x + items.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("a narrow card keeps the time of its game in view, on a 320px phone too", async ({ page }) => {
  test.skip(!isPhone(page), "the narrow card");
  const profile = await profileOf(page, "TOP");
  // The project's phone, then the narrowest one (iPhone SE, first generation), where the line wraps
  // between its parts rather than cut the time off.
  for (const size of [page.viewportSize()!, { width: 320, height: 568 }]) {
    await page.setViewportSize(size);
    await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
    const metas = page.getByTestId("match-card-meta");
    const count = await metas.count();
    expect(count).toBeGreaterThan(0);
    // Cards with a "Best … in N" chip too: on a narrow card it sits in the figures' row, so the KDA
    // column beside the line stays narrow.
    expect(await page.locator('[data-testid="match-standout"]:visible').count()).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const meta = metas.nth(i);
      // "Victory · Solo/Duo · 3h ago" as shown (the long queue name is hidden): without "Ranked", and nothing cut off.
      await expect(meta).toContainText(/ago|just now/);
      expect(await meta.innerText()).not.toContain("Ranked");
      expect(await meta.evaluate((el) => el.scrollWidth - el.clientWidth), `${size.width}px, card ${i}`).toBeLessThanOrEqual(1);
      // The time itself, whole, inside the line and the card.
      const time = await meta.evaluate((el) => {
        const range = document.createRange();
        const node = [...el.querySelectorAll("span")].find((s) => /^· (\d+[mhd] ago|just now)$/.test(s.textContent?.trim() ?? ""))!;
        range.selectNodeContents(node);
        const text = range.getBoundingClientRect();
        const line = el.getBoundingClientRect();
        const card = el.closest('[data-testid="match-card"]')!.getBoundingClientRect();
        return { right: text.right, width: text.width, line: line.right, card: card.right };
      });
      expect(time.width, `${size.width}px, card ${i}: the time is drawn`).toBeGreaterThan(20);
      expect(time.right, `${size.width}px, card ${i}: the time ends inside its line`).toBeLessThanOrEqual(time.line + 0.5);
      expect(time.right, `${size.width}px, card ${i}: the time ends inside the card`).toBeLessThanOrEqual(time.card);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
});

/**
 * Each card's wide-layout geometry (run in the page, so it holds everything it uses): where its CS
 * total and damage share end, where the next column in its row starts (the build where it is shown,
 * else the teams; past what takes no room in the row, hidden or out of flow, such as the
 * screen-reader note a build that was not recorded leaves, a 1px box at the row's start), the
 * teams' names and left edge, and the card's height.
 */
const cardGeometry = (els: Element[]) =>
  els.map((card) => {
    const box = (e: Element) => e.getBoundingClientRect();
    const text = (e: Element) => {
      const range = document.createRange();
      range.selectNodeContents(e);
      return range.getBoundingClientRect();
    };
    const cs = card.querySelector('[data-testid="match-cs"]')!;
    const damage = card.querySelector('[data-testid="match-damage"]')!;
    const inRow = (e: Element) => box(e).width >= 0.5 && !["absolute", "fixed"].includes(getComputedStyle(e).position);
    let next = cs.parentElement!.nextElementSibling;
    while (next && !inRow(next)) next = next.nextElementSibling;
    const teams = card.querySelector('[data-testid="match-teams"]');
    return {
      cs: text(cs).right,
      damage: text(damage).right,
      next: next ? box(next).left : null,
      nextIs: next ? (next.getAttribute("data-testid") ?? next.firstElementChild?.getAttribute("data-testid") ?? next.tagName) : null,
      names: [...card.querySelectorAll('[data-testid="team-slot-name"]')].map((n) => box(n).width),
      teams: teams ? box(teams).left : null,
      height: box(card).height,
    };
  });

test("a wide card's figures end before the next column, the teams keep their names, and the columns stay level", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "wide cards, at the window sizes that matter (the desktop project sizes its own windows)");
  // The sidebar open, as most members keep it: a 60rem list at 1280×800 (no build), 65.4rem at
  // 1366×768 and 70rem at 1440×900 (with the build), and 50.75rem at 860×700 (no sidebar below lg;
  // the one-row card's narrowest widths, without the spells and runes).
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
  const profile = await profileOf(page, "TOP");
  for (const size of [{ width: 1280, height: 800 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 860, height: 700 }]) {
    await page.setViewportSize(size);
    await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
    await page.evaluate(() => document.fonts.ready);
    const cards = await page.getByTestId("match-card").evaluateAll(cardGeometry);
    expect(cards.length).toBeGreaterThan(1);
    for (const [i, c] of cards.entries()) {
      const at = `${size.width}px, card ${i}`;
      expect(c.next, at).not.toBeNull();
      expect(c.cs, `${at}: the CS total ends before the next column`).toBeLessThanOrEqual(c.next! + 0.5);
      expect(c.damage, `${at}: the damage share ends before the next column`).toBeLessThanOrEqual(c.next! + 0.5);
      if (c.teams === null) continue;
      expect(c.names, at).toHaveLength(10);
      expect(Math.min(...c.names), `${at}: the teams keep their names`).toBeGreaterThan(24);
      // About 100px: the teams' five lines set the card's height.
      expect(c.height, `${at}: a compact card`).toBeLessThanOrEqual(106);
    }
    const lefts = cards.map((c) => c.teams).filter((x): x is number => x !== null);
    expect(Math.max(...lefts) - Math.min(...lefts), `${size.width}px: the teams start at the same place on every card`).toBeLessThanOrEqual(1);

    // Real games go further than the demo's (its deaths stop at 9): the widest K/D/A, three
    // two-digit numbers, fits the KDA column's floor, so that card stays level with the others;
    // and the longest champion names stay whole, "Nunu & Willump" on two lines and the longest
    // one-word name on one from a 54rem list (860×700 is 50.75rem), the card no taller.
    const wide = size.width >= 1000;
    const edited = await page.getByTestId("match-card").evaluateAll((els, wide) => {
      const [first, second] = els as [HTMLElement, HTMLElement];
      first.querySelector('[data-testid="match-kda"]')!.textContent = "10 / 10 / 10";
      const nunu = first.querySelector<HTMLElement>('[data-testid="match-champion"]')!;
      nunu.textContent = "Nunu & Willump";
      const heimer = second.querySelector<HTMLElement>('[data-testid="match-champion"]')!;
      if (wide) heimer.textContent = "Heimerdinger";
      const kda = first.querySelector('[data-testid="match-kda"]')!;
      const range = document.createRange();
      range.selectNodeContents(kda);
      const lines = (e: HTMLElement) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight));
      return {
        teams: [first, second].map((c) => c.querySelector('[data-testid="match-teams"]')!.getBoundingClientRect().left),
        kda: { text: range.getBoundingClientRect().width, box: kda.getBoundingClientRect().width },
        nunu: { cut: nunu.scrollWidth > nunu.clientWidth + 0.5 || nunu.scrollHeight > nunu.clientHeight + 0.5, lines: lines(nunu), title: nunu.title },
        heimer: { cut: heimer.scrollWidth > heimer.clientWidth + 0.5, lines: lines(heimer) },
        height: first.getBoundingClientRect().height,
      };
    }, wide);
    const at = `${size.width}px`;
    expect(edited.kda.text, `${at}: "10 / 10 / 10" fits its column`).toBeLessThanOrEqual(edited.kda.box + 0.5);
    expect(Math.abs(edited.teams[0]! - edited.teams[1]!), `${at}: a card with "10 / 10 / 10" stays level with the next one`).toBeLessThanOrEqual(1);
    expect(Math.abs(edited.teams[1]! - cards[1]!.teams!), `${at}: the next card has not moved`).toBeLessThanOrEqual(1);
    expect(edited.nunu.cut, `${at}: "Nunu & Willump" whole`).toBe(false);
    expect(edited.nunu.lines, `${at}: "Nunu & Willump" on two lines at most`).toBeLessThanOrEqual(2);
    expect(edited.nunu.title, `${at}: the name is the hover text`).not.toBe("");
    if (wide) expect(edited.heimer, `${at}: "Heimerdinger" whole, on one line`).toEqual({ cut: false, lines: 1 });
    expect(edited.height, `${at}: two lines of name keep the card compact`).toBeLessThanOrEqual(106);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
});

test("an item whose image fails shows its initials, and an empty slot stays a plain tile", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the wide card's build (the same icons at every size)");
  // Data Dragon unreachable for item images only (a blocked host, the installed app offline).
  await page.route(/\/cdn\/[^/]+\/img\/item\//, (route) => route.abort());
  const profile = await profileOf(page, "TOP");
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  const card = page.getByTestId("match-card").first();
  const standIns = card.getByTestId("icon-initials");
  // Every item image of the card has failed and given way (no broken-image glyph anywhere).
  await expect(card.locator('img[src*="/img/item/"]')).toHaveCount(0);
  await expect(standIns.first()).toBeVisible();
  const shown = await standIns.evaluateAll((els) => els.map((e) => ({ name: e.getAttribute("title") ?? "", label: e.getAttribute("aria-label") ?? "", letters: (e.textContent ?? "").trim(), width: e.getBoundingClientRect().width })));
  for (const s of shown) {
    // Named like the picture, in its title and for screen readers, with one or two letters of it.
    expect(s.name.length).toBeGreaterThan(1);
    expect(s.label).toBe(s.name);
    expect(s.letters).toMatch(/^\S{1,2}$/);
    expect(s.width).toBeGreaterThan(16);
  }
  // The build's empty slots draw no letters: a stand-in only where an item was bought.
  const slots = await card.locator('[aria-label^="Items:"] > *').count();
  expect(slots).toBe(7);
  expect(shown.length).toBeLessThanOrEqual(7);
  expect(shown.length).toBe(await card.locator('[aria-label^="Items:"] [data-testid="icon-initials"]').count());
});

test("a build that was not recorded draws nothing on its card, and the page says it once", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "the phone's and the wide card cover it");
  // A member whose games come from the browser tests' Riot stand-in (server/riot/browser-test.ts):
  // its records carry no items, as a stored record without a build does.
  const { username } = await createMember(page, "Nobuild");
  await page.context().addCookies([{ name: "uniiverse_view", value: "player", url: new URL(page.url()).origin }]);
  await page.goto("/players", { waitUntil: "networkidle" });
  const href = (await page.locator(`main a[data-testid='player-card'][data-player-name='${username}']`).first().getAttribute("href"))!;
  await page.goto(`${href}/matches`, { waitUntil: "networkidle" });
  const refresh = page.getByTestId("data-refresh-button");
  if (isPhone(page)) await refresh.tap();
  else await refresh.click();
  await expect(page.getByTestId("toast")).toContainText("3 new games", { timeout: 30_000 });
  await expect(page.getByTestId("match-row")).toHaveCount(3);
  // No empty slots that read as a build: each card says it to screen readers only.
  const missing = page.getByTestId("match-card").getByTestId("items-missing");
  await expect(missing).toHaveCount(3);
  await expect(missing.first()).toHaveText("Items not recorded");
  for (const box of await missing.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
    expect(box.width).toBeLessThanOrEqual(1);
    expect(box.height).toBeLessThanOrEqual(1);
  }
  // A wide card's figures still end before the next column, the build's room (kept empty, so the
  // columns stay level) or the teams: the screen-reader note takes no room in the row.
  if (info.project.name === "desktop") {
    for (const [i, c] of (await page.getByTestId("match-card").evaluateAll(cardGeometry)).entries()) {
      expect(c.next, `card ${i}`).not.toBeNull();
      expect(c.nextIs, `card ${i}: the next column is not the screen-reader note`).not.toBe("items-missing");
      expect(Math.max(c.cs, c.damage), `card ${i}: the figures end before the next column`).toBeLessThanOrEqual(c.next! + 0.5);
    }
  }
  // The page says it once, in its data status.
  const infoTip = page.getByTestId("data-refresh-info");
  if (isPhone(page)) await infoTip.tap();
  else await infoTip.hover();
  await expect(page.getByTestId("data-refresh-info-bubble").locator('[data-part="note"]')).toContainText("Items of 3 games on this page were not recorded");
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("the pager's buttons are finger-sized on a touch screen and keep the mouse's size; on a narrow phone both arrows stay on the line, at its ends", async ({ page }) => {
  const profile = await profileOf(page, "JUNGLE");
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  const pages = page.getByTestId("match-pages");
  await expect(pages).toBeVisible();
  const sizes = await pages.locator("button").evaluateAll((els) => els.map((e) => ({ h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width })));
  expect(sizes.length).toBeGreaterThan(2);
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  for (const s of sizes) {
    if (coarse) {
      expect(s.h, "44px on touch").toBeGreaterThanOrEqual(44);
      expect(s.w, "44px on touch").toBeGreaterThanOrEqual(44);
    } else {
      expect(s.h, "a mouse's 32px").toBeGreaterThanOrEqual(32);
      expect(s.h, "a mouse's 32px").toBeLessThan(44);
    }
  }
  if (!isPhone(page)) return;
  // A middle page (both ends, the page either side and the arrows: up to seven buttons), on the
  // project's phone and on the narrowest one (iPhone SE, first generation). Where the whole line
  // does not fit, the pages either side of the current one give way to the arrows, which go to the
  // same pages, so both arrows stay on the line, at its ends, and nothing wraps.
  const total = Number(await page.getByTestId("match-history").getAttribute("data-total"));
  const count = Math.ceil(total / 10);
  const middle = Math.max(1, Math.ceil(count / 2));
  const items = pagerItems(middle, count);
  expect(count, "a history long enough for a middle page of seven buttons, which a 320px phone folds").toBeGreaterThanOrEqual(5);
  for (const width of [page.viewportSize()!.width, 320]) {
    await page.setViewportSize({ width, height: 640 });
    await page.goto(`${profile}/matches?page=${middle}`, { waitUntil: "networkidle" });
    await pages.scrollIntoViewIfNeeded();
    const line = await pages.evaluate((nav) => {
      const shown = [...nav.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().width > 0);
      return {
        room: nav.getBoundingClientRect().width,
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
        buttons: shown.map((b) => ({ ...b.getBoundingClientRect().toJSON(), label: b.getAttribute("aria-label"), current: b.getAttribute("aria-current") })),
      };
    });
    const at = `${width}px, page ${middle} of ${count}`;
    const tops = line.buttons.map((b) => Math.round(b.top));
    expect(Math.max(...tops) - Math.min(...tops), `${at}: one line`).toBeLessThanOrEqual(1);
    expect(line.buttons[0]!.label, `${at}: the newer arrow first`).toBe("Newer games");
    expect(line.buttons.at(-1)!.label, `${at}: the older arrow last`).toBe("Older games");
    for (const b of line.buttons) {
      expect(b.left, at).toBeGreaterThanOrEqual(0);
      expect(b.right, at).toBeLessThanOrEqual(width);
      expect(b.height, `${at}: 44px`).toBeGreaterThanOrEqual(44);
    }
    // Both ends and the current page always; the pages either side only where the whole line fits.
    const labels = line.buttons.map((b) => b.label);
    expect(labels).toEqual(expect.arrayContaining(["Page 1", `Page ${count}`, `Page ${middle}`]));
    expect(line.buttons.find((b) => b.current === "page")?.label).toBe(`Page ${middle}`);
    // The whole line needs pagerRem(items); it folds below the first width of FOLDS over that.
    const fold = pagerFold(items);
    const folded = fold.hide !== "" && line.room < fold.below * line.rem;
    if (!folded) expect(pagerRem(items) * line.rem, `${at}: the whole line fits where it does not fold`).toBeLessThanOrEqual(line.room);
    for (const item of items) {
      if ("gap" in item || !item.folds) continue;
      if (!folded) await expect(pages.getByRole("button", { name: `Page ${item.page}`, exact: true }), at).toBeVisible();
      else await expect(pages.getByRole("button", { name: `Page ${item.page}`, exact: true }), `${at}: left to the arrows`).toBeHidden();
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
});

test("icon-only teams tint only their five icons, never the empty rest of the row", async ({ page }) => {
  test.skip(!isPhone(page), "a phone held sideways: the card's teams as icons");
  await page.setViewportSize({ width: 740, height: 360 });
  const profile = await profileOf(page, "MID");
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  const own = page.getByTestId("match-card").first().locator('[data-testid="match-teams"] [data-own]');
  await expect(own).toBeVisible();
  const fit = await own.evaluate((side) => {
    const slots = [...side.querySelectorAll('[data-testid="team-slot"]')];
    const name = side.querySelector('[data-testid="team-slot-name"]')!;
    return { names: name.getBoundingClientRect().width, side: side.getBoundingClientRect().right, icons: Math.max(...slots.map((s) => s.getBoundingClientRect().right)) };
  });
  // Names fold away here (screen readers still read them), and the tint ends with the last icon.
  expect(fit.names).toBeLessThanOrEqual(1);
  expect(Math.abs(fit.side - fit.icons)).toBeLessThanOrEqual(1);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("on a phone, Refine shows Result and keeps the other fields behind More filters", async ({ page }) => {
  test.skip(!isPhone(page), "the phone filter bar");
  const profile = await profileOf(page, "JUNGLE");
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  const filters = page.getByTestId("match-filters");
  const toggle = filters.getByTestId("filter-toggle");
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const panel = filters.getByTestId("refine-panel");
  await expect(panel.getByTestId("refine-result")).toBeVisible();
  const more = panel.getByTestId("refine-more");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(panel.getByTestId("refine-patch")).toBeHidden();
  const short = (await panel.boundingBox())!.height;
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByTestId("refine-patch")).toBeVisible();
  await expect(panel.getByTestId("refine-group")).toBeVisible();
  expect((await panel.boundingBox())!.height).toBeGreaterThan(short + 150);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});
