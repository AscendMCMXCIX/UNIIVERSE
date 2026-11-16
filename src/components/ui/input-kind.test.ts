import { describe, expect, it } from "vitest";
import { INPUT_KIND_SCRIPT, focusWindow, opensFocusingItself } from "./input-kind";

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

/**
 * A stand-in for a window's <dialog>: its tabindex, what focused it, the listeners it holds, and
 * whether the page itself has the focus.
 */
function windowElement() {
  const attributes = new Map<string, string>();
  const listeners: Array<{ type: string; listener: (e: { target: unknown }) => void; capture: boolean }> = [];
  const page = { focused: true };
  const focused: unknown[] = [];
  const el = {
    get tabIndex() {
      return Number(attributes.get("tabindex") ?? 0);
    },
    set tabIndex(value: number) {
      attributes.set("tabindex", String(value));
    },
    removeAttribute: (name: string) => attributes.delete(name),
    hasAttribute: (name: string) => attributes.has(name),
    focus: (options: unknown) => focused.push(options),
    ownerDocument: { hasFocus: () => page.focused },
    addEventListener: (type: string, listener: (e: { target: unknown }) => void, capture?: boolean) => listeners.push({ type, listener, capture: !!capture }),
    removeEventListener: (type: string, listener: (e: { target: unknown }) => void, capture?: boolean) => {
      const i = listeners.findIndex((l) => l.type === type && l.listener === listener && l.capture === !!capture);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  const fire = (type: string, target: unknown = el) => {
    for (const l of listeners.filter((x) => x.type === type)) l.listener({ target });
  };
  return { el, attributes, listeners, focused, page, fire, dialog: el as unknown as HTMLElement };
}

describe("a window holds the focus it takes only until it is pressed or the focus moves on", () => {
  it("takes it focusable (tabindex -1), without scrolling anything to it", () => {
    const w = windowElement();
    focusWindow(w.dialog);
    expect(w.attributes.get("tabindex")).toBe("-1");
    expect(w.focused).toEqual([{ preventScroll: true }]);
    // The press heard on its way down, before the browser gives the focus to what it lands on.
    expect(w.listeners.map((l) => [l.type, l.capture])).toEqual([
      ["pointerdown", true],
      ["focusout", false],
    ]);
  });

  it("a press inside lets it go: a click on its text then leaves the focus as a page does, and the keys scroll its body", () => {
    const w = windowElement();
    focusWindow(w.dialog);
    w.fire("pointerdown", "text in the body");
    expect(w.el.hasAttribute("tabindex")).toBe(false);
    expect(w.listeners).toEqual([]);
  });

  it("the focus moving on lets it go (Tab, a field of its own); the focus moving inside it does not", () => {
    const w = windowElement();
    focusWindow(w.dialog);
    w.fire("focusout", "a field inside, losing the focus to another");
    expect(w.attributes.get("tabindex")).toBe("-1");
    w.fire("focusout");
    expect(w.el.hasAttribute("tabindex")).toBe(false);
    expect(w.listeners).toEqual([]);
  });

  it("the page going to the background is not the focus moving on: the window has it back when the reader returns", () => {
    const w = windowElement();
    focusWindow(w.dialog);
    w.page.focused = false;
    w.fire("focusout");
    expect(w.attributes.get("tabindex")).toBe("-1");
    w.page.focused = true;
    w.fire("focusout");
    expect(w.el.hasAttribute("tabindex")).toBe(false);
  });

  it("a window that closes first lets go too", () => {
    const w = windowElement();
    const letGo = focusWindow(w.dialog);
    letGo();
    expect(w.el.hasAttribute("tabindex")).toBe(false);
    expect(w.listeners).toEqual([]);
  });
});
