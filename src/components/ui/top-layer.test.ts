import { describe, expect, it, vi } from "vitest";
import { layerOf, noTopLayer, noteModalAtRest, noteModalClosed, noteModalOpened, subscribeModals, topLayer, topModal, topmostModal } from "./top-layer";

/*
  The topmost window is the one opened last (the browser's top layer stacks windows in the order
  they were shown, whatever their order in the page); of windows never noted, the last in the page.
  What shows over the windows (the toasts) goes into the topmost window at rest: a window moving in
  has a transform, which would carry what is fixed inside it along with its motion, so until it is
  still the toasts stay where they were, covered by it. Its behaviour in a browser (a tip and a toast
  drawn in the open window) is in e2e/popups.spec.ts.
*/

describe("the topmost window", () => {
  it("is the one opened last, wherever it sits in the page", () => {
    const opened = new Map([
      ["filter sheet", 3],
      ["champion window", 1],
      ["match window", 2],
    ]);
    const order = (d: string) => opened.get(d) ?? 0;
    expect(topmostModal(["filter sheet", "champion window", "match window"], order)).toBe("filter sheet");
    expect(topmostModal(["champion window", "match window"], order)).toBe("match window");
  });

  it("of windows opened alike (never noted), is the later in the page; none open is null", () => {
    expect(topmostModal(["first", "second"], () => 0)).toBe("second");
    expect(topmostModal(["only"], () => 0)).toBe("only");
    expect(topmostModal([], () => 0)).toBeNull();
    // A noted window is above one that never said it opened.
    expect(topmostModal(["noted", "unnoted"], (d) => (d === "noted" ? 1 : 0))).toBe("noted");
  });

  it("tells its listeners as windows open, come to rest and close, until they stop listening", () => {
    const listener = vi.fn();
    const stop = subscribeModals(listener);
    const dialog = {} as HTMLDialogElement;
    noteModalOpened(dialog);
    noteModalAtRest(dialog);
    // Said once: coming to rest twice, or closing twice (as its closing motion starts, and as it
    // leaves the page), changes nothing the second time.
    noteModalAtRest(dialog);
    noteModalClosed(dialog);
    noteModalClosed(dialog);
    expect(listener).toHaveBeenCalledTimes(3);
    // A window that closed before it came to rest does not come to rest afterwards.
    noteModalAtRest(dialog);
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    noteModalOpened(dialog);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("is none on the server, where there is no page", () => {
    expect(topModal()).toBeNull();
    expect(topLayer()).toBe(noTopLayer());
    expect(noTopLayer()).toEqual({ host: null, opening: false });
  });
});

describe("where the toasts are drawn, of the open windows", () => {
  const opened = new Map([
    ["champion window", 1],
    ["match window", 2],
  ]);
  const order = (d: string) => opened.get(d) ?? 0;

  it("in the topmost window once it is at rest, and nothing covers it", () => {
    expect(layerOf(["champion window", "match window"], order, () => true)).toEqual({ host: "match window", opening: false });
  });

  it("while the topmost window moves in, where they were: in the window under it, or on the page, covered", () => {
    expect(layerOf(["champion window", "match window"], order, (d) => d !== "match window")).toEqual({ host: "champion window", opening: true });
    expect(layerOf(["match window"], order, () => false)).toEqual({ host: null, opening: true });
  });

  it("on the page, uncovered, while no window is open (one that has started to close no longer counts)", () => {
    expect(layerOf([], order, () => true)).toEqual({ host: null, opening: false });
  });
});
