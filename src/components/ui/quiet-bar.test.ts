import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuietBar } from "./quiet-bar";

/*
  Recent form's record bar: a count of the window's games, wins first, never a fraction stretched
  over 20 (a provisional 9 of 14 is 9 filled, 5 empty and 6 missing, not 13 of 20).
*/

const render = (props: Parameters<typeof QuietBar>[0]) => renderToStaticMarkup(createElement(QuietBar, props));
/** The markup with the attribute escapes React writes undone ("[&amp;&gt;…]" is the class "[&>…]"). */
const decoded = (html: string) => html.replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const states = (html: string) => [...html.matchAll(/data-state="(\w+)"/g)].map((m) => m[1]);
const count = (html: string, state: string) => states(html).filter((s) => s === state).length;

describe("QuietBar", () => {
  it("draws a full window's wins first: 13 of 20 is 13 filled and 7 empty", () => {
    const html = render({ value: 13, segments: 20, testId: "bar" });
    expect(states(html)).toEqual([...Array(13).fill("filled"), ...Array(7).fill("empty")]);
    expect(html).toMatch(/^<span aria-hidden="true" data-testid="bar" data-segments="20" data-filled="13" data-known="20"/);
  });

  it("outlines the games a provisional window does not have yet: 9 wins of 14 is 9, 5 and 6 missing", () => {
    const html = render({ value: 9, segments: 20, known: 14 });
    expect([count(html, "filled"), count(html, "empty"), count(html, "missing")]).toEqual([9, 5, 6]);
    expect(html).toContain('data-known="14"');
    expect(decoded(html)).toContain("[&>[data-state=missing]]:ring-fg/25");
    // The look is set once, on the frame: each segment is a bare span with its state.
    expect(html).toContain('<span data-state="missing"></span>');
    expect(html).not.toMatch(/<span data-state="\w+" class=/);
  });

  it("clamps what it is given: no more filled than played, no more played than segments, nothing below zero", () => {
    expect(render({ value: 25, segments: 20, known: 14 })).toContain('data-filled="14" data-known="14"');
    expect(render({ value: 5, segments: 20, known: 30 })).toContain('data-filled="5" data-known="20"');
    const negative = render({ value: -3, segments: 20, known: -1 });
    expect(negative).toContain('data-filled="0" data-known="0"');
    expect(count(negative, "missing")).toBe(20);
    expect(render({ value: 12.6, segments: 20 })).toContain('data-filled="13"');
  });

  it("is hidden from screen readers, and neutral: text-colour overlays only, no accent or state colour", () => {
    for (const variant of ["inline", "inset", "row"] as const) {
      const html = render({ value: 9, segments: 20, known: 14, variant });
      expect(html.startsWith('<span aria-hidden="true"')).toBe(true);
      expect(html).not.toMatch(/accent|good|bad|warn|red|blue|transition/);
    }
    // The row's bar is the 2px inset line under a 36rem board and the 6px bar from it.
    const row = render({ value: 9, segments: 20, variant: "row" });
    expect(row).toContain("absolute inset-x-0 bottom-0 flex h-0.5");
    expect(row).toContain("@min-[36rem]/list:static @min-[36rem]/list:h-1.5");
  });

  it("draws a continuous share as one bar, its scale clamped to 0–1", () => {
    expect(render({ value: 0.4, testId: "share" })).toMatch(/data-testid="share" data-value="0.4".*transform:scaleX\(0\.4\)/);
    expect(render({ value: 1.7 })).toContain("scaleX(1)");
    expect(render({ value: -2 })).toContain("scaleX(0)");
    expect(render({ value: Number.NaN })).toContain("scaleX(0)");
  });
});
