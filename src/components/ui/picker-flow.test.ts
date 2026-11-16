import { describe, expect, it } from "vitest";
import { closeOnPressOutside, placeList, visibleArea } from "./picker-flow";

/*
  The add-champion list on a page: below its field, or above it when the room below (down to the
  tab bar's top on a phone, or the on-screen keyboard's while it is up) is less than the list needs
  and the room above is larger; never taller than the room on its side, so it never ends under the
  bars or the keyboard. On a phone in e2e/popups.spec.ts (Chromium has no on-screen keyboard: the
  keyboard's part is here and on a real iPhone, docs/RESPONSIVE.md).

  A press outside an open picker's list closes it: as the press starts while the list floats, on
  its click while the list is in the flow, so nothing moves under the finger before the click finds
  its target. Over a real Filters sheet in e2e/popups.spec.ts.
*/

/** A stand-in for the document: the listeners added to it, and a press to send them. */
function stage() {
  const listeners: Array<{ type: string; listener: (e: Event) => void; capture: unknown }> = [];
  const target = {
    addEventListener: (type: string, listener: (e: Event) => void, capture?: unknown) => listeners.push({ type, listener, capture }),
    removeEventListener: (type: string, listener: (e: Event) => void, capture?: unknown) => {
      const i = listeners.findIndex((l) => l.type === type && l.listener === listener && l.capture === capture);
      if (i >= 0) listeners.splice(i, 1);
    },
  } as unknown as Pick<EventTarget, "addEventListener" | "removeEventListener">;
  const press = (type: string, node: string) => {
    for (const l of listeners.filter((x) => x.type === type)) l.listener({ target: node } as unknown as Event);
  };
  return { target, listeners, press };
}

describe("a press outside an open list closes it", () => {
  const inside = (node: Node | null) => (node as unknown as string) === "option";

  it("a floating list as the press starts, heard on the way down", () => {
    const { target, listeners, press } = stage();
    let closed = 0;
    const stop = closeOnPressOutside(target, inside, false, () => closed++);
    expect(listeners.map((l) => [l.type, l.capture])).toEqual([["pointerdown", true]]);
    press("pointerdown", "option");
    expect(closed).toBe(0);
    press("pointerdown", "field below");
    expect(closed).toBe(1);
    stop();
    expect(listeners).toEqual([]);
  });

  it("a list in the flow on the press's click, not as it starts: what is below it moves only once the click has its target", () => {
    const { target, listeners, press } = stage();
    let closed = 0;
    const stop = closeOnPressOutside(target, inside, true, () => closed++);
    expect(listeners.map((l) => [l.type, l.capture])).toEqual([["click", true]]);
    press("pointerdown", "field below");
    expect(closed).toBe(0);
    press("click", "option");
    expect(closed).toBe(0);
    press("click", "field below");
    expect(closed).toBe(1);
    stop();
    expect(listeners).toEqual([]);
  });
});

describe("the part of the screen a list may use", () => {
  const clear = { top: 60, bottom: 603 };

  it("is the part between the bars while no keyboard is up", () => {
    expect(visibleArea(clear, null)).toEqual(clear);
  });

  it("ends at the keyboard's top while it is up, and starts where the visible part does once Safari has moved it down the page", () => {
    // An iPhone: the keyboard covers the bottom 336px of an 852px screen, the tab bar with it.
    expect(visibleArea({ top: 103, bottom: 774 }, { top: 0, bottom: 516 })).toEqual({ top: 103, bottom: 516 });
    // Safari scrolled the visible part 180px down to bring the field above the keyboard: the top bar
    // is out of sight above it.
    expect(visibleArea({ top: 103, bottom: 774 }, { top: 180, bottom: 696 })).toEqual({ top: 180, bottom: 696 });
  });

  it("puts the add-champion list above a field the keyboard leaves no room under", () => {
    // The field in the middle of the screen: 236px to the tab bar, but the keyboard's top is 20px under it.
    const field = { top: 440, bottom: 480 };
    expect(placeList(field, 288, visibleArea({ top: 103, bottom: 774 }, null), 6, 40).side).toBe("below");
    expect(placeList(field, 288, visibleArea({ top: 103, bottom: 774 }, { top: 0, bottom: 500 }), 6, 40)).toEqual({ side: "above", maxHeight: 288 });
  });
});

// A phone: the top bar's foot at 60, the tab bar's top at 603 (the screen less the page's scroll padding).
const area = { top: 60, bottom: 603 };
const needs = 288;
const gap = 6;
const least = 40;

describe("where the add-champion list goes", () => {
  it("below its field when the list fits there", () => {
    expect(placeList({ top: 100, bottom: 140 }, needs, area, gap, least)).toEqual({ side: "below", maxHeight: 288 });
  });

  it("above its field near the tab bar, where the room below is too small and above is larger", () => {
    expect(placeList({ top: 520, bottom: 560 }, needs, area, gap, least)).toEqual({ side: "above", maxHeight: 288 });
  });

  it("on the larger side, as tall as the room there, where it fits on neither", () => {
    // A short screen (a phone held sideways): 340px between the bars, the field in the middle.
    const short = { top: 60, bottom: 400 };
    expect(placeList({ top: 200, bottom: 240 }, needs, short, gap, least)).toEqual({ side: "below", maxHeight: 154 });
    expect(placeList({ top: 260, bottom: 300 }, needs, short, gap, least)).toEqual({ side: "above", maxHeight: 194 });
  });

  it("below when the rooms are equal, and never shorter than a row", () => {
    expect(placeList({ top: 300, bottom: 340 }, 400, { top: 0, bottom: 640 }, 0, least)).toEqual({ side: "below", maxHeight: 300 });
    expect(placeList({ top: 70, bottom: 590 }, needs, area, gap, least)).toEqual({ side: "below", maxHeight: 40 });
  });
});
