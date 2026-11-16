import { describe, expect, it } from "vitest";
import { INPUT_KIND_SCRIPT, opensFocusingItself } from "./input-kind";

/*
  The script the root layout inlines at the top of <head>: each pointer press and each key press
  notes its kind on window.__lastInput, heard on window in the capture phase (before anything on the
  page can stop it). A window opened by a pointer takes the focus itself; from the keyboard, or by
  nothing the reader did, its close button does. In a browser: e2e/popups.spec.ts.
*/

/** The script run against a stand-in window, which records its listeners. */
function run() {
  const listeners = new Map<string, { listener: (e: { key?: string }) => void; capture: unknown }>();
  const win: { __lastInput?: string; addEventListener: (type: string, listener: (e: { key?: string }) => void, capture?: unknown) => void } = {
    addEventListener: (type, listener, capture) => listeners.set(type, { listener, capture }),
  };
  new Function("window", INPUT_KIND_SCRIPT)(win);
  const fire = (type: string, e: { key?: string } = {}) => listeners.get(type)!.listener(e);
  return { win, listeners, fire };
}

describe("the input-kind script", () => {
  it("listens for pointer and key presses on window, in the capture phase", () => {
    const { listeners } = run();
    expect([...listeners.keys()].sort()).toEqual(["keydown", "pointerdown"]);
    for (const { capture } of listeners.values()) expect(capture).toBe(true);
  });

  it("notes a pointer press, then a key press, as the last input", () => {
    const { win, fire } = run();
    expect(win.__lastInput).toBeUndefined();
    fire("pointerdown");
    expect(win.__lastInput).toBe("pointer");
    fire("keydown", { key: "Enter" });
    expect(win.__lastInput).toBe("keyboard");
    fire("pointerdown");
    expect(win.__lastInput).toBe("pointer");
    fire("keydown", { key: "Tab" });
    expect(win.__lastInput).toBe("keyboard");
  });

  it("does not count a modifier held for a click as the keyboard", () => {
    const { win, fire } = run();
    fire("pointerdown");
    for (const key of ["Shift", "Control", "Alt", "Meta"]) fire("keydown", { key });
    expect(win.__lastInput).toBe("pointer");
    fire("keydown", { key: " " });
    expect(win.__lastInput).toBe("keyboard");
  });
});

describe("where a window puts the focus as it opens", () => {
  it("on itself after a tap or a click; on its close button from the keyboard or with no input yet", () => {
    expect(opensFocusingItself("pointer")).toBe(true);
    expect(opensFocusingItself("keyboard")).toBe(false);
    expect(opensFocusingItself(null)).toBe(false);
  });
});
