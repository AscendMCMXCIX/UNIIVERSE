import { describe, expect, it } from "vitest";
import { drawnToasts } from "./toast";

/*
  The toasts' live region moves into an open window and back out (Toaster). A screen reader hears a
  toast as it is added to a live region already on the page, or as an alert is drawn: so a toast is
  drawn with its live role only once, in a region that is in place, and the toasts that move with
  the region come along without it. Their place on screen and their buttons over a window are in
  e2e/popups.spec.ts.
*/

const toasts = [{ id: 1 }, { id: 2 }, { id: 3 }];
const ids = (drawn: ReturnType<typeof drawnToasts>) => drawn.map(({ toast, live }) => `${toast.id}${live ? " live" : ""}`);

describe("which toasts the region draws, and which are heard", () => {
  it("in place, every toast is drawn with its live role", () => {
    expect(ids(drawnToasts(toasts, new Set(), true))).toEqual(["1 live", "2 live", "3 live"]);
  });

  it("the toasts that moved with the region are drawn without it: they were heard where they first showed", () => {
    expect(ids(drawnToasts(toasts, new Set([1, 2]), true))).toEqual(["1", "2", "3 live"]);
  });

  it("while the region settles in its new place, a new toast waits, and the moved ones stay in view", () => {
    expect(ids(drawnToasts(toasts, new Set([1]), false))).toEqual(["1"]);
    expect(ids(drawnToasts(toasts, new Set(), false))).toEqual([]);
  });

  it("keeps the toasts' order", () => {
    expect(ids(drawnToasts([{ id: 7 }, { id: 4 }, { id: 9 }], new Set([4]), true))).toEqual(["7 live", "4", "9 live"]);
  });
});
