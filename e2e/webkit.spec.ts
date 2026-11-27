import { devices, expect, test, type Locator, type Page } from "./test";
import { lineupAtRest } from "./lineup";
import { emulateKeyboard, keyboard } from "./keyboard";
import { untilStill } from "./modal-corner";
import { openMatchWindow, showGamePage } from "./match-history";
import { bubbleFacts, NOT_A_PICTURE, NOT_A_PICTURE_ERROR, openPictureEditor, placedRight, toastFacts } from "./popups";
import { pullDown } from "./pull";
import { pick, ready, SELECT_LOOK, selectLook, valueOf } from "./select";
import path from "node:path";

/*
  SAFARI'S ENGINE. Runs only in the opt-in "webkit" project (E2E_WEBKIT=1 locally, or the WebKit
  workflow on GitHub, started by hand): the priority pages in WebKit as Playwright builds it, on an
  iPhone-sized touch screen. That is Safari's engine on Linux, not Safari on an iPhone: the Home
  Screen app, the iOS keyboard (emulated here, as in the Chromium tests) and real touch scrolling
  still need a device (docs/RESPONSIVE.md → Safari and iPhones). Every other test runs in Chromium
  on the phone, tablet and desktop projects.
  The popups over windows that behave differently in Safari are checked here too (the rest are in
  e2e/popups.spec.ts): a window opened by a tap holds the focus itself with nothing in it ringed
  (Safari ringed the close button), an ⓘ's bubble in a game's window is drawn inside it and Escape
  closes the bubble alone, and a toast over the picture editor is drawn in it, its dismiss button
  reached by a tap where it is drawn.
  The shared fixture fails a test on any uncaught page error, hydration mismatches included.
*/

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name !== "webkit", "Safari's engine only (E2E_WEBKIT=1)");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** Nothing on the page is wider than the screen. */
async function fitsWidth(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${label}: no sideways scrolling`).toBeLessThanOrEqual(1);
}

test("the priority pages load without an error and without sideways scrolling", async ({ page }) => {
  for (const route of ["/team", "/players", "/leaderboards", "/matches", "/resources", "/lookup", "/lookup?champion=LeeSin&haste=40", "/settings", "/admin", "/admin/people", "/admin/system"]) {
    await page.goto(route);
    await expect(page.locator("main"), route).toBeVisible();
    await expect(page.locator("h1").first(), route).toBeVisible();
    await fitsWidth(page, route);
  }
});

test("Team Overview: the cards are one sideways carousel, a dot brings its card into view, and names are whole", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByTestId("lineup-cell")).toHaveCount(5);
  // Measured once the lineup is laid out and at rest (it streams in: e2e/lineup.ts).
  await lineupAtRest(page);
  await fitsWidth(page, "/team");
  // No pager over the cards since the carousel (23 Nov 2026): five position dots under them.
  await expect(page.getByTestId("lineup-pager")).toHaveCount(0);
  const dots = page.getByTestId("lineup-indicator");
  // The active card takes the height Safari's tab leaves (Release 16, docs/MOBILE.md "The active card
  // uses the screen"): the dots end above the tab bar and within 24px of it, the five cards one height,
  // and the page does not scroll.
  const used = await page.evaluate(() => ({
    dots: document.querySelector("[data-testid=lineup-indicator]")!.getBoundingClientRect().bottom,
    tab: document.querySelector("[data-testid=phone-tabbar]")!.getBoundingClientRect().top,
    heights: new Set([...document.querySelectorAll("[data-testid=lineup-cell]")].map((c) => Math.round(c.getBoundingClientRect().height))).size,
    scroll: document.documentElement.scrollHeight - innerHeight,
  }));
  expect(used.dots, "the dots above the tab bar").toBeLessThanOrEqual(used.tab + 0.5);
  expect(used.tab - used.dots, "the card uses the height: at most 24px left").toBeLessThanOrEqual(24);
  expect(used.heights, "the five cards one height").toBe(1);
  expect(used.scroll, "no page scroll").toBeLessThanOrEqual(1);
  // A tap before the page is interactive does nothing: tap until the track has moved. The dot's job
  // is to bring its card across into view, whole from side to side; how much of its height fits
  // depends on what is above the track (the page scrolls for the rest).
  await expect(async () => {
    await dots.getByRole("tab", { name: /^Mid:/ }).tap();
    const box = (await page.getByTestId("lineup-row-MID").boundingBox())!;
    expect(box.x, "the card's left edge on screen").toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, "the card's right edge on screen").toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    await expect(page.getByTestId("lineup-row-MID")).toBeInViewport({ ratio: 0.75, timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(dots.getByRole("tab", { name: /^Mid:/ })).toHaveAttribute("aria-selected", "true");
  // One card on screen (no neighbour beside it).
  const shown = () => page.getByTestId("lineup-cell").evaluateAll((els) => els.filter((c) => { const r = c.getBoundingClientRect(); return r.right > 0.5 && r.left < document.documentElement.clientWidth - 0.5; }).map((c) => c.querySelector<HTMLElement>("[data-testid^=lineup-row-]")!.dataset.testid));
  await expect.poll(shown).toEqual(["lineup-row-MID"]);
  const name = page.getByTestId("lineup-row-MID").getByTestId("card-name");
  await expect(name).toBeVisible();
  expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await expect(async () => {
    await dots.getByRole("tab", { name: /^Support:/ }).tap();
    await expect.poll(shown, { timeout: 2_000 }).toEqual(["lineup-row-SUPPORT"]);
  }).toPass({ timeout: 15_000 });
  // The track moved one card on by script (Playwright's WebKit has no touch drag; a card is the
  // track's width apart): the loop wraps from Support to Top once Safari has the scroll at rest
  // (scrollend, or no scroll for 140ms where it is not sent), Top in the middle of the loop again.
  await page.getByTestId("lineup-overview").evaluate((el) => el.scrollBy({ left: el.clientWidth, behavior: "smooth" }));
  await expect(dots.getByRole("tab", { name: /^Top:/ })).toHaveAttribute("aria-selected", "true");
  await expect.poll(shown).toEqual(["lineup-row-TOP"]);
  await expect.poll(() => page.getByTestId("lineup-cell").first().evaluate((c) => getComputedStyle(c).order)).toBe("2");
  // Moved round where nothing shows it: Top is still the one card on screen.
  await expect.poll(shown).toEqual(["lineup-row-TOP"]);
});

test("Team Overview: a card turns over with nothing of the side turned away left drawn, its links and controls included", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  // The demo's Support card has a substitute, and the substitute's side has a link.
  await expect(async () => {
    await page.getByTestId("lineup-indicator").getByRole("tab", { name: /^Support:/ }).tap();
    await expect(page.getByTestId("lineup-row-SUPPORT")).toBeInViewport({ ratio: 0.5, timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const card = page.getByTestId("lineup-card-SUPPORT");
  // A turn there and a turn back, each with its clock stepped by hand (WebKit here draws few frames
  // a second, so live sampling would see almost none): how far through the turn, what each side
  // shows, and what is drawn over the art on each side.
  const turns = await card.evaluate(async (el) => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const face = (s: string) => el.querySelector<HTMLElement>(s)!;
    // The overlays drawn (a phone's card leaves its links to the player's window: not displayed there).
    const overlay = (f: HTMLElement) => Math.max(0, ...[...f.querySelectorAll<HTMLElement>("[data-card-overlay]")].filter((o) => o.getClientRects().length).map((o) => Number(getComputedStyle(o).opacity)));
    const run = async (from: string, to: string, control: string) => {
      // The turn's own animations (not CSS transitions), as soon as React has started them.
      const started = async () => {
        for (let i = 0; i < 50; i++) {
          const own = el.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation));
          if (own.length) return own;
          await new Promise((r) => setTimeout(r, 0));
        }
        return [];
      };
      (face(from).querySelector(`[data-testid=${control}]`) as HTMLElement).click();
      const turn = await started();
      const total = Number(turn[0]?.effect?.getComputedTiming().duration ?? 0);
      turn.forEach((a) => a.pause());
      const out: Array<{ t: number; leaving: string; leavingOverlay: number; arriving: number; arrivingOverlay: number }> = [];
      for (let step = 0; step <= 20; step++) {
        turn.forEach((a) => (a.currentTime = (total * step) / 20));
        out.push({ t: step / 20, leaving: getComputedStyle(face(from)).visibility, leavingOverlay: overlay(face(from)), arriving: Number(getComputedStyle(face(to)).opacity), arrivingOverlay: overlay(face(to)) });
      }
      turn.forEach((a) => a.finish());
      while ((await frame(), el.dataset.turn));
      const links = [...face(from).querySelectorAll<HTMLElement>("[data-card-overlay] a, [data-card-overlay] button")];
      // Settled: every link and control of the side turned away is hidden and cannot be hit.
      const rest = links.map((l) => {
        const b = l.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { hidden: getComputedStyle(l).visibility === "hidden", hit: !!hit && l.contains(hit) };
      });
      return { out, animations: turn.length, rest };
    };
    const there = await run(".flip-face-front", ".flip-face-back", "flip-to-substitute");
    const back = await run(".flip-face-back", ".flip-face-front", "flip-back");
    return [there, back];
  });
  for (const [i, turn] of turns.entries()) {
    const which = i === 0 ? "to the substitute" : "back to the starter";
    expect(turn.animations, `${which}: the turn runs on its own animations`).toBeGreaterThan(3);
    for (const f of turn.out) {
      if (f.t > 0.2) expect(f.leavingOverlay, `${which} at ${f.t.toFixed(2)}: the leaving side's links and controls are gone`).toBe(0);
      if (f.t > 0.5) expect(f.leaving, `${which} at ${f.t.toFixed(2)}: the leaving side is hidden`).toBe("hidden");
      if (f.t < 0.5) expect(f.arriving, `${which} at ${f.t.toFixed(2)}: the arriving side is not drawn yet`).toBe(0);
      if (f.t < 0.6) expect(f.arrivingOverlay, `${which} at ${f.t.toFixed(2)}: the arriving side's links and controls wait`).toBe(0);
    }
    expect(turn.rest.length, which).toBeGreaterThan(0);
    for (const r of turn.rest) expect(r, `${which}: settled`).toEqual({ hidden: true, hit: false });
  }
  await expect(page.getByTestId("lineup-row-SUPPORT")).toBeVisible();
});

test("All Champions: a tap on a champion's second position mark opens its preview in that position (the row stays one target)", async ({ page }) => {
  // Demo Sub (Top) plays Sion in five positions (server/demo/seed.ts, DEMO_OTHER_POSITIONS). The row's
  // button reads where Safari's tap landed (champion-roles.tsx, roleMarkAt).
  await page.goto("/players");
  const href = (await page.locator("main a[data-testid='player-card'][data-player-name='Demo Sub (Top)']").getAttribute("href"))!;
  await page.goto(`${href}/champions`);
  const sion = page.locator("[data-testid=top-champion][data-champion=Sion]");
  const mark = sion.getByTestId("champion-role-mark").nth(1);
  const role = (await mark.getAttribute("data-role"))!;
  const box = (await mark.boundingBox())!;
  await expect(async () => {
    if (!(await page.locator("dialog[open]").count())) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-role", role, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await fitsWidth(page, "All Champions with a preview open");
});

test("All Champions at 1440 × 900 in Safari's engine: with a fine pointer the one-screen workspace (the page the window, its pages, the pane's height kept as an opponent opens); without one the flow", async ({ browser, page, baseURL }) => {
  await page.goto("/team");
  const profile = `/players/${(await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!}`;
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // The demo's lists are shorter than a page: the test cookies cap the measured pages (server/demo/test-hooks.ts).
  await desk.addCookies([
    { name: "uniiverse_view", value: "player", url: baseURL! },
    { name: "uniiverse-test-champions-per-page", value: "3", url: baseURL! },
    { name: "uniiverse-test-opponents-per-column", value: "1", url: baseURL! },
  ]);
  const dp = await desk.newPage();
  await dp.goto(`${profile}/champions`, { waitUntil: "load" });
  await expect(dp.getByTestId("top-champion").first()).toBeVisible();
  const fine = await dp.evaluate(() => matchMedia("(pointer: fine)").matches);
  if (!fine) {
    // Playwright's WebKit on Linux reports no fine pointer: the workspace's gate (docs/RESPONSIVE.md) leaves it the flow.
    await expect.poll(() => dp.evaluate(() => !!document.querySelector("[data-workspace]"))).toBe(false);
    await fitsWidth(dp, "the flow at 1440 × 900");
    await desk.close();
    return;
  }
  // dvh and a flex column's least height behave differently in WebKit: the frame still ends at the window's foot.
  const measure = () =>
    dp.evaluate(() => {
      const pad = parseFloat(getComputedStyle(document.getElementById("content")!).paddingBottom);
      const cards = [...document.querySelectorAll("[data-testid=all-champions-table], aside[data-preview-pane]")].map((c) => c.getBoundingClientRect().bottom);
      return { fits: document.documentElement.scrollHeight <= innerHeight, cards: cards.every((b) => b <= innerHeight - pad + 0.5), pager: !!document.querySelector("[data-testid=all-champions-pager] [aria-current=page]") };
    });
  await expect.poll(measure).toEqual({ fits: true, cards: true, pager: true });
  await dp.getByTestId("top-champion").first().getByTestId("open-champion").click();
  const pane = dp.locator("aside[data-preview-pane]");
  await expect(pane).toBeVisible();
  await expect.poll(measure).toEqual({ fits: true, cards: true, pager: true });
  const height = (await pane.boundingBox())!.height;
  await pane.locator("[data-testid=champion-preview-opponent]").first().getByRole("button").click();
  await expect(pane.getByTestId("champion-preview-pairing")).toBeVisible();
  await expect.poll(measure).toEqual({ fits: true, cards: true, pager: true });
  expect(Math.abs((await pane.boundingBox())!.height - height)).toBeLessThanOrEqual(1);
  await fitsWidth(dp, "the workspace at 1440 × 900");
  await desk.close();
});

test("All Champions' short form and workspace window in Safari's engine: Sion vs Nasus at 1366 × 657 fits (the subgrid, :is() and the two-block variant); the window at 1280 × 800 has a fixed height and nothing scrolling inside", async ({ browser, page, baseURL }) => {
  await page.goto("/players");
  const href = (await page.locator("main a[data-testid='player-card'][data-player-name='Demo Sub (Top)']").getAttribute("href"))!;
  const at = async (width: number, height: number, sidebar: "expanded" | "collapsed") => {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addCookies([
      { name: "uniiverse_view", value: "player", url: baseURL! },
      { name: "uniiverse_sidebar", value: sidebar, url: baseURL! },
    ]);
    const p = await context.newPage();
    await p.goto(`${href}/champions?champion=Sion&crole=TOP&vs=Nasus`, { waitUntil: "load" });
    await expect(p.getByTestId("champion-preview-content")).toBeVisible();
    return { context, p };
  };
  const short = await at(1366, 657, "expanded");
  if (!(await short.p.evaluate(() => matchMedia("(pointer: fine)").matches))) {
    // Playwright's WebKit on Linux reports no fine pointer: the workspace's gate leaves it the flow (the test above).
    await expect.poll(() => short.p.evaluate(() => !!document.querySelector("[data-workspace]"))).toBe(false);
    await short.context.close();
    return;
  }
  const pane = short.p.locator("aside[data-preview-pane]");
  await expect(pane.getByTestId("champion-preview-pairing")).toBeVisible();
  await expect
    .poll(() =>
      short.p.evaluate(() => {
        const pad = parseFloat(getComputedStyle(document.getElementById("content")!).paddingBottom);
        const cards = [...document.querySelectorAll("[data-testid=all-champions-table], aside[data-preview-pane]")].map((c) => c.getBoundingClientRect().bottom);
        const stats = document.querySelector("aside[data-preview-pane] [data-testid=champion-preview-stats]")!;
        return { fits: document.documentElement.scrollHeight <= innerHeight, cards: cards.every((b) => b <= innerHeight - pad + 0.5), subgrid: getComputedStyle(stats).gridTemplateColumns.startsWith("subgrid"), foot: Math.round(pad) };
      }),
    )
    .toEqual({ fits: true, cards: true, subgrid: true, foot: 12 });
  await fitsWidth(short.p, "the short form at 1366 × 657");
  await short.context.close();
  // The workspace window: a fixed height (the screen less 1rem above and below), nothing scrolling inside it.
  const windowed = await at(1280, 800, "expanded");
  const win = windowed.p.locator("dialog[open][data-testid=champion-preview][data-size=workspace]");
  await expect(win).toBeVisible();
  await expect(win.getByTestId("champion-preview-pairing")).toBeVisible();
  await expect
    .poll(() =>
      win.evaluate((d) => ({
        height: Math.abs(d.getBoundingClientRect().height - (innerHeight - 2 * parseFloat(getComputedStyle(document.documentElement).fontSize))) <= 1,
        scrollers: [d, ...d.querySelectorAll("*")].filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1).length,
        fits: document.documentElement.scrollHeight <= innerHeight,
      })),
    )
    .toEqual({ height: true, scrollers: 0, fits: true });
  await windowed.context.close();
});

test("a teammate's profile: its sections switch, and a champion's preview sheet opens and closes by Back and Escape", async ({ page }) => {
  await page.goto("/players");
  const href = (await page.locator("main a[data-testid='player-card'][data-player-name='Demo Top']").getAttribute("href"))!;
  await page.goto(`${href}/champions`);
  // On a phone the profile's sections ride in the top bar, with short names (docs/MOBILE.md).
  const tabs = page.getByTestId("profile-chrome-tabs");
  await expect(tabs.getByRole("link", { name: "Champions" })).toHaveAttribute("aria-current", "page");
  await fitsWidth(page, "All Champions");
  const open = page.getByTestId("open-champion").first();
  await expect(async () => {
    if (!(await page.locator("dialog[open]").count())) await open.tap();
    await expect(page.getByTestId("champion-preview-figures")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // All Champions' preview is a sheet on a phone: Back closes it (one history entry), and it opens again.
  await page.goBack();
  await expect(page.getByTestId("champion-preview-content")).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  await expect(async () => {
    if (!(await page.locator("dialog[open]").count())) await open.tap();
    await expect(page.getByTestId("champion-preview-figures")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // The sheet fills the phone's width and nothing in it scrolls sideways. Measured once it is at
  // rest: while it opens, Safari's engine can measure its 44px close button at 43.99998px.
  await expect.poll(() => page.locator("dialog[open]").evaluate((d) => d.getAnimations({ subtree: true }).length)).toBe(0);
  const box = (await page.locator("dialog[open]").boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  // The opponents' compact table (Release 16) fits the sheet: every row within it, none wider than it.
  await page.locator("dialog[open] [data-testid=champion-preview-opponent]").first().waitFor();
  const rows = await page.locator("dialog[open] [data-testid=champion-preview-opponent] > button").evaluateAll((els, right) => els.map((e) => e.getBoundingClientRect().right <= right + 0.5 && e.scrollWidth <= e.clientWidth + 1), box.x + box.width);
  expect(rows.length, "an opponent row in the sheet").toBeGreaterThan(0);
  expect(rows.every(Boolean), "the opponents' rows within the sheet").toBe(true);
  // Its close button (the shared Peek's sheet) is the header's last control, a 44px target, in its
  // top-right corner: within the header's 16px side padding and the sheet's 1px side border, and
  // under the sheet's 1px top border, its grabber (12px) and the header's 12px top padding (25px;
  // the same in Chromium). Before 20 Nov 2026 this read 24, met only while the sheet still slid in.
  const close = (await page.locator("dialog[open]").getByTestId("champion-preview-close").boundingBox())!;
  expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width - (close.x + close.width)).toBeLessThanOrEqual(17.5);
  expect(close.y - box.y).toBeLessThanOrEqual(25);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-preview-content")).toHaveCount(0);
  await tabs.getByRole("link", { name: "History" }).tap();
  await expect(page).toHaveURL(new RegExp(`${href}/matches$`));
  await expect(tabs.getByRole("link", { name: "History" })).toHaveAttribute("aria-current", "page");
});

test("Champion Intel on an iPhone: the search is 16px and a tap on a match chooses, the haste field changes the numbers, an ability's row unfolds, a second champion comes beside the first, swaps and goes, the window fills the screen, and nothing is wider than the phone", async ({ page }) => {
  await page.goto("/lookup");
  const input = page.getByTestId("lookup-search-input");
  // 16px, so Safari never zooms into the field.
  expect(await input.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  await input.tap();
  await input.fill("ahr");
  const option = page.getByTestId("lookup-search-option").first();
  await expect(option).toHaveAttribute("data-champion", "Ahri");
  await option.tap();
  await expect(page).toHaveURL(/\/lookup\?champion=Ahri$/);
  await expect(page.getByTestId("lookup-panel")).toHaveAttribute("data-champion", "Ahri");
  await expect(page.getByTestId("lookup-ability")).toHaveCount(5);
  await fitsWidth(page, "Ahri");
  // The haste field: 16px, digits typed change the numbers by Riot's rule, in place, and the address keeps it.
  const haste = page.getByTestId("lookup-haste-input");
  expect(await haste.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  await haste.tap();
  await haste.fill("20");
  const q = page.locator('[data-testid="lookup-ability"][data-slot="Q"]');
  await expect(q.getByTestId("lookup-hasted")).toHaveAttribute("data-values", "5.83,5.83,5.83,5.83,5.83");
  await expect(page).toHaveURL(/\/lookup\?champion=Ahri&haste=20$/);
  await haste.fill("100");
  await expect(q.getByTestId("lookup-hasted")).toHaveAttribute("data-values", "3.5,3.5,3.5,3.5,3.5");
  await fitsWidth(page, "Ahri at 100 haste");
  // An ability's row unfolds with a tap, Riot's description in it, and folds again.
  await q.getByTestId("lookup-ability-summary").tap();
  await expect(q.getByTestId("lookup-description")).toBeVisible();
  await fitsWidth(page, "Ahri's Q unfolded");
  await q.getByTestId("lookup-ability-summary").tap();
  await expect(q.getByTestId("lookup-description")).toBeHidden();
  // The champion's name opens the window of every champion: a screen of its own on a phone.
  await page.getByTestId("lookup-change").tap();
  const win = page.getByTestId("lookup-picker");
  await expect(win).toBeVisible();
  await untilStill(page);
  expect((await win.boundingBox())!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
  await fitsWidth(page, "All champions");
  const search = win.getByTestId("lookup-picker-search");
  await search.tap();
  await search.fill("lee");
  await win.getByTestId("lookup-picker-grid").locator('button[data-champion="LeeSin"]').tap();
  await expect(win).toHaveCount(0);
  await expect(page.getByTestId("lookup-panel")).toHaveAttribute("data-champion", "LeeSin");
  await expect(page).toHaveURL(/\/lookup\?champion=LeeSin&haste=100$/);
  // Two abilities in one slot: said in words, Riot's array as Riot's, and no haste applied.
  const leeQ = page.locator('[data-testid="lookup-ability"][data-slot="Q"]');
  await expect(leeQ.getByTestId("lookup-no-number")).toContainText("Two abilities share this slot in Riot's data · no haste applied");
  await leeQ.getByTestId("lookup-ability-summary").tap();
  await expect(leeQ).toContainText("Riot lists 10 / 9 / 8 / 7 / 6\u00a0s for the slot.");
  await fitsWidth(page, "Lee Sin");
  // Compare: both champions side by side on one board (no switcher since 25 Nov 2026), swapped, and removed again.
  await page.getByTestId("lookup-add").tap();
  await win.getByTestId("lookup-picker-search").tap();
  await win.getByTestId("lookup-picker-search").fill("jinx");
  await win.getByTestId("lookup-picker-grid").locator('button[data-champion="Jinx"]').tap();
  await expect(page).toHaveURL(/\/lookup\?champion=LeeSin&haste=100&champion2=Jinx$/);
  const first = page.locator('[data-testid="lookup-panel"][data-panel="1"]');
  const second = page.locator('[data-testid="lookup-panel"][data-panel="2"]');
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  const [a, b] = [(await first.boundingBox())!, (await second.boundingBox())!];
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
  await fitsWidth(page, "two champions");
  await page.getByTestId("lookup-swap").tap();
  await expect(page).toHaveURL(/\/lookup\?champion=Jinx&champion2=LeeSin&haste2=100$/);
  await expect(first).toHaveAttribute("data-champion", "Jinx");
  await second.getByTestId("lookup-remove").tap();
  await expect(page).toHaveURL(/\/lookup\?champion=Jinx$/);
  await expect(second).toHaveCount(0);
});

test("Champion Intel's builds on an iPhone: the queue choice is the phone's own picker, a choice applies with no page load, and the offer of another queue is a 44px target", async ({ page }) => {
  await page.goto("/lookup?champion=Thresh");
  const view = page.locator('[data-testid="lookup-panel"][data-panel="1"] [data-testid="lookup-builds-view"]');
  await expect(view).toHaveAttribute("data-queue", "solo");
  const queue = view.getByTestId("lookup-build-queue");
  await expect(queue).toHaveAttribute("data-ready", "true");
  expect(await queue.evaluate((e) => e.tagName)).toBe("SELECT");
  await queue.selectOption("flex");
  await expect(view).toHaveAttribute("data-queue", "flex");
  await expect(page).toHaveURL(/[?&]champion=Thresh&queue=flex$/);
  const offer = view.getByTestId("lookup-build-other-queue");
  expect((await offer.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await offer.tap();
  await expect(view).toHaveAttribute("data-queue", "solo");
  await expect(page).toHaveURL(/[?&]champion=Thresh$/);
  await fitsWidth(page, "Champion Intel's builds");
});

test("Leaderboards on an iPhone: the index brings each section under the top bar, focused, the old Records address lands on its section, and nothing is wider than the phone, at a larger text size too", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/leaderboards");
  // Once the page's code runs: before it, a tap is the browser's own jump to the anchor.
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("season-record")).toHaveCount(7);
  await fitsWidth(page, "Leaderboards");
  const index = page.getByTestId("section-index");
  for (const [name, id] of [
    ["Milestones", "milestones"],
    ["Multikills", "multikills"],
    ["Season records", "season-records"],
  ] as const) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await index.getByRole("link", { name }).tap();
    const section = page.locator(`section#${id}`);
    await expect(section).toBeFocused();
    await expect(section).toBeInViewport();
    await expect.poll(async () => (await section.boundingBox())!.y - (await page.getByTestId("mobile-topbar").evaluate((b) => b.getBoundingClientRect().bottom)), { message: `${name}: under the top bar` }).toBeGreaterThanOrEqual(-1);
  }
  // Records & achievements' old address: the same page, at its records (Safari's history replaced, not added to).
  await page.goto("/leaderboards?view=records");
  await expect(page).toHaveURL(/\/leaderboards#season-records$/);
  await expect(page.locator("section#season-records")).toBeFocused();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: "200%: as wide as the phone" }).toBeLessThanOrEqual(0);
});

test("Match History: a game opens as a whole screen of its own, its ranks are checked there, and Back returns to the list", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-ADC").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  // On a phone the card leaves both teams to the game's own screen (docs/MOBILE.md).
  const card = page.getByTestId("match-card").first();
  await expect(card.getByTestId("match-teams")).toBeHidden();
  const win = page.getByTestId("match-detail");
  await expect(async () => {
    if (!(await win.isVisible())) await card.tap({ position: { x: 24, y: 16 }, timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page).toHaveURL(/match=/);
  const breakdown = win.getByTestId("match-breakdown");
  await expect(breakdown).toBeVisible({ timeout: 15_000 });
  // The whole screen, and nothing in it scrolls sideways.
  const box = (await win.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
  await fitsWidth(page, "an open game");
  // The browser tests' Riot stand-in answers the rank check (server/riot/browser-test.ts).
  const note = breakdown.getByTestId("ranks-note");
  // (On the window's Scoreboard page: present whatever page is shown.)
  await expect(note).toBeAttached({ timeout: 15_000 });
  await expect(note).not.toHaveAttribute("data-state", "checking", { timeout: 15_000 });
  // The bottom bar: Previous and Next (44px targets) inside the screen; Next shows the next game in place of the address.
  const bar = win.getByTestId("match-detail-nav");
  const barBox = (await bar.boundingBox())!;
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(page.viewportSize()!.height + 0.5);
  expect((await win.getByTestId("match-detail-next").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(win.getByTestId("match-detail-prev")).toBeDisabled();
  const first = new URL(page.url()).searchParams.get("match");
  await win.getByTestId("match-detail-next").tap();
  await expect.poll(() => new URL(page.url()).searchParams.get("match")).not.toBe(first);
  await expect(win.getByTestId("match-detail-position")).toHaveText(/^Game 2 of \d+$/);
  // Back (Safari's edge swipe and the browser's button alike) closes it; the list is as it was, on the last game viewed.
  await page.goBack();
  await expect(win).toHaveCount(0);
  await expect(page).not.toHaveURL(/match=/);
  await expect(card).toBeVisible();
  await expect(page.getByTestId("match-row").nth(1)).toBeFocused();
});

test("the phone window shell in Safari's engine: a pull on a game's header closes it, closing a game opened from a row partly under the tab bar moves the list 0px, and the Team player window collapses its header to a 56px bar and is pulled down too", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-ADC").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  const tabbar = (await page.getByTestId("phone-tabbar").boundingBox())!;
  // A finger lands on the card: its content sits over the card's one button (the card for the
  // keyboard and screen readers), so a tap aimed at that button is taken by the content, and the
  // card's own click opens the game.
  const row = page.getByTestId("match-card").nth(3);
  // The row's top 30px above the tab bar, the rest under it (UM.X4: 70–109px when audited).
  const top = await row.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), top - (tabbar.y - 30));
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.scrollY);
  const win = page.getByTestId("match-detail");
  await expect(async () => {
    if (!(await win.isVisible())) await row.tap({ position: { x: 24, y: 12 }, timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await win.getByTestId("match-detail-close").tap();
  await expect(win).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY), "the list does not move").toBe(before);
  await row.tap({ position: { x: 24, y: 12 } });
  await expect(win).toBeVisible();
  await pullDown(page.getByTestId("match-detail-header"));
  await expect(win).toHaveCount(0);
  await expect(page).not.toHaveURL(/match=/);

  await page.goto("/team");
  await page.getByTestId("lineup-row-TOP").getByTestId("open-player-detail").tap();
  const player = page.getByTestId("player-detail");
  await expect(player).toBeVisible();
  const bar = player.getByTestId("modal-compact-bar");
  await player.evaluate((el) => {
    const body = el.querySelector<HTMLElement>("[data-modal-handle]:not([data-testid=modal-compact-bar]) + div")!;
    (getComputedStyle(el).overflowY === "auto" ? el : body).scrollTop = 160;
  });
  await expect(bar).toHaveCSS("opacity", "1");
  expect(Math.round((await bar.boundingBox())!.height)).toBe(56);
  await pullDown(bar);
  // Closed, as in e2e/overlay-kit.spec.ts: the player window stays in the page, hidden.
  await expect(player).toBeHidden();
  await expect(page).not.toHaveURL(/player=/);
});

test("Match History: a game's LP dash is no button on its card; a tap opens the game, whose tip (44px) says why it has no figure, and another tap closes it", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  const card = page.getByTestId("match-card").filter({ has: page.locator('[data-testid="match-lp"][data-lp="none"]:visible') }).first();
  const mark = card.getByTestId("match-lp-mark").filter({ visible: true });
  const bubble = page.getByTestId("match-lp-tip-bubble");
  // Until the page is interactive the card's tip is still drawn; once hydrated on touch it is the mark alone.
  await expect(mark).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('[data-testid="match-lp-tip"]')).toHaveCount(0);
  await mark.scrollIntoViewIfNeeded();
  await mark.tap();
  await expect(page).toHaveURL(/[?&]match=/);
  const tip = page.getByRole("dialog").locator('[data-testid="match-lp-tip"]').first();
  await expect(tip).toBeVisible();
  const t = (await tip.boundingBox())!;
  expect(Math.min(t.width, t.height)).toBeGreaterThanOrEqual(43.5);
  const note = await tip.evaluate((el) => document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent ?? "");
  expect(note.length).toBeGreaterThan(20);
  await tip.tap();
  await expect(bubble).toHaveText(note);
  const b = (await bubble.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await tip.tap();
  await expect(bubble).toHaveCount(0);
  await expect(page).toHaveURL(/[?&]match=/);
});

test("Match History: once the page's own Filters has scrolled away, the top bar's Filters (44px) opens the filter sheet with a tap; a choice and Done bring the first game under the bars", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  const filters = page.getByTestId("topbar-filters");
  // Down the list by steps, as a reader scrolls, so the observers see the way down.
  const toEnd = () =>
    page.evaluate(async () => {
      for (let at = window.scrollY; at < document.documentElement.scrollHeight; at += 240) {
        window.scrollTo(0, at);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
  await toEnd();
  await expect(filters).toBeVisible();
  expect(Math.round((await filters.boundingBox())!.height)).toBe(44);
  await fitsWidth(page, "the top bar with Filters");
  // Back at the top the page's own Filters is in view again, and the bar's goes.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(filters).toHaveCount(0);
  await toEnd();
  await filters.tap();
  const sheet = page.getByTestId("filter-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("refine-result").getByRole("radio", { name: "Wins" }).tap();
  await expect(page).toHaveURL(/result=win/);
  await sheet.getByTestId("filter-sheet-done").tap();
  await expect(sheet).toHaveCount(0);
  // The new list starts at its first game, just under the top bar, or as near it as the page's end allows.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const first = document.querySelector("[data-testid=match-card]")!.getBoundingClientRect();
          const bar = document.querySelector("[data-testid=mobile-topbar]")!.getBoundingClientRect();
          const gap = Math.round(first.top - bar.bottom);
          return gap >= 0 && (gap <= 12 || window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 1);
        }),
      { message: "the first game just under the bars" },
    )
    .toBe(true);
  await expect(filters.locator("span:not(.sr-only)")).toHaveText("1");
  await fitsWidth(page, "the top bar with Filters and its count");
});

test("Encounters: each player's records sit under the name with their side in words, and a player met both ways opens with the games filtered by side", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id"))!;
  // All, every player met at least once (the demo has each member meet one player on both sides).
  await page.goto(`/players/${id}/matches?view=encounters&rel=all&min=1`);
  await expect(page.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
  const rows = page.getByTestId("encounter-row");
  await expect(rows.first()).toBeVisible();
  for (const row of (await rows.all()).slice(0, 6)) {
    expect(await row.locator("[title]").first().evaluate((name) => name.scrollWidth - name.clientWidth), "the name is whole").toBeLessThanOrEqual(1);
    // On a phone each side's record is a line of its own, opened by its side's word.
    for (const record of await row.getByTestId("encounter-record").all()) {
      const games = Number(await record.getAttribute("data-games"));
      if (games) await expect(record.getByTestId("relation-tag")).toHaveText(/^(Against|Alongside)$/);
    }
  }
  await fitsWidth(page, "Encounters");
  // A player met both ways: their games in Match History itself, both records, and the games filtered by side.
  const panel = page.getByTestId("encounter-games");
  const both = page.locator("[data-testid='encounter-row']:not([data-against='0']):not([data-alongside='0'])").first();
  const against = Number(await both.getAttribute("data-against"));
  await expect(async () => {
    if (!(await panel.isVisible())) await both.getByTestId("open-encounter").tap({ timeout: 2_000 });
    await expect(panel).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(panel.getByTestId("encounter-detail-record")).toHaveCount(2);
  await panel.getByTestId("encounter-games-against").tap();
  await expect(page).toHaveURL(/side=against/);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-total", String(against));
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await fitsWidth(page, "a player's games");
  await panel.getByTestId("encounter-back").tap();
  await expect(page.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
});

test("Player Customisation: Card Studio opens, its section tabs switch, and Cancel keeps the saved card", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}`);
  await expect(page.getByTestId("profile-header")).toBeVisible();
  const frame = await page.getByTestId("profile-header").getAttribute("data-frame");
  await expect(async () => {
    await page.getByTestId("profile-header").getByTestId("customise-card").tap();
    await expect(page.getByTestId("card-studio")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByTestId("studio-tab-artwork").tap();
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-section", "artwork");
  await page.getByTestId("studio-tab-appearance").tap();
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-section", "appearance");
  await page.getByTestId("fold-colours").locator("summary").tap();
  await page.getByTestId("palettes").getByRole("button", { name: /Ember/ }).tap();
  await expect(page.getByLabel("Primary colour: hex value")).toHaveValue("#ff8a3d");
  // The Studio fits the phone; only its controls scroll.
  expect(await page.evaluate((w) => [...document.querySelectorAll("dialog *")].filter((e) => e.getBoundingClientRect().right > w + 1).length, page.viewportSize()!.width)).toBe(0);
  await page.getByTestId("studio-cancel").tap();
  await page.getByTestId("studio-confirm-yes").tap();
  await expect(page.getByTestId("card-studio")).toBeHidden();
  await expect(page.getByTestId("profile-header")).toHaveAttribute("data-frame", frame ?? "none");
});

test("the account screen in Safari's engine: one tap opens it, it fills the screen at rest, every control a full-width target reached where it is drawn, the page left where it was", async ({ page }) => {
  const screen = page.getByTestId("account-sheet");
  for (const [path, scroll] of [["/team", 0], ["/players", 400]] as const) {
    await page.goto(path);
    await page.evaluate((y) => window.scrollTo(0, y), scroll);
    const scrolled = await page.evaluate(() => scrollY);
    // One tap where the avatar is drawn (page.touchscreen): kept if it lands before the page's code
    // has run (src/components/early-taps.ts). locator.tap() would first scroll the avatar into view,
    // and this engine counts the top bar's scroll padding against a control inside the bar.
    const avatar = (await page.getByTestId("account-sheet-button").boundingBox())!;
    await page.touchscreen.tap(avatar.x + avatar.width / 2, avatar.y + avatar.height / 2);
    await expect(screen).toBeVisible();
    // At rest: its motion run and dropped, nothing animating, nothing moved or faded.
    await expect(screen).toHaveAttribute("data-entered", "true");
    expect(await screen.evaluate((d) => ({ animations: d.getAnimations().length, transform: getComputedStyle(d).transform, opacity: getComputedStyle(d).opacity }))).toEqual({ animations: 0, transform: "none", opacity: "1" });
    const fit = await screen.evaluate((d) => {
      const box = d.getBoundingClientRect();
      const body = d.querySelector<HTMLElement>("[data-sheet-scroll]")!;
      const controls = [...d.querySelectorAll<HTMLElement>("[data-testid=account-sheet-close], nav a, nav button, [data-testid=mode-switch], [data-testid=sign-out]")];
      const missed = controls.filter((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(r.top >= 0 && r.bottom <= box.bottom && !!at && (at === el || el.contains(at)));
      }).length;
      const shortest = Math.min(...controls.slice(1).map((el) => el.getBoundingClientRect().height));
      // Full width: as wide as the column the rows sit in (the nav), less its border.
      const narrowest = Math.min(...controls.slice(1).map((el) => el.getBoundingClientRect().width));
      const column = d.querySelector("nav")!.getBoundingClientRect().width;
      return { box: [box.left, box.top, box.width, box.height], screen: [innerWidth, innerHeight], scrolls: body.scrollHeight > body.clientHeight + 1, missed, rows: controls.length - 1, shortest, narrowest, column, focus: document.activeElement === d };
    });
    // The whole screen, exactly; nothing scrolls; every control reached; rows at least 48px; the
    // screen itself has the focus (the close button is not lit up).
    expect(fit.box, path).toEqual([0, 0, ...fit.screen]);
    expect(fit.scrolls, path).toBe(false);
    expect(fit.missed, path).toBe(0);
    // Rows measured (the account's own items: Settings, Install App and the mode switch on the demo), each 48px or
    // taller and as wide as the column.
    expect(fit.rows, path).toBeGreaterThanOrEqual(2);
    expect(fit.shortest, path).toBeGreaterThanOrEqual(48);
    expect(fit.narrowest, path).toBeGreaterThanOrEqual(fit.column - 2);
    expect(fit.focus, path).toBe(true);
    expect(await page.evaluate(() => scrollY), path).toBe(scrolled);
    await screen.getByTestId("account-sheet-close").tap();
    await expect(screen).toHaveCount(0);
    expect(await page.evaluate(() => scrollY), path).toBe(scrolled);
  }
});

test("Admin Mode: the account screen's switch moves between Admin Mode and Player Mode, each with the sidebar's four destinations; Back closes the account screen", async ({ page }) => {
  const tabs = page.getByRole("navigation", { name: "Primary" }).getByRole("link");
  const sheet = page.getByTestId("account-sheet");
  await page.goto("/admin");
  await expect(page.getByTestId("mobile-topbar")).toContainText("Admin mode");
  await expect(tabs).toHaveText(["Dashboard", "Users & Permissions", "Platform Settings", "System"]);
  // One tap: kept if it lands before the page's code has run (early-taps.ts).
  await page.getByTestId("account-sheet-button").tap();
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("mode-switch").tap();
  await expect(page).toHaveURL(/\/team$/);
  await expect(tabs).toHaveText(["My Profile", "Team", "Champion Intel", "Resources"]);
  await expect(page.getByTestId("team-chrome-tabs").getByRole("link")).toHaveText(["Overview", "Players", "Leaderboards", "Matches"]);
  // Back (Safari's swipe from the edge) closes the account screen and the page stays.
  await page.getByTestId("account-sheet-button").tap();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/team$/);
});

test("the one Select in Safari's engine: the iPhone keeps its own picker; with a mouse on a larger screen, the app's popover draws as in Chromium, opens and chooses from the keyboard, and Escape gives the focus back", async ({ browser, page, baseURL }) => {
  await page.goto("/team");
  const profile = `/players/${(await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!}`;
  // The iPhone: the browser's own select (its wheel), as before.
  await page.goto(`${profile}/champions`);
  const sort = page.locator("#all-champions-sort-by");
  await ready(sort);
  expect(await sort.evaluate((el) => el.tagName)).toBe("SELECT");
  await pick(sort, "games");
  await expect.poll(() => valueOf(sort)).toBe("games");
  // A desktop-sized window with a mouse: the popover.
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await desk.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  const dp = await desk.newPage();
  await dp.goto(profile);
  const mode = dp.locator("#overview-mode");
  // The same figures as Chromium's. Playwright's WebKit on Linux reports no fine pointer, so it gets
  // the touch sizes every field and menu row has there (44px, 16px text): the same rule, not a difference.
  const fine = await dp.evaluate(() => matchMedia("(pointer: fine)").matches);
  const touch = { button: { ...SELECT_LOOK.button, font: "16px", height: 44 }, option: { ...SELECT_LOOK.option, height: 44 } };
  expect(await selectLook(mode)).toEqual(fine ? SELECT_LOOK : { ...SELECT_LOOK, ...touch });
  await mode.focus();
  await dp.keyboard.press("Enter");
  const list = dp.getByRole("listbox", { name: "Game mode" });
  await expect(list).toBeVisible();
  await dp.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(mode).toBeFocused();
  await dp.keyboard.press("ArrowDown");
  await expect(list).toBeVisible();
  await dp.keyboard.press("End");
  await dp.keyboard.press("Enter");
  await expect(list).toHaveCount(0);
  await expect(dp).toHaveURL(/mode=/);
  await expect(mode).toBeFocused();
  await desk.close();
  // An iPad (768 × 1024, touch): the popover, and a tap on an option chooses it (WebKit sends no click
  // after a cancelled press, which had left the list open and the address as it was).
  const pad = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  await pad.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  const tp = await pad.newPage();
  await tp.goto(`${profile}?mode=all`);
  const padMode = tp.locator("#overview-mode");
  await ready(padMode);
  expect(await padMode.evaluate((el) => el.tagName)).toBe("BUTTON");
  await padMode.tap();
  await tp.getByRole("listbox", { name: "Game mode" }).locator("[data-value=flex]").tap();
  await expect(tp).toHaveURL(/mode=flex/);
  await expect(tp.getByRole("listbox", { name: "Game mode" })).toHaveCount(0);
  await pad.close();
});

test("forms: text fields are at least 16px (Safari zooms into smaller ones) and sign-in offers saved passwords", async ({ browser, page, baseURL }) => {
  await page.goto("/settings");
  const field = page.getByTestId("display-name-form").getByLabel("Display name");
  await expect(field).toBeVisible();
  expect(parseFloat(await field.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  // Sign-in, as a visitor (locally, a browser holding the guest cookie): the browser's password
  // manager can fill both fields.
  const { defaultBrowserType: _, ...iphone } = devices["iPhone 15"];
  const guest = await browser.newContext(iphone);
  await guest.addCookies([{ name: "uniiverse_guest", value: "1", url: baseURL! }]);
  const login = await guest.newPage();
  await login.goto("/login");
  const username = login.locator("#username");
  const password = login.locator("#password");
  await expect(username).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  for (const input of [username, password]) expect(parseFloat(await input.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await username.fill("someone");
  await expect(username).toHaveValue("someone");
  await guest.close();
});

test("Admin's typed confirmation on an iPhone: a tap opens it, the phrase field is 16px, the phrase typed in any case enables Run, the sheet fits the screen, and Cancel closes it", async ({ page }) => {
  // Data & Integrations → Details → Advanced → a setup job (the overhaul's S1a). Nothing is run.
  await page.goto("/admin/data");
  for (const id of ["data-details", "jobs-advanced"]) {
    const details = page.getByTestId(id);
    await expect(async () => {
      if ((await details.getAttribute("open")) === null) await details.locator("summary").first().tap({ timeout: 2_000 });
      await expect(details).toHaveAttribute("open", "", { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  }
  const dialog = page.getByRole("dialog", { name: "Turn off LP tracking's five-minute schedule?" });
  const open = page.getByTestId("jobs-setup").locator("[data-job=rank-schedule-off]").getByTestId("run-job");
  await expect(async () => {
    if (!(await dialog.isVisible())) await open.tap({ timeout: 2_000 });
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const phrase = dialog.getByTestId("job-confirm-input");
  const run = dialog.getByTestId("job-confirm-run");
  expect(parseFloat(await phrase.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await expect(run).toBeDisabled();
  await phrase.tap();
  await phrase.fill("Turn off");
  await expect(run).toBeEnabled();
  await fitsWidth(page, "the typed confirmation");
  const box = (await dialog.boundingBox())!;
  expect(box.x, "the sheet inside the screen").toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, "the sheet inside the screen").toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await dialog.getByRole("button", { name: "Cancel" }).tap();
  await expect(dialog).toBeHidden();
});

test("a switch turns on and off with a tap on its words, not only the knob (the Studio's effects; Settings' Show publicly switches are the same control)", async ({ page }) => {
  // The demo's local owner, on Top's card: a test here cannot stay signed in as a member (the
  // session cookie is Secure, which WebKit does not keep on http://localhost), and Settings'
  // social links need one. The control is the same Switch; its sizes on a phone and its place on
  // the platform's line are checked in Chromium (e2e/social-links.spec.ts).
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}`);
  await expect(page.getByTestId("profile-header")).toBeVisible();
  await expect(async () => {
    await page.getByTestId("profile-header").getByTestId("customise-card").tap();
    await expect(page.getByTestId("card-studio")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-section", "appearance");
  if (!(await page.getByTestId("fold-effects").evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByTestId("fold-effects").locator("summary").tap();
  const glow = page.getByRole("switch", { name: /Ambient glow/ });
  const words = page.locator("label[for=fx-glow]").getByText("Ambient glow", { exact: true });
  const was = await glow.isChecked();
  await words.tap();
  await expect(glow).toBeChecked({ checked: !was });
  await expect(page.locator("label[for=fx-glow]")).toHaveAttribute("data-state", was ? "off" : "on");
  await words.tap();
  await expect(glow).toBeChecked({ checked: was });
  await page.getByTestId("studio-cancel").tap();
  const discard = page.getByTestId("studio-confirm-yes");
  if (await discard.isVisible()) await discard.tap();
  await expect(page.getByTestId("card-studio")).toBeHidden();
});

test("the sign-in window on an iPhone: the whole screen, the fields and Sign in above the keyboard, an error in view, and Close back to Sign in", async ({ browser, baseURL }) => {
  // As a visitor (locally, a browser holding the guest cookie), with the keyboard emulated: WebKit
  // here has none either (keyboard.ts). What the real iOS keyboard does still needs a device.
  const { defaultBrowserType: _, ...iphone } = devices["iPhone 15"];
  const guest = await browser.newContext(iphone);
  await guest.addCookies([{ name: "uniiverse_guest", value: "1", url: baseURL! }]);
  const page = await guest.newPage();
  await emulateKeyboard(page);
  await page.goto("/public");
  const signIn = page.getByTestId("public-sign-in");
  const dialog = page.getByRole("dialog", { name: "Sign in" });
  // A tap before the page is interactive does nothing: tap until the window opens.
  await expect(async () => {
    await signIn.tap();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const { width, height } = page.viewportSize()!;
  const box = async (target: Locator) => {
    const b = (await target.boundingBox())!;
    return { top: Math.round(b.y), bottom: Math.round(b.y + b.height), left: Math.round(b.x), width: Math.round(b.width), height: Math.round(b.height) };
  };
  await expect.poll(async () => Object.values(await box(dialog)).join(" ")).toBe(`0 ${height} 0 ${width} ${height}`);
  const username = dialog.getByLabel("Username");
  const password = dialog.getByLabel("Password");
  const submit = dialog.getByRole("button", { name: "Sign in" });
  const close = dialog.getByRole("button", { name: "Close" });
  await expect(username).toBeFocused();
  // The keyboard comes up: the window fits above it, with the fields, Sign in and Close in view.
  const above = height - 300;
  await keyboard(page, 300);
  await expect.poll(async () => (await box(dialog)).bottom).toBeLessThanOrEqual(above);
  for (const target of [username, password, submit, close]) {
    const { top, bottom } = await box(target);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeLessThanOrEqual(above);
  }
  // Return goes on to the password; a wrong one is told in the window, above the keyboard.
  await username.fill("nobody-here");
  await username.press("Enter");
  await expect(password).toBeFocused();
  await password.fill("not-the-password-1");
  await submit.tap();
  const error = dialog.getByTestId("login-error");
  await expect(error).toBeVisible();
  await expect.poll(async () => (await box(error)).bottom).toBeLessThanOrEqual(above);
  // The keyboard goes away; Close is a full-size target and returns to Sign in.
  await keyboard(page, 0);
  expect(Math.min((await box(close)).width, (await box(close)).height)).toBeGreaterThanOrEqual(44);
  await close.tap();
  await expect(dialog).toBeHidden();
  await expect(signIn).toBeFocused();
  await guest.close();
});

test("held sideways: the pages fit, the destinations are in one compact bar with no bottom bar, a profile's sections under it, and it steps aside while reading", async ({ browser, baseURL }) => {
  // An iPhone 15 held sideways in Safari's tab (734 × 343) and on its whole screen (852 × 393, as wide
  // as a tablet with viewport-fit=cover): the same frame either way (docs/MOBILE.md, "Frames by posture").
  const { defaultBrowserType: _, ...landscape } = devices["iPhone 15 landscape"];
  for (const viewport of [landscape.viewport, { width: 852, height: 393 }]) {
    const where = `${viewport.width} × ${viewport.height}`;
    const context = await browser.newContext({ ...landscape, viewport });
    await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
    const page = await context.newPage();
    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const route of ["/team", "/players", "/resources"]) {
      await page.goto(route);
      await expect(page.locator("main"), route).toBeVisible();
      if (route === "/team") await lineupAtRest(page);
      await fitsWidth(page, `${route}, sideways at ${where}`);
      // The places to go stay one tap away: one primary navigation, in the top bar, which is compact.
      await expect(nav, `${route} at ${where}`).toHaveCount(1);
      await expect(page.getByTestId("mobile-topbar").getByRole("navigation", { name: "Primary" }), `${route} at ${where}`).toBeVisible();
      await expect(page.getByTestId("phone-tabbar"), `${route} at ${where}`).toBeHidden();
      // One compact bar, with Team's sections as its second row on Team's pages: at most 90px.
      expect((await page.getByTestId("mobile-topbar").boundingBox())!.height, `${route} at ${where}: one compact bar`).toBeLessThanOrEqual(route === "/resources" ? 45.5 : 90);
    }
    // Teammates' profiles: their sections the bar's 44px second row, the bars at rest about 89px, the
    // band at most 80px: Demo Top's, and Demo Mid's with an off role, the lineup status and two links.
    await page.goto("/team");
    const profiles = await Promise.all(["TOP", "MID"].map(async (role) => `/players/${await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id")}`));
    for (const [i, profile] of profiles.entries()) {
      const who = `${["Demo Top", "Demo Mid"][i]} at ${where}`;
      await page.goto(profile);
      await expect(page.getByTestId("profile-chrome-tabs"), who).toBeVisible();
      if (i === 1) await expect(page.getByTestId("profile-header").getByTestId("social-links").locator("li"), who).toHaveCount(2);
      await page.evaluate(() => document.fonts.ready);
      expect((await page.getByTestId("mobile-topbar").boundingBox())!.height, `${who}: the bar and the sections`).toBeLessThanOrEqual(90);
      expect((await page.getByTestId("profile-sections-bar").boundingBox())!.height, `${who}: the sections, 44px targets`).toBeGreaterThanOrEqual(44);
      expect((await page.getByTestId("profile-header").boundingBox())!.height, `${who}: the profile's band`).toBeLessThanOrEqual(80);
      await fitsWidth(page, `${who}: the profile, sideways`);
    }
    // Reading down a page, the bar slides away (scrolled by script: WebKit's touch emulation has no wheel).
    await page.goto("/players");
    await expect(page.locator("main")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), `${where}: Players scrolls sideways, more than the bar needs`).toBeGreaterThan(100);
    await page.evaluate(async () => {
      for (let i = 0; i < 12; i++) {
        window.scrollBy(0, 60);
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      }
    });
    await expect(page.getByTestId("mobile-topbar"), where).toHaveAttribute("data-hidden", "true");
    await context.close();
  }
});

test("Players held sideways: rows two up, level with each other, every portrait whole", async ({ browser, baseURL }) => {
  // The roster lays its rows out by its own width and each row by its own (container queries): Safari has to as well.
  const { defaultBrowserType: _, ...landscape } = devices["iPhone 15 landscape"];
  const context = await browser.newContext(landscape);
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  const page = await context.newPage();
  await page.goto("/players");
  await expect(page.locator("main [data-testid=player-card-item]").first()).toBeVisible();
  const rows = await page.getByTestId("players-directory").evaluate((panel) => {
    const items = [...panel.querySelectorAll<HTMLElement>("[data-testid=player-card-item]")].map((row) => {
      const r = row.getBoundingClientRect();
      const top = (selector: string) => {
        const el = row.querySelector(selector);
        return el ? el.getBoundingClientRect().top - r.top : null;
      };
      const meta = row.querySelector<HTMLElement>("[data-testid=roster-meta]")!;
      const drawn = [...row.querySelectorAll("[data-testid=pool-portrait], [data-testid=directory-pool-more]")].filter((el) => el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== "none");
      return { top: Math.round(r.top), height: r.height, content: meta.parentElement!.getBoundingClientRect().height, name: top("[data-testid=card-name]"), meta: top("[data-testid=roster-meta]"), cut: drawn.some((el) => el.getBoundingClientRect().right > r.right - 1) };
    });
    return [...new Set(items.map((c) => c.top))].map((t) => items.filter((c) => c.top === t));
  });
  const spread = (values: Array<number | null>) => Math.max(...values.map(Number)) - Math.min(...values.map(Number));
  expect(rows[0]!.length, "two rows side by side").toBe(2);
  for (const row of rows.filter((r) => r.length > 1)) {
    expect(spread(row.map((c) => c.height)), "the same height").toBeLessThanOrEqual(1);
    // The names level whatever either row holds; the role, rank and pool too where the rows' content is as tall.
    expect(spread(row.map((c) => c.name)), "name level").toBeLessThanOrEqual(1);
    if (spread(row.map((c) => c.content)) <= 1) expect(spread(row.map((c) => c.meta)), "meta level").toBeLessThanOrEqual(1);
  }
  expect(rows.flat().filter((c) => c.cut), "no portrait cut").toEqual([]);
  await fitsWidth(page, "Players, sideways");
  await context.close();
});

test("Home Screen: the page declares itself an app for iOS, with its icon, the manifest and the notch's safe areas", async ({ page, request }) => {
  await page.goto("/team");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]').first()).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "black-translucent");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  const icon = await page.locator('link[rel="apple-touch-icon"]').first().getAttribute("href");
  expect(icon).toBeTruthy();
  const res = await request.get(icon!);
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toMatch(/^image\//);
  expect((await request.get((await page.locator('link[rel="manifest"]').getAttribute("href"))!)).ok()).toBe(true);
});

test("an uploaded logo: at the start of the top bar, animated unless motion is reduced, and centred on the collapsed sidebar with the icons", async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  await page.context().addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/admin/branding");
  const card = page.locator("[data-testid=brand-logo][data-ready=true]");
  await expect(card).toBeVisible();
  await card.locator("input[type=file]").setInputFiles(path.join(__dirname, "fixtures/animated-logo.gif"));
  await expect(page.getByText(/Logo updated \(animated\)/)).toBeVisible({ timeout: 60_000 });
  try {
    // The logo is a picture whose still-frame source is not displayed: WebKit still picks the
    // source by its media query, and the source takes no place in the top bar's row.
    const { defaultBrowserType: _, ...iphone } = devices["iPhone 15"];
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      const context = await browser.newContext({ ...iphone, reducedMotion });
      await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
      const phone = await context.newPage();
      await phone.goto("/team");
      const link = phone.getByTestId("mobile-topbar").getByTestId("mobile-brand");
      await expect.poll(() => link.locator("img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      const shown = await link.evaluate((a) => {
        const img = a.querySelector("img")!;
        // From the link's content edge: its padding lines the mark up with the page's gutter.
        const start = a.getBoundingClientRect().left + parseFloat(getComputedStyle(a).paddingLeft);
        return { inset: img.getBoundingClientRect().left - start, src: new URL(img.currentSrc).pathname };
      });
      expect(Math.abs(shown.inset), `${reducedMotion}: the logo starts ${shown.inset}px past the start of the top bar's link`).toBeLessThanOrEqual(0.5);
      expect(shown.src, reducedMotion).toBe(reducedMotion === "reduce" ? "/api/branding/logo-static" : "/api/branding/logo");
      await context.close();
    }
    // Safari on a Mac: the collapsed desktop sidebar's logo on the rail's centre line, with the icons.
    const { defaultBrowserType: __, ...mac } = devices["Desktop Safari"];
    const context = await browser.newContext({ ...mac, viewport: { width: 1440, height: 900 } });
    await context.addCookies([
      { name: "uniiverse_view", value: "player", url: baseURL! },
      { name: "uniiverse_sidebar", value: "collapsed", url: baseURL! },
    ]);
    const desk = await context.newPage();
    await desk.goto("/team");
    await desk.mouse.move(1430, 890);
    await expect(desk.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
    const c = await desk.evaluate(() => {
      const mid = (e: Element) => {
        const r = e.getBoundingClientRect();
        return (r.left + r.right) / 2;
      };
      const aside = document.querySelector("[data-testid=sidebar]")!;
      return { logo: mid(aside.querySelector("a[title] img")!), rail: mid(document.querySelector("[data-testid=sidebar-slot]")!), icons: [...aside.querySelectorAll("[data-testid=sidebar-toggle] svg, nav a svg")].map(mid) };
    });
    for (const x of [c.rail, ...c.icons]) expect(Math.abs(c.logo - x), `the logo's centre ${c.logo}, the rail's or an icon's ${x}`).toBeLessThanOrEqual(0.5);
    await context.close();
  } finally {
    // Back to the usual team mark for every other test.
    await page.goto("/admin/branding");
    await page.locator("[data-testid=brand-logo][data-ready=true]").getByRole("button", { name: "Remove" }).click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("brand-logo-empty")).toBeVisible();
  }
});

test("popups: a window opened by a tap takes the focus itself, and nothing in it is ringed (Safari ringed its close button)", async ({ page }) => {
  await page.goto("/team");
  const open = page.getByTestId("lineup-row-TOP").getByTestId("open-player-detail");
  const win = page.getByTestId("player-detail");
  // A tap before the page is interactive does nothing: tap until the window opens.
  await expect(async () => {
    if (!(await win.isVisible())) await open.tap({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await untilStill(page);
  const focus = await win.evaluate((d) => {
    const active = document.activeElement as HTMLElement | null;
    return {
      onWindow: active === d,
      outline: active ? getComputedStyle(active).outlineStyle : null,
      ringed: [...d.querySelectorAll("*")].filter((e) => e.matches(":focus-visible")).map((e) => e.getAttribute("aria-label") ?? e.tagName),
    };
  });
  expect(focus).toEqual({ onWindow: true, outline: "none", ringed: [] });
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
});

test("popups: a tapped ⓘ in a game's window is drawn inside the window, on top, beside its ⓘ, and the first Escape closes the bubble alone", async ({ page }) => {
  const win = await openMatchWindow(page);
  await untilStill(page);
  // On a phone the notes are on the window's Scoreboard page.
  await showGamePage(win.getByTestId("match-breakdown"), "board");
  // The notes under the scoreboard settle first (they redraw the lines above the ⓘ).
  await expect(win.getByTestId("ranks-note")).not.toHaveAttribute("data-state", "checking", { timeout: 15_000 });
  await expect(win.getByTestId("possible-groups-note")).not.toHaveAttribute("data-state", "loading", { timeout: 15_000 });
  const tip = win.getByTestId("ranks-info");
  const bubble = page.getByTestId("ranks-info-bubble");
  await tip.scrollIntoViewIfNeeded();
  // A tap toggles the bubble: tap again only while it has not opened.
  await expect(async () => {
    if ((await bubble.count()) === 0) await tip.tap({ timeout: 2_000 });
    await expect(bubble).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const facts = await bubbleFacts(bubble, "ranks-info");
  expect(facts.window).toBe("match-detail");
  expect(facts.onTop).toBe(true);
  expect(placedRight(facts), JSON.stringify(facts)).toBe(true);
  // Escape closes the bubble; the window's close request is the key's default action, kept from it.
  await page.keyboard.press("Escape");
  await expect(bubble).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(win).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
});

test("popups: an error toast raised over the picture editor is drawn in the window, on top, and a tap at its dismiss button's centre reaches it", async ({ page }) => {
  const win = await openPictureEditor(page);
  await page.getByTestId("avatar-file").setInputFiles(NOT_A_PICTURE);
  const toast = page.getByTestId("toast").filter({ hasText: NOT_A_PICTURE_ERROR });
  await expect(toast).toBeVisible();
  const f = await toastFacts(toast);
  expect({ inWindow: f.inWindow, live: f.live, onTop: f.onTop, reached: f.dismiss.reached }).toEqual({ inWindow: true, live: 1, onTop: true, reached: true });
  expect(f.dismiss.width).toBeGreaterThanOrEqual(44);
  expect(f.dismiss.height).toBeGreaterThanOrEqual(44);
  // A finger where the button is drawn (over the sheet: a toast is not part of it, and pulls nothing).
  await page.touchscreen.tap((f.dismiss.box.left + f.dismiss.box.right) / 2, (f.dismiss.box.top + f.dismiss.box.bottom) / 2);
  await expect(toast).toHaveCount(0);
  await expect(win).toBeVisible();
});

test("the public pages and Install App in Safari's engine: the header's links 44px and 14px, the window's guide fits the screen and closes; in the app opened from the Home Screen there is no entry", async ({ browser, baseURL }) => {
  const tab = await browser.newContext({ ...devices["iPhone 15"] });
  await tab.addCookies([{ name: "uniiverse_guest", value: "1", url: baseURL! }]);
  const page = await tab.newPage();
  for (const path of ["/public", "/login", "/recover", "/privacy"]) {
    await page.goto(path);
    await fitsWidth(page, path);
  }
  await page.goto("/public");
  const links = page.getByRole("navigation", { name: "Public pages" }).locator("a, button");
  for (const box of await links.evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => ({ h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width, size: getComputedStyle(e).fontSize })))) {
    expect(Math.min(box.h, box.w), "a 44px target").toBeGreaterThanOrEqual(44);
    expect(box.size).toBe("14px");
  }
  await page.getByTestId("install-app").tap();
  const win = page.getByTestId("install-window");
  await expect(win.getByTestId("install-body")).toHaveAttribute("data-guide", "ios");
  const box = await win.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(393 + 1);
  await fitsWidth(page, "the install window");
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);
  await tab.close();
  // Opened from the Home Screen (navigator.standalone): the public header has no Install App.
  const app = await browser.newContext({ ...devices["iPhone 15"] });
  await app.addCookies([{ name: "uniiverse_guest", value: "1", url: baseURL! }]);
  await app.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }));
  const installed = await app.newPage();
  await installed.goto("/public");
  await expect(installed.getByTestId("public-sign-in")).toBeVisible();
  await expect(installed.getByTestId("install-app").filter({ visible: true })).toHaveCount(0);
  await app.close();
});

test("Match History on an iPhone: the game's window shows one page at a time, each within the screen; a tap on any scoreboard row inspects that player and shows their page", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
  const win = page.getByTestId("match-detail");
  // The first of the newest games with a stored timeline (its scores and build path read it).
  let breakdown = win.getByTestId("match-breakdown");
  for (let i = 0; i < 8; i++) {
    const card = page.getByTestId("match-card").nth(i);
    await expect(async () => {
      if (!(await win.isVisible())) await card.tap({ position: { x: 24, y: 16 }, timeout: 2_000 });
      await expect(win).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    breakdown = win.getByTestId("match-breakdown");
    await expect(breakdown).not.toHaveAttribute("data-timeline", "loading", { timeout: 15_000 });
    if ((await breakdown.getAttribute("data-timeline")) === "ok") break;
    await win.getByTestId("match-detail-close").tap();
    await expect(win).toHaveCount(0);
  }
  await expect(breakdown).toHaveAttribute("data-timeline", "ok");
  await expect(breakdown.locator("[data-testid=participant-score][data-score]")).toHaveCount(10);
  const own = await breakdown.getAttribute("data-selected");
  // Player, Build and Scoreboard (the owner's brief of 24 Nov 2026, §2): each page within the
  // window's body, nothing to scroll.
  for (const p of ["player", "build", "board"] as const) {
    await showGamePage(breakdown, p);
    expect(await page.getByTestId("match-detail-body").evaluate((b) => b.scrollHeight - b.clientHeight), p).toBeLessThanOrEqual(1);
  }
  // The seventh of the players not inspected, then held by its slot: once tapped it is inspected
  // itself, and the ":not(current)" list would name another row.
  const slot = (await breakdown.locator('[data-testid=participant-select]:not([aria-current="true"])').nth(6).getAttribute("data-slot"))!;
  const row = breakdown.locator(`[data-testid=participant-select][data-slot="${slot}"]`);
  // A tap on the row (not its name, which is the player's own link).
  const box = (await row.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width - 60, box.y + box.height / 2);
  await expect(breakdown).toHaveAttribute("data-selected", slot);
  expect(slot).not.toBe(own);
  // Their page shows: the player inspected, in view; Back to returns to the profile's player.
  await expect(breakdown).toHaveAttribute("data-page", "player");
  await expect(breakdown.getByTestId("inspected")).toBeInViewport();
  await breakdown.getByTestId("inspect-back").tap();
  await expect(breakdown).toHaveAttribute("data-selected", own!);
  await fitsWidth(page, "an inspected player");
});
