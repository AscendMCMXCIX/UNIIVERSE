import { describe, expect, it, vi } from "vitest";
import { noteModalClosed, noteModalOpened, subscribeModals, topModal, topmostModal } from "./top-layer";

/*
  The topmost window is the one opened last (the browser's top layer stacks windows in the order
  they were shown, whatever their order in the page); of windows never noted, the last in the page.
  Its behaviour in a browser (a tip and a toast drawn in the open window) is in e2e/popups.spec.ts.
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

  it("tells its listeners as windows open and close, until they stop listening", () => {
    const listener = vi.fn();
    const stop = subscribeModals(listener);
    const dialog = {} as HTMLDialogElement;
    noteModalOpened(dialog);
    noteModalClosed(dialog);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    noteModalOpened(dialog);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("is none on the server, where there is no page", () => {
    expect(topModal()).toBeNull();
  });
});
