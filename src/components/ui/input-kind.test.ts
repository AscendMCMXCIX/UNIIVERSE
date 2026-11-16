import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INPUT_KIND_SCRIPT, focusWindow, letGoWhenPressed, opensFocusingItself } from "./input-kind";

/*
  The script the root layout inlines at the top of <head>: each pointer press and each key press
  notes its kind on window.__lastInput, heard on window in the capture phase (before anything on the
  page can stop it). A window opened by a pointer takes the focus itself; from the keyboard, or by
  nothing the reader did, its close button does. A press inside a window on nothing focusable leaves
  nothing focused, as on a page. In a browser: e2e/popups.spec.ts.
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
 * A stand-in for a window's <dialog>: its tabindex, what focused it, the listeners it holds, whether
 * the page itself has the focus, what has the focus in it (`page.active`) and how often the window
 * let the focus go (`blurred`).
 */
function windowElement() {
  const attributes = new Map<string, string>();
  const listeners: Array<{ type: string; listener: (e: { target: unknown }) => void; capture: boolean }> = [];
  const page: { focused: boolean; active: unknown } = { focused: true, active: null };
  const focused: unknown[] = [];
  let blurred = 0;
  const el = {
    get tabIndex() {
      return Number(attributes.get("tabindex") ?? 0);
    },
    set tabIndex(value: number) {
      attributes.set("tabindex", String(value));
    },
    removeAttribute: (name: string) => attributes.delete(name),
    hasAttribute: (name: string) => attributes.has(name),
    focus: (options: unknown) => {
      focused.push(options);
      page.active = el;
    },
    blur: () => {
      blurred++;
      if (page.active === el) page.active = null;
    },
    ownerDocument: {
      hasFocus: () => page.focused,
      get activeElement() {
        return page.active;
      },
    },
    addEventListener: (type: string, listener: (e: { target: unknown }) => void, capture?: boolean) => listeners.push({ type, listener, capture: !!capture }),
    removeEventListener: (type: string, listener: (e: { target: unknown }) => void, capture?: boolean) => {
      const i = listeners.findIndex((l) => l.type === type && l.listener === listener && l.capture === !!capture);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  const fire = (type: string, target: unknown = el) => {
    for (const l of listeners.filter((x) => x.type === type)) l.listener({ target });
  };
  return { el, attributes, listeners, focused, page, fire, blurred: () => blurred, dialog: el as unknown as HTMLElement };
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

describe("a press inside a window on nothing focusable leaves nothing focused, as on a page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("listens for the press's mousedown (a tap sends one too), on its way down", () => {
    const w = windowElement();
    letGoWhenPressed(w.dialog);
    expect(w.listeners.map((l) => [l.type, l.capture])).toEqual([["mousedown", true]]);
  });

  it("the browser focusing the window itself at the press (its text, a card): once the press is over, the window lets the focus go", () => {
    const w = windowElement();
    letGoWhenPressed(w.dialog);
    w.fire("mousedown", "text in the body");
    // The browser gives the focus out as the press's own task ends: here, to the window itself.
    w.page.active = w.el;
    expect(w.blurred()).toBe(0);
    vi.runAllTimers();
    expect(w.blurred()).toBe(1);
    expect(w.page.active).toBe(null);
  });

  it("a press that gives the focus to what it lands on (a field, a link) leaves it there", () => {
    const w = windowElement();
    letGoWhenPressed(w.dialog);
    w.fire("mousedown", "a field");
    w.page.active = "a field";
    vi.runAllTimers();
    expect(w.blurred()).toBe(0);
    expect(w.page.active).toBe("a field");
  });

  it("every press, not only the first", () => {
    const w = windowElement();
    letGoWhenPressed(w.dialog);
    for (let i = 1; i <= 3; i++) {
      w.fire("mousedown");
      w.page.active = w.el;
      vi.runAllTimers();
      expect(w.blurred()).toBe(i);
      expect(w.page.active).toBe(null);
    }
  });

  it("a window that took the focus as it opened, pressed on its text: its tabindex goes, and nothing has the focus once the press is over (the browser keeps it on a dialog without one)", () => {
    const w = windowElement();
    letGoWhenPressed(w.dialog);
    focusWindow(w.dialog);
    expect(w.page.active).toBe(w.el);
    w.fire("pointerdown", "text in the body");
    w.fire("mousedown", "text in the body");
    expect(w.el.hasAttribute("tabindex")).toBe(false);
    vi.runAllTimers();
    expect(w.page.active).toBe(null);
  });

  it("a window that closes stops: a press just before it closed lets nothing go after", () => {
    const w = windowElement();
    const stop = letGoWhenPressed(w.dialog);
    w.fire("mousedown");
    w.page.active = w.el;
    stop();
    vi.runAllTimers();
    expect(w.blurred()).toBe(0);
    expect(w.listeners).toEqual([]);
  });
});
