import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WS_MIN_HEIGHT_REM, WS_QUERY } from "./posture";
import { WS_TIER_ROWS } from "@/components/players/all-champions";

/*
  All Champions' one-screen workspace (docs/RESPONSIVE.md, "All Champions' workspace"): the CSS gate
  (globals.css, the `ws` and `ws-host` variants) and the page's own check (posture.ts, WS_QUERY) are
  the same string, so the server's first paint and the hydrated page agree; and the first paint's
  rows (WS_TIER_ROWS, drawn before the page can measure) are fewer than fit at the smallest window of
  each tier in every band of widths, so hydration only adds rows below them.
*/

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
const mediaOf = (variant: string) => {
  const at = css.indexOf(`@custom-variant ${variant} {`);
  expect(at, variant).toBeGreaterThan(-1);
  const m = /@media ([^{]+)\{/.exec(css.slice(at));
  return m![1]!.trim();
};

describe("the workspace's gate", () => {
  it("is one string in the CSS (ws, ws-host) and in the page's own check (WS_QUERY)", () => {
    expect(mediaOf("ws")).toBe(WS_QUERY);
    expect(mediaOf("ws-host")).toBe(WS_QUERY);
  });

  it("asks a fine pointer, 80rem of width and, per band of widths, 46 of the band's widest root", () => {
    const root = (w: number) => Math.min(22, Math.max(16, 16 + (w - 1536) * 0.0045));
    const bands = [...WS_QUERY.matchAll(/\(pointer: fine\) and \(min-width: ([\d.]+)(rem|px)\)(?: and \(max-width: (\d+)px\))? and \(min-height: (\d+)px\)/g)];
    expect(bands).toHaveLength(5);
    for (const [, , , max, height] of bands) {
      const widest = max ? root(Number(max)) : 22;
      // At least 46 of the band's widest root (rounded up to the pixel), so the page's own check never disagrees inside the band.
      expect(Number(height), `band to ${max ?? "∞"}`).toBeGreaterThanOrEqual(WS_MIN_HEIGHT_REM * widest - 0.5);
      expect(Number(height), `band to ${max ?? "∞"}`).toBeLessThanOrEqual(WS_MIN_HEIGHT_REM * widest + 1);
    }
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
    ["gate", [[1280, 736], [1535, 736], [1800, 791], [1920, 816], [2560, 948], [2561, 1012]]],
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
