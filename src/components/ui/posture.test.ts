import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WS_MIN_HEIGHT_REM, WS_NARROW_SECTION_REM, WS_QUERY, WS_SHORT_NARROW_QUERY, WS_SHORT_NARROW_REM, WS_SHORT_QUERY, WS_SHORT_REM, workspaceNow, workspaceShortNarrowNow, workspaceShortNow } from "./posture";
import { WS_PANE_SECTION_REM, WS_TIER_ROWS } from "@/components/players/all-champions";

/*
  All Champions' one-screen workspace (docs/RESPONSIVE.md, "All Champions' workspace"): the CSS gate
  (globals.css, the `ws` and `ws-host` variants) and the page's own check (posture.ts, WS_QUERY) are
  the same string, so the server's first paint and the hydrated page agree; and the first paint's
  rows (WS_TIER_ROWS, drawn before the page can measure) are fewer than fit at the smallest window of
  each tier in every band of widths, so hydration only adds rows below them.
*/

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
/** The text of a variant's `index`th @media block (its first by default). */
const mediaOf = (variant: string, index = 0) => {
  const at = css.indexOf(`@custom-variant ${variant} {`);
  expect(at, variant).toBeGreaterThan(-1);
  // The variant's own body: up to the next variant.
  const next = css.indexOf("@custom-variant ", at + 1);
  const body = css.slice(at, next < 0 ? undefined : next);
  const m = [...body.matchAll(/@media ([^{]+)\{/g)][index];
  expect(m, `${variant}'s @media block ${index}`).toBeDefined();
  return m![1]!.trim();
};

describe("the workspace's gate", () => {
  it("is one string in the CSS (ws, ws-host) and in the page's own check (WS_QUERY)", () => {
    expect(mediaOf("ws")).toBe(WS_QUERY);
    expect(mediaOf("ws-host")).toBe(WS_QUERY);
  });

  const root = (w: number) => Math.min(22, Math.max(16, 16 + (w - 1536) * 0.0045));
  const bands = [...WS_QUERY.matchAll(/\(pointer: fine\) and \(min-width: ([\d.]+)(rem|px)\)(?: and \(max-width: (\d+)px\))? and \(min-height: (\d+)px\)/g)].map(([, min, unit, max, height]) => ({ min: unit === "rem" ? Number(min) * 16 : Number(min), max: max ? Number(max) : null, height: Number(height) }));

  it("asks a fine pointer, 80rem of width and, per band of widths, 41 of the band's widest root", () => {
    expect(WS_MIN_HEIGHT_REM).toBe(41);
    expect(bands).toHaveLength(10);
    for (const { max, height } of bands) {
      const widest = max ? root(max) : 22;
      // At least 41 of the band's widest root (rounded up to the pixel), so the page's own check never disagrees inside the band.
      expect(height, `band to ${max ?? "∞"}`).toBeGreaterThanOrEqual(WS_MIN_HEIGHT_REM * widest - 0.5);
      expect(height, `band to ${max ?? "∞"}`).toBeLessThanOrEqual(WS_MIN_HEIGHT_REM * widest + 1);
    }
  });

  it("leaves no width uncovered (each band includes its upper edge) and rejects few windows the page's own root check would take", () => {
    expect(bands[0]!.min).toBe(1280);
    for (let i = 1; i < bands.length; i++) expect(bands[i]!.min, `band ${i} starts where the one before ends`).toBe(bands[i - 1]!.max);
    expect(bands.at(-1)!.max).toBeNull();
    // From 1536 to 1920px a band is 64px wide: at its narrowest width the CSS asks at most 13px more than the root check.
    for (const { min, max, height } of bands) if (max !== null && max <= 1920) expect(height - (WS_MIN_HEIGHT_REM * root(min) - 0.5), `band ${min}–${max}`).toBeLessThanOrEqual(13);
  });

  it("takes the short laptop windows the owner's request names (a browser window inside a 1366 × 768 or 1920 × 1080 at 125% screen), and leaves 1366 × 640 to the flow", () => {
    const takes = (w: number, h: number) => bands.some((b) => w >= b.min && (b.max === null || w <= b.max) && h >= b.height) && h >= WS_MIN_HEIGHT_REM * root(w) - 0.5;
    expect(takes(1366, 657)).toBe(true);
    expect(takes(1536, 730)).toBe(true);
    expect(takes(1600, 772)).toBe(true);
    expect(takes(1648, 760)).toBe(true);
    expect(takes(1536, 790)).toBe(true);
    expect(takes(1920, 937)).toBe(true);
    expect(takes(1366, 640)).toBe(false);
    expect(takes(1279, 900)).toBe(false);
  });
});

/*
  The champion list's arithmetic (docs/RESPONSIVE.md, "All Champions' workspace"; map3 §6), with the
  page's own sizes: #content's padding 1.75rem top and bottom; the profile band 5.25rem and its border
  (min(6.5rem, 120px) in windows 1000px tall or more); the tabs 2.75rem with 0.375rem above and below;
  the section's one-line header 2.25rem and its 0.75rem gap; the card's two borders; its toolbar
  (57px at 16px), heading row (39), footer (44) and the guard (16), each scaling with the root; rows
  of 51px, the last a pixel shorter (no divider).
*/
function rowsThatFit(w: number, h: number): number {
  const r = Math.min(22, Math.max(16, 16 + (w - 1536) * 0.0045));
  const s = r / 16;
  const band = (h >= 1000 ? Math.min(6.5 * r, 120) : 5.25 * r) + 2;
  const top = 1.75 * r + band + 0.375 * r + 2.75 * r + 0.375 * r + 2.25 * r + 0.75 * r;
  const frame = h - 1.75 * r - top;
  const room = frame - 2 - (57 + 39 + 44 + 16) * s;
  return Math.floor((room + 1) / (51 * s));
}

describe("the workspace's first paint (WS_TIER_ROWS)", () => {
  // Each tier's smallest window in every band of widths (globals.css: the ws gate, board-at-mid, board-at-tall).
  const tiers: Array<[keyof typeof WS_TIER_ROWS, Array<[number, number]>]> = [
    ["gate", [[1280, 656], [1536, 656], [1536, 668], [1600, 680], [1664, 691], [1728, 703], [1792, 715], [1856, 727], [1920, 786], [2240, 845], [2560, 902]]],
    ["mid", [[1535, 856], [1800, 920], [1920, 929], [2560, 1080], [2561, 1153]]],
    ["tall", [[1535, 975], [1800, 1047], [1920, 1072], [2560, 1246], [2561, 1331]]],
  ];
  it("draws one row fewer than fit at each tier's smallest window, in every band", () => {
    for (const [tier, windows] of tiers) for (const [w, h] of windows) expect(WS_TIER_ROWS[tier], `${tier} at ${w} × ${h}`).toBeLessThan(rowsThatFit(w, h));
  });
  it("matches the measured counts at the owner's sizes (map3 §6: 7, 9, 9 and 10 rows)", () => {
    expect(rowsThatFit(1366, 768)).toBe(7);
    expect(rowsThatFit(1440, 900)).toBe(9);
    expect(rowsThatFit(1648, 900)).toBe(9);
    expect(rowsThatFit(1920, 1080)).toBe(10);
  });
});

/*
  The short form (docs/RESPONSIVE.md, "All Champions' workspace", the short form; globals.css, the
  `ws-short` and `ws-short-host` variants): bands of widths inside the `ws` gate's (64px wide from 1536 up,
  so a bound is never more than 14px past the page's own 46rem; until 28 Nov 2026 the bands from 1920 were
  the gate's 320px and reached 66px past it), each with an upper height of 46 of the band's widest root
  rounded up to the pixel (less 0.02, so the bound itself is tall); a second block for the page's own check
  ([data-ws-short] under the ws gate); and, in a narrow section only (a container query), the same under
  48 rem: the first band's media query and the page's own check ([data-ws-short-narrow]).
*/
describe("the workspace's short form", () => {
  const root = (w: number) => Math.min(22, Math.max(16, 16 + (w - 1536) * 0.0045));
  const clause = /\(pointer: fine\) and \(min-width: ([\d.]+)(rem|px)\)(?: and \(max-width: (\d+)px\))? and \(min-height: (\d+)px\)(?: and \(max-height: ([\d.]+)px\))?/g;
  const parse = (q: string) => [...q.matchAll(clause)].map(([, min, unit, max, height, top]) => ({ min: unit === "rem" ? Number(min) * 16 : Number(min), max: max ? Number(max) : null, height: Number(height), top: top ? Number(top) : null }));
  /** A media query of these clauses at a window (media queries read rem at 16px, whatever the root). */
  const matches = (q: string, w: number, h: number) => parse(q).some((b) => w >= b.min && (b.max === null || w <= b.max) && h >= b.height && (b.top === null || h <= b.top));
  /** The text of a variant's body (its blocks, nested rules included). */
  const bodyOf = (variant: string) => {
    const at = css.indexOf(`@custom-variant ${variant} {`);
    const next = css.indexOf("@custom-variant ", at + 1);
    return css.slice(at, next < 0 ? undefined : next);
  };

  it("is one string in the CSS (ws-short, ws-short-host) and in the page's own checks (WS_SHORT_QUERY, WS_SHORT_NARROW_QUERY); the page's blocks are the ws gate", () => {
    expect(mediaOf("ws-short")).toBe(WS_SHORT_QUERY);
    expect(mediaOf("ws-short-host")).toBe(WS_SHORT_QUERY);
    expect(mediaOf("ws-short", 1)).toBe(WS_QUERY);
    expect(mediaOf("ws-short-host", 1)).toBe(WS_QUERY);
    expect(mediaOf("ws-short", 2)).toBe(WS_SHORT_NARROW_QUERY);
    expect(mediaOf("ws-short", 3)).toBe(WS_QUERY);
    // The narrow section's two blocks, and nothing narrow for the shell's main (a container query cannot reach it).
    const narrow = `@container section (min-width: ${WS_PANE_SECTION_REM}rem) and (width < ${WS_NARROW_SECTION_REM}rem)`;
    expect(bodyOf("ws-short").split(narrow).length - 1, "the narrow section's container query, in blocks 3 and 4").toBe(2);
    expect(bodyOf("ws-short-host")).not.toContain("@container");
    expect([...bodyOf("ws-short-host").matchAll(/@media /g)]).toHaveLength(2);
  });

  it("asks bands inside the ws gate's, each under 46 of its widest root (rounded up to the pixel), never more than 14px past the page's own 46rem", () => {
    expect(WS_SHORT_REM).toBe(46);
    const gate = parse(WS_QUERY);
    const short = parse(WS_SHORT_QUERY);
    expect(short[0]!.min).toBe(1280);
    expect(short.at(-1)!.max).toBeNull();
    for (const [i, b] of short.entries()) {
      // Each band starts where the one before ends (each includes its upper edge, as the gate's do).
      if (i > 0) expect(b.min, `band ${i} starts where the one before ends`).toBe(short[i - 1]!.max);
      // Inside one of the gate's bands, with its least height.
      const g = gate.find((x) => b.min >= x.min && (x.max === null || (b.max !== null && b.max <= x.max)));
      expect(g, `band ${b.min}–${b.max ?? "∞"} inside a band of the gate`).toBeDefined();
      expect(b.height, `band ${b.min}–${b.max ?? "∞"}: the gate's least height`).toBe(g!.height);
      const widest = b.max ? root(b.max) : 22;
      expect(b.top, `band to ${b.max ?? "∞"}`).toBe(Math.ceil(WS_SHORT_REM * widest) - 0.02);
      // At its narrowest width the CSS's bound is at most 14px past the page's own 46rem.
      expect(b.top! - WS_SHORT_REM * root(b.min), `band ${b.min}–${b.max ?? "∞"}: past the page's 46rem`).toBeLessThanOrEqual(14.05);
      // 64px wide from 1536 up (the root grows 0.288px a band); beyond the root's 22px, open.
      if (b.min >= 1536 && b.max !== null) expect(b.max - b.min, `band ${b.min}–${b.max}`).toBe(64);
    }
    // Every gate band's edge is a band's edge here.
    for (const g of gate) expect(short.some((b) => b.min === g.min), `the gate's band from ${g.min}`).toBe(true);
  });

  it("takes the laptop windows and leaves the owner's four sizes, and the tall windows of the widest bands, tall", () => {
    for (const [w, h] of [[1366, 657], [1366, 735], [1536, 730], [1599, 749], [1900, 815], [1280, 689], [1920, 828], [2000, 841]] as const) expect(matches(WS_SHORT_QUERY, w, h), `${w} × ${h}`).toBe(true);
    for (const [w, h] of [[1366, 736], [1366, 768], [1440, 900], [1648, 900], [1920, 1080], [1599, 750], [1900, 816], [1366, 655], [1920, 829], [1920, 850], [1920, 881], [2000, 845], [2240, 900], [2240, 940], [2560, 970], [2600, 1000]] as const)
      expect(matches(WS_SHORT_QUERY, w, h), `${w} × ${h}`).toBe(false);
    // A band includes its upper edge, as the gate's do (a fractional width never falls between two): at that edge the next
    // band's bound holds too (1600 × 750 is short by the band to 1664; 46 of the page's own rem there is 749.2px; at 1920
    // the band to 1984 says short to 828, 13.5px past 1920's own 815.5).
    expect(matches(WS_SHORT_QUERY, 1600, 750)).toBe(true);
    expect(matches(WS_SHORT_QUERY, 1920, 828)).toBe(true);
  });

  it("in a narrow section: under 48 rem of the first band, so 1366 × 768 (a laptop's full screen) keeps the tall form", () => {
    expect(WS_SHORT_NARROW_REM).toBe(48);
    expect(WS_PANE_SECTION_REM).toBe(64.75);
    expect(WS_NARROW_SECTION_REM).toBe(71.5);
    const [b, ...more] = parse(WS_SHORT_NARROW_QUERY);
    expect(more).toEqual([]);
    expect(b).toEqual({ min: 1280, max: 1536, height: 656, top: Math.ceil(WS_SHORT_NARROW_REM * 16) - 0.02 });
    // The sidebar open takes 20rem of the window (320px at 16px: 1356px wide is a 64.75rem section): a narrow section at the
    // default text size is 1356–1463px wide, all in the first band; folded, 1280px is already 71.5rem (the rail and
    // the gutters take 136px).
    expect((1356 - 320) / 16).toBe(WS_PANE_SECTION_REM);
    expect((1464 - 320) / 16).toBe(WS_NARROW_SECTION_REM);
    expect((1280 - 136) / 16).toBe(WS_NARROW_SECTION_REM);
    for (const [w, h] of [[1366, 736], [1366, 767], [1440, 760], [1356, 752]] as const) expect(matches(WS_SHORT_NARROW_QUERY, w, h), `${w} × ${h}`).toBe(true);
    for (const [w, h] of [[1366, 768], [1440, 900], [1366, 655], [1600, 760]] as const) expect(matches(WS_SHORT_NARROW_QUERY, w, h), `${w} × ${h}`).toBe(false);
  });

  /** A window for posture.ts's checks: its size, the root's size, and media queries read as a browser reads them. */
  function windowAt(w: number, h: number, rootSize = root(w)) {
    vi.stubGlobal("window", { innerWidth: w, innerHeight: h, matchMedia: (q: string) => ({ matches: matches(q, w, h) }) });
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("getComputedStyle", () => ({ fontSize: `${rootSize}px` }));
  }
  afterEach(() => vi.unstubAllGlobals());

  it("is the CSS bands at the default text size, the page's own rem at a larger one, and never where the workspace does not apply", () => {
    // At the default root the page's check is the media query (every band's bound is its widest root's).
    for (let w = 1280; w <= 2900; w += 37)
      for (let h = 640; h <= 1100; h += 7) {
        windowAt(w, h);
        expect(workspaceShortNow(), `${w} × ${h}`).toBe(workspaceNow() && matches(WS_SHORT_QUERY, w, h));
        // The narrow section's check in the first band, where a narrow section can be (wider, it changes nothing).
        if (w <= 1536) expect(workspaceShortNarrowNow(), `narrow ${w} × ${h}`).toBe(workspaceNow() && matches(WS_SHORT_NARROW_QUERY, w, h));
      }
    // An 18px root at 1366 × 768 (42.7 of its rem): the workspace applies (768 ≥ 41 × 18), short by the page's own rem.
    windowAt(1366, 768, 18);
    expect(matches(WS_SHORT_QUERY, 1366, 768)).toBe(false);
    expect(workspaceNow()).toBe(true);
    expect(workspaceShortNow()).toBe(true);
    expect(workspaceShortNarrowNow()).toBe(true);
    // At 1366 × 850 with the same root (47.2 of its rem): tall, but short for a narrow section (under 48 of its rem).
    windowAt(1366, 850, 18);
    expect(workspaceShortNow()).toBe(false);
    expect(workspaceShortNarrowNow()).toBe(true);
    // At 1366 × 900 with the same root: tall (50 of its rem).
    windowAt(1366, 900, 18);
    expect(workspaceShortNow()).toBe(false);
    expect(workspaceShortNarrowNow()).toBe(false);
    // No workspace, no short form: a window under the gate, or a root too large for it.
    windowAt(1366, 640);
    expect(workspaceShortNow()).toBe(false);
    expect(workspaceShortNarrowNow()).toBe(false);
    windowAt(1366, 700, 18);
    expect(workspaceNow()).toBe(false);
    expect(workspaceShortNow()).toBe(false);
    expect(workspaceShortNarrowNow()).toBe(false);
  });
});
