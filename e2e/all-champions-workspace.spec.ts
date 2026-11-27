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
    const cards = [...document.querySelectorAll<HTMLElement>("[data-testid=all-champions-table], aside[data-preview-pane]")].filter(shown);
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
    return {
      height: root.scrollHeight,
      window: innerHeight,
      width: root.scrollWidth,
      windowWidth: innerWidth,
      limit: innerHeight - pad,
      bottoms: cards.map((c) => c.getBoundingClientRect().bottom),
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

const cfg = ([w, h]: [number, number], side: Side) => `${w}x${h}-${side === "expanded" ? "open" : "folded"}`;
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/ws-${name}.png`, animations: "disabled" });
const pane = (page: Page) => page.locator("aside[data-preview-pane][data-testid=champion-preview]");
const listCard = (page: Page) => page.getByTestId("all-champions-table");
const rowsOnPage = (page: Page) => listCard(page).locator("[data-testid=top-champion]:visible");
const cells = (page: Page) => pane(page).locator("[data-testid=champion-preview-opponent]:visible");
const detailTitle = (page: Page) => pane(page).locator("[data-testid=champion-preview-pairing] h4");
const pageHeight = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight);

/** Clicks an opponent's cell, again until the page is interactive (a click before hydration does nothing). */
async function openOpponent(page: Page, id: string) {
  await expect(async () => {
    if (!(await detailTitle(page).count())) await pane(page).locator(`[data-opponent-row="${id}"]`).click({ timeout: 2_000 });
    await expect(pane(page).getByTestId("champion-preview-pairing")).toHaveAttribute("data-champion", id, { timeout: 1_000 });
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

test("1366 × 736 and 1280 × 800: one screen; 1280 × 800 with the sidebar open opens the preview in the sheet over the paged list", async ({ page }) => {
  for (const side of SIDES) {
    for (const path of [top, `${top}?champion=Ambessa&crole=TOP`, `${top}?champion=Ambessa&crole=TOP&vs=Darius`, `${sub}?champion=Sion&crole=TOP&vs=Nasus`]) {
      await open(page, path, [1366, 736], side);
      await fits(page, `1366x736 ${side} ${path.split("?")[1] ?? "list"}`);
    }
    await open(page, top, [1280, 800], side);
    await fits(page, `1280x800 ${side} list`);
  }
  // Folded: the pane; open: the sheet (a section under 64.75rem), the list paged under it.
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1280, 800], "collapsed");
  await expect(pane(page)).toBeVisible();
  await fits(page, "1280x800 folded A");
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1280, 800], "expanded");
  await expect(page.locator("dialog[open][data-testid=champion-preview]")).toBeVisible();
  await expect(pane(page)).toHaveCount(0);
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

test("with CI's wider text: the list, Ambessa, Darius and Sion still fit, with the margin", async ({ page }) => {
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

test("shorter desktop windows keep the workspace with fewer rows (a laptop's browser window): the list, Ambessa, Darius and Aatrox fit; a champion of several positions with an opponent open keeps one game a column, nothing hidden", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [size, side] of [
    [[1366, 657], "expanded"],
    [[1366, 657], "collapsed"],
    [[1536, 730], "expanded"],
    [[1600, 772], "collapsed"],
    [[1648, 789], "expanded"],
  ] as Array<[[number, number], Side]>) {
    const at = cfg(size, side);
    for (const path of [top, `${top}?champion=Ambessa&crole=TOP`, `${top}?champion=Ambessa&crole=TOP&vs=Darius`, `${top}?champion=Aatrox&crole=TOP`]) {
      await open(page, path, size, side);
      await fits(page, `${at} ${path.split("?")[1] ?? "list"}`);
    }
    // Several positions with an opponent open: the floor (one game a column); in the shortest windows the page grows by
    // what that row lacks, and nothing is clipped, scrolls inside or is out of reach.
    for (const path of [`${top}?champion=Aatrox&crole=TOP&vs=Darius`, `${sub}?champion=Sion&crole=TOP&vs=Nasus`]) {
      await open(page, path, size, side);
      const m = await measure(page);
      const games = await region(page, "games");
      expect(m.workspace, `${at} ${path}: the workspace`).toBe(true);
      expect(games.per, `${at} ${path}: at least a game a column`).toBeGreaterThanOrEqual(2);
      if (m.height > m.window) expect(games.per, `${at} ${path}: the page grows only at the floor`).toBe(2);
      expect(m.height - m.window, `${at} ${path}: by less than a row and the bands`).toBeLessThan(64);
      expect(m.scrollers).toEqual([]);
      expect(m.clipped).toEqual([]);
      expect(m.outside).toEqual([]);
      expect(m.kda).toEqual([]);
    }
  }
});

test("the section's parts are spaced by a gap, not margins: an open match window, the sheet and the first paint leave the frame its full height", async ({ page }) => {
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
  // The sheet over the paged list (1280 × 800, the sidebar open).
  await open(page, `${top}?champion=Ambessa&crole=TOP`, [1280, 800], "expanded");
  await expect(page.locator("dialog[open][data-testid=champion-preview]")).toBeVisible();
  const sheet = await layout();
  expect(sheet.margin).toBe(0);
  expect(sheet.bottoms, "the list reaches the frame's foot under the sheet").toEqual([sheet.limit]);
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
