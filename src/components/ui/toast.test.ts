import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawnToasts, hearing } from "./toast";

/*
  The toasts' live region moves into an open window and back out (Toaster). A screen reader hears a
  toast as it is added to a live region already on the page, or as an alert is drawn: so a toast is
  drawn with its live role only once, in a region that is in place, and the toasts that move with
  the region come along without it. A toast counts as heard once it has been live, in a region in
  place, for a moment: one raised as its window closes (`toast.success(...); onClose()`) was drawn
  live in the window only until it closed, and is heard on the page instead. Their place on screen,
  their buttons over a window and the toast raised as its window closes are in e2e/popups.spec.ts.
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

describe("which toasts a screen reader has heard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a toast drawn live is heard once it has been so for a moment", () => {
    const heard = hearing(200);
    heard.live([1]);
    vi.advanceTimersByTime(199);
    expect(heard.has(1)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(heard.has(1)).toBe(true);
  });

  it("the region moving sooner (its window closing with it) leaves it unheard: it is heard where the region settles", () => {
    const heard = hearing(200);
    // Raised, then its window closes in the same moment.
    heard.live([1]);
    vi.advanceTimersByTime(5);
    heard.moved();
    vi.advanceTimersByTime(1000);
    expect(heard.has(1)).toBe(false);
    // Drawn live again on the page: heard there.
    heard.live([1]);
    vi.advanceTimersByTime(200);
    expect(heard.has(1)).toBe(true);
  });

  it("a toast heard stays heard however often the region moves", () => {
    const heard = hearing(200);
    heard.live([1]);
    vi.advanceTimersByTime(200);
    heard.moved();
    heard.moved();
    expect(heard.has(1)).toBe(true);
  });

  it("drawn live again and again, its clock runs from the first time", () => {
    const heard = hearing(200);
    heard.live([1]);
    vi.advanceTimersByTime(150);
    heard.live([1, 2]);
    vi.advanceTimersByTime(50);
    expect(heard.has(1)).toBe(true);
    expect(heard.has(2)).toBe(false);
    vi.advanceTimersByTime(150);
    expect(heard.has(2)).toBe(true);
  });

  it("forgets the toasts that are gone, heard or not", () => {
    const heard = hearing(200);
    heard.live([1]);
    vi.advanceTimersByTime(200);
    heard.live([2]);
    heard.keep(new Set([3]));
    vi.advanceTimersByTime(200);
    expect(heard.has(1)).toBe(false);
    expect(heard.has(2)).toBe(false);
  });
});
