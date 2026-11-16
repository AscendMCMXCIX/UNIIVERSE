import { describe, expect, it } from "vitest";
import { placeList } from "./picker-flow";

/*
  The add-champion list on a page: below its field, or above it when the room below (down to the
  tab bar's top on a phone) is less than the list needs and the room above is larger; never taller
  than the room on its side, so it never ends under the bars. On a phone in e2e/popups.spec.ts.
*/

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
