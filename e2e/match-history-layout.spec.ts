import { expect, test, type Page } from "./test";
import { cardOf, expandedOf, openGame, opensFullScreen, pastGameHeader, showGamePage } from "./match-history";
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
  a tall window's page size counts its cards as drawn; and icon-only teams tint only their icons.
  Since 18 Nov 2026 (owner decision D8, denser cards): a phone's card is about 118px, the result
  line across it with the LP at its end and the build beside the champion from 21.375rem, so the
  first game is whole on an iPhone's first screen; a 36–50rem list's card is two rows (about 120px
  on an iPad); the views, Filters and Refresh share one row, and chips (a phone's narrowed
  filters, a tablet's refinements) take the next row, from its start; the summary is three lines
  on a phone (four with the ladder change) and one row of tiles on a desktop; and at 200% text on
  a 320px phone the games and Encounters are no wider than the phone.
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

test("the profile card is one band on every section from a tablet up, so the tabs never move; a phone held upright shows it in full on the Overview", async ({ page }) => {
  const profile = await profileOf(page, "MID");
  const phone = (page.viewportSize()?.width ?? 1440) < 640;
  await page.goto(profile);
  const header = page.getByTestId("profile-header");
  await expect(header).toBeVisible();
  await expect(header).not.toHaveAttribute("data-compact");
  const overview = (await header.boundingBox())!;
  const tabsAt = async () => (phone ? null : (await page.getByTestId("profile-tabs").boundingBox())!.y);
  const overviewTabs = await tabsAt();
  // On a desktop the band is taller since Release 17 (the owner's Card Studio brief: the desktop header
  // about 40–50% taller for its artwork, 74px before): 5.25rem of content in a window under 1000px
  // tall (86px at 1440 × 900), 6.5rem (120px at most) in a taller one. A tablet keeps its 80px at most.
  const size = page.viewportSize() ?? { width: 1440, height: 900 };
  const bandMax = size.width < 1024 ? 80 : size.height >= 1000 ? 124 : 90;
  if (!phone) expect(overview.height, "the Overview's band").toBeLessThanOrEqual(bandMax);
  for (const section of ["matches", "champions", "accounts"]) {
    await page.goto(`${profile}/${section}`);
    await expect(header).toHaveAttribute("data-compact");
    // An upright phone: the band is in the top bar (the name over the rank), none in the page (S2b).
    if ((page.viewportSize()?.width ?? 1440) < 768) {
      await expect(header).toBeHidden();
      await expect(page.getByTestId("profile-bar-title").getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("profile-bar-rank")).toBeVisible();
      continue;
    }
    // The name, the role and the rank stay; the band is far shorter than a phone's full card.
    await expect(header.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(header.getByTestId("profile-rank")).toBeVisible();
    const band = (await header.boundingBox())!;
    expect(band.height, section).toBeLessThanOrEqual(bandMax);
    if (phone) expect(band.height).toBeLessThan(overview.height * 0.6);
    else {
      expect(Math.abs(band.height - overview.height), `${section}: one header height (UD.PO1)`).toBeLessThanOrEqual(1);
      expect(Math.abs((await tabsAt())! - overviewTabs!), `${section}: the tabs in one place`).toBeLessThanOrEqual(1);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
  // Back on the Overview (a tab, no reload). (On a phone the sections ride in the top bar.)
  await page.getByTestId((page.viewportSize()?.width ?? 1440) < 768 ? "profile-chrome-tab-overview" : "profile-tab-overview").click();
  await expect(header).not.toHaveAttribute("data-compact");
});

test("an open game ends with a control that closes it and brings its card into view, with the focus on it", async ({ page }) => {
  test.skip(opensFullScreen(page), "phones open a game as a whole screen, closed by Back or its close button: e2e/mobile-nav.spec.ts");
  // A window shorter than the game (the footer is drawn only then: a game that fits the window has its
  // card's own Close in view with all of it, the owner's brief of 24 Nov 2026).
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 560 });
  const profile = await profileOf(page, "TOP");
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  const card = page.getByTestId("match-card").nth(1);
  const matchId = (await card.getByTestId("match-row").getAttribute("data-match"))!;
  await openGame(card);
  const close = expandedOf(cardOf(page, matchId)).getByTestId("match-close");
  // The footer's steps show once the card's own have gone up (one set at a time: Release 13's review, finding 10).
  await pastGameHeader(page);
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

test("a phone's scoreboard row is two lines of 32px: the name, K/D/A and score, then the build, the rank (whole) and CS; at 320px too", async ({ page }) => {
  test.skip(!isPhone(page), "the phone layout");
  const profile = await profileOf(page, "SUPPORT");
  for (const size of [page.viewportSize()!, { width: 320, height: 568 }]) {
    await page.setViewportSize(size);
    await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
    const breakdown = await openGame(page.getByTestId("match-card").first());
    await showGamePage(breakdown, "board");
    const rows = breakdown.locator('[data-testid="participant"]:not([data-removed])');
    await expect(rows.first()).toBeVisible();
    for (let i = 0; i < (await rows.count()); i++) {
      const row = rows.nth(i);
      const box = (await row.boundingBox())!;
      // Two lines since 24 Nov 2026 (the name, K/D/A and score; the build, the rank and CS), so the ten
      // rows and both bands fit the window's Scoreboard page (three lines of about 60px before).
      expect(box.height, `${size.width}px, row ${i}`).toBeLessThanOrEqual(36);
      const rankText = row.getByTestId("participant-rank-text");
      if (await rankText.count()) expect(await rankText.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), `${size.width}px, row ${i}: the rank whole`).toBe(true);
      // The build, the K/D/A and CS inside the row, none over another.
      // The performance score (Release 16) on the first line after the K/D/A, inside the row too.
      const parts = await Promise.all(["participant-name", "participant-kda", "participant-items-phone", "participant-cs", "participant-score"].map(async (t) => (await row.getByTestId(t).boundingBox())!));
      for (const p of parts) expect(p.x + p.width, `${size.width}px, row ${i}`).toBeLessThanOrEqual(box.x + box.width + 0.5);
      const [name, kda, items, cs, score] = parts;
      expect(kda!.x + kda!.width, `${size.width}px, row ${i}: the K/D/A before the score`).toBeLessThanOrEqual(score!.x + 0.5);
      expect(name!.x + name!.width, `${size.width}px, row ${i}: the name before the K/D/A`).toBeLessThanOrEqual(kda!.x + 0.5);
      expect(items!.x + items!.width, `${size.width}px, row ${i}: the build before CS`).toBeLessThanOrEqual(cs!.x + 0.5);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await page.getByTestId("match-detail-close").click();
    await expect(page.getByTestId("match-detail")).toHaveCount(0);
    await expect(page).not.toHaveURL(/match=/);
  }
});

test("a narrow card keeps the time of its game in view, on a 320px phone too", async ({ page }) => {
  test.skip(!isPhone(page), "the narrow card");
  const profile = await profileOf(page, "TOP");
  // The project's phone, then the narrowest one (iPhone SE, first generation), where the line wraps
  // between its parts rather than cut the time off.
  for (const size of [page.viewportSize()!, { width: 320, height: 568 }]) {
    await page.setViewportSize(size);
    await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
    // The result line shown (a two-row card's copy waits for its width).
    const metas = page.getByTestId("match-card-meta").filter({ visible: true });
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
    // The figures' column (the CS and damage sit in a line of their own inside it on a narrow phone).
    let next = cs.closest('[data-testid="match-figures"]')!.nextElementSibling;
    while (next && !inRow(next)) next = next.nextElementSibling;
    // From 50 to 65rem of list (1280 with the sidebar open) the build takes the teams' place (S6c, UD.H1): no teams drawn there.
    const shown = (e: Element | null) => !!e && box(e).width > 0;
    const teams = card.querySelector('[data-testid="match-teams"]');
    const build = card.querySelector('[data-testid="match-card-build"]');
    return {
      build: shown(build),
      // The build's slots (six items and the trinket, an empty slot drawn as one).
      items: build ? (build.firstElementChild?.children.length ?? 0) : 0,
      cs: text(cs).right,
      damage: text(damage).right,
      next: next ? box(next).left : null,
      nextIs: next ? (next.getAttribute("data-testid") ?? next.firstElementChild?.getAttribute("data-testid") ?? next.tagName) : null,
      names: [...card.querySelectorAll('[data-testid="team-slot-name"]')].map((n) => box(n).width),
      teams: shown(teams) ? box(teams!).left : null,
      // The last column's left edge: the teams, or the build where it takes their place.
      col: shown(teams) ? box(teams!).left : shown(build) ? box(build!).left : null,
      height: box(card).height,
    };
  });

test("a wide card's figures end before the next column, the teams keep their names, and the columns stay level", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "wide cards, at the window sizes that matter (the desktop project sizes its own windows)");
  // The sidebar open, as most members keep it: a 60rem list at 1280×800 (the build in the teams' place since S6c), 65.4rem at
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
    if (size.width === 1366) {
      // With the build and the teams both on the card (a 65–74rem list, the chevron left out), the columns keep 10px apart
      // so the teams have the room the 12px floor needs (Release 11): with 16px gaps 8 of the
      // first card's 10 names were cut here, at 12px.
      // Demo Mid's first game has the longer names.
      await page.goto(`${await profileOf(page, "MID")}/matches`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
      const roster = await page.getByTestId("match-card").first().evaluate((c) => {
        const names = [...c.querySelectorAll("[data-testid=team-slot-name]")];
        return { gap: getComputedStyle(c.querySelector("[data-testid=match-card-grid]")!).columnGap, names: names.length, cut: names.filter((n) => n.scrollWidth > n.clientWidth + 0.5).length };
      });
      expect(roster.gap, "1366: 10px between the columns").toBe("10px");
      expect(roster.names).toBe(10);
      expect(roster.cut, "1366: the first card's roster names mostly whole").toBeLessThanOrEqual(3);
      await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
    }
    for (const [i, c] of cards.entries()) {
      const at = `${size.width}px, card ${i}`;
      expect(c.next, at).not.toBeNull();
      expect(c.cs, `${at}: the CS total ends before the next column`).toBeLessThanOrEqual(c.next! + 0.5);
      expect(c.damage, `${at}: the damage share ends before the next column`).toBeLessThanOrEqual(c.next! + 0.5);
      // The build on every card at these widths (1280 included, where it showed none before S6c), the rosters left to the game's scoreboard there.
      if (size.width >= 1000) expect(c.build, `${at}: the build is drawn`).toBe(true);
      if (size.width >= 1000) expect(c.items, `${at}: six items and the trinket`).toBe(7);
      if (size.width === 1280) {
        expect(c.teams, `${at}: the build in the teams' place`).toBeNull();
        expect(c.height, `${at}: D8's density, unchanged`).toBeLessThanOrEqual(106);
      }
      if (c.teams === null) continue;
      expect(c.names, at).toHaveLength(10);
      expect(Math.min(...c.names), `${at}: the teams keep their names`).toBeGreaterThan(24);
      // About 100px: the teams' five lines set the card's height.
      expect(c.height, `${at}: a compact card`).toBeLessThanOrEqual(106);
    }
    const lefts = cards.map((c) => c.teams).filter((x): x is number => x !== null);
    if (lefts.length) expect(Math.max(...lefts) - Math.min(...lefts), `${size.width}px: the teams start at the same place on every card`).toBeLessThanOrEqual(1);

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
        teams: [first, second].map((c) => {
          const teams = c.querySelector('[data-testid="match-teams"]')!;
          return (teams.getBoundingClientRect().width > 0 ? teams : c.querySelector('[data-testid="match-card-build"]')!).getBoundingClientRect().left;
        }),
        kda: { text: range.getBoundingClientRect().width, box: kda.getBoundingClientRect().width },
        // scrollWidth and scrollHeight are whole pixels: a cut name overflows by far more than one.
        nunu: { cut: nunu.scrollWidth > nunu.clientWidth + 1 || nunu.scrollHeight > nunu.clientHeight + 1, lines: lines(nunu), title: nunu.title },
        heimer: { cut: heimer.scrollWidth > heimer.clientWidth + 1, lines: lines(heimer) },
        height: first.getBoundingClientRect().height,
      };
    }, wide);
    const at = `${size.width}px`;
    expect(edited.kda.text, `${at}: "10 / 10 / 10" fits its column`).toBeLessThanOrEqual(edited.kda.box + 0.5);
    expect(Math.abs(edited.teams[0]! - edited.teams[1]!), `${at}: a card with "10 / 10 / 10" stays level with the next one`).toBeLessThanOrEqual(1);
    expect(Math.abs(edited.teams[1]! - cards[1]!.col!), `${at}: the next card has not moved`).toBeLessThanOrEqual(1);
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
  // The build shown (a phone's copy beside the champion waits for its width).
  const standIns = card.getByTestId("icon-initials").filter({ visible: true });
  // Every item image of the card has failed and given way (no broken-image glyph anywhere).
  await expect(card.locator('img[src*="/img/item/"]').filter({ visible: true })).toHaveCount(0);
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
  const build = card.locator('[aria-label^="Items:"]').filter({ visible: true });
  await expect(build).toHaveCount(1);
  const slots = await build.locator("> *").count();
  expect(slots).toBe(7);
  expect(shown.length).toBeLessThanOrEqual(7);
  expect(shown.length).toBe(await build.locator('[data-testid="icon-initials"]').count());
});

test("a build that was not recorded draws nothing on its card, and the page says it once", async ({ page }, info) => {
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
  // A wide or two-row card's figures still end before the next column, the build's room (kept
  // empty, so the columns stay level) or the teams: the screen-reader note takes no room in the row.
  if (!isPhone(page)) {
    for (const [i, c] of (await page.getByTestId("match-card").evaluateAll(cardGeometry)).entries()) {
      expect(c.next, `card ${i}`).not.toBeNull();
      expect(c.nextIs, `card ${i}: the next column is not the screen-reader note`).not.toBe("items-missing");
      expect(Math.max(c.cs, c.damage), `card ${i}: the figures end before the next column`).toBeLessThanOrEqual(c.next! + 0.5);
    }
  }
  // A tablet's two-row card keeps the build's room in its first row (no ghost slots), and its teams
  // in the second, under the figures and the portrait.
  if (info.project.name === "tablet") {
    const rows = await page.getByTestId("match-card").evaluateAll(cardRows);
    for (const [i, c] of rows.entries()) {
      expect(c.build, `card ${i}: no build drawn`).toBeNull();
      if (c.teams) expect(c.teams.top, `card ${i}: the teams in a row of their own`).toBeGreaterThanOrEqual(Math.max(c.figures!.bottom, c.portrait!.bottom) - 0.5);
    }
    // The room is the build's width (about 94px), on the figures' row.
    const room = await page.getByTestId("match-card").evaluateAll((cards) =>
      cards.map((card) => {
        const figures = card.querySelector('[data-testid="match-figures"]')!;
        let next = figures.nextElementSibling;
        while (next && (next.getBoundingClientRect().width < 0.5 || getComputedStyle(next).position === "absolute")) next = next.nextElementSibling;
        const [a, b] = [figures.getBoundingClientRect(), next!.getBoundingClientRect()];
        return { width: b.width, sameRow: b.top < a.bottom && b.bottom > a.top };
      }),
    );
    for (const [i, r] of room.entries()) {
      expect(r.width, `card ${i}: the build's room kept`).toBeGreaterThanOrEqual(88);
      expect(r.sameRow, `card ${i}: on the figures' row`).toBe(true);
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
    if (width === 320) expect(folded, `${at}: the narrowest phone folds a middle page`).toBe(true);
    if (!folded) expect(pagerRem(items) * line.rem, `${at}: the whole line fits where it does not fold`).toBeLessThanOrEqual(line.room);
    for (const item of items) {
      if ("gap" in item || !item.folds) continue;
      if (!folded) await expect(pages.getByRole("button", { name: `Page ${item.page}`, exact: true }), at).toBeVisible();
      else await expect(pages.getByRole("button", { name: `Page ${item.page}`, exact: true }), `${at}: left to the arrows`).toBeHidden();
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
});

test("a tall window gets as many whole cards as fit, counted at their height as drawn", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "a portrait monitor, at 1080×1920");
  const profile = await profileOf(page, "JUNGLE");
  await page.setViewportSize({ width: 1080, height: 1920 });
  // The sidebar folded: a 59rem list of one-row cards, about 100px each, so more than ten fit and
  // the page asks for them (?per=, replaced).
  await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/[?&]per=1[1-9]/);
  await expect(page.getByTestId("match-card")).toHaveCount(Number(new URL(page.url()).searchParams.get("per")));
  const bottom = await page.getByTestId("match-card").last().evaluate((card) => card.getBoundingClientRect().bottom + scrollY);
  expect(bottom, "the last card ends inside the window").toBeLessThanOrEqual(1920);
  // The sidebar open: a 47.5rem list, whose cards are two rows (about 120px; 150–165px when they
  // stacked in three, which kept the page at ten): counted at their own height, as many whole cards
  // as fit, the last one inside the window again. Counted at the wide card's height it would ask
  // for more than fit.
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await expect(page).toHaveURL(/[?&]per=1[1-9]/);
  await expect(page.getByTestId("match-card")).toHaveCount(Number(new URL(page.url()).searchParams.get("per")));
  const twoRow = await page.getByTestId("match-card").evaluateAll((els) => ({ height: els[0]!.getBoundingClientRect().height, bottom: els.at(-1)!.getBoundingClientRect().bottom + scrollY }));
  expect(twoRow.height, "two-row cards").toBeGreaterThan(105);
  expect(twoRow.height, "two-row cards").toBeLessThan(135);
  expect(twoRow.bottom, "the last card ends inside the window").toBeLessThanOrEqual(1920);
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

/**
 * Each card's rows as drawn: the result line, the portrait, the champion, the K/D/A, the build, the
 * figures and the teams. Where a part has a copy for another width (a phone's result line and build
 * are placed where they are read: MatchCard), the one shown is measured.
 */
const cardRows = (els: Element[]) =>
  els.map((card) => {
    const box = (e: Element | null) => (e ? e.getBoundingClientRect().toJSON() : null);
    const shown = (sel: string) => [...card.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 1) ?? null;
    const build = shown('[aria-label^="Items:"]');
    return {
      height: card.getBoundingClientRect().height,
      card: box(card)!,
      meta: box(shown('[data-testid="match-card-meta"]')),
      lp: box(shown('[data-testid="match-lp"]')),
      portrait: box(card.querySelector('[data-testid="match-loadout"]')!.firstElementChild),
      champion: box(card.querySelector('[data-testid="match-champion"]')),
      championCut: (() => {
        const name = card.querySelector('[data-testid="match-champion"]')!;
        return name.scrollWidth - name.clientWidth;
      })(),
      kda: box(card.querySelector('[data-testid="match-kda"]')),
      build: box(build),
      // The build's own box: nothing in it cut off (its wrapper hides what overflows).
      buildCut: build ? build.parentElement!.scrollWidth - build.parentElement!.clientWidth : 0,
      figures: box(card.querySelector('[data-testid="match-figures"]')),
      kp: box(card.querySelector('[data-testid="match-kp"]')),
      cs: box(card.querySelector('[data-testid="match-cs"]')),
      teams: box(shown('[data-testid="match-teams"]')),
      extra: !!card.querySelector('[data-testid="match-members"], [data-testid="match-multikill"], [data-testid="match-standout"]'),
    };
  });

/**
 * A phone's card is read in the order it is drawn: its parts in the page's order follow the grid's
 * rows, then its columns (the cell each part is placed in, read from the grid). Returns the parts in
 * page order and in drawn order, by name.
 */
const readingOrder = (els: Element[]) =>
  els.map((card) => {
    const grid = card.querySelector('[data-testid="match-card-grid"]')!;
    const cells: Element[] = [];
    const walk = (el: Element) => {
      for (const c of el.children) {
        if (getComputedStyle(c).display === "contents") walk(c);
        else cells.push(c);
      }
    };
    walk(grid);
    const shown = (sel: string) => [...card.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 1) ?? null;
    const parts = Object.entries({
      result: shown('[data-testid="match-card-meta"]'),
      portrait: card.querySelector('[data-testid="match-loadout"]'),
      champion: card.querySelector('[data-testid="match-champion"]'),
      kda: card.querySelector('[data-testid="match-kda"]'),
      build: shown('[aria-label^="Items:"]'),
      kp: card.querySelector('[data-testid="match-kp"]'),
      cs: card.querySelector('[data-testid="match-cs"]'),
      damage: card.querySelector('[data-testid="match-damage"]'),
    })
      .filter((e): e is [string, Element] => !!e[1] && e[1].getBoundingClientRect().width > 1)
      .map(([name, el]) => {
        const cell = cells.find((c) => c === el || c.contains(el))!;
        const cs = getComputedStyle(cell);
        return { name, el, row: parseInt(cs.gridRowStart) || 0, col: parseInt(cs.gridColumnStart) || 0 };
      });
    const inPage = [...parts].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const drawn = [...inPage].sort((a, b) => a.row - b.row || a.col - b.col);
    return { inPage: inPage.map((p) => p.name), drawn: drawn.map((p) => p.name), placed: parts.every((p) => p.row > 0) };
  });

test("a phone's card is about 118px: the result line across it with the LP at its end, the build beside the champion, and the first game whole on the first screen", async ({ page }) => {
  test.skip(!isPhone(page), "the phone's card");
  const profile = await profileOf(page, "ADC");
  // An iPhone 15 in Safari (393×659), the live check's phone (390×844) and an iPhone SE (375×667):
  // lists of 21.375rem and more, where the build sits beside the champion.
  for (const size of [{ width: 393, height: 659 }, { width: 390, height: 844 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(size);
    await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
    await page.evaluate(() => document.fonts.ready);
    const cards = await page.getByTestId("match-card").evaluateAll(cardRows);
    expect(cards.length).toBeGreaterThan(5);
    const at = `${size.width}×${size.height}`;
    for (const [i, c] of cards.entries()) {
      const where = `${at}, card ${i}`;
      // About 118px; a game with team members, a multikill or a "best" figure adds a short line.
      expect(c.height, where).toBeLessThanOrEqual(c.extra ? 145 : 124);
      // The result line runs across the card, over the portrait.
      expect(c.meta, where).not.toBeNull();
      expect(c.meta!.bottom, `${where}: the result line over the portrait`).toBeLessThanOrEqual(c.portrait!.top + 0.5);
      // A ranked game's LP closes that line, at the card's end.
      if (c.lp) {
        expect(c.lp.top + c.lp.height / 2, `${where}: the LP on the result line`).toBeGreaterThan(c.meta!.top);
        expect(c.lp.top + c.lp.height / 2, `${where}: the LP on the result line`).toBeLessThan(c.meta!.bottom);
        expect(c.card.right - c.lp.right, `${where}: the LP at the line's end`).toBeLessThan(24);
      }
      // The build beside the champion: right of the portrait, under the name, above the figures.
      if (c.build) {
        expect(c.build.left, `${where}: the build beside the portrait`).toBeGreaterThanOrEqual(c.portrait!.right - 0.5);
        expect(c.build.top, `${where}: under the champion's name`).toBeGreaterThanOrEqual(c.champion!.bottom - 0.5);
        expect(c.build.bottom, `${where}: above the figures`).toBeLessThanOrEqual(c.figures!.top + 0.5);
        expect(c.build.right, `${where}: clear of the K/D/A`).toBeLessThanOrEqual(c.kda!.left + 0.5);
        expect(c.buildCut, `${where}: no item cut off`).toBeLessThanOrEqual(0.5);
      }
      // Phones leave the teams to the game's own screen.
      expect(c.teams, where).toBeNull();
    }
    // Read in the order drawn: the result line, the portrait, the champion, the K/D/A, the build, the figures.
    for (const [i, o] of (await page.getByTestId("match-card").evaluateAll(readingOrder)).entries()) {
      expect(o.placed, `${at}, card ${i}: every part placed in the grid`).toBe(true);
      expect(o.inPage, `${at}, card ${i}: the page's order is the drawn order`).toEqual(o.drawn);
    }
    // The first game is whole above the tab bar.
    const bar = await page.getByTestId("phone-tabbar").evaluate((el) => el.getBoundingClientRect().top);
    expect(cards[0]!.card.bottom, `${at}: the first game whole on the first screen`).toBeLessThanOrEqual(bar);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
  // The widest K/D/A a real game gives ("10 / 10 / 10"; the demo's deaths stop at 9) at 375px, a
  // 21.375rem list: the build still fits beside it, whole.
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const widest = page.getByTestId("match-card").filter({ has: page.locator('[aria-label^="Items:"]:visible') }).first();
  await widest.getByTestId("match-kda").evaluate((el) => (el.textContent = "10 / 10 / 10"));
  const [w] = await widest.evaluateAll(cardRows);
  expect(w!.build, "375px with 10 / 10 / 10: the build beside the champion").not.toBeNull();
  expect(w!.build!.right, "375px with 10 / 10 / 10: the build clear of the K/D/A").toBeLessThanOrEqual(w!.kda!.left + 0.5);
  expect(w!.buildCut, "375px with 10 / 10 / 10: no item cut off").toBeLessThanOrEqual(0.5);
  // The narrowest phone (320px): the build closes the card, kill participation sits under the
  // champion (right of the portrait, above the CS), and the CS and damage keep one line.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const narrow = await page.getByTestId("match-card").evaluateAll(cardRows);
  for (const [i, c] of narrow.entries()) {
    const where = `320px, card ${i}`;
    expect(c.height, where).toBeLessThanOrEqual(c.extra ? 170 : 146);
    // (The figures' own box steps aside there: the CS line stands for it.)
    if (c.build) expect(c.build.top, `${where}: the build last`).toBeGreaterThanOrEqual(c.cs!.bottom - 0.5);
    expect(c.kp!.left, `${where}: kill participation right of the portrait`).toBeGreaterThanOrEqual(c.portrait!.right - 0.5);
    expect(c.kp!.top, `${where}: kill participation under the champion`).toBeGreaterThanOrEqual(c.champion!.bottom - 0.5);
    expect(c.kp!.bottom, `${where}: kill participation above the CS`).toBeLessThanOrEqual(c.cs!.top + 0.5);
  }
  for (const [i, o] of (await page.getByTestId("match-card").evaluateAll(readingOrder)).entries()) expect(o.inPage, `320px, card ${i}: the page's order is the drawn order`).toEqual(o.drawn);
  const lines = await page.getByTestId("match-cs").evaluateAll((els) => els.map((cs) => Math.abs(cs.getBoundingClientRect().top - cs.parentElement!.querySelector('[data-testid="match-damage"]')!.getBoundingClientRect().top)));
  for (const d of lines) expect(d, "320px: CS and damage on one line").toBeLessThanOrEqual(1);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("a 36–50rem list's card is two rows: the game's figures and build in one, both teams in the other, about 120px", async ({ page }, info) => {
  test.skip(info.project.name === "desktop", "an iPad's list (45rem at 768px) and a phone's held sideways (43rem at 740×360)");
  const profile = await profileOf(page, "ADC");
  const sizes = isPhone(page) ? [{ width: 740, height: 360 }] : [{ width: 768, height: 1080 }, { width: 810, height: 1080 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
    await page.evaluate(() => document.fonts.ready);
    const cards = await page.getByTestId("match-card").evaluateAll(cardRows);
    expect(cards.length).toBeGreaterThan(5);
    expect(cards.filter((c) => c.teams).length, `${size.width}px: the teams under the game`).toBeGreaterThan(5);
    for (const [i, c] of cards.entries()) {
      const where = `${size.width}px, card ${i}`;
      if (!c.teams) continue;
      // A phone held sideways shows the teams as icons: a shorter second row.
      expect(c.height, where).toBeLessThanOrEqual(c.extra ? 145 : 128);
      // One row: the champion, the K/D/A, the figures and the build side by side.
      expect(c.kda!.left, `${where}: the K/D/A after the champion`).toBeGreaterThanOrEqual(c.champion!.left);
      expect(c.figures!.left, `${where}: the figures after the K/D/A`).toBeGreaterThan(c.kda!.right - 0.5);
      if (c.build) expect(c.build.left, `${where}: the build after the figures`).toBeGreaterThan(c.figures!.right - 0.5);
      // The result line over the champion, with the LP on it; the champion's name whole.
      expect(c.meta!.bottom, `${where}: the result line over the champion`).toBeLessThanOrEqual(c.champion!.top + 0.5);
      expect(c.championCut, `${where}: the champion's name whole`).toBeLessThanOrEqual(1);
      if (c.lp) {
        // On the result line, one line with the queue named without "Ranked".
        expect(c.lp.top + c.lp.height / 2, `${where}: the LP on the result line`).toBeGreaterThan(c.meta!.top);
        expect(c.lp.top + c.lp.height / 2, `${where}: the LP on the result line`).toBeLessThan(c.meta!.bottom);
        expect(c.meta!.height, `${where}: the result line is one line`).toBeLessThan(24);
      }
      // The teams under it all, across the card.
      expect(c.teams.top, `${where}: the teams in a row of their own`).toBeGreaterThanOrEqual(Math.max(c.figures!.bottom, c.portrait!.bottom) - 0.5);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
});

test("a two-row card keeps the longest champion names whole, even on a 36rem list", async ({ page }) => {
  test.skip(!isPhone(page), "a 608px window: a 36rem list, the narrowest two-row card");
  const profile = await profileOf(page, "ADC");
  await page.setViewportSize({ width: 608, height: 900 });
  await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => document.fonts.ready);
  const card = page.getByTestId("match-card").filter({ has: page.locator('[data-testid="match-teams"]:visible') }).first();
  for (const name of ["Heimerdinger", "Nunu & Willump", "Aurelion Sol", "Renata Glasc"]) {
    await card.getByTestId("match-champion").evaluate((el, n) => (el.textContent = n), name);
    const [c] = await card.evaluateAll(cardRows);
    expect(c!.championCut, `${name}: whole`).toBeLessThanOrEqual(1);
    // The name has the box; the role takes the next line when both do not fit, the card stays compact.
    expect(c!.kda!.left, `${name}: the K/D/A after the name`).toBeGreaterThanOrEqual(c!.champion!.right - 0.5);
    expect(c!.height, `${name}: the card stays two rows`).toBeLessThanOrEqual(c!.extra ? 160 : 145);
  }
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("the views, Filters and Refresh share one row, read and tabbed in the order drawn; narrowed filters bring their chips on a row of their own", async ({ page }, info) => {
  // A member whose games come from the browser tests' Riot stand-in: their own profile offers Refresh.
  const { username } = await createMember(page, "Onerow");
  await page.context().addCookies([{ name: "uniiverse_view", value: "player", url: new URL(page.url()).origin }]);
  await page.goto("/players", { waitUntil: "networkidle" });
  const href = (await page.locator(`main a[data-testid='player-card'][data-player-name='${username}']`).first().getAttribute("href"))!;
  const centre = async (l: ReturnType<Page["getByTestId"]>) => {
    const b = (await l.boundingBox())!;
    return b.y + b.height / 2;
  };
  // A phone: the project's 375px, an iPhone SE's 320px and a 360px Android; a tablet; a desktop.
  const sizes = isPhone(page) ? [page.viewportSize()!, { width: 320, height: 568 }, { width: 360, height: 780 }] : [page.viewportSize()!];
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const view of ["", "?view=encounters"]) {
      const at = `${size.width}px, ${view || "games"}`;
      await page.goto(`${href}/matches${view}`, { waitUntil: "networkidle" });
      await expect(page.locator("[data-testid='match-history'][data-ready], [data-testid='encounters'][data-ready]")).toBeVisible();
      const refresh = page.getByTestId("data-refresh-button");
      await expect(refresh).toBeVisible();
      const filters = isPhone(page) ? page.getByTestId("filter-toggle") : page.locator("#overview-mode");
      const views = page.getByTestId("match-views");
      const [v, f, r] = [await centre(views), await centre(filters), await centre(refresh)];
      expect(Math.abs(v - f), `${at}: Filters on the views' row`).toBeLessThanOrEqual(4);
      expect(Math.abs(v - r), `${at}: Refresh on the views' row`).toBeLessThanOrEqual(4);
      // Refresh and Filters keep their names for screen readers where they show their icon alone.
      await expect(refresh).toHaveAccessibleName(/Refresh/);
      if (isPhone(page)) {
        await expect(filters).toHaveAccessibleName(/^Filters/);
        expect((await refresh.boundingBox())!.width, `${at}: a 44px Refresh`).toBeGreaterThanOrEqual(43.5);
        expect((await filters.boundingBox())!.width, `${at}: a 44px Filters`).toBeGreaterThanOrEqual(43.5);
      }
      // Tab goes the way the header is drawn: the views, the toolbar (its filters, then Refresh),
      // then the data status's ⓘ on the scope line under them. Screen readers read it in that order.
      await page.getByTestId("match-view-encounters").focus();
      const stops: Array<{ id: string | null; inToolbar: boolean }> = [];
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        const stop = await page.evaluate(() => {
          const el = document.activeElement!;
          return { id: el.getAttribute("data-testid"), inToolbar: !!el.closest('[data-testid="section-toolbar"]') };
        });
        stops.push(stop);
        if (stop.id === "data-refresh-info") break;
      }
      const status = stops.findIndex((s) => s.id === "data-refresh-info");
      expect(status, `${at}: Tab reaches the data status`).toBeGreaterThan(0);
      expect(stops.slice(0, status).every((s) => s.inToolbar), `${at}: every stop before it is the toolbar's`).toBe(true);
      expect(stops[status - 1]!.id, `${at}: Refresh just before it`).toBe("data-refresh-button");
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    }
  }
  if (info.project.name === "desktop") return;
  // Narrowed filters bring chips that need the room, and the toolbar takes the next row, from its
  // start: a phone's beside Filters (no room for them beside the views at 375px), and a tablet's
  // active refinements under the bar, clear of the Refine panel that opens from the right
  // (e2e/match-refine.spec.ts). A tablet shows no chip for a game mode.
  await page.setViewportSize(sizes[0]!);
  const phone = isPhone(page);
  await page.goto(`${href}/matches?${phone ? "mode=solo" : "result=win"}`, { waitUntil: "networkidle" });
  const history = page.getByTestId("match-history");
  await expect(history).toHaveAttribute("data-ready", "true");
  const views = (await page.getByTestId("match-views").boundingBox())!;
  const toolbar = (await history.getByTestId("section-toolbar").boundingBox())!;
  expect(toolbar.y, "the toolbar under the views").toBeGreaterThanOrEqual(views.y + views.height - 1);
  expect(toolbar.x, "from the row's start").toBeLessThanOrEqual(views.x + 1);
  const chip = history.getByRole("button", { name: phone ? "Ranked Solo/Duo: remove this filter" : "Wins: remove this filter" });
  await expect(chip).toBeVisible();
  const c = (await chip.boundingBox())!;
  if (!phone) {
    // A tablet's active refinements sit in the toolbar's own row since 23 Nov 2026 (one row: what is
    // narrowed, the controls, Reset), before the game mode, never a row of their own under the bar;
    // the Refine panel opens under the row, so they stay clear of it.
    const mode = (await history.locator("#overview-mode").boundingBox())!;
    expect(Math.abs(c.y + c.height / 2 - (mode.y + mode.height / 2)), "the refinement's chip on the controls' line").toBeLessThanOrEqual(4);
    expect(c.x + c.width, "before the game mode").toBeLessThanOrEqual(mode.x);
  }
  expect(c.x + c.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  if (phone) return;
  // A game mode brings no chip on a tablet: the toolbar stays beside the views where it fits
  // (Encounters' does on a 768px tablet, with Refresh and Reset).
  await page.goto(`${href}/matches?view=encounters&mode=solo`, { waitUntil: "networkidle" });
  await expect(page.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
  const [v, m] = [await centre(page.getByTestId("match-views")), await centre(page.locator("#overview-mode"))];
  expect(Math.abs(v - m), "a game mode: the toolbar beside the views").toBeLessThanOrEqual(4);
});

/** The summary's shape: each phone line's height, how many rows its tiles take, and the tallest tile. */
const summaryShape = (s: Element) => {
  const tiles = [...s.querySelectorAll("[data-stat-tile]")].filter((e) => e.getBoundingClientRect().height > 0);
  return {
    lines: [...s.querySelectorAll("[data-stat-line]")].map((l) => l.getBoundingClientRect().height),
    rows: new Set(tiles.map((e) => Math.round(e.getBoundingClientRect().top))).size,
    tallest: Math.max(...tiles.map((e) => e.getBoundingClientRect().height)),
    height: s.getBoundingClientRect().height,
  };
};

/**
 * The widest a real summary gets, written into a strip that already holds a named trend, the ladder
 * change, a streak and three champions (demo Support): a three-digit ladder change over the longest
 * label ("Solo/Duo since 30 Sep"), a two-digit record on a champion, and the KDA and CS (or vision)
 * arrows. Only the words and figures change; the strip lays them out as it would.
 */
const widestSummary = (s: Element, { record = true, arrows = true } = {}) => {
  const ladder = s.querySelector('[data-testid="history-summary-ladder"]')!;
  ladder.querySelector("span.font-semibold span")!.textContent = "+999";
  const label = [...ladder.children].find((c) => !c.classList.contains("font-semibold"))!;
  [...label.childNodes].reverse().find((n) => n.nodeType === Node.TEXT_NODE)!.textContent = " since 30 Sep";
  if (record) s.querySelector('[data-testid="history-summary-champions"] li span.tabular-nums')!.textContent = "10–4";
  if (arrows)
    for (const key of ["kda", "cs", "vision"]) {
      const value = s.querySelector(`[data-testid="history-summary-${key}"] span.font-semibold`);
      if (value && !value.querySelector("svg")) value.insertAdjacentHTML("beforeend", '<svg style="width:14px;height:14px"></svg>');
    }
};

test("the summary is three lines on a phone and one row of tiles on a desktop, with every figure at once", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "the phone's lines and the desktop's row");
  // Demo ADC: the ladder change, a streak and a KDA arrow. Demo Support: a named trend, the ladder
  // change and a streak at once. Then Support at its widest (widestSummary).
  const players = { ADC: await profileOf(page, "ADC"), SUPPORT: await profileOf(page, "SUPPORT") };
  const sizes = isPhone(page) ? [{ width: 375, height: 667 }, { width: 393, height: 659 }, { width: 412, height: 839 }] : [{ width: 1280, height: 800 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const [role, profile] of Object.entries(players)) {
      await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const summary = page.getByTestId("history-summary");
      if (role === "SUPPORT") await expect(summary.getByTestId("history-summary-trend")).toBeVisible();
      await expect(summary.getByTestId("history-summary-ladder")).toBeVisible();
      await expect(summary.getByTestId("history-summary-streak")).toBeVisible();
      const variants: Array<[string, { record?: boolean; arrows?: boolean } | null]> = role === "ADC" ? [["as it is", null]] : [["as it is", null], ["with the longest ladder label", { record: false, arrows: false }], ["at its widest", {}]];
      for (const [what, widest] of variants) {
        if (widest) await summary.evaluate(widestSummary, widest);
        const f = await summary.evaluate(summaryShape);
        const where = `${size.width}px, ${role} ${what}`;
        if (isPhone(page)) {
          // Three lines from 393px, each one line of figures (about 21px). At 375px a streak beside a
          // named trend takes a second row on the first line (3px squares do not fit beside them),
          // and the widened ladder change may take a fourth line (the champions and the longest
          // label need about 315px of 317, a two-digit record about 323px).
          const narrow = size.width < 393;
          const allowed = [narrow && role === "SUPPORT" ? 48 : 24, 24, narrow && widest !== null ? 48 : 24];
          expect(f.lines.length).toBe(3);
          for (const [i, h] of f.lines.entries()) expect(h, `${where}: line ${i + 1}`).toBeLessThanOrEqual(allowed[i]!);
          if (!narrow) expect(f.height, `${where}: three lines, about 89px`).toBeLessThanOrEqual(94);
        } else {
          // One row of tiles, about 44px, on a 60rem list (1280 with the sidebar open) too.
          expect(f.rows, `${where}: one row of tiles`).toBe(1);
          expect(f.height, where).toBeLessThanOrEqual(46);
        }
      }
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    }
  }
  if (isPhone(page)) return;
  // From 78rem of strip (a 2560px screen) a summary without a trend is one line of text; with one, the tiles stay.
  await page.setViewportSize({ width: 2560, height: 1440 });
  for (const [role, profile] of Object.entries(players)) {
    await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const f = await page.getByTestId("history-summary").evaluate(summaryShape);
    const value = await page.getByTestId("history-summary-record").evaluate((t) => t.querySelector("span.font-semibold")!.getBoundingClientRect().height);
    expect(f.rows, `2560px, ${role}: one row`).toBe(1);
    if (role === "ADC") expect(f.tallest, "2560px, no trend: one line of text").toBeLessThanOrEqual(value + 1);
    else expect(f.tallest, "2560px, a trend: tiles").toBeGreaterThan(value + 8);
  }
});

/** The summary's squares: the narrowest, whether all stay inside the strip, and whether the last ends before the streak on its row. */
const summarySquares = (s: Element) => {
  const squares = [...s.querySelectorAll("[data-result]")].map((e) => e.getBoundingClientRect());
  const strip = s.getBoundingClientRect();
  const last = squares[squares.length - 1]!;
  const streak = s.querySelector('[data-testid="history-summary-streak"]')?.getBoundingClientRect() ?? null;
  const beside = !!streak && last.top < streak.bottom && last.bottom > streak.top;
  return {
    count: squares.length,
    narrowest: Math.min(...squares.map((r) => r.width)),
    inside: squares.every((r) => r.left >= strip.left - 0.5 && r.right <= strip.right + 0.5),
    clear: !beside || last.right <= streak!.left + 0.5,
  };
};

test("a phone's summary squares keep their 3px floor: never drawn under the streak or past the strip", async ({ page }) => {
  test.skip(!isPhone(page), "a phone's first line");
  // Demo Support: a streak and a named trend beside the squares, the tightest first line; demo ADC
  // beside a streak. At 320, 360 and 375px, and at 150% text on the narrowest.
  const players = { SUPPORT: await profileOf(page, "SUPPORT"), ADC: await profileOf(page, "ADC") };
  for (const [width, height, text] of [[320, 568, 1], [360, 780, 1], [375, 667, 1], [320, 568, 1.5], [375, 667, 1.5]] as const) {
    await page.setViewportSize({ width, height });
    for (const [role, profile] of Object.entries(players)) {
      await page.goto(`${profile}/matches`, { waitUntil: "networkidle" });
      if (text !== 1) await page.addStyleTag({ content: `html { font-size: ${text * 100}% !important; }` });
      await page.evaluate(() => document.fonts.ready);
      const summary = page.getByTestId("history-summary");
      await expect(summary.getByTestId("history-summary-streak")).toBeVisible();
      if (role === "SUPPORT") await expect(summary.getByTestId("history-summary-trend")).toBeVisible();
      const f = await summary.evaluate(summarySquares);
      const where = `${width}px at ${text * 100}% text, ${role}`;
      expect(f.count, where).toBe(20);
      expect(f.narrowest, `${where}: every square at least 3px wide`).toBeGreaterThanOrEqual(2.99);
      expect(f.inside, `${where}: inside the strip`).toBe(true);
      expect(f.clear, `${where}: clear of the streak`).toBe(true);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    }
  }
});

/**
 * The plan's page heights (D8), in screens: the page's height over the window's, for Demo ADC's games
 * and Encounters, at each project's devices (touch for phones and tablets). Each bound is the
 * plan's target, compared at its two decimals (the plan's own precision), so a lost or added line
 * (16px or more) shows but a pixel of rounding between browser builds does not (1440×900 meets its
 * target with no room to spare: 1,440px). docs/MOBILE.md (section 3) has the measurements, dated.
 * The one target missed is bound by the height measured, and MOBILE.md says why: a Pixel 7 held
 * sideways (863×360) keeps the wide one-row card, which D8 leaves as it is, under the phone's frame.
 */
const HEIGHTS: Record<string, Array<{ device: string; size: { width: number; height: number }; games: number; encounters?: number }>> = {
  phone: [
    { device: "iPhone 15 in Safari", size: { width: 393, height: 659 }, games: 2.7, encounters: 1.8 },
    { device: "iPhone 15, the installed app", size: { width: 393, height: 852 }, games: 2.2 },
    { device: "iPhone SE (1st generation)", size: { width: 320, height: 568 }, games: 3.8, encounters: 2.1 },
    { device: "iPhone SE (3rd generation)", size: { width: 375, height: 667 }, games: 2.7 },
    { device: "Pixel 7 in Chrome", size: { width: 412, height: 839 }, games: 2.1 },
    { device: "an iPhone held sideways, in Safari", size: { width: 734, height: 343 }, games: 4.8, encounters: 3.3 },
    { device: "a Pixel 7 held sideways, in Chrome", size: { width: 863, height: 360 }, games: 4.3 },
  ],
  tablet: [
    { device: "iPad (820×1180)", size: { width: 820, height: 1180 }, games: 1.6 },
    { device: "iPad (810×1080)", size: { width: 810, height: 1080 }, games: 1.6, encounters: 1.0 },
  ],
  desktop: [
    { device: "a laptop (1440×900)", size: { width: 1440, height: 900 }, games: 1.6 },
    { device: "a 2560×1440 monitor", size: { width: 2560, height: 1440 }, games: 1.3 },
    { device: "an ultrawide (3440×1440)", size: { width: 3440, height: 1440 }, games: 1.35 },
  ],
};

test("Match History's and Encounters' page heights stay within the plan's targets on each device", async ({ page }, info) => {
  const profile = await profileOf(page, "ADC");
  for (const { device, size, games, encounters } of HEIGHTS[info.project.name] ?? []) {
    await page.setViewportSize(size);
    for (const [view, bound] of [["", games], ["?view=encounters", encounters]] as const) {
      if (bound === undefined) continue;
      await page.goto(`${profile}/matches${view}`, { waitUntil: "networkidle" });
      await expect(page.locator("[data-testid='match-history'][data-ready], [data-testid='encounters'][data-ready]")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const screens = await page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight);
      expect(Math.round(screens * 100) / 100, `${device}, ${view ? "Encounters" : "games"}: ${screens.toFixed(3)} screens`).toBeLessThanOrEqual(bound);
    }
  }
});

test("at 200% text on a 320px phone, the games and Encounters are no wider than the phone", async ({ page }) => {
  test.skip(!isPhone(page), "a 320px phone");
  const profile = await profileOf(page, "TOP");
  await page.setViewportSize({ width: 320, height: 568 });
  for (const path of [`${profile}/matches`, `${profile}/matches?view=encounters`, `${profile}/matches?view=encounters&rel=against`]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator("[data-testid='match-history'][data-ready], [data-testid='encounters'][data-ready]")).toBeVisible();
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${path}: no wider than the phone` }).toBeLessThanOrEqual(0);
    // Nothing in a card is cut off either (a card hides what runs past it, so the page's width
    // cannot tell): every shown part, and the text in it, ends inside the card's content box.
    const cut = await page.getByTestId("match-card").evaluateAll((cards) =>
      cards.flatMap((card) => {
        const grid = card.querySelector('[data-testid="match-card-grid"]')!;
        const edge = grid.getBoundingClientRect().right - parseFloat(getComputedStyle(grid).paddingRight);
        const parts = [...card.querySelectorAll('[data-testid="match-kda"], [data-testid="match-champion"], [data-testid="match-kp"], [data-testid="match-cs"], [data-testid="match-damage"], [data-testid="match-card-meta"], [data-testid="match-standout"], [aria-label^="Items:"]')].filter((e) => e.getBoundingClientRect().width > 1);
        // A part's ink: its own box and the text in it (text can run past a box that cannot grow),
        // leaving out what is laid over the page (screen-reader text, a tooltip's bubble).
        const inkRight = (e: Element) => {
          let right = e.getBoundingClientRect().right;
          const texts = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
          for (let n = texts.nextNode(); n; n = texts.nextNode()) {
            let laidOver = false;
            for (let a = n.parentElement; a && a !== e.parentElement; a = a.parentElement) if (["absolute", "fixed"].includes(getComputedStyle(a).position)) laidOver = true;
            if (laidOver || !n.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            right = Math.max(right, range.getBoundingClientRect().right);
          }
          return right;
        };
        return parts.filter((e) => inkRight(e) > edge + 0.5).map((e) => e.getAttribute("data-testid") ?? "build");
      }),
    );
    expect(cut, `${path}: nothing past a card's content box`).toEqual([]);
  }
});
