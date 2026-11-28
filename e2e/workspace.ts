import { chromium } from "@playwright/test";
import { slotPages } from "../src/components/ui/row-budget";
import { expect, type Page } from "./test";
import { widenText } from "./wide-text";

/*
  The one-screen workspace's browser checks, shared by every page's spec and the platform spec
  (e2e/one-screen.spec.ts; docs/RESPONSIVE.md, "One-screen desktop pages"). Lifted from All Champions'
  own spec (e2e/all-champions-workspace.spec.ts, which keeps its own copies until it moves onto these)
  and read through the data contract (ui/workspace.tsx): data-workspace on a workspace section,
  data-ws-card on a card that reaches the frame's foot, data-ws-foot on its footer, data-ws-row on a
  measured row, data-ws-region with data-per, data-page, data-pages and data-total on a paged list
  (and data-divider on a paged grid whose pages draw a divider slot: usePagedGrid's `divider`).

  The promise held (fits): the page is the window (scrollHeight ≤ innerHeight, nothing wider than it);
  every card ends above #content's bottom padding, and everything a card draws lies inside it (a long
  cell or label would overlap the pane beside it: All Champions' own rule); a paged list's last row
  ends at least MARGIN px above its footer; nothing in #content scrolls on its own; nothing a reader
  needs (text, a control, a picture) is clipped by an overflow, whether it lies past its clipping
  ancestor or is a text's own lines cut by a fixed height or a line clamp (read-out-only text and an
  aria-hidden decoration aside); no truncation in #content cuts its text; nothing a reader needs is
  drawn off the screen (the page cannot scroll to it); no text under the 12px floor (a small tile's
  letters, an uppercase label's 11px and a chart's text aside: globals.css); and every region has a
  page size, its pages the ones its rows and its divider make (pageSizes).

  Nothing here names a person: pages are reached by role, and messages hold sizes and counts only.
*/

export type Size = [number, number];
export type Side = "expanded" | "collapsed";

/** The owner's four desktop sizes (27 Nov 2026). */
export const OWNER_SIZES: Size[] = [
  [1366, 768],
  [1440, 900],
  [1648, 900],
  [1920, 1080],
];
export const SIDES: readonly Side[] = ["expanded", "collapsed"];
/** The owner's eight configurations: each size with the sidebar open and folded. */
export const OWNER_CONFIGS: ReadonlyArray<{ size: Size; side: Side }> = SIDES.flatMap((side) => OWNER_SIZES.map((size) => ({ size, side })));
/** The gate's floor: 41rem tall, a 1366 × 768 laptop's browser window (about 1366 × 657). */
export const FLOOR: Size = [1366, 657];
/** Sizes at the workspace's edges: the short form's bound (46rem), the floor, the narrow section. */
export const EDGE_SIZES = { short: [1366, 736] as Size, floor: FLOOR, narrow: [1280, 800] as Size };
/** The least room between a list's last row and its footer (docs/STANDARDS.md, "A layout held to a measure keeps a margin"). */
export const MARGIN = 12;

/** The suite's server (playwright.config.ts). */
export const BASE = `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 3199)}`;

/** A configuration's name in messages and screenshots: "1366x768 expanded". */
export const cfg = ([w, h]: Size, side: Side) => `${w}x${h} ${side}`;

/**
 * Opens `path` at `size` with the sidebar `side` (its state is the server's: its cookie), Admin Mode's
 * view for `admin`, and any other cookies; then waits for the page to settle.
 */
export async function openAt(page: Page, path: string, size: Size, side: Side, o: { admin?: boolean; cookies?: Record<string, string>; base?: string } = {}) {
  const base = o.base ?? BASE;
  await page.setViewportSize({ width: size[0], height: size[1] });
  const cookies = { uniiverse_sidebar: side, ...(o.admin ? { uniiverse_view: "admin" } : {}), ...(o.cookies ?? {}) };
  await page.context().addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url: base })));
  await page.goto(`${base}${path}`, { waitUntil: "load" });
  await settled(page);
}

/** Resizes the open page in place (the sidebar unchanged), then waits for it to settle. */
export async function resizeTo(page: Page, size: Size) {
  await page.setViewportSize({ width: size[0], height: size[1] });
  await settled(page);
}

export interface RegionPage {
  region: string;
  per: number;
  page: number;
  pages: number;
  total: number;
  /** A paged grid's divider slot: the row it stands before (data-divider), or null. */
  divider: number | null;
}

/**
 * The rows each page holds for `total` rows of `per` slots a page (pure: the same pages as the list's,
 * row-budget.ts's slotPages): ceil(total / per) pages of `per` rows, but a divider (`divider`: the row it
 * stands before) takes a slot of the page it is on and of every page after it, and a page ends a slot
 * early rather than end on it. 7 rows, a divider before row 3, 4 slots a page: 3, 3 and 1 rows.
 */
export function pageSizes(total: number, per: number, divider: number | null = null): number[] {
  return slotPages(Array.from({ length: Math.max(0, total) }, (_, i) => i), per, divider).map((p) => p.filter((slot) => slot.kind === "row").length);
}

/** The regions' pages as drawn: data-per, data-page, data-pages, data-total and data-divider of each drawn [data-ws-region]. */
export const regions = (page: Page): Promise<RegionPage[]> =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-ws-region]")].filter((el) => el.getBoundingClientRect().height > 0).map((el) => ({ region: el.dataset.wsRegion!, per: Number(el.dataset.per), page: Number(el.dataset.page), pages: Number(el.dataset.pages), total: Number(el.dataset.total), divider: el.dataset.divider === undefined ? null : Number(el.dataset.divider) })));

export const region = async (page: Page, name: string) => (await regions(page)).find((r) => r.region === name);

/**
 * The page settled: the fonts loaded, then two reads 250ms apart agree on every region's pages (none
 * missing a figure) and on the document's height.
 */
export async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  let last = "";
  await expect
    .poll(
      async () => {
        const drawn = await regions(page);
        const now = JSON.stringify([drawn, await page.evaluate(() => document.documentElement.scrollHeight)]);
        // Every region with its figures (a divider is null where there is none).
        const whole = drawn.every((r) => [r.per, r.page, r.pages, r.total].every(Number.isFinite));
        const same = now === last && whole;
        last = now;
        if (!same) await page.waitForTimeout(250);
        return same;
      },
      { message: "the page settled", timeout: 15_000 },
    )
    .toBe(true);
}

export interface WorkspaceMeasure {
  height: number;
  window: number;
  width: number;
  windowWidth: number;
  /** innerHeight less #content's bottom padding: where a card must end. */
  limit: number;
  bottoms: number[];
  margins: Array<number | null>;
  scrollers: string[];
  clipped: string[];
  cut: string[];
  /** A card's drawn descendants whose box goes past the card's edges (sr-only text and fixed layers aside). */
  outside: string[];
  offscreen: string[];
  small: string[];
  workspace: boolean;
  regions: RegionPage[];
  windowBox: { size: string; top: number; bottom: number; height: number; body: number; rootPx: number } | null;
}

/**
 * The page's measures (see the file's header). `cards`: the cards held to the frame's foot, each
 * holding everything it draws; `rows`: the rows whose bottom is held MARGIN above their card's footer;
 * `truncates`: the truncations that must show their text whole (every one in #content by default).
 */
export const measureWorkspace = (page: Page, o: { cards?: string; rows?: string; truncates?: string } = {}): Promise<WorkspaceMeasure> =>
  page.evaluate(({ cards: cardSel, rows: rowSel, truncates }) => {
    const root = document.documentElement;
    const content = document.getElementById("content")!;
    const pad = parseFloat(getComputedStyle(content).paddingBottom);
    // Drawn: a box, and not inside a closed <details> or a hidden layer (which keep their boxes: checkVisibility).
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true });
    };
    // Read out only (Tailwind's sr-only, at any breakpoint): a 1px box, clipped on purpose.
    const srOnly = (el: Element) => {
      for (let at: Element | null = el; at && at.id !== "content"; at = at.parentElement) {
        const s = getComputedStyle(at);
        if (s.position === "absolute" && at.clientWidth <= 1 && at.clientHeight <= 1 && (s.clipPath.startsWith("inset(50%") || s.clip.startsWith("rect(0"))) return true;
      }
      return false;
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}.${[...el.classList].slice(0, 3).join(".")}`;
    const cards = [...document.querySelectorAll<HTMLElement>(cardSel)].filter(shown);
    const inWindow = (card: Element) => !!card.closest("dialog");
    const margins = cards.map((card) => {
      const foot = [...card.querySelectorAll("[data-ws-foot]")].find(shown);
      const rows = [...card.querySelectorAll(rowSel)].filter(shown);
      if (!foot || !rows.length) return null;
      return Math.round(foot.getBoundingClientRect().top - Math.max(...rows.map((r) => r.getBoundingClientRect().bottom)));
    });
    const all = [...content.querySelectorAll<HTMLElement>("*")];
    const scrollers = all.filter((el) => {
      const s = getComputedStyle(el);
      return (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) || (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1);
    });
    // Content a reader needs: text, a control, a picture (an aria-hidden layer is decoration: a lineup's stage, a glow).
    const meaningful = (el: Element) => !el.closest("[aria-hidden=true]") && !srOnly(el) && (el.matches("a, button, input, select, textarea, img, [role=img], [tabindex]") || [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()));
    const clips = (el: Element) => {
      const s = getComputedStyle(el);
      return { x: /(hidden|clip)/.test(s.overflowX), y: /(hidden|clip)/.test(s.overflowY) };
    };
    // Text of its own (a non-empty text node directly in it).
    const ownText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    // Clipped: an element that hides or clips its overflow, with something a reader needs past its box, or its own text cut
    // (a fixed height, a line clamp: All Champions' rule, scrollHeight past clientHeight on a hiding axis). A truncation is
    // `cut`'s to report; an aria-hidden decoration is not read.
    const clipped = all.filter((el) => {
      if (!shown(el) || srOnly(el) || el.tagName === "IMG" || el.classList.contains("truncate")) return false;
      const c = clips(el);
      if (!((c.x && el.scrollWidth > el.clientWidth + 1) || (c.y && el.scrollHeight > el.clientHeight + 1))) return false;
      if (ownText(el) && !el.closest("[aria-hidden=true]")) return true;
      const box = el.getBoundingClientRect();
      return [...el.querySelectorAll("*")].some((d) => {
        if (!shown(d) || !meaningful(d)) return false;
        const r = d.getBoundingClientRect();
        return (c.x && (r.left < box.left - 1 || r.right > box.right + 1)) || (c.y && (r.top < box.top - 1 || r.bottom > box.bottom + 1));
      });
    });
    const cut = truncates ? [...document.querySelectorAll<HTMLElement>(truncates)].filter((el) => shown(el) && !srOnly(el) && el.scrollWidth > el.clientWidth + 0.5) : [];
    // Inside an element (the card's own included) that hides its overflow on an axis: text past it is not drawn (clipped reports it).
    const clippedBy = (el: Element, card: Element) => {
      for (let at: Element | null = el; at; at = at.parentElement) {
        const c = clips(at);
        if (c.x || c.y) return true;
        if (at === card) break;
      }
      return false;
    };
    // In a fixed layer (a modal window, a popover, a toast: the top layer), not in the card's own box.
    const inLayer = (el: Element, card: Element) => {
      for (let at: Element | null = el; at && at !== card; at = at.parentElement) if (getComputedStyle(at).position === "fixed") return true;
      return false;
    };
    // Outside its card: a drawn descendant whose box goes past the card's edges (All Champions' rule: a long cell or label
    // overlapping the pane or the card beside it), or whose own text does (a line that does not wrap runs past its block's box,
    // which stays the card's width: the text's own extent, read through a Range).
    const past = (r: DOMRect, c: DOMRect) => r.width > 0 && r.height > 0 && (r.left < c.left - 1 || r.right > c.right + 1 || r.top < c.top - 1 || r.bottom > c.bottom + 1);
    const textPast = (el: Element, c: DOMRect) =>
      [...el.childNodes].some((n) => {
        if (n.nodeType !== Node.TEXT_NODE || !n.textContent!.trim()) return false;
        const range = document.createRange();
        range.selectNodeContents(n);
        return past(range.getBoundingClientRect(), c);
      });
    const outside = cards.flatMap((card) => {
      const c = card.getBoundingClientRect();
      return [...card.querySelectorAll<HTMLElement>("*")]
        .filter((el) => shown(el) && !srOnly(el) && !inLayer(el, card))
        .filter((el) => past(el.getBoundingClientRect(), c) || (!el.closest(".truncate") && !clippedBy(el, card) && textPast(el, c)))
        .map((el) => `${name(card)}: ${name(el)}`);
    });
    // The part of an element its clipping ancestors leave drawn.
    const drawnBox = (el: Element) => {
      const r = el.getBoundingClientRect();
      let { left, right, top, bottom } = r;
      for (let at = el.parentElement; at && at !== document.body; at = at.parentElement) {
        const c = clips(at);
        if (!c.x && !c.y) continue;
        const b = at.getBoundingClientRect();
        if (c.x) [left, right] = [Math.max(left, b.left), Math.min(right, b.right)];
        if (c.y) [top, bottom] = [Math.max(top, b.top), Math.min(bottom, b.bottom)];
      }
      return right - left > 0.5 && bottom - top > 0.5 ? { left, right, top, bottom } : null;
    };
    // Drawn where the page cannot scroll to it: something a reader needs past the window's foot or its sides (fixed layers aside).
    const offscreen = all.filter((el) => {
      if (!shown(el) || !meaningful(el) || el.closest("dialog, [popover], [data-popover]")) return false;
      const s = getComputedStyle(el);
      if (s.position === "fixed" || s.visibility === "hidden") return false;
      const r = drawnBox(el);
      return !!r && (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.left < -1);
    });
    // Text under the 12px floor: a small tile's letters (text-4xs), an uppercase label's 11px, a chart's text and the read-out-only aside.
    const small = all.filter((el) => {
      if (!shown(el) || srOnly(el) || el.closest("svg, .text-4xs, .uppercase, .type-floor-later")) return false;
      if (![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())) return false;
      return parseFloat(getComputedStyle(el).fontSize) < 12 - 0.01;
    });
    const dialog = document.querySelector<HTMLElement>("dialog[open][data-size=workspace]");
    const body = dialog?.querySelector<HTMLElement>("[data-ws-card], [data-preview-pane]");
    return {
      height: root.scrollHeight,
      window: innerHeight,
      width: root.scrollWidth,
      windowWidth: innerWidth,
      limit: innerHeight - pad,
      bottoms: cards.filter((c) => !inWindow(c)).map((c) => c.getBoundingClientRect().bottom),
      margins,
      scrollers: scrollers.map(name),
      clipped: clipped.map((el) => `${name(el)} ${el.scrollWidth}/${el.clientWidth} ${el.scrollHeight}/${el.clientHeight}`),
      cut: cut.map(name),
      outside: outside.slice(0, 5),
      offscreen: offscreen.slice(0, 5).map((el) => `${name(el)} ${Math.round(drawnBox(el)?.bottom ?? 0)}`),
      small: small.slice(0, 5).map((el) => `${name(el)} ${getComputedStyle(el).fontSize}`),
      workspace: !!document.querySelector("[data-workspace]"),
      regions: [...document.querySelectorAll<HTMLElement>("[data-ws-region]")].filter(shown).map((el) => ({ region: el.dataset.wsRegion!, per: Number(el.dataset.per), page: Number(el.dataset.page), pages: Number(el.dataset.pages), total: Number(el.dataset.total), divider: el.dataset.divider === undefined ? null : Number(el.dataset.divider) })),
      windowBox: dialog && body ? { size: dialog.dataset.size ?? "", top: dialog.getBoundingClientRect().top, bottom: dialog.getBoundingClientRect().bottom, height: dialog.getBoundingClientRect().height, body: body.getBoundingClientRect().bottom, rootPx: parseFloat(getComputedStyle(root).fontSize) } : null,
    };
  }, { cards: o.cards ?? "[data-ws-card]", rows: o.rows ?? "[data-ws-row]", truncates: o.truncates ?? "#content .truncate" });

export interface FitsOptions {
  /** The page carries data-workspace (a workspace page); false for a page that fits by its own layout. */
  workspace?: boolean;
  /** A pager's test id that must be drawn. */
  pager?: string;
  cards?: string;
  rows?: string;
  truncates?: string;
}

/** The one-screen promise (see the file's header), at `at` ("1366x768 expanded: Team"). */
export async function fits(page: Page, at: string, o: FitsOptions = {}) {
  const m = await measureWorkspace(page, o);
  if (o.workspace) expect(m.workspace, `${at}: the workspace applied`).toBe(true);
  if (o.pager) await expect(page.getByTestId(o.pager), `${at}: its pager is drawn`).toBeVisible();
  expect(m.height, `${at}: the page is the window (no document scroll)`).toBeLessThanOrEqual(m.window);
  expect(m.width, `${at}: nothing wider than the window`).toBeLessThanOrEqual(m.windowWidth);
  for (const b of m.bottoms) expect(b, `${at}: a card ends above #content's bottom padding`).toBeLessThanOrEqual(m.limit + 0.5);
  for (const g of m.margins) if (g !== null) expect(g, `${at}: a list ends at least ${MARGIN}px above its footer`).toBeGreaterThanOrEqual(MARGIN);
  expect(m.scrollers, `${at}: nothing in #content scrolls`).toEqual([]);
  expect(m.clipped, `${at}: nothing is clipped by an overflow`).toEqual([]);
  expect(m.cut, `${at}: every truncated text whole`).toEqual([]);
  expect(m.outside, `${at}: everything inside its card`).toEqual([]);
  expect(m.offscreen, `${at}: nothing drawn off the screen`).toEqual([]);
  expect(m.small, `${at}: no text under the 12px floor`).toEqual([]);
  for (const r of m.regions) {
    expect(r.per, `${at}: ${r.region} shows a row or more a page`).toBeGreaterThanOrEqual(1);
    expect(r.page, `${at}: ${r.region}'s page exists`).toBeGreaterThanOrEqual(1);
    expect(r.page, `${at}: ${r.region}'s page exists`).toBeLessThanOrEqual(r.pages);
    expect(r.pages, `${at}: ${r.region}'s pages hold every row`).toBe(pageSizes(r.total, r.per, r.divider).length);
  }
}

/**
 * A workspace window's promise (DetailModal size="workspace"): fits() for the page and the window's
 * body, and the window inside the screen, as tall as it less 1rem above and below, its body ending at
 * its foot.
 */
export async function fitsWindow(page: Page, at: string, o: FitsOptions = {}) {
  await fits(page, at, o);
  const w = (await measureWorkspace(page, o)).windowBox;
  expect(w, `${at}: the workspace window is open`).not.toBeNull();
  const win = await page.evaluate(() => innerHeight);
  expect(w!.top, `${at}: the window inside the screen`).toBeGreaterThanOrEqual(0);
  expect(w!.bottom, `${at}: the window inside the screen`).toBeLessThanOrEqual(win);
  expect(Math.abs(w!.height - (win - 2 * w!.rootPx)), `${at}: the window as tall as the screen less 1rem above and below`).toBeLessThanOrEqual(1);
  expect(w!.body, `${at}: its body ends at its foot`).toBeLessThanOrEqual(w!.bottom + 0.5);
}

/** Walks a region's pages by its Next button until it is disabled, collecting each page's rows (`read`) and its region's figures. */
export async function walkPages<R>(page: Page, name: string, nextTestId: string, read: () => Promise<R[]>): Promise<{ pages: R[][]; meta: RegionPage[] }> {
  const pages: R[][] = [];
  const meta: RegionPage[] = [];
  for (let n = 0; n < 60; n++) {
    await settled(page);
    meta.push((await region(page, name))!);
    pages.push(await read());
    const button = page.getByTestId(nextTestId);
    if (!(await button.count()) || (await button.isDisabled())) break;
    await button.click();
    await expect.poll(async () => (await region(page, name))?.page).toBe(n + 2);
  }
  return { pages, meta };
}

/**
 * Every record once across the pages (the main promise), and each page as full as its slots allow (a
 * walk's result: rows by a key): `per` slots a page, a divider taking one on its page and on every page
 * after it, and a page ending a slot early rather than end on it (pageSizes).
 */
export function expectEveryRecord(walk: { pages: string[][]; meta: RegionPage[] }, total: number, at: string) {
  const keys = walk.pages.flat();
  expect(keys, `${at}: every record`).toHaveLength(total);
  expect(new Set(keys).size, `${at}: every record once`).toBe(total);
  const { per, divider } = walk.meta[0]!;
  const sizes = pageSizes(total, per, divider);
  expect(walk.pages, `${at}: pages of ${per} slots${divider !== null ? `, a divider before row ${divider + 1}` : ""}`).toHaveLength(sizes.length);
  for (const [i, p] of walk.pages.entries()) expect(p, `${at}: page ${i + 1} holds ${sizes[i]} rows`).toHaveLength(sizes[i]!);
}

/** Each card's page but the last is full: the room under its last row is less than a row and the guard (1rem). */
export async function pageFull(page: Page, at: string, rows = "[data-ws-row]") {
  const room = await page.evaluate((sel) => {
    return [...document.querySelectorAll("[data-ws-card]")].flatMap((card) => {
      const foot = [...card.querySelectorAll("[data-ws-foot]")].find((f) => f.getBoundingClientRect().height > 0);
      const drawn = [...card.querySelectorAll(sel)].filter((r) => r.getBoundingClientRect().height > 0);
      const region = card.closest("[data-ws-region]") ?? card.querySelector("[data-ws-region]") ?? card;
      const r = region as HTMLElement;
      if (!foot || !drawn.length || Number(r.dataset.page) >= Number(r.dataset.pages)) return [];
      const last = Math.max(...drawn.map((d) => d.getBoundingClientRect().bottom));
      const row = Math.max(...drawn.map((d) => d.getBoundingClientRect().height));
      const guard = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return [{ spare: foot.getBoundingClientRect().top - last, limit: row + guard + 1 }];
    });
  }, rows);
  for (const r of room) expect(r.spare, `${at}: a page holds every row that fits`).toBeLessThan(r.limit);
}

/** No scrollbar track drawn in #content, nor on the page, with classic scrollbars (Chromium without --hide-scrollbars). */
export async function noScrollbarTracks(paths: ReadonlyArray<{ path: string; admin?: boolean }>, configs: ReadonlyArray<{ size: Size; side: Side }>, base = BASE) {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}), ignoreDefaultArgs: ["--hide-scrollbars"] });
  try {
    for (const { size, side } of configs) {
      const context = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
      const page = await context.newPage();
      for (const p of paths) {
        await openAt(page, p.path, size, side, { admin: p.admin, base });
        const tracks = await page.evaluate(() => {
          const root = document.documentElement;
          const out = [...document.querySelectorAll<HTMLElement>("#content *")].filter((el) => {
            const s = getComputedStyle(el);
            if (!/(auto|scroll)/.test(s.overflowX + s.overflowY)) return false;
            return el.offsetWidth - el.clientWidth - (parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth)) > 1 || el.offsetHeight - el.clientHeight - (parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth)) > 1;
          });
          return { page: root.scrollHeight > innerHeight || innerWidth - root.clientWidth > 0 || innerHeight - root.clientHeight > 0, boxes: out.map((el) => el.tagName.toLowerCase() + "." + [...el.classList].slice(0, 3).join(".")) };
        });
        expect(tracks, `${cfg(size, side)} ${p.path}`).toEqual({ page: false, boxes: [] });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

/**
 * The flow where the workspace does not apply (windows under 41rem tall, a larger text size): once
 * hydrated no [data-workspace], #content not a flex column and no footer drawn. `ready`: a locator's
 * test id the flow shows.
 */
export async function flowUnchanged(page: Page, path: string, o: { admin?: boolean; base?: string; sizes?: Size[] } = {}) {
  for (const size of o.sizes ?? ([
    [1366, 640],
    [1440, 600],
  ] as Size[])) {
    await openAt(page, path, size, "expanded", { admin: o.admin, base: o.base });
    await expect
      .poll(() => page.evaluate(() => ({ workspace: !!document.querySelector("[data-workspace]"), mainFlex: getComputedStyle(document.getElementById("content")!).display === "flex" && !document.querySelector("[data-fills-height]"), foot: [...document.querySelectorAll("[data-ws-foot]")].some((f) => f.getBoundingClientRect().height > 0) })), { message: `${size.join("x")} ${path}` })
      .toEqual({ workspace: false, mainFlex: false, foot: false });
  }
}

/** CI's wider text, doubled (e2e/wide-text.ts): from now on every page this tab opens. */
export const withWideText = (page: Page) => widenText(page);

/** A demo player's profile id from the Players page (by its demo name: no person's). */
export async function demoPlayerId(page: Page, name = "Demo Top", base = BASE): Promise<string> {
  const html = await (await page.request.get(`${base}/players`)).text();
  const id = new RegExp(`data-player-name="${name.replace(/[()]/g, "\\$&")}"[^>]*href="/players/([0-9a-f-]{36})"`).exec(html)?.[1] ?? "";
  expect(id, `a demo player named ${name}`).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}
