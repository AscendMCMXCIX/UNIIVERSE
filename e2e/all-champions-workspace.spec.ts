import { spawn, type ChildProcess } from "node:child_process";
import { chromium } from "@playwright/test";
import { E2E_DDRAGON_VERSION } from "./ddragon-version";
import { expect, test, type Page } from "./test";
import { expectNoSeriousAxe } from "./axe";
import { pick } from "./select";
import { widenText } from "./wide-text";

/*
  All Champions as a one-screen workspace (the owner's request of 27 Nov 2026; docs/RESPONSIVE.md,
  "All Champions' workspace"; docs/MATCHUPS.md). On a desktop window the page never scrolls: the
  profile band, the tabs, the filters, the champions and the open champion fit the window; the
  champions, the lane opponents and an opponent's games are in pages of the complete rows that fit
  (no list scrolls on its own, nothing is clipped, no text shrinks); opening a champion or an
  opponent never changes the page's height; every record is reachable through the pages.

  The default demo's champions meet four lane opponents at most, so this file starts its own demo
  server with UNIIVERSE_DEMO_WIDE_CHAMPION=1 (src/server/demo/seed.ts, applyWideChampionFixture):
  Demo Top plays Ambessa (Top only, 40 lane opponents), Aatrox in two positions and 30 champions in
  all. It runs on the suite's port plus 19 and stops at the end; the default demo is unchanged.

  The owner's verification list, at 1366 × 768, 1440 × 900, 1648 × 900 and 1920 × 1080, the sidebar
  open and folded (plus 1366 × 736, the gate, and 1280 × 800): fits() after every step (the page is
  the window, the cards end above its padding, each list ends at least 12px above its footer, nothing
  scrolls, nothing is clipped, every name and K/D/A whole, everything inside its card).

  Shorter windows, down to the workspace's least height (41rem, 656px at 16px: a 1366 × 768 laptop's
  browser window), take the short form under 46 of the page's own rem, and under 48 where the section
  is narrow (1356–1463px with the sidebar open: docs/RESPONSIVE.md, "the short form"), and every state
  fits there too, a champion of five positions with an opponent's games open and every optional line
  drawn included. Where the section is too narrow for the pane (1280–1355px
  with the sidebar open) the preview opens in the workspace window: fitsWindow() holds it to the same
  promise, the window inside the screen less 1rem above and below.
*/

const PORT = Number(process.env.E2E_PORT ?? 3199) + 19;
const BASE = `http://127.0.0.1:${PORT}`;
/** The least room between each list's last row and its footer (docs/STANDARDS.md, "A layout held to a measure keeps a margin"). */
const MARGIN = 12;
const SIZES: Array<[number, number]> = [
  [1366, 768],
  [1440, 900],
  [1648, 900],
  [1920, 1080],
];
const SIDES = ["expanded", "collapsed"] as const;
type Side = (typeof SIDES)[number];
const SHOTS = "test-results/all-champions-workspace";

let server: ChildProcess | null = null;
let top = "";
let sub = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browserName }, info) => {
  void browserName;
  if (info.project.name !== "desktop") return;
  info.setTimeout(180_000);
  // The suite's server's settings (playwright.config.ts), with the wide champion.
  server = spawn("pnpm", ["start", "-p", String(PORT)], {
    env: { ...process.env, UNIIVERSE_DB_MODE: "memory", UNIIVERSE_SEED_DEMO: "true", UNIIVERSE_REQUIRE_AUTH: "false", UNIIVERSE_JOB_LOGS: "silent", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: "", RIOT_API_KEY: "", UNIIVERSE_FAKE_RIOT_IDS: "1", DDRAGON_VERSION: E2E_DDRAGON_VERSION, UNIIVERSE_DEMO_WIDE_CHAMPION: "1" },
    stdio: "ignore",
    detached: true,
  });
  const until = Date.now() + 150_000;
  let html = "";
  for (;;) {
    try {
      const r = await fetch(`${BASE}/players`);
      if (r.ok) {
        html = await r.text();
        break;
      }
    } catch {
      // not answering yet
    }
    if (Date.now() > until) throw new Error(`the wide-champion demo server did not answer on ${PORT}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  const id = (name: string) => new RegExp(`data-player-name="${name.replace(/[()]/g, "\\$&")}"[^>]*href="/players/([0-9a-f-]{36})"`).exec(html)?.[1] ?? "";
  top = `/players/${id("Demo Top")}/champions`;
  sub = `/players/${id("Demo Sub (Top)")}/champions`;
  expect(top).toMatch(/[0-9a-f-]{36}/);
});

test.afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid);
    } catch {
      server.kill();
    }
  }
  server = null;
});

test.beforeEach(({ browserName }, info) => {
  void browserName;
  test.skip(info.project.name !== "desktop", "a desktop window's workspace (its own server, desktop project only)");
});

/** The window and the sidebar, then the address (the sidebar's state is the server's: its cookie). */
async function open(page: Page, path: string, [w, h]: [number, number], side: Side = "expanded") {
  await page.setViewportSize({ width: w, height: h });
  await page.context().addCookies([{ name: "uniiverse_sidebar", value: side, url: BASE }]);
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await settled(page);
}

/** The regions' pages as drawn: data-per, data-page, data-pages and data-total of each [data-ws-region]. */
const regions = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-ws-region]")].filter((el) => el.getBoundingClientRect().height > 0).map((el) => ({ region: el.dataset.wsRegion!, per: Number(el.dataset.per), page: Number(el.dataset.page), pages: Number(el.dataset.pages), total: Number(el.dataset.total) })));

/** The fonts loaded and the budgets measured: two reads 250ms apart agree, every region paged. */
async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  let last = "";
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await regions(page));
        const same = now === last && !now.includes("null") && !now.includes("NaN");
        last = now;
        if (!same) await page.waitForTimeout(250);
        return same;
      },
      { message: "the workspace's pages settled", timeout: 15_000 },
    )
    .toBe(true);
}

const region = async (page: Page, name: string) => (await regions(page)).find((r) => r.region === name)!;

/** The workspace's measures (fits): see the file's header. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const root = document.documentElement;
    const pad = parseFloat(getComputedStyle(document.getElementById("content")!).paddingBottom);
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    // Read out only (Tailwind's sr-only, at any breakpoint): a 1px box, clipped on purpose.
    const srOnly = (el: Element) => {
      for (let at: Element | null = el; at && at.id !== "content"; at = at.parentElement) {
        const s = getComputedStyle(at);
        if (s.position === "absolute" && at.clientWidth <= 1 && at.clientHeight <= 1 && (s.clipPath.startsWith("inset(50%") || s.clip.startsWith("rect(0"))) return true;
      }
      return false;
    };
    // The list's card, and the pane or the workspace window's body (dialog[open] [data-preview-pane]).
    const cards = [...document.querySelectorAll<HTMLElement>("[data-testid=all-champions-table], aside[data-preview-pane], dialog[open] [data-preview-pane]")].filter(shown);
    const inWindow = (card: Element) => !!card.closest("dialog");
    const ROWS = "[data-testid=top-champion], [data-testid=champion-preview-opponent], [data-testid=champion-preview-small-divider], [data-testid=champion-preview-games] > li";
    const margins = cards.map((card) => {
      const foot = [...card.querySelectorAll("[data-ws-foot]")].find(shown);
      const rows = [...card.querySelectorAll(ROWS)].filter(shown);
      if (!foot || !rows.length) return null;
      return Math.round(foot.getBoundingClientRect().top - Math.max(...rows.map((r) => r.getBoundingClientRect().bottom)));
    });
    const all = [...document.querySelectorAll<HTMLElement>("#content *")];
    const scrollers = all.filter((el) => {
      const s = getComputedStyle(el);
      return (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) || (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1);
    });
    const clipped = all.filter((el) => {
      if (!shown(el) || srOnly(el) || el.tagName === "IMG" || el.classList.contains("truncate")) return false;
      const s = getComputedStyle(el);
      return (/(hidden|clip)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1) || (/(hidden|clip)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1);
    });
    const cut = [...document.querySelectorAll<HTMLElement>("[data-testid=champion-preview-opponent] .truncate, [data-testid=top-champion] .truncate, [data-testid=champion-preview-game] .truncate, [data-testid=champion-preview-lookup] .truncate")].filter((el) => shown(el) && el.scrollWidth > el.clientWidth + 0.5);
    const kda = [...document.querySelectorAll<HTMLElement>("[data-testid=champion-preview-game-kda]")].filter((el) => shown(el) && el.scrollWidth > el.clientWidth + 0.5);
    const outside = cards.flatMap((card) => {
      const c = card.getBoundingClientRect();
      return [...card.querySelectorAll<HTMLElement>("*")]
        .filter((el) => shown(el) && !srOnly(el) && getComputedStyle(el).position !== "fixed")
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < c.left - 1 || r.right > c.right + 1 || r.top < c.top - 1 || r.bottom > c.bottom + 1;
        })
        .map((el) => `${card.dataset.testid}: ${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join(".")}`);
    });
    const dialog = document.querySelector<HTMLElement>("dialog[open][data-testid=champion-preview]");
    const body = dialog?.querySelector<HTMLElement>("[data-preview-pane]");
    const rootPx = parseFloat(getComputedStyle(root).fontSize);
    return {
      height: root.scrollHeight,
      window: innerHeight,
      width: root.scrollWidth,
      windowWidth: innerWidth,
      limit: innerHeight - pad,
      // The page's cards (the workspace window's body ends at the window's foot instead: windowBox).
      bottoms: cards.filter((c) => !inWindow(c)).map((c) => c.getBoundingClientRect().bottom),
      windowBox:
        dialog && body
          ? { size: dialog.dataset.size ?? "", top: dialog.getBoundingClientRect().top, bottom: dialog.getBoundingClientRect().bottom, height: dialog.getBoundingClientRect().height, body: body.getBoundingClientRect().bottom, rootPx }
          : null,
      margins,
      scrollers: scrollers.map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join(".")}`),
      clipped: clipped.map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 4).join(".")} ${el.scrollWidth}/${el.clientWidth} ${el.scrollHeight}/${el.clientHeight}`),
      cut: cut.map((el) => el.textContent),
      kda: kda.map((el) => el.textContent),
      outside: outside.slice(0, 5),
      workspace: !!document.querySelector("[data-workspace]"),
      pager: !!document.querySelector("[data-testid=all-champions-pager]"),
    };
  });

/** The one-screen promise, held after every step. */
async function fits(page: Page, at: string) {
  const m = await measure(page);
  expect(m.workspace && m.pager, `${at}: the workspace applied`).toBe(true);
  expect(m.height, `${at}: the page is the window (no document scroll)`).toBeLessThanOrEqual(m.window);
  expect(m.width, `${at}: nothing wider than the window`).toBeLessThanOrEqual(m.windowWidth);
  for (const b of m.bottoms) expect(b, `${at}: a card ends above #content's bottom padding`).toBeLessThanOrEqual(m.limit + 0.5);
  for (const g of m.margins) if (g !== null) expect(g, `${at}: a list ends at least ${MARGIN}px above its footer`).toBeGreaterThanOrEqual(MARGIN);
  expect(m.scrollers, `${at}: nothing in #content scrolls`).toEqual([]);
  expect(m.clipped, `${at}: nothing is clipped by an overflow`).toEqual([]);
  expect(m.cut, `${at}: every name whole`).toEqual([]);
  expect(m.kda, `${at}: every K/D/A whole`).toEqual([]);
  expect(m.outside, `${at}: everything inside its card`).toEqual([]);
}

/**
 * The workspace window's promise (1280–1355px with the sidebar open): fits() for the page and the
 * window's body (its lists' margins, nothing scrolling, clipped or outside it), and the window inside
 * the screen, as tall as it less 1rem above and below, its body ending at its foot.
 */
async function fitsWindow(page: Page, at: string) {
  await fits(page, at);
  const w = (await measure(page)).windowBox;
  expect(w, `${at}: the workspace window is open`).not.toBeNull();
  expect(w!.size, `${at}: the workspace window, not the sheet`).toBe("workspace");
  const win = await page.evaluate(() => innerHeight);
  expect(w!.top, `${at}: the window inside the screen`).toBeGreaterThanOrEqual(0);
  expect(w!.bottom, `${at}: the window inside the screen`).toBeLessThanOrEqual(win);
  expect(Math.abs(w!.height - (win - 2 * w!.rootPx)), `${at}: the window as tall as the screen less 1rem above and below`).toBeLessThanOrEqual(1);
  expect(w!.body, `${at}: its body ends at its foot`).toBeLessThanOrEqual(w!.bottom + 0.5);
}

/**
 * A two-season header (from January 2027 most profiles have two seasons, and the season choice wraps
 * the section's header at 1366 with the sidebar open, 36 → 50px; the demo has one): a box as wide and
 * tall as the season select (md:w-56, 2.25rem) first in the filters' joined group, then a resize so
 * every budget measures again.
 */
async function twoSeasons(page: Page) {
  await page.evaluate(() => {
    const group = document.querySelector("[data-testid=all-champions-filters] div.hidden.min-w-0.flex-col.gap-3");
    if (!group) throw new Error("the filters' joined group");
    const box = document.createElement("div");
    box.style.cssText = "width: 14rem; height: 2.25rem; flex: none";
    box.dataset.testSeason = "";
    group.prepend(box);
    window.dispatchEvent(new Event("resize"));
  });
  await settled(page);
}

const cfg = ([w, h]: [number, number], side: Side) => `${w}x${h}-${side === "expanded" ? "open" : "folded"}`;
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/ws-${name}.png`, animations: "disabled" });
const pane = (page: Page) => page.locator("aside[data-preview-pane][data-testid=champion-preview]");
/** The workspace window (1280–1355px with the sidebar open) and its body, the pane's content. */
const wsWindow = (page: Page) => page.locator("dialog[open][data-testid=champion-preview][data-size=workspace]");
const wsBody = (page: Page) => wsWindow(page).locator("[data-preview-pane]");
const listCard = (page: Page) => page.getByTestId("all-champions-table");
const rowsOnPage = (page: Page) => listCard(page).locator("[data-testid=top-champion]:visible");
const cells = (page: Page) => pane(page).locator("[data-testid=champion-preview-opponent]:visible");
const detailTitle = (page: Page) => pane(page).locator("[data-testid=champion-preview-pairing] h4");
const pageHeight = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight);

/** Clicks an opponent's cell (in the pane, or in `where`: the workspace window), again until the page is interactive (a click before hydration does nothing). */
async function openOpponent(page: Page, id: string, where = pane(page)) {
  await expect(async () => {
    if (!(await where.locator("[data-testid=champion-preview-pairing] h4").count())) await where.locator(`[data-opponent-row="${id}"]`).click({ timeout: 2_000 });
    await expect(where.getByTestId("champion-preview-pairing")).toHaveAttribute("data-champion", id, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await settled(page);
}

test("one screen at the owner's eight sizes: the list, Ambessa, Ambessa with Darius, Sion with Nasus, Aatrox's two positions", async ({ page }) => {
  test.setTimeout(300_000);
  for (const size of SIZES)
    for (const side of SIDES) {
      const at = cfg(size, side);
      await open(page, top, size, side);
      await fits(page, `${at} L`);
      await shot(page, `${at}-list`);
      await open(page, `${top}?champion=Ambessa&crole=TOP`, size, side);
      await expect(pane(page)).toBeVisible();
      await fits(page, `${at} A`);
      // The list's toolbar rule and the pane's identity bar rule: one line across the gap between the cards.
      const rules = await page.evaluate(() => [document.querySelector("[data-testid=all-champions-toolbar]"), document.querySelector("aside[data-preview-pane] [data-testid=champion-preview-header]")].map((el) => el!.getBoundingClientRect().bottom));
      expect(Math.abs(rules[0]! - rules[1]!), `${at}: the toolbar's rule level with the identity bar's`).toBeLessThanOrEqual(1);
      await shot(page, `${at}-ambessa`);
      const before = await pane(page).boundingBox();
      await openOpponent(page, "Darius");
      await fits(page, `${at} D`);
      expect(Math.abs((await pane(page).boundingBox())!.height - before!.height), `${at}: opening Darius keeps the pane's height`).toBeLessThanOrEqual(1);
      await shot(page, `${at}-ambessa-darius`);
      // Sion: five positions, an opponent open (Demo Sub (Top)).
      await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, size, side);
      await fits(page, `${at} S`);
      // Aatrox: Top, then Mid: the opponents start again at their first page.
      await open(page, `${top}?champion=Aatrox&crole=TOP`, size, side);
      await fits(page, `${at} P Top`);
      await pane(page).locator("[data-testid=champion-preview-role][data-role=MID]").click();
      await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-role", "MID");
      await settled(page);
      await fits(page, `${at} P Mid`);
      expect(await region(page, "opponents")).toMatchObject({ page: 1, pages: 1, total: 5 });
      await expect(pane(page).getByTestId("opponents-pager-range")).toHaveText("5 lane opponents");
      await expect(pane(page).getByTestId("opponents-next")).toHaveCount(0);
      await pane(page).locator("[data-testid=champion-preview-role][data-role=TOP]").click();
      await settled(page);
      expect((await region(page, "opponents")).page).toBe(1);
    }
});

test("1366 × 736 and 1280 × 800: one screen; 1280 × 800 with the sidebar open opens the preview in the workspace window over the paged list", async ({ page }) => {
  for (const side of SIDES) {
    for (const path of [top, `${top}?champion=Ambessa&crole=TOP`, `${top}?champion=Ambessa&crole=TOP&vs=Darius`, `${sub}?champion=Sion&crole=TOP&vs=Nasus`]) {
      await open(page, path, [1366, 736], side);
      await fits(page, `1366x736 ${side} ${path.split("?")[1] ?? "list"}`);
    }
    await open(page, top, [1280, 800], side);
    await fits(page, `1280x800 ${side} list`);
  }
  // Folded: the pane; open: the workspace window (a section under 64.75rem), the list paged under it.
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1280, 800], "collapsed");
  await expect(pane(page)).toBeVisible();
  await fits(page, "1280x800 folded A");
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1280, 800], "expanded");
  await expect(wsBody(page)).toBeVisible();
  await expect(page.locator("dialog[open][data-testid=champion-preview][data-size=workspace]")).toHaveCount(1);
  await expect(pane(page)).toHaveCount(0);
  await fitsWindow(page, "1280x800 open A");
  expect((await region(page, "list")).pages).toBeGreaterThan(1);
});

test("every interactive element is reachable: inside the window, nothing over it, and Tab walks the section with a visible focus and no scroll", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [size, side] of [
    [[1366, 768], "expanded"],
    [[1920, 1080], "collapsed"],
    [[1440, 900], "expanded"],
  ] as Array<[[number, number], Side]>) {
    await open(page, `${top}?champion=Ambessa&crole=TOP`, size, side);
    const unreachable = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("#content button, #content a[href], #content input, #content [role=radio], #content [tabindex='0']")]
        .filter((el) => el.getBoundingClientRect().width > 0 && !el.closest(".sr-only") && getComputedStyle(el).visibility !== "hidden")
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) return true;
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !hit || (hit !== el && !el.contains(hit));
        })
        .map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? el.tagName),
    );
    expect(unreachable, `${cfg(size, side)}: every control in reach`).toEqual([]);
    // Tab from the skip link to the opponents' last pager button: never a scroll, a focus ring at every stop.
    await page.locator("body").press("Tab");
    await expect(page.getByTestId("skip-link")).toBeFocused();
    const last = pane(page).getByTestId("opponents-next");
    let steps = 0;
    for (;;) {
      await page.keyboard.press("Tab");
      steps += 1;
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return { y: scrollY, ring: true, inContent: false, id: "body" };
        // A visible focus: the control (or its row) looks different focused than at rest (a ring, an outline, an accent border, an underline).
        const look = (x: Element) => {
          const s = getComputedStyle(x);
          return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.textDecorationLine].join("|");
        };
        const row = el.closest("li");
        const focused = look(el) + (row ? look(row) : "");
        el.blur();
        const resting = look(el) + (row ? look(row) : "");
        el.focus({ preventScroll: true });
        return { y: scrollY, ring: focused !== resting, inContent: !!el.closest("#content"), id: el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? el.tagName };
      });
      expect(state.y, `${cfg(size, side)}: no scroll as Tab reaches ${state.id}`).toBe(0);
      if (state.inContent) expect(state.ring, `${cfg(size, side)}: a visible focus on ${state.id}`).toBe(true);
      if (await last.evaluate((el) => el === document.activeElement)) break;
      expect(steps, "Tab reaches the opponents' last pager button").toBeLessThan(120);
    }
  }
});

test("no scrollbar track anywhere in the workspace with classic scrollbars", async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}), ignoreDefaultArgs: ["--hide-scrollbars"] });
  try {
    for (const [size, side] of [
      [[1366, 768], "expanded"],
      [[1920, 1080], "collapsed"],
    ] as Array<[[number, number], Side]>) {
      const context = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
      await context.addCookies([{ name: "uniiverse_sidebar", value: side, url: BASE }]);
      const page = await context.newPage();
      for (const path of [top, `${top}?champion=Ambessa&crole=TOP`, `${top}?champion=Ambessa&crole=TOP&vs=Darius`]) {
        await page.goto(`${BASE}${path}`, { waitUntil: "load" });
        await settled(page);
        const tracks = await page.evaluate(() => {
          const root = document.documentElement;
          // A drawn scrollbar takes room from its box: its offset size less its client size and borders.
          const out = [...document.querySelectorAll<HTMLElement>("#content *")].filter((el) => {
            const s = getComputedStyle(el);
            if (!/(auto|scroll)/.test(s.overflowX + s.overflowY)) return false;
            return el.offsetWidth - el.clientWidth - (parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth)) > 1 || el.offsetHeight - el.clientHeight - (parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth)) > 1;
          });
          return { page: root.scrollHeight > innerHeight || innerWidth - root.clientWidth > 0 || innerHeight - root.clientHeight > 0, boxes: out.map((el) => el.tagName.toLowerCase() + "." + [...el.classList].slice(0, 3).join(".")) };
        });
        expect(tracks, `${cfg(size, side)} ${path}`).toEqual({ page: false, boxes: [] });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test("choosing a champion never changes the page's height or moves a row: by click, Enter, ↓ across a page's edge and ‹ ›; Escape and Back close", async ({ page }) => {
  test.setTimeout(180_000);
  for (const [size, side] of [
    [[1366, 768], "expanded"],
    [[1920, 1080], "collapsed"],
  ] as Array<[[number, number], Side]>) {
    const at = cfg(size, side);
    await open(page, top, size, side);
    const height = await pageHeight(page);
    const tops = await rowsOnPage(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    const same = async (step: string) => {
      await settled(page);
      expect(await pageHeight(page), `${at} ${step}: the page's height`).toBe(height);
      expect(await rowsOnPage(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top))), `${at} ${step}: no row moves`).toEqual(tops);
      await fits(page, `${at} ${step}`);
      if (await pane(page).count()) expect(Math.abs((await pane(page).boundingBox())!.height - (await listCard(page).boundingBox())!.height), `${at} ${step}: the pane as tall as the list's card`).toBeLessThanOrEqual(1);
    };
    // Click.
    await rowsOnPage(page).first().getByTestId("open-champion").click();
    await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", "Ambessa");
    await same("click");
    // Escape closes, the focus on the row.
    await page.keyboard.press("Escape");
    await expect(pane(page)).toHaveCount(0);
    await same("Escape");
    // Enter: the focus on the pane's heading.
    await rowsOnPage(page).first().getByTestId("open-champion").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#champion-preview-title")).toBeFocused();
    await same("Enter");
    // ↓ from the list's last row on the page: the page turns, the next row selected and focused.
    const per = (await region(page, "list")).per;
    await rowsOnPage(page).nth(per - 1).getByTestId("open-champion").focus();
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await region(page, "list")).page).toBe(2);
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest<HTMLElement>("[data-testid=top-champion]")?.getAttribute("aria-posinset") ?? null)).toBe(String(per + 1));
    const focused = await page.evaluate(() => document.activeElement?.closest<HTMLElement>("[data-testid=top-champion]")?.dataset.champion ?? null);
    await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", focused!);
    await expect(listCard(page).locator(`[data-testid=top-champion][data-champion="${focused}"]`)).toHaveAttribute("data-selected", "true");
    await settled(page);
    expect(await pageHeight(page)).toBe(height);
    await fits(page, `${at} ↓ across the page's edge`);
    // ‹: back to the page before.
    await pane(page).getByTestId("champion-preview-prev").click();
    await expect.poll(async () => (await region(page, "list")).page).toBe(1);
    await same("‹");
    // Back closes it (one entry), the list on its page.
    await page.goBack();
    await expect(pane(page)).toHaveCount(0);
    await same("Back");
  }
});

test("choosing an opponent never changes the page's height: its games in place, ‹ › to the next (the address replaced), All opponents and Escape back to its page", async ({ page }) => {
  for (const [size, side] of [
    [[1366, 768], "expanded"],
    [[1648, 900], "collapsed"],
  ] as Array<[[number, number], Side]>) {
    const at = cfg(size, side);
    await open(page, `${top}?champion=Ambessa&crole=TOP`, size, side);
    const box = await pane(page).boundingBox();
    const height = await pageHeight(page);
    const entries = await page.evaluate(() => history.length);
    await pane(page).locator('[data-opponent-row="Darius"]').focus();
    await page.keyboard.press("Enter");
    await expect(detailTitle(page)).toBeFocused();
    await expect(detailTitle(page)).toHaveText(/vs\s*Darius/);
    await settled(page);
    const after = await pane(page).boundingBox();
    expect(Math.abs(after!.height - box!.height), `${at}: the pane's height`).toBeLessThanOrEqual(1);
    expect(await pageHeight(page)).toBe(height);
    await fits(page, `${at} D`);
    // ‹ › to the next opponent in the grid's order: the address replaced, the focus on the button.
    await pane(page).getByTestId("champion-preview-opponent-next").click();
    await expect(pane(page).getByTestId("champion-preview-pairing")).toHaveAttribute("data-champion", "Garen");
    await expect(pane(page).getByTestId("champion-preview-opponent-next")).toBeFocused();
    await expect(pane(page).getByTestId("sibling-position")).toContainText("2 of 40");
    expect(await page.evaluate(() => history.length)).toBe(entries);
    await settled(page);
    await fits(page, `${at} ›`);
    // All opponents: the grid back, the focus on Garen's cell.
    await pane(page).getByTestId("champion-preview-opponents-back").click();
    await expect(pane(page).locator('[data-opponent-row="Garen"]')).toBeFocused();
    // Escape from the detail: the grid back on the page holding the opponent; again: closed.
    await openOpponent(page, "Garen");
    await page.keyboard.press("Escape");
    await expect(pane(page).getByTestId("champion-preview-opponent-list")).toBeVisible();
    await expect(pane(page).locator('[data-opponent-row="Garen"]')).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(pane(page)).toHaveCount(0);
    await expect(listCard(page).locator('[data-champion="Ambessa"] [data-open-champion]')).toBeFocused();
  }
});

/** Walks a region's pages by its Next button until it is disabled, collecting each page's rows. */
async function walk(page: Page, name: "list" | "opponents" | "games", next: string, read: () => Promise<Array<{ id: string; games: number; small: boolean } | "divider">>) {
  const pages: Array<Array<{ id: string; games: number; small: boolean } | "divider">> = [];
  const meta = [];
  for (let n = 0; n < 60; n++) {
    await settled(page);
    meta.push(await region(page, name));
    pages.push(await read());
    const button = page.getByTestId(next);
    if (!(await button.count()) || (await button.isDisabled())) break;
    await button.click();
    await expect.poll(async () => (await region(page, name)).page).toBe(n + 2);
  }
  return { pages, meta };
}

test("the pages expose every record: 30 champions, Ambessa's 40 opponents in all three orders, Darius's 9 games; each page full but the last", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [size, side] of [
    [[1366, 768], "expanded"],
    [[1920, 1080], "collapsed"],
  ] as Array<[[number, number], Side]>) {
    const at = cfg(size, side);
    await open(page, top, size, side);
    const scope = Number((await page.getByTestId("all-champions-scope").textContent())!.match(/^(\d+) champions/)![1]);
    expect(scope).toBe(30);
    const list = await walk(page, "list", "all-champions-next", () => rowsOnPage(page).evaluateAll((els) => els.map((e) => ({ id: (e as HTMLElement).dataset.champion!, games: Number((e as HTMLElement).dataset.games), small: false }))));
    const ids = list.pages.flat().map((r) => (r as { id: string }).id);
    expect(new Set(ids).size, `${at}: every champion once`).toBe(30);
    expect(ids).toHaveLength(30);
    const per = list.meta[0]!.per;
    expect(list.pages).toHaveLength(Math.ceil(30 / per));
    for (const [i, p] of list.pages.entries()) if (i < list.pages.length - 1) expect(p).toHaveLength(per);
    await fits(page, `${at} the list's last page`);

    await open(page, `${top}?champion=Ambessa&crole=TOP`, size, side);
    const count = Number(await pane(page).getByTestId("champion-preview-opponent-count").evaluate((el) => el.firstChild?.textContent));
    expect(count).toBe(40);
    for (const order of ["games", "high", "low"] as const) {
      await pane(page).getByTestId(`opponent-sort-${order}`).click();
      await expect.poll(async () => (await region(page, "opponents")).page).toBe(1);
      const read = () =>
        pane(page)
          .locator("[data-testid=champion-preview-opponent-list] > li:visible")
          .evaluateAll((els) => els.map((e) => ((e as HTMLElement).dataset.testid === "champion-preview-small-divider" ? ("divider" as const) : { id: (e as HTMLElement).dataset.champion!, games: Number((e as HTMLElement).dataset.games), small: (e as HTMLElement).dataset.small !== undefined })));
      const opp = await walk(page, "opponents", "opponents-next", read);
      const rows = opp.pages.flat().filter((x): x is { id: string; games: number; small: boolean } => x !== "divider");
      expect(new Set(rows.map((r) => r.id)).size, `${at} ${order}: every opponent once`).toBe(40);
      expect(rows).toHaveLength(40);
      for (const r of rows) expect(r.small, `${at} ${order}: ${r.games} games and the small-sample mark`).toBe(r.games < 3);
      if (order === "games") {
        expect(opp.pages.flat().includes("divider"), "Most games has no divider").toBe(false);
        for (let i = 1; i < rows.length; i++) expect(rows[i]!.games).toBeLessThanOrEqual(rows[i - 1]!.games);
      } else {
        for (const p of opp.pages) {
          expect(p.at(-1), `${at} ${order}: the divider is never a page's last slot`).not.toBe("divider");
          const first = p.find((x) => x !== "divider") as { small: boolean } | undefined;
          if (first?.small) expect(p[0], `${at} ${order}: a page starting in the small samples starts with the divider`).toBe("divider");
          for (const [i, x] of p.entries()) if (x !== "divider" && x.small && i > 0 && p[i - 1] !== "divider" && (p[i - 1] as { small: boolean }).small === false) throw new Error(`${at} ${order}: a small sample without its divider before it`);
        }
      }
      await fits(page, `${at} ${order}'s last page`);
    }
    await pane(page).getByTestId("opponent-sort-games").click();
    // Darius's games.
    await openOpponent(page, "Darius");
    const games = await walk(page, "games", "games-next", () => pane(page).locator("[data-testid=champion-preview-games] > li:visible").evaluateAll((els) => els.map((e, i) => ({ id: `${i}:${e.textContent}`, games: 1, small: false }))));
    const record = Number((await pane(page).getByTestId("champion-preview-pairing-record").textContent())!.match(/^(\d+) games/)![1]);
    expect(games.pages.flat()).toHaveLength(record);
    expect(record).toBe(9);
  }
});

test("each page but the last is full: the room under its last row is less than a row and the guard", async ({ page }) => {
  for (const size of SIZES) {
    await open(page, `${top}?champion=Ambessa&crole=TOP`, size, "expanded");
    const room = await page.evaluate(() =>
      [...document.querySelectorAll("[data-ws-foot]")].map((foot) => {
        const card = foot.closest("[data-testid=all-champions-table], aside")!;
        const rows = [...card.querySelectorAll("[data-testid=top-champion], [data-testid=champion-preview-opponent]")].filter((r) => r.getBoundingClientRect().height > 0);
        const last = Math.max(...rows.map((r) => r.getBoundingClientRect().bottom));
        const row = rows[0]!.getBoundingClientRect().height;
        const guard = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return { spare: foot.getBoundingClientRect().top - last, limit: row + guard + 1 };
      }),
    );
    for (const r of room) expect(r.spare, `${size.join("x")}: a page holds every row that fits`).toBeLessThan(r.limit);
  }
});

test("changing filters keeps the champion open (O2) and the layout: Ranked Solo/Duo, a role where Ambessa has no game, a search with no match, the opponents' search", async ({ page }) => {
  await open(page, top, [1440, 900], "expanded");
  // Opened from the list (its own entry), then the filter changed: the champion stays open.
  await rowsOnPage(page).first().getByTestId("open-champion").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", "Ambessa");
  const entries = await page.evaluate(() => history.length);
  await pick(page.getByTestId("all-champions-filters").getByLabel("Game mode"), "solo");
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page).toHaveURL(/champion=Ambessa/);
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", "Ambessa");
  await settled(page);
  await fits(page, "F: Ranked Solo/Duo");
  // The list on Ambessa's page.
  await expect(listCard(page).locator('[data-champion="Ambessa"]')).toBeVisible();
  // Close replaces (no Back to the old filters).
  await pane(page).getByTestId("champion-preview-close").click();
  await expect(pane(page)).toHaveCount(0);
  await expect(page).toHaveURL(/mode=solo/);
  expect(await page.evaluate(() => history.length)).toBe(entries);
  // A role where Ambessa has no game: the preview's keys go by a replace, the list on page 1.
  await page.goto(`${BASE}${top}?role=JUNGLE&champion=Ambessa&crole=TOP`, { waitUntil: "load" });
  await expect(page).not.toHaveURL(/champion=/);
  await settled(page);
  expect((await region(page, "list")).page).toBe(1);
  await fits(page, "F: no game in the filters");
  // A search with no match: the message inside the card.
  await open(page, top, [1440, 900], "expanded");
  await page.getByTestId("all-champions-search").fill("zz");
  await expect(page.getByTestId("all-champions-empty")).toBeVisible();
  const m = await measure(page);
  expect(m.height).toBeLessThanOrEqual(m.window);
  expect(m.scrollers).toEqual([]);
  await page.getByTestId("all-champions-search").fill("");
  // The opponents' search: page 1, and clearing it page 1 again.
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1366, 768], "expanded");
  await page.getByTestId("opponents-next").click();
  await expect.poll(async () => (await region(page, "opponents")).page).toBe(2);
  await pane(page).getByTestId("opponent-search").fill("a");
  await expect.poll(async () => (await region(page, "opponents")).page).toBe(1);
  await fits(page, "the opponents searched");
  await pane(page).getByTestId("opponent-search").fill("");
  await expect.poll(async () => (await region(page, "opponents")).page).toBe(1);
});

test("a resize, a zoom and the sidebar keep one screen and the selected row on the page shown", async ({ page }) => {
  await open(page, top, [1920, 1080], "expanded");
  await page.getByTestId("all-champions-next").click();
  await page.getByTestId("all-champions-next").click();
  await expect.poll(async () => (await region(page, "list")).page).toBe(3);
  const row = rowsOnPage(page).first();
  const id = (await row.getAttribute("data-champion"))!;
  await row.getByTestId("open-champion").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", id);
  const selectedShown = () => expect(listCard(page).locator(`[data-testid=top-champion][data-champion="${id}"]`)).toBeVisible();
  for (const [w, h] of [
    [1366, 768],
    [1440, 900],
  ] as Array<[number, number]>) {
    await page.setViewportSize({ width: w, height: h });
    await settled(page);
    await fits(page, `resized to ${w}x${h}`);
    await selectedShown();
  }
  await page.getByTestId("sidebar-toggle").click();
  await page.waitForTimeout(400);
  await settled(page);
  await fits(page, "the sidebar folded");
  await selectedShown();
  // 125% zoom on a 1920 × 1080 screen: 1536 × 864 at a device scale of 1.25.
  const context = await page.context().browser()!.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
  const zoomed = await context.newPage();
  await zoomed.goto(`${BASE}${top}?champion=Ambessa&crole=TOP`, { waitUntil: "load" });
  await settled(zoomed);
  await fits(zoomed, "1536x864 at 125%");
  await context.close();
});

test("keys: PageDown, PageUp, Home and End on the list; ↓ down the opponents' first column, then the second, then the next page; ←/→ across; Enter opens; Escape in order", async ({ page }) => {
  await open(page, top, [1366, 768], "expanded");
  const per = (await region(page, "list")).per;
  await rowsOnPage(page).first().getByTestId("open-champion").focus();
  await page.keyboard.press("PageDown");
  await expect.poll(async () => (await region(page, "list")).page).toBe(2);
  expect(await page.evaluate(() => document.activeElement?.closest<HTMLElement>("[data-testid=top-champion]")?.getAttribute("aria-posinset"))).toBe(String(per + 1));
  await page.keyboard.press("PageUp");
  await expect.poll(async () => (await region(page, "list")).page).toBe(1);
  expect(await page.evaluate(() => document.activeElement?.closest<HTMLElement>("[data-testid=top-champion]")?.getAttribute("aria-posinset"))).toBe(String(per));
  await page.keyboard.press("End");
  await expect.poll(async () => (await region(page, "list")).page).toBe((await region(page, "list")).pages);
  expect(await page.evaluate(() => document.activeElement?.closest<HTMLElement>("[data-testid=top-champion]")?.getAttribute("aria-posinset"))).toBe("30");
  await page.keyboard.press("Home");
  await expect.poll(async () => (await region(page, "list")).page).toBe(1);
  expect(await page.evaluate(() => document.activeElement?.closest<HTMLElement>("[data-testid=top-champion]")?.getAttribute("aria-posinset"))).toBe("1");
  // The opponents.
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1366, 768], "expanded");
  const opp = await region(page, "opponents");
  const perColumn = opp.per / 2;
  const order = await cells(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.champion!));
  await pane(page).locator(`[data-opponent-row="${order[0]}"]`).focus();
  const focusedCell = () => page.evaluate(() => document.activeElement?.closest<HTMLElement>("[data-testid=champion-preview-opponent]")?.dataset.champion ?? null);
  for (let i = 1; i < order.length; i++) {
    await page.keyboard.press("ArrowDown");
    expect(await focusedCell(), "↓ down the reading order").toBe(order[i]);
  }
  // ↓ at the page's last cell: the next page, the focus on its first cell.
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await region(page, "opponents")).page).toBe(2);
  const second = await cells(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.champion!));
  await expect.poll(focusedCell).toBe(second[0]);
  // ←/→: the same row of the other column.
  await page.keyboard.press("ArrowRight");
  expect(await focusedCell()).toBe(second[perColumn]);
  await page.keyboard.press("ArrowLeft");
  expect(await focusedCell()).toBe(second[0]);
  await page.keyboard.press("PageUp");
  await expect.poll(async () => (await region(page, "opponents")).page).toBe(1);
  await expect.poll(focusedCell).toBe(order[0]);
  await page.keyboard.press("End");
  await expect.poll(async () => (await region(page, "opponents")).page).toBe(opp.pages);
  await page.keyboard.press("Home");
  await expect.poll(async () => (await region(page, "opponents")).page).toBe(1);
  // Enter opens its games in place, the focus on "vs …"; Escape back to the grid, again closed, the focus on the row.
  await page.keyboard.press("Enter");
  await expect(detailTitle(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(pane(page).locator(`[data-opponent-row="${order[0]}"]`)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(pane(page)).toHaveCount(0);
  await expect(listCard(page).locator('[data-champion="Ambessa"] [data-open-champion]')).toBeFocused();
});

test("Back and Forward: one Back closes the preview and its opponent, Forward reopens both; a game's window closes first; the opponent, ‹ ›, positions and pages add no entry", async ({ page }) => {
  await open(page, top, [1440, 900], "expanded");
  const start = await page.evaluate(() => history.length);
  await page.getByTestId("all-champions-next").click();
  await expect.poll(async () => (await region(page, "list")).page).toBe(2);
  expect(await page.evaluate(() => history.length), "a page adds no entry").toBe(start);
  await page.getByTestId("all-champions-prev").click();
  await rowsOnPage(page).first().getByTestId("open-champion").click();
  await expect(pane(page)).toBeVisible();
  const opened = await page.evaluate(() => history.length);
  expect(opened).toBe(start + 1);
  await openOpponent(page, "Darius");
  await pane(page).getByTestId("champion-preview-opponent-next").click();
  await expect(pane(page).getByTestId("champion-preview-pairing")).toHaveAttribute("data-champion", "Garen");
  await pane(page).getByTestId("champion-preview-opponent-prev").click();
  expect(await page.evaluate(() => history.length), "the opponent and ‹ › add no entry").toBe(opened);
  const listPage = (await region(page, "list")).page;
  await page.goBack();
  await expect(pane(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/vs=|champion=/);
  expect((await region(page, "list")).page).toBe(listPage);
  await page.goForward();
  await expect(pane(page).getByTestId("champion-preview-pairing")).toHaveAttribute("data-champion", "Darius");
  await settled(page);
  await fits(page, "Forward");
  // A game: its own entry, Back closes it first, then the preview.
  await pane(page).getByTestId("champion-preview-game").first().click();
  await expect(page).toHaveURL(/match=/);
  await page.goBack();
  await expect(page).not.toHaveURL(/match=/);
  await expect(pane(page)).toBeVisible();
  await page.goBack();
  await expect(pane(page)).toHaveCount(0);
});

test("accessibility: axe on the list, Ambessa and Darius; the pagers' labels, the current page, the range read after a press and never after a resize; each row's place on the list", async ({ page }) => {
  for (const [size, side] of [
    [[1366, 768], "expanded"],
    [[1920, 1080], "collapsed"],
  ] as Array<[[number, number], Side]>) {
    for (const path of [top, `${top}?champion=Ambessa&crole=TOP`, `${top}?champion=Ambessa&crole=TOP&vs=Darius`]) {
      await open(page, path, size, side);
      await expectNoSeriousAxe(page, `${cfg(size, side)} ${path}`, ["#content"]);
    }
  }
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1440, 900], "expanded");
  await expect(page.getByRole("navigation", { name: "Champion pages" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Lane opponent pages" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Champion pages" }).locator("[aria-current=page]")).toHaveText("1");
  await expect(page.getByTestId("all-champions-pager-live")).toHaveText("");
  await page.getByTestId("all-champions-next").click();
  await expect(page.getByTestId("all-champions-pager-live")).toHaveText(/^Champions 10 to 18 of 30$/);
  await expect(page.getByRole("navigation", { name: "Champion pages" }).locator("[aria-current=page]")).toHaveText("2");
  await page.getByTestId("opponents-next").click();
  await expect(page.getByTestId("opponents-pager-live")).toHaveText(/^Lane opponents 19 to \d+ of 40$/);
  // A resize changes the pages, never reads them out.
  const live = await page.getByTestId("opponents-pager-live").textContent();
  await page.setViewportSize({ width: 1366, height: 768 });
  await settled(page);
  await expect(page.getByTestId("opponents-pager-live")).toHaveText(live!);
  // Each row's place on the whole list (the resize went back to the open champion's page).
  await page.getByTestId("all-champions-next").click();
  const list = await region(page, "list");
  expect(list.page).toBe(2);
  const first = rowsOnPage(page).first();
  await expect(first).toHaveAttribute("aria-setsize", "30");
  await expect(first).toHaveAttribute("aria-posinset", String(list.per + 1));
  await expect(listCard(page).locator("ul[aria-label=Champions]")).toHaveAttribute("aria-describedby", "all-champions-range");
});

test("with CI's wider text: the list, Ambessa, Darius and Sion still fit, with the margin; the short form at the floor and the workspace window too", async ({ page }) => {
  await widenText(page);
  for (const size of [
    [1366, 768],
    [1920, 1080],
  ] as Array<[number, number]>) {
    for (const path of [top, `${top}?champion=Ambessa&crole=TOP`, `${top}?champion=Ambessa&crole=TOP&vs=Darius`, `${sub}?champion=Sion&crole=TOP&vs=Nasus`]) {
      await open(page, path, size, "expanded");
      await fits(page, `wide text ${size.join("x")} ${path.split("?")[1] ?? "list"}`);
    }
  }
  // The floor's short form, its widest states.
  for (const path of [`${sub}?champion=Sion&crole=TOP&vs=Nasus`, `${sub}?champion=Sion&crole=TOP`]) {
    await open(page, path, [1366, 656], "expanded");
    await fits(page, `wide text 1366x656 ${path.split("?")[1]}`);
  }
  // The narrowest panes just above 46rem (the short form of a narrow section, to 48rem), and the tall form at 48rem: with
  // CI's wider text the tall form's kills line wraps in panes up to 1376px with the sidebar open, and kept no games row at
  // 1366 × 736 (739/736) until 28 Nov 2026.
  for (const size of [
    [1356, 736],
    [1366, 736],
    [1366, 751],
    [1376, 744],
    [1356, 768],
  ] as Array<[number, number]>) {
    await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, size, "expanded");
    await fits(page, `wide text ${size.join("x")} open Sion vs Nasus`);
    expect(await shortForm(page), `wide text ${size.join("x")} open: the ${size[1] < 768 ? "short" : "tall"} form`).toBe(size[1] < 768);
  }
  // The workspace window.
  for (const path of [`${top}?champion=Ambessa&crole=TOP`, `${sub}?champion=Sion&crole=TOP&vs=Nasus`]) {
    await open(page, path, [1280, 689], "expanded");
    await fitsWindow(page, `wide text 1280x689 ${path.split("?")[1]}`);
  }
});

test("the flow is unchanged where the workspace does not apply: windows under 41rem tall, a larger text size", async ({ page }) => {
  for (const [w, h] of [
    [1366, 640],
    [1440, 600],
    [1280, 640],
  ] as Array<[number, number]>) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}${top}`, { waitUntil: "load" });
    await expect(page.getByTestId("all-champions-more")).toBeVisible();
    // Once hydrated (the server marks the section until the page knows; the CSS gate leaves it as flow meanwhile).
    await expect.poll(() => page.evaluate(() => ({ workspace: !!document.querySelector("[data-workspace]"), mainFlex: getComputedStyle(document.getElementById("content")!).display === "flex", foot: !!document.querySelector("[data-ws-foot]") })), { message: `${w}x${h}` }).toEqual({ workspace: false, mainFlex: false, foot: false });
  }
  // A larger text size (the page's own rem short of the gate): the page's own check drops the workspace.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    const add = () => {
      if (!document.head) return false;
      const style = document.createElement("style");
      style.textContent = "html{font-size:150%!important}";
      document.head.appendChild(style);
      return true;
    };
    if (!add()) new MutationObserver((_, o) => add() && o.disconnect()).observe(document, { childList: true, subtree: true });
  });
  await page.goto(`${BASE}${top}`, { waitUntil: "load" });
  await expect.poll(() => page.evaluate(() => !!document.querySelector("[data-workspace]"))).toBe(false);
  await expect(page.getByTestId("all-champions-more")).toBeVisible();
});


/*
  Regression tests from the review of 27 Nov 2026 (each reproduced by a reviewer and a skeptic).
*/

const active = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "body";
    return el.dataset.opponentRow ? `cell:${el.dataset.opponentRow}` : (el.dataset.testid ?? el.getAttribute("aria-label") ?? el.tagName.toLowerCase());
  });
const cellIds = (page: Page) => cells(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.champion!));

test("an opponent left (All opponents, Escape) brings the grid back on the page holding it, its cell focused, from a later page, after ‹ › and from a link; nothing takes the focus later", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [size, side] of [
    [[1366, 768], "expanded"],
    [[1920, 1080], "collapsed"],
  ] as Array<[[number, number], Side]>) {
    const at = cfg(size, side);
    for (const how of ["Escape", "All opponents"] as const) {
      await open(page, `${top}?champion=Ambessa&crole=TOP`, size, side);
      await pane(page).getByTestId("opponents-next").click();
      await expect.poll(async () => (await region(page, "opponents")).page).toBe(2);
      const who = (await cellIds(page))[1]!;
      await pane(page).locator(`[data-opponent-row="${who}"]`).focus();
      await page.keyboard.press("Enter");
      await expect(detailTitle(page)).toBeFocused();
      if (how === "Escape") await page.keyboard.press("Escape");
      else await pane(page).getByTestId("champion-preview-opponents-back").click();
      await expect(pane(page).locator(`[data-opponent-row="${who}"]`), `${at} ${how}: back on its cell`).toBeFocused();
      expect((await region(page, "opponents")).page, `${at} ${how}: the page it was opened from`).toBe(2);
      // Nothing pending takes the focus later: the pager keeps it, and the search keeps every key typed.
      await pane(page).getByTestId("opponents-pager").locator("[aria-label='Page 1']").click();
      await expect.poll(() => active(page)).not.toMatch(/^cell:/);
      await pane(page).getByTestId("opponents-pager").locator("[aria-label='Page 2']").click();
      await expect.poll(async () => (await region(page, "opponents")).page).toBe(2);
      expect(await active(page), `${at} ${how}: the pager keeps the focus`).not.toMatch(/^cell:|^body$/);
      await pane(page).getByTestId("opponents-pager").locator("[aria-label='Page 1']").click();
      await pane(page).getByTestId("opponent-search").click();
      await page.keyboard.type(who.slice(0, 3).toLowerCase(), { delay: 60 });
      await expect(pane(page).getByTestId("opponent-search"), `${at} ${how}: every key typed`).toHaveValue(who.slice(0, 3).toLowerCase());
      await expect(pane(page).getByTestId("opponent-search")).toBeFocused();
    }
    // ‹ › past the page's end, then All opponents: the page holding the opponent stepped to.
    await open(page, `${top}?champion=Ambessa&crole=TOP`, size, side);
    const per = (await region(page, "opponents")).per;
    await openOpponent(page, "Darius");
    for (let i = 0; i < per; i++) await pane(page).getByTestId("champion-preview-opponent-next").click();
    await expect(pane(page).getByTestId("sibling-position")).toContainText(`${per + 1} of 40`);
    const stepped = (await pane(page).getByTestId("champion-preview-pairing").getAttribute("data-champion"))!;
    await pane(page).getByTestId("champion-preview-opponents-back").click();
    await expect(pane(page).locator(`[data-opponent-row="${stepped}"]`)).toBeFocused();
    expect((await region(page, "opponents")).page, `${at}: ‹ › to the ${per + 1}th, then back`).toBe(2);
    // A link to the last opponent (its grid never drawn before): back on the last page, the focus on its cell.
    await pane(page).getByTestId("opponents-pager").locator(`[aria-label='Page ${(await region(page, "opponents")).pages}']`).click();
    const last = (await cellIds(page)).at(-1)!;
    const lastPage = (await region(page, "opponents")).page;
    await open(page, `${top}?champion=Ambessa&crole=TOP&vs=${last}`, size, side);
    await expect(detailTitle(page)).toHaveText(new RegExp(`vs\\s*`));
    await detailTitle(page).focus();
    await page.keyboard.press("Escape");
    await expect(pane(page).locator(`[data-opponent-row="${last}"]`), `${at}: a linked opponent, back to its cell`).toBeFocused();
    expect((await region(page, "opponents")).page).toBe(lastPage);
    // A link to Darius (page 1): the cell focused once the page has measured stays focused (the same element: no remount).
    await open(page, `${top}?champion=Ambessa&crole=TOP&vs=Darius`, size, side);
    await page.evaluate(() => {
      (window as unknown as { __focused: Element[] }).__focused = [];
      document.addEventListener("focusin", (e) => (window as unknown as { __focused: Element[] }).__focused.push(e.target as Element), true);
    });
    await detailTitle(page).focus();
    await pane(page).getByTestId("champion-preview-opponents-back").click();
    await expect(pane(page).locator('[data-opponent-row="Darius"]')).toBeFocused();
    await settled(page);
    expect(await page.evaluate(() => (window as unknown as { __focused: Element[] }).__focused.filter((el) => (el as HTMLElement).dataset.opponentRow).every((el) => el.isConnected && el === document.activeElement)), `${at}: Darius's cell kept, never re-made`).toBe(true);
  }
});

/** The page as the server's HTML paints it (its scripts held back), then once they have loaded and the pages settled. */
async function firstPaintThenHydrated<T>(page: Page, path: string, [w, h]: [number, number], side: Side, read: () => Promise<T>): Promise<{ first: T; hydrated: T }> {
  await page.setViewportSize({ width: w, height: h });
  await page.context().addCookies([{ name: "uniiverse_sidebar", value: side, url: BASE }]);
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const pattern = /\/_next\/static\/chunks\/[^?]*\.js(\?.*)?$/;
  await page.route(pattern, async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(300);
    const first = await read();
    release();
    await page.waitForLoadState("load");
    await settled(page);
    return { first, hydrated: await read() };
  } finally {
    release();
    await page.unroute(pattern);
  }
}

/** Every drawn opponent cell, game row and champion row, by a stable name, with its box. */
const clickables = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, { x: number; y: number; h: number }> = {};
    const add = (key: string, el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out[key] = { x: Math.round(r.left), y: Math.round(r.top), h: Math.round(r.height) };
    };
    for (const el of document.querySelectorAll<HTMLElement>("[data-testid=champion-preview-opponent] > button")) add(`opponent:${el.dataset.opponentRow}`, el);
    document.querySelectorAll("[data-testid=champion-preview-game]").forEach((el, i) => add(`game:${i}`, el));
    for (const el of document.querySelectorAll<HTMLElement>("[data-testid=top-champion]")) add(`champion:${el.dataset.champion}`, el);
    return { boxes: out, height: document.documentElement.scrollHeight, window: innerHeight };
  });

test("a linked preview's first paint: no opponent, game or champion row moves when the page hydrates, and the page is never taller than the window (1280 × 800 with the sidebar open included)", async ({ page }) => {
  test.setTimeout(240_000);
  const cases: Array<[[number, number], Side, string]> = [
    [[1366, 768], "expanded", `${top}?champion=Ambessa&crole=TOP`],
    [[1366, 768], "expanded", `${top}?champion=Ambessa&crole=TOP&vs=Darius`],
    [[1440, 900], "collapsed", `${top}?champion=Ambessa&crole=TOP`],
    [[1920, 1080], "expanded", `${top}?champion=Ambessa&crole=TOP&vs=Darius`],
    [[1920, 1080], "collapsed", `${top}?champion=Ambessa&crole=TOP`],
    [[1280, 800], "expanded", `${top}?champion=Ambessa&crole=TOP`],
    [[1340, 800], "expanded", `${top}?champion=Ambessa&crole=TOP`],
    [[1366, 736], "expanded", `${sub}?champion=Sion&crole=TOP&vs=Nasus`],
    // The short form is CSS: nothing moves at hydration there either, a narrow section's (a container query) included.
    [[1366, 657], "expanded", `${sub}?champion=Sion&crole=TOP&vs=Nasus`],
    [[1440, 760], "expanded", `${sub}?champion=Sion&crole=TOP&vs=Nasus`],
    [[1366, 736], "collapsed", `${sub}?champion=Sion&crole=TOP&vs=Nasus`],
  ];
  for (const [size, side, path] of cases) {
    const at = `${cfg(size, side)} ${path.split("?")[1]}`;
    const { first, hydrated } = await firstPaintThenHydrated(page, path, size, side, () => clickables(page));
    expect(first.height, `${at}: the first paint is no taller than the window`).toBeLessThanOrEqual(first.window);
    for (const [key, box] of Object.entries(first.boxes)) if (key.startsWith("champion:")) expect(box.h, `${at}: ${key}'s row at its table height`).toBeLessThanOrEqual(56);
    const moved = Object.entries(first.boxes)
      .filter(([key]) => hydrated.boxes[key])
      .filter(([key, b]) => Math.abs(hydrated.boxes[key]!.x - b.x) > 1 || Math.abs(hydrated.boxes[key]!.y - b.y) > 1)
      .map(([key, b]) => `${key} ${b.x},${b.y} → ${hydrated.boxes[key]!.x},${hydrated.boxes[key]!.y}`);
    expect(moved, `${at}: nothing drawn at first moves at hydration`).toEqual([]);
    expect(Object.keys(first.boxes).filter((k) => !hydrated.boxes[k]), `${at}: nothing drawn at first goes`).toEqual([]);
  }
});

test("the pagers never change width as their pages turn: the arrows and the range stay where they are", async ({ page }) => {
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1366, 768], "expanded");
  for (const [region0, pager, next] of [
    ["list", "all-champions-pager", "all-champions-next"],
    ["opponents", "opponents-pager", "opponents-next"],
  ] as const) {
    const where = () =>
      page.evaluate((pager) => {
        const box = (sel: string) => document.querySelector(`[data-testid=${pager}] ${sel}`)!.getBoundingClientRect();
        return { prev: Math.round(box("button[aria-label='Previous page']").left), next: Math.round(box("button[aria-label='Next page']").left), range: Math.round(box(`[data-testid=${pager}-range]`).left) };
      }, pager);
    const seen = [await where()];
    const pages = (await region(page, region0)).pages;
    expect(pages, `${region0}: several pages`).toBeGreaterThanOrEqual(4);
    for (let p = 2; p <= pages; p++) {
      await page.getByTestId(next).click();
      await expect.poll(async () => (await region(page, region0)).page).toBe(p);
      seen.push(await where());
    }
    for (const [i, w] of seen.entries()) expect(w, `${region0} page ${i + 1}`).toEqual(seen[0]);
    // A second click where the first Previous was: the page before, never a page number under the pointer.
    const prev = page.getByTestId(pager).getByRole("button", { name: "Previous page" });
    const box = (await prev.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(async () => (await region(page, region0)).page).toBe(pages - 2);
  }
});

/** The states every short window is held to (docs/RESPONSIVE.md, "the short form"): each champion kind, each with an opponent open. */
const SHORT_STATES = (): Array<[string, string]> => [
  ["list", top],
  ["Ambessa", `${top}?champion=Ambessa&crole=TOP`],
  ["Ambessa vs Darius", `${top}?champion=Ambessa&crole=TOP&vs=Darius`],
  ["Aatrox", `${top}?champion=Aatrox&crole=TOP`],
  ["Aatrox vs Darius", `${top}?champion=Aatrox&crole=TOP&vs=Darius`],
  ["Aatrox Mid vs Ahri", `${top}?champion=Aatrox&crole=MID&vs=Ahri`],
  ["Sion", `${sub}?champion=Sion&crole=TOP`],
  ["Sion vs Nasus", `${sub}?champion=Sion&crole=TOP&vs=Nasus`],
  ["Sion Jungle vs Lee Sin", `${sub}?champion=Sion&crole=JUNGLE&vs=LeeSin`],
  ["Malphite Support vs Leona", `${sub}?champion=Malphite&crole=SUPPORT&vs=Leona`],
  ["Mordekaiser vs Nasus", `${sub}?champion=Mordekaiser&crole=TOP&vs=Nasus`],
];

/** Every optional line of Sion vs Nasus drawn (the fixture's): the averages' coverage, the partial multikills' words, the totals with no recorded position. */
async function everyOptionalLine(page: Page, at: string, where = pane(page)) {
  const coverage = where.getByTestId("champion-preview-coverage");
  await expect(coverage, `${at}: the coverage drawn`).toBeVisible();
  await expect(coverage).toHaveText("Averages from the 21 games with a full record, of 22 Top games.");
  expect(await coverage.evaluate((el) => el.getBoundingClientRect().height > 2), `${at}: the coverage not read out only`).toBe(true);
  await expect(where.getByTestId("champion-preview-partial"), `${at}: the partial multikills' words`).toBeVisible();
  await expect(where.getByTestId("champion-preview-kills")).toContainText("Kills");
  await expect(where.getByTestId("champion-preview-total-identity"), `${at}: the totals in the identity bar`).toBeVisible();
  await expect(where.getByTestId("champion-preview-total-identity")).toContainText(", 1 with no recorded position");
}

test("shorter desktop windows keep the workspace with fewer rows (a laptop's browser window), and every state fits: five positions with an opponent's games open and every optional line drawn included", async ({ page }) => {
  test.setTimeout(480_000);
  for (const [size, side] of [
    [[1366, 657], "expanded"],
    [[1366, 657], "collapsed"],
    [[1280, 689], "collapsed"],
    [[1280, 689], "expanded"],
    [[1536, 730], "expanded"],
    [[1600, 772], "collapsed"],
    [[1648, 789], "expanded"],
  ] as Array<[[number, number], Side]>) {
    const at = cfg(size, side);
    // 1280 with the sidebar open: the workspace window (a section under 64.75rem).
    const inWindow = size[0] === 1280 && side === "expanded";
    for (const [state, path] of SHORT_STATES()) {
      await open(page, path, size, side);
      if (inWindow && state !== "list") {
        await expect(wsBody(page), `${at} ${state}: the workspace window`).toBeVisible();
        await expect(pane(page)).toHaveCount(0);
        await fitsWindow(page, `${at} ${state}`);
      } else {
        await fits(page, `${at} ${state}`);
      }
      if (state === "Sion vs Nasus" && size[1] === 657) await everyOptionalLine(page, `${at} ${state}`);
    }
  }
});

test("the 41rem gate's band edges and both sides of the short form's bound: every state fits", async ({ page }) => {
  test.setTimeout(480_000);
  const states: Array<[string, string]> = [
    ["Sion", `${sub}?champion=Sion&crole=TOP`],
    ["Sion vs Nasus", `${sub}?champion=Sion&crole=TOP&vs=Nasus`],
    ["Aatrox vs Darius", `${top}?champion=Aatrox&crole=TOP&vs=Darius`],
    ["Sion Jungle vs Lee Sin", `${sub}?champion=Sion&crole=JUNGLE&vs=LeeSin`],
    ["Ambessa vs Darius", `${top}?champion=Ambessa&crole=TOP&vs=Darius`],
  ];
  // Each band's least height (globals.css, the ws gate), at a width in the band, the sidebar open and folded in turn.
  for (const [size, side] of [
    [[1366, 656], "expanded"],
    [[1280, 656], "collapsed"],
    [[1440, 656], "expanded"],
    [[1536, 656], "collapsed"],
    [[1600, 668], "expanded"],
    [[1648, 680], "collapsed"],
    [[1728, 691], "expanded"],
    [[1792, 703], "collapsed"],
    [[1856, 715], "expanded"],
    [[1920, 727], "collapsed"],
  ] as Array<[[number, number], Side]>)
    for (const [state, path] of states) {
      await open(page, path, size, side);
      await fits(page, `${cfg(size, side)} ${state}`);
    }
  // The short form's bound (46 of the band's widest root): short under it, tall at it. The bands include their upper edge,
  // where the next band's bound holds too (1600 and 1920), so the bound is tested inside its band; at 1920 itself the band
  // to 1984 holds (829, 13.5px past 1920's own 46rem). From 1920 the bands are 64px wide, as below: until 28 Nov 2026 they
  // were 320px, and 1920 × 850 (a 1920 × 1080 screen's window with the Dock and a bookmarks bar), 2240 × 900 and
  // 2560 × 970, 46 to 49.7 of their own rem, took the short form. A narrow section (64.75 to 71.5rem: 1356–1463px with the
  // sidebar open) takes it to 48rem, so 1366 at 736 is short there and tall folded.
  for (const [w, h, side, short] of [
    [1366, 735, "collapsed", true],
    [1366, 736, "collapsed", false],
    [1599, 749, "expanded", true],
    [1599, 750, "expanded", false],
    [1900, 815, "expanded", true],
    [1900, 816, "expanded", false],
    [1920, 828, "expanded", true],
    [1920, 829, "expanded", false],
    [1920, 850, "expanded", false],
    [1920, 881, "collapsed", false],
    [2000, 845, "expanded", false],
    [2240, 900, "expanded", false],
    [2560, 970, "collapsed", false],
    [1366, 767, "expanded", true],
    [1366, 768, "expanded", false],
    [1463, 767, "expanded", true],
    [1464, 767, "expanded", false],
    [1280, 740, "collapsed", false],
  ] as const) {
    const size: [number, number] = [w, h];
    await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, size, side);
    await fits(page, `${cfg(size, side)} Sion vs Nasus`);
    expect(await shortForm(page), `${cfg(size, side)}: the ${short ? "short" : "tall"} form`).toBe(short);
  }
});

test("a narrow section (1356–1463px with the sidebar open) keeps the short form to 48rem: the narrowest panes fit from 736 to 767px with every optional line, the tall form from 768", async ({ page }) => {
  test.setTimeout(360_000);
  // In a pane under about 40rem (1356–1376px open) the tall form's totals take a line under the positions and its kills line
  // wraps: at 1356–1363 × 736 Sion vs Nasus with every optional line kept no games row (739/736), and its margin stayed
  // under 12px to 751 (docs/RESPONSIVE.md, "the short form").
  const states: Array<[string, string]> = [
    ["Sion vs Nasus", `${sub}?champion=Sion&crole=TOP&vs=Nasus`],
    ["Sion", `${sub}?champion=Sion&crole=TOP`],
    ["Sion Jungle vs Lee Sin", `${sub}?champion=Sion&crole=JUNGLE&vs=LeeSin`],
    ["Aatrox vs Darius", `${top}?champion=Aatrox&crole=TOP&vs=Darius`],
    ["Ambessa vs Darius", `${top}?champion=Ambessa&crole=TOP&vs=Darius`],
  ];
  for (const size of [
    [1356, 736],
    [1360, 744],
    [1356, 752],
    [1366, 751],
    [1440, 760],
    [1463, 767],
  ] as Array<[number, number]>)
    for (const [state, path] of states) {
      const at = `${cfg(size, "expanded")} ${state}`;
      await open(page, path, size, "expanded");
      await expect(pane(page), `${at}: the pane`).toBeVisible();
      expect(await shortForm(page), `${at}: the short form`).toBe(true);
      await fits(page, at);
      if (state === "Sion vs Nasus") await everyOptionalLine(page, at);
    }
  // The page's foot stays 28px in a narrow section from 46rem (the short form's 12px foot is the shell's, under 46rem).
  await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, [1366, 740], "expanded");
  expect((await shortReadings(page)).pad, "1366x740 open: the page's 28px foot").toBeCloseTo(1.75, 2);
  // From 48rem the approved tall form, which fits there with every optional line.
  for (const size of [
    [1356, 768],
    [1366, 768],
    [1440, 768],
  ] as Array<[number, number]>) {
    await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, size, "expanded");
    expect(await shortForm(page), `${cfg(size, "expanded")}: the tall form`).toBe(false);
    const at = `${cfg(size, "expanded")} Sion vs Nasus`;
    await fits(page, at);
    // Every optional line drawn there too: the coverage, the partial multikills' words, the totals after the positions.
    await expect(pane(page).getByTestId("champion-preview-coverage"), `${at}: the coverage`).toBeVisible();
    await expect(pane(page).getByTestId("champion-preview-partial"), `${at}: the partial multikills' words`).toBeVisible();
    await expect(pane(page).locator("[data-testid=champion-preview-positions] [data-testid=champion-preview-total]"), `${at}: the totals after the positions`).toContainText(", 1 with no recorded position");
  }
  // A wider section keeps 46rem: folded (1280px folded is 71.5rem), and from 1464px open.
  for (const [size, side] of [
    [[1366, 740], "collapsed"],
    [[1464, 740], "expanded"],
    [[1280, 744], "collapsed"],
  ] as Array<[[number, number], Side]>) {
    await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, size, side);
    expect(await shortForm(page), `${cfg(size, side)}: the tall form`).toBe(false);
    await fits(page, `${cfg(size, side)} Sion vs Nasus`);
  }
});

/** Whether the pane's figures are in the short form: the stats' list a subgrid of one row (in the tall form, a grid of its own). */
const shortForm = (page: Page, where = "aside[data-preview-pane]") =>
  page.evaluate((where) => getComputedStyle(document.querySelector(`${where} [data-testid=champion-preview-stats]`)!).gridTemplateColumns.startsWith("subgrid"), where);

/** P3's height, the totals' two places and #content's bottom padding, in the page's own rem. */
const shortReadings = (page: Page) =>
  page.evaluate(() => {
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const pane = document.querySelector("aside[data-preview-pane]")!;
    const drawn = (sel: string) => {
      const el = pane.querySelector(sel);
      return !!el && el.getBoundingClientRect().height > 0;
    };
    return {
      figures: pane.querySelector("[data-testid=champion-preview-figures]")!.getBoundingClientRect().height / root,
      identity: drawn("[data-testid=champion-preview-total-identity]"),
      afterSegments: drawn("[data-testid=champion-preview-positions] [data-testid=champion-preview-total]"),
      pad: parseFloat(getComputedStyle(document.getElementById("content")!).paddingBottom) / root,
    };
  });

test("the short form applies below 46 of the page's own rem only (48 in a narrow section): the figures in one row, the totals in the identity bar, the page's 12px foot; the identity bar level with the list's toolbar", async ({ page }) => {
  test.setTimeout(240_000);
  for (const side of SIDES) {
    await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, [1366, 657], side);
    expect(await shortForm(page), `1366x657 ${side}: the short form`).toBe(true);
    const r = await shortReadings(page);
    expect(r.figures, `1366x657 ${side}: P3 in one row of label and figure, the subs under them`).toBeLessThan(2.9);
    expect(r.identity, `1366x657 ${side}: the totals in the identity bar`).toBe(true);
    expect(r.afterSegments, `1366x657 ${side}: not after the positions`).toBe(false);
    expect(r.pad, `1366x657 ${side}: the page's 12px foot`).toBeCloseTo(0.75, 2);
    for (const path of [`${top}?champion=Ambessa&crole=TOP`, `${top}?champion=Aatrox&crole=TOP`, `${sub}?champion=Sion&crole=TOP`]) {
      await open(page, path, [1366, 657], side);
      const rules = await page.evaluate(() => [document.querySelector("[data-testid=all-champions-toolbar]"), document.querySelector("aside[data-preview-pane] [data-testid=champion-preview-header]")].map((el) => el!.getBoundingClientRect().bottom));
      expect(Math.abs(rules[0]! - rules[1]!), `1366x657 ${side} ${path.split("?")[1]}: the toolbar's rule level with the identity bar's`).toBeLessThanOrEqual(1);
    }
  }
  // At 46rem and up the approved layout (from 48rem in a narrow section: 1366 × 768 open): P3's three lines (62px at a 16px
  // root), the totals after the positions, the 28px foot. 1920 × 850 and 2560 × 970 too, which took the short form until
  // 28 Nov 2026 (the bands from 1920 were 320px wide).
  const tall: Array<[[number, number], Side]> = [...SIZES.flatMap((size) => SIDES.map((side): [[number, number], Side] => [size, side])), [[1366, 736], "collapsed"], [[1920, 850], "expanded"], [[2560, 970], "collapsed"]];
  for (const [size, side] of tall) {
    await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, size, side);
    const at = cfg(size, side);
    expect(await shortForm(page), `${at}: the tall form`).toBe(false);
    const r = await shortReadings(page);
    expect(Math.abs(r.figures * 16 - 62), `${at}: P3 as approved (62px at a 16px root, ${(r.figures * 16).toFixed(1)})`).toBeLessThanOrEqual(1.5);
    expect(r.identity, `${at}: no totals in the identity bar`).toBe(false);
    expect(r.afterSegments, `${at}: the totals after the positions`).toBe(true);
    expect(r.pad, `${at}: the page's 28px foot`).toBeCloseTo(1.75, 2);
  }
});

test("nothing is cut in the short form: every figure, label and sub whole, the record's groups whole, P1 whole; the five figure cells never overlap", async ({ page }) => {
  for (const [size, side] of [
    [[1366, 656], "expanded"],
    [[1366, 657], "collapsed"],
    [[1920, 727], "expanded"],
  ] as Array<[[number, number], Side]>)
    for (const path of [`${sub}?champion=Sion&crole=TOP&vs=Nasus`, `${top}?champion=Ambessa&crole=TOP`, `${top}?champion=Aatrox&crole=MID&vs=Ahri`]) {
      await open(page, path, size, side);
      const at = `${cfg(size, side)} ${path.split("?")[1]}`;
      expect(await shortForm(page), `${at}: the short form`).toBe(true);
      const r = await page.evaluate(() => {
        const pane = document.querySelector("aside[data-preview-pane]")!;
        const els = [
          ...pane.querySelectorAll<HTMLElement>("[data-testid^=champion-stat-] > *"),
          ...pane.querySelectorAll<HTMLElement>("[data-testid=champion-preview-figures] > div:first-child > p"),
          ...pane.querySelectorAll<HTMLElement>("[data-testid=champion-preview-record-line] > span"),
          ...pane.querySelectorAll<HTMLElement>("[data-testid=champion-preview-header] span, [data-testid=champion-preview-header] h2"),
        ].filter((el) => el.getBoundingClientRect().width > 0 && !el.closest(".sr-only") && !el.classList.contains("sr-only"));
        // A box wider inside than its own width; an inline piece (an unbreakable group) split over two lines or past its cell.
        const cell = (el: Element) => el.closest("[data-testid^=champion-stat-], [data-testid=champion-preview-figures] > div, [data-testid=champion-preview-header]")!.getBoundingClientRect();
        const cut = els
          .filter((el) => {
            const st = getComputedStyle(el);
            if (st.display !== "inline") return el.scrollWidth > el.clientWidth + 0.5;
            // Inline: only the unbreakable pieces are held to one line (a breakable phrase may wrap between its words).
            // (Its rects: one per fragment around its children, so its lines are its rects' distinct tops.)
            const lines = new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size;
            return st.whiteSpace === "nowrap" && (lines > 1 || el.getBoundingClientRect().right > cell(el).right + 0.5);
          })
          .map((el) => `${el.tagName.toLowerCase()} "${el.textContent?.trim().slice(0, 30)}" ${el.scrollWidth}/${el.clientWidth}`);
        // The cells in their row: the win rate's, then the four of the stats' list.
        const cells = [pane.querySelector("[data-testid=champion-preview-figures] > div:first-child")!, ...pane.querySelectorAll("[data-testid^=champion-stat-]")].map((el) => el.getBoundingClientRect());
        const overlaps = cells.slice(1).flatMap((c, i) => (c.left < cells[i]!.right - 0.5 ? [`cell ${i + 1} at ${c.left.toFixed(1)} < ${cells[i]!.right.toFixed(1)}`] : []));
        const row = cells.every((c) => Math.abs(c.top - cells[0]!.top) < 1);
        return { cut, overlaps, row, checked: els.length };
      });
      expect(r.checked, `${at}: the cells read`).toBeGreaterThan(10);
      expect(r.cut, `${at}: nothing cut`).toEqual([]);
      expect(r.overlaps, `${at}: no cell over the next`).toEqual([]);
      expect(r.row, `${at}: the five cells on one row`).toBe(true);
    }
});

test("the detail's header never puts ‹ n of N › on a line of its own, at every height; its record wraps between its groups", async ({ page }) => {
  for (const size of [
    [1366, 657],
    [1366, 768],
  ] as Array<[number, number]>) {
    await open(page, `${sub}?champion=Sion&crole=JUNGLE&vs=LeeSin`, size, "expanded");
    const at = cfg(size, "expanded");
    await fits(page, `${at} Sion Jungle vs Lee Sin`);
    const h = await page.evaluate(() => {
      const pane = document.querySelector("aside[data-preview-pane]")!;
      const header = pane.querySelector<HTMLElement>("[data-testid=champion-preview-pairing] > header")!;
      const box = (el: Element) => el.getBoundingClientRect();
      const small = [...header.querySelectorAll("span")].find((el) => el.textContent === "(small sample)");
      const p = box(pane);
      return {
        root: parseFloat(getComputedStyle(document.documentElement).fontSize),
        steps: box(pane.querySelector("[data-testid=champion-preview-opponent-steps]")!).top,
        back: box(pane.querySelector("[data-testid=champion-preview-opponents-back]")!).top,
        height: box(header).height,
        smallLines: small ? small.getClientRects().length : 0,
        outside: [...header.children].filter((el) => box(el).left < p.left - 1 || box(el).right > p.right + 1).map((el) => el.tagName),
      };
    });
    expect(Math.abs(h.steps - h.back), `${at}: the steps on the back button's line`).toBeLessThanOrEqual(0.25 * h.root);
    expect(h.height, `${at}: one line (the record at most two, beside the steps)`).toBeLessThanOrEqual(2.5 * h.root + 1);
    expect(h.smallLines, `${at}: "(small sample)" whole, on one line`).toBe(1);
    expect(h.outside, `${at}: every part of the header inside the pane`).toEqual([]);
    // At 1366 × 768 its games have the room the steps' own line took (two rows of two before).
    if (size[1] === 768) expect((await region(page, "games")).per, `${at}: six games a page`).toBe(6);
  }
});

test("a two-season header (the season choice wraps it in a section under about 71rem: to 1366, or to 1440 or so, with the sidebar open): every state still fits", async ({ page }) => {
  test.setTimeout(240_000);
  // The floor, and just above 46rem in the narrow panes (the short form of a narrow section), where the tall form kept no
  // games row for Sion vs Nasus (753/736 at 1356) and under 12px to 765px; then the tall form at 48rem.
  for (const [w, h] of [
    [1366, 656],
    [1366, 657],
    [1356, 736],
    [1356, 760],
    [1366, 744],
    [1440, 744],
    [1356, 768],
    [1366, 768],
  ] as Array<[number, number]>)
    for (const [state, path] of [
      ["Sion vs Nasus", `${sub}?champion=Sion&crole=TOP&vs=Nasus`],
      ["Sion", `${sub}?champion=Sion&crole=TOP`],
      ["Aatrox vs Darius", `${top}?champion=Aatrox&crole=TOP&vs=Darius`],
    ]) {
      await open(page, path!, [w, h], "expanded");
      const layoutTop = () => page.evaluate(() => document.querySelector("[data-testid=all-champions-layout]")!.getBoundingClientRect().top);
      const before = await layoutTop();
      await twoSeasons(page);
      // To 1366 it wraps on every profile; wider, on a profile whose filters are wider (Demo Sub (Top)'s, to about 1440).
      if (w <= 1366) expect((await layoutTop()) - before, `${w}x${h} ${state}: the section's header took a second line`).toBeGreaterThanOrEqual(10);
      await fits(page, `${w}x${h} two seasons ${state}`);
    }
});

test("a resize across the short form's bound keeps the opponent and the games' page, and one screen: 46rem folded, 48rem in a narrow section", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [side, tallH, shortH] of [
    ["collapsed", 740, 730],
    ["expanded", 776, 760],
  ] as const) {
    const at = (h: number) => `1366x${h} ${side}`;
    await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, [1366, tallH], side);
    await fits(page, at(tallH));
    expect(await shortForm(page), `${at(tallH)}: the tall form`).toBe(false);
    await pane(page).getByTestId("games-next").click();
    await expect.poll(async () => (await region(page, "games")).page).toBe(2);
    const before = await region(page, "games");
    await page.setViewportSize({ width: 1366, height: shortH });
    await settled(page);
    await fits(page, `${at(shortH)} after the resize`);
    expect(await shortForm(page), `${at(shortH)}: the short form`).toBe(true);
    await expect(pane(page).getByTestId("champion-preview-pairing")).toHaveAttribute("data-champion", "Nasus");
    const short = await region(page, "games");
    // The page holding the first game shown before (keepPage), or the last where there are fewer pages.
    expect(short.page, `${at(shortH)}: the games' page kept or clamped`).toBe(Math.min(short.pages, Math.floor((before.per * (before.page - 1)) / short.per) + 1));
    await page.setViewportSize({ width: 1366, height: tallH });
    await settled(page);
    await fits(page, `${at(tallH)} again`);
    expect(await shortForm(page), `${at(tallH)} again: the tall form`).toBe(false);
    await expect(pane(page).getByTestId("champion-preview-pairing")).toHaveAttribute("data-champion", "Nasus");
    const back = await region(page, "games");
    expect(back.page).toBeGreaterThanOrEqual(1);
    expect(back.page).toBeLessThanOrEqual(back.pages);
  }
  // The sidebar folded across the narrow section's edge at 1366 × 750: short open (a 65.4rem section), tall folded (76.9rem).
  await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, [1366, 750], "expanded");
  expect(await shortForm(page), "1366x750 open: the short form (a narrow section)").toBe(true);
  await fits(page, "1366x750 open");
  await page.getByTestId("sidebar-toggle").click();
  await page.waitForTimeout(400);
  await settled(page);
  await fits(page, "1366x750 folded");
  expect(await shortForm(page), "1366x750 folded: the tall form").toBe(false);
  await expect(pane(page).getByTestId("champion-preview-pairing")).toHaveAttribute("data-champion", "Nasus");
});

test("a larger browser text size: the page's own rem decides the short form (an 18px root at 1366 × 768, and under 48 of it in a narrow section), and the workspace window where the section is narrower", async ({ page }) => {
  await page.addInitScript(() => {
    const add = () => {
      if (!document.head) return false;
      const style = document.createElement("style");
      style.textContent = "html{font-size:18px!important}";
      document.head.appendChild(style);
      return true;
    };
    if (!add()) new MutationObserver((_, o) => add() && o.disconnect()).observe(document, { childList: true, subtree: true });
  });
  // 768 / 18 = 42.7 of its rem: the workspace (768 ≥ 41 × 18), short by the page's own check (the CSS bands say tall).
  await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, [1366, 768], "collapsed");
  await expect(page.locator("[data-workspace][data-ws-short]")).toHaveCount(1);
  expect(await shortForm(page), "1366x768 folded at 18px: the short form").toBe(true);
  await fits(page, "1366x768 folded at 18px");
  // The sidebar open: the section is 58 of its rem, under the pane's 64.75: the workspace window.
  await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, [1366, 768], "expanded");
  await expect(wsBody(page)).toBeVisible();
  expect(await shortForm(page, "dialog[open] [data-preview-pane]"), "1366x768 open at 18px: the short form in the window").toBe(true);
  await fitsWindow(page, "1366x768 open at 18px");
  // A narrow section at 18px (1560px open: 66.7 of its rem) under 48 of its rem (840px: 46.7) takes the short form by the
  // page's own check ([data-ws-short-narrow]; the CSS's first band cannot reach 1560px); at 870px (48.3) the tall form.
  await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, [1560, 840], "expanded");
  await expect(page.locator("[data-workspace][data-ws-short-narrow]:not([data-ws-short])")).toHaveCount(1);
  expect(await shortForm(page), "1560x840 open at 18px: the short form (a narrow section)").toBe(true);
  await fits(page, "1560x840 open at 18px");
  await open(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, [1560, 870], "expanded");
  expect(await shortForm(page), "1560x870 open at 18px: the tall form").toBe(false);
  await fits(page, "1560x870 open at 18px");
});

test("the workspace window (1280–1355px with the sidebar open): the pane's content paged inside it, nothing scrolling; every record through its pages; Escape, Back, ‹ › and the focus kept inside", async ({ page }) => {
  test.setTimeout(360_000);
  for (const size of [
    [1280, 689],
    [1280, 800],
    [1340, 720],
  ] as Array<[number, number]>) {
    const at = cfg(size, "expanded");
    for (const [state, path, region0] of [
      ["Ambessa", `${top}?champion=Ambessa&crole=TOP`, "opponents"],
      ["Ambessa vs Darius", `${top}?champion=Ambessa&crole=TOP&vs=Darius`, "games"],
      ["Aatrox vs Darius", `${top}?champion=Aatrox&crole=TOP&vs=Darius`, "games"],
      ["Sion", `${sub}?champion=Sion&crole=TOP`, "opponents"],
      ["Sion vs Nasus", `${sub}?champion=Sion&crole=TOP&vs=Nasus`, "games"],
    ] as const) {
      await open(page, path, size, "expanded");
      await expect(wsBody(page), `${at} ${state}`).toBeVisible();
      await expect(wsBody(page).locator(`[data-ws-region=${region0}]`)).toBeVisible();
      await expect(pane(page)).toHaveCount(0);
      await fitsWindow(page, `${at} ${state}`);
      expect(await pageHeight(page), `${at} ${state}: no document scroll`).toBeLessThanOrEqual(size[1]);
      // The list paged under it.
      await expect(listCard(page)).toHaveAttribute("data-ws-region", "list");
      expect((await region(page, "list")).per, `${at} ${state}: the list paged`).toBeGreaterThan(0);
    }
  }
  // Every record through the pages inside the window: Ambessa's 40 opponents (Most games), Darius's 9 games.
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1280, 689], "expanded");
  const ids = new Set<string>();
  const opp = await walk(page, "opponents", "opponents-next", async () => (await wsBody(page).locator("[data-testid=champion-preview-opponent]:visible").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.champion!))).map((id) => ({ id, games: 0, small: false })));
  for (const p of opp.pages) for (const x of p) if (x !== "divider") ids.add(x.id);
  expect(ids.size, "every opponent through the window's pages").toBe(40);
  expect(opp.meta.at(-1)!.page).toBe(opp.meta[0]!.pages);
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1280, 689], "expanded");
  await openOpponent(page, "Darius", wsBody(page));
  await fitsWindow(page, "1280x689 Darius");
  expect((await region(page, "games")).total).toBe(9);
  const seen = await walk(page, "games", "games-next", async () =>
    (await wsBody(page).locator("[data-testid=champion-preview-game]:visible").evaluateAll((els) => els.map((e) => e.closest("li")!.getAttribute("aria-posinset")!))).map((id) => ({ id, games: 0, small: false })),
  );
  expect(new Set(seen.pages.flat().map((x) => (x === "divider" ? "" : x.id))).size, "every game of Darius's through the window's pages").toBe(9);

  // Escape, innermost first: Darius's games back to the grid on its page, the window still open, the focus on Darius's cell.
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1280, 689], "expanded");
  await openOpponent(page, "Darius", wsBody(page));
  await page.keyboard.press("Escape");
  await expect(wsBody(page).getByTestId("champion-preview-opponent-list")).toBeVisible();
  await expect(wsBody(page).locator('[data-opponent-row="Darius"]')).toBeFocused();
  await expect(wsWindow(page)).toBeVisible();
  // Again: closed, the focus on Ambessa's row.
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open][data-testid=champion-preview]")).toHaveCount(0);
  await expect(listCard(page).locator('[data-champion="Ambessa"] [data-open-champion]')).toBeFocused();
  // Back closes it.
  await listCard(page).locator('[data-champion="Ambessa"] [data-open-champion]').click();
  await expect(wsBody(page)).toBeVisible();
  await settled(page);
  await page.goBack();
  await expect(page.locator("dialog[open][data-testid=champion-preview]")).toHaveCount(0);
  // P1's › steps to the next champion: the window stays, its content the next champion, the list's page following.
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1280, 689], "expanded");
  const per = (await region(page, "list")).per;
  await expect(listCard(page).locator("[data-testid=top-champion]").first()).toHaveAttribute("data-champion", "Ambessa");
  let shown = "Ambessa";
  for (let i = 1; i <= per; i++) {
    await wsBody(page).getByTestId("champion-preview-next").click();
    await expect(page.getByTestId("champion-preview-content")).not.toHaveAttribute("data-champion", shown);
    shown = (await page.getByTestId("champion-preview-content").getAttribute("data-champion"))!;
  }
  await expect.poll(async () => (await region(page, "list")).page, "the list's page follows the champion stepped to").toBe(2);
  await expect(listCard(page).locator(`[data-testid=top-champion][data-champion="${shown}"]`)).toHaveAttribute("data-selected", "true");
  await expect(wsWindow(page)).toBeVisible();
  await expect(wsBody(page).getByTestId("champion-preview-next")).toBeFocused();
  await settled(page);
  await fitsWindow(page, "1280x689 after ›");
  // Tab from P1's Close through the window and round again: the focus never leaves it.
  await wsBody(page).getByTestId("champion-preview-close").focus();
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const el = document.activeElement;
      return !el || el === document.body || !!el.closest("dialog[open][data-testid=champion-preview]");
    });
    expect(inside, `Tab ${i + 1}: the focus inside the window`).toBe(true);
  }
  // Folded at 1280 × 800: the pane, no window.
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1280, 800], "collapsed");
  await expect(pane(page)).toBeVisible();
  await expect(page.locator("dialog[open][data-testid=champion-preview]")).toHaveCount(0);
});

test("the workspace window ends at 1355px with the sidebar open (the pane from 1356), reads the champion each ‹ › steps to, and has the pane's surface", async ({ page }) => {
  // Its band: a section under 64.75rem (1355px open: 64.69rem), the pane from 1356 (64.75rem), the narrowest panes there.
  for (const [w, inWindow] of [
    [1354, true],
    [1355, true],
    [1356, false],
    [1359, false],
  ] as const) {
    await open(page, `${top}?champion=Ambessa&crole=TOP`, [w, 700], "expanded");
    const at = `${w}x700 open`;
    if (inWindow) {
      await expect(wsBody(page), `${at}: the workspace window`).toBeVisible();
      await expect(pane(page)).toHaveCount(0);
      await fitsWindow(page, at);
    } else {
      await expect(pane(page), `${at}: the pane`).toBeVisible();
      await expect(page.locator("dialog[open][data-testid=champion-preview]")).toHaveCount(0);
      await fits(page, at);
    }
  }
  // ‹ › in the window: its live region stays (it is not inside the keyed body that cross-fades), and its words change in
  // place, so a screen reader reads the champion stepped to (a live region inserted with its words is never read), as in the
  // pane. Until 28 Nov 2026 it was remounted with each champion and nothing was read.
  for (const [size, where] of [
    [[1280, 689], "dialog[open][data-testid=champion-preview]"],
    [[1366, 768], "aside[data-preview-pane]"],
  ] as Array<[[number, number], string]>) {
    await open(page, `${top}?champion=Ambessa&crole=TOP`, size, "expanded");
    const live = page.locator(`${where} [data-testid=champion-preview-announce]`);
    await expect(live).toHaveCount(1);
    await expect(live).toHaveAttribute("aria-live", "polite");
    await live.evaluate((el) => {
      const w = window as unknown as { __live: Element; __heard: string[] };
      w.__live = el;
      w.__heard = [];
      new MutationObserver(() => w.__heard.push(el.textContent ?? "")).observe(el, { childList: true, characterData: true, subtree: true });
    });
    const before = (await live.textContent())!;
    expect(before).toContain("Ambessa");
    await page.locator(`${where} [data-testid=champion-preview-next]`).click();
    await expect(page.getByTestId("champion-preview-content")).not.toHaveAttribute("data-champion", "Ambessa");
    const after = await page.evaluate(() => {
      const w = window as unknown as { __live: Element; __heard: string[] };
      return { connected: w.__live.isConnected, text: w.__live.textContent ?? "", heard: w.__heard };
    });
    const at = `${size.join("x")} open`;
    expect(after.connected, `${at}: the same live region after ›`).toBe(true);
    expect(after.text, `${at}: its words the next champion's`).not.toBe(before);
    expect(after.heard.at(-1), `${at}: its words changed in place (read)`).toBe(after.text);
  }
  // The window's surface is the pane's (panel-depth: its sheen, its top hairline and its soft shadow), not shadow-2xl over it:
  // both set box-shadow, and the stylesheet's order gave the window shadow-2xl's until 28 Nov 2026.
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1366, 768], "expanded");
  const paneLook = await pane(page).evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, image: getComputedStyle(el).backgroundImage }));
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1280, 689], "expanded");
  const windowLook = await wsWindow(page).evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, image: getComputedStyle(el).backgroundImage }));
  expect(paneLook.shadow, "the pane's panel-depth: an inset hairline").toContain("inset");
  expect(windowLook, "the workspace window's surface: the pane's").toEqual(paneLook);
});

test("the section's parts are spaced by a gap, not margins: an open match window, the workspace window and the first paint leave the frame its full height", async ({ page }) => {
  const layout = () =>
    page.evaluate(() => {
      const pad = parseFloat(getComputedStyle(document.getElementById("content")!).paddingBottom);
      const el = document.querySelector<HTMLElement>("[data-testid=all-champions-layout]")!;
      const cards = [...document.querySelectorAll<HTMLElement>("[data-testid=all-champions-table], aside[data-preview-pane]")].filter((c) => c.getBoundingClientRect().height > 0);
      return { margin: parseFloat(getComputedStyle(el).marginBottom), bottoms: cards.map((c) => Math.round(c.getBoundingClientRect().bottom)), limit: Math.round(innerHeight - pad), height: document.documentElement.scrollHeight, window: innerHeight };
    });
  // A game's window over the pane.
  await open(page, `${top}?champion=Ambessa&crole=TOP&vs=Mordekaiser`, [1920, 1080], "expanded");
  const before = await layout();
  await pane(page).getByTestId("champion-preview-game").first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  const behind = await layout();
  expect(behind.margin).toBe(0);
  expect(behind.bottoms, "the cards keep the frame's foot behind the match window").toEqual(before.bottoms);
  for (const b of behind.bottoms) expect(b).toBe(behind.limit);
  // The workspace window over the paged list (1280 × 800, the sidebar open).
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1280, 800], "expanded");
  await expect(wsBody(page)).toBeVisible();
  const windowed = await layout();
  expect(windowed.margin).toBe(0);
  expect(windowed.bottoms, "the list reaches the frame's foot under the workspace window").toEqual([windowed.limit]);
  // The first paint with the flow's legend after the layout (a champion with multikills from some games only).
  const { first } = await firstPaintThenHydrated(page, `${sub}?champion=Sion&crole=TOP&vs=Nasus`, [1366, 736], "expanded", layout);
  expect(first.margin).toBe(0);
  expect(first.height).toBeLessThanOrEqual(first.window);
});

test("closing the champion after paging the list away from it: the focus on the page shown (Close, Escape, Back), never the page's body", async ({ page }) => {
  for (const how of ["Close", "Escape", "Back"] as const) {
    await open(page, top, [1366, 768], "expanded");
    await rowsOnPage(page).first().getByTestId("open-champion").click();
    await expect(pane(page)).toBeVisible();
    await page.getByTestId("all-champions-next").click();
    await expect.poll(async () => (await region(page, "list")).page).toBe(2);
    await expect(listCard(page).locator('[data-champion="Ambessa"]')).toHaveCount(0);
    if (how === "Close") await pane(page).getByTestId("champion-preview-close").click();
    else if (how === "Escape") {
      await page.locator("#champion-preview-title").focus();
      await page.keyboard.press("Escape");
    } else {
      await pane(page).getByTestId("champion-preview-close").focus();
      await page.goBack();
    }
    await expect(pane(page)).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[data-testid=all-champions-table] [data-testid=top-champion]")), `${how}: a row of the page shown`).toBe(true);
    expect((await region(page, "list")).page, `${how}: the list on its page`).toBe(2);
  }
});

test("each opponent and game says its place on the whole list; the small-sample divider is read as the next cell's description, not as an item", async ({ page }) => {
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1366, 768], "expanded");
  const per = (await region(page, "opponents")).per;
  await pane(page).getByTestId("opponents-next").click();
  await expect.poll(async () => (await region(page, "opponents")).page).toBe(2);
  await expect(cells(page).first()).toHaveAttribute("aria-posinset", String(per + 1));
  await expect(cells(page).first()).toHaveAttribute("aria-setsize", "40");
  // The win-rate order: on a page with the divider, it is hidden as an item and describes the cell after it.
  await pane(page).getByTestId("opponent-sort-high").click();
  for (let n = 0; n < 6 && !(await pane(page).getByTestId("champion-preview-small-divider").count()); n++) await pane(page).getByTestId("opponents-next").click();
  const divider = pane(page).getByTestId("champion-preview-small-divider").first();
  await expect(divider).toHaveAttribute("aria-hidden", "true");
  const id = (await divider.getAttribute("id"))!;
  expect(await divider.evaluate((el) => (el.nextElementSibling?.querySelector("button") as HTMLElement | null)?.getAttribute("aria-describedby"))).toBe(id);
  const places = await pane(page)
    .locator("[data-testid=champion-preview-opponent-list] > li:not([aria-hidden])")
    .evaluateAll((els) => els.map((e) => [e.getAttribute("aria-posinset"), e.getAttribute("aria-setsize")]));
  for (const [pos, size] of places) {
    expect(Number(pos)).toBeGreaterThan(0);
    expect(size).toBe("40");
  }
  // An opponent's games.
  await pane(page).getByTestId("opponent-sort-games").click();
  await openOpponent(page, "Darius");
  const games = await pane(page)
    .locator("[data-testid=champion-preview-games] > li")
    .evaluateAll((els) => els.map((e) => `${e.getAttribute("aria-posinset")}/${e.getAttribute("aria-setsize")}`));
  expect(games[0]).toBe("1/9");
  expect(games.every((g) => g.endsWith("/9"))).toBe(true);
});

test("a zoom across the workspace's gate keeps the focus: an opponent's cell becomes its row in the flow and its cell again; a control that has no counterpart leaves it on an opponent", async ({ page }) => {
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1366, 768], "expanded");
  await pane(page).locator('[data-opponent-row="Garen"]').focus();
  await page.setViewportSize({ width: 1242, height: 698 });
  await expect.poll(() => page.evaluate(() => !!document.querySelector("[data-workspace]"))).toBe(false);
  await expect.poll(() => active(page), "110% zoom: Garen's row in the flow").toBe("cell:Garen");
  await page.setViewportSize({ width: 1366, height: 768 });
  await settled(page);
  await expect.poll(() => active(page), "back at 100%: Garen's cell").toBe("cell:Garen");
  await pane(page).getByTestId("opponents-next").focus();
  await page.setViewportSize({ width: 1242, height: 698 });
  await expect.poll(() => page.evaluate(() => !!document.querySelector("[data-workspace]"))).toBe(false);
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[data-testid=champion-preview-opponents]")), "the pager gone: the focus stays in the opponents").toBe(true);
});

test("the pane's ‹ › step from champion to champion and keep the focus on the arrow pressed", async ({ page }) => {
  await open(page, top, [1366, 768], "expanded");
  const order = await rowsOnPage(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.champion!));
  await rowsOnPage(page).first().getByTestId("open-champion").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", order[0]!);
  await pane(page).getByTestId("champion-preview-next").focus();
  for (let i = 1; i <= 3; i++) {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", order[i]!);
    await expect(pane(page).getByTestId("champion-preview-next"), `step ${i}: the focus on ›`).toBeFocused();
  }
  await page.keyboard.press("Shift+Tab");
  await expect(pane(page).getByTestId("champion-preview-prev")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", order[2]!);
  await expect(pane(page).getByTestId("champion-preview-prev")).toBeFocused();
});
