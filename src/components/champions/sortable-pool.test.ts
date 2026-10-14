import { describe, expect, it } from "vitest";
import { moveItem, targetIndex } from "./sortable-pool";

/* Drop targets come from the cards' layout slots (not their animated positions), so a fast drag cannot flicker between two places. */

const grid = (ids: string[], cols = 3, w = 100, h = 60, gap = 8) => new Map(ids.map((id, i) => [id, { x: (i % cols) * (w + gap), y: Math.floor(i / cols) * (h + gap), w, h }]));

describe("pool reordering", () => {
  const ids = ["A", "B", "C", "D", "E"];
  const slots = grid(ids);

  it("moves an item and keeps every other in order", () => {
    expect(moveItem(ids, 0, 2)).toEqual(["B", "C", "A", "D", "E"]);
    expect(moveItem(ids, 4, 0)).toEqual(["E", "A", "B", "C", "D"]);
    expect(moveItem(ids, 1, 99)).toEqual(["A", "C", "D", "E", "B"]);
    expect(moveItem(ids, 7, 0)).toEqual(ids);
  });

  it("targets the card under the pointer", () => {
    expect(targetIndex(ids, "A", slots, 230, 30, 0)).toBe(2); // over C
    expect(targetIndex(ids, "A", slots, 50, 90, 0)).toBe(3); // over D, second row
  });

  it("keeps the current place over a gap or over the dragged card's own slot", () => {
    expect(targetIndex(ids, "A", slots, 104, 30, 0)).toBe(0); // the gap between A and B
    expect(targetIndex(ids, "A", slots, 50, 30, 0)).toBe(0);
  });

  it("drops at the end past the last card", () => {
    expect(targetIndex(ids, "A", slots, 300, 100, 0)).toBe(4);
    expect(targetIndex(ids, "A", slots, 50, 400, 0)).toBe(4);
  });

  it("handles a large pool", () => {
    const many = Array.from({ length: 60 }, (_, i) => `C${i}`);
    const s = grid(many);
    expect(targetIndex(many, "C0", s, 120, 19 * 68 + 10, 0)).toBe(58);
  });
});
