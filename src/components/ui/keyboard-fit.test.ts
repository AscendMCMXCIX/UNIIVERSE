import { describe, expect, it } from "vitest";
import { keyboardShrinks } from "./keyboard-fit";

/*
  When the on-screen keyboard counts as up: phones raise it over the page without resizing the page,
  and only the visible part of the screen (the visual viewport) shrinks. A window being typed in fits
  above it (useKeyboardFit, e2e/public-sign-in.spec.ts), and the add-champion list keeps above it
  (aboveKeyboard, add-champion.tsx; Chromium has no on-screen keyboard, so a real iPhone shows that
  one: docs/RESPONSIVE.md). Both believe a keyboard only on a touch screen, not pinched to zoom, a
  keyboard's worth short and never nearly the whole screen short.
*/

// An iPhone 15 in Safari: 852px tall, its keyboard and the bar above it 336px.
const screen = 852;

describe("whether the visible part of the screen is a keyboard's worth short", () => {
  it("is, on a touch screen with a keyboard up", () => {
    expect(keyboardShrinks({ height: 516, scale: 1 }, screen, true)).toBe(true);
  });

  it("is not with a mouse, or with the whole screen visible, or only a toolbar's height short", () => {
    expect(keyboardShrinks({ height: 516, scale: 1 }, screen, false)).toBe(false);
    expect(keyboardShrinks({ height: 852, scale: 1 }, screen, true)).toBe(false);
    expect(keyboardShrinks({ height: 760, scale: 1 }, screen, true)).toBe(false);
  });

  it("is not while the page is pinched to zoom, which shrinks the visible part too", () => {
    expect(keyboardShrinks({ height: 426, scale: 2 }, screen, true)).toBe(false);
  });

  it("is not when nearly none of the screen is left (no keyboard leaves less than 30%)", () => {
    expect(keyboardShrinks({ height: 200, scale: 1 }, screen, true)).toBe(false);
    expect(keyboardShrinks({ height: 256, scale: 1 }, screen, true)).toBe(true);
  });
});
