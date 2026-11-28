import { describe, expect, it } from "vitest";
import { opensWith } from "./detail-modal";

/*
  When a window counts as at rest (DetailModal's onAnimationEnd; top-layer.ts moves the toasts into it then, so they never
  ride its transform while it moves): its own opening motion's end. Every window's ::backdrop fades in (MODAL_BACKDROP,
  160ms), and that animationend is dispatched on the dialog itself with pseudoElement "::backdrop": it never counts. A phone's
  sheet (sheet-in, 220ms) was at rest 60ms early once fade-in became the workspace window's motion.
*/
describe("a window's opening motion", () => {
  it("is its own animation's end, never its backdrop's", () => {
    expect(opensWith("sheet", { animationName: "sheet-in", pseudoElement: "" })).toBe(true);
    expect(opensWith("sheet", { animationName: "fade-in", pseudoElement: "::backdrop" })).toBe(false);
    expect(opensWith("screen", { animationName: "screen-in", pseudoElement: "" })).toBe(true);
    expect(opensWith("screen", { animationName: "fade-in", pseudoElement: "::backdrop" })).toBe(false);
    expect(opensWith("wide", { animationName: "modal-in", pseudoElement: "" })).toBe(true);
    expect(opensWith("wide", { animationName: "fade-in", pseudoElement: "::backdrop" })).toBe(false);
    expect(opensWith("workspace", { animationName: "fade-in", pseudoElement: "::backdrop" })).toBe(false);
  });

  it("counts a fade only for the workspace window, whose motion it is", () => {
    expect(opensWith("workspace", { animationName: "fade-in", pseudoElement: "" })).toBe(true);
    expect(opensWith("workspace", { animationName: "fade-in" })).toBe(true);
    for (const size of ["compact", "standard", "wide", "full", "sheet", "form", "screen"] as const) expect(opensWith(size, { animationName: "fade-in", pseudoElement: "" }), size).toBe(false);
  });

  it("ignores the motions that open nothing (a closing one, a child's)", () => {
    expect(opensWith("sheet", { animationName: "sheet-out", pseudoElement: "" })).toBe(false);
    expect(opensWith("standard", { animationName: "modal-out", pseudoElement: "" })).toBe(false);
    expect(opensWith("standard", { animationName: "swap-in", pseudoElement: "" })).toBe(false);
  });
});
