import { describe, expect, it } from "vitest";
import { loopDelta, loopSlot } from "./use-loop-track";

/*
  The phone lineup's loop (Team Overview, useLoopTrack): five cards, each once, placed round the card
  in the middle by their flex order, so two cards are always ready on either side, and a move goes
  the shortest way round. The browser tests (e2e/team-carousel.spec.ts) check the swipes themselves.
*/

describe("the lineup loop", () => {
  it("places the card in view in the middle, its neighbours round it in lineup order, wrapping", () => {
    const order = (centre: number) => [0, 1, 2, 3, 4].map((i) => loopSlot(i, centre, 5));
    // Card 0 in the middle: 3 and 4 before it, 1 and 2 after.
    expect(order(0)).toEqual([2, 3, 4, 0, 1]);
    // The last card in the middle: the first comes straight after it.
    expect(order(4)).toEqual([3, 4, 0, 1, 2]);
    for (let c = 0; c < 5; c++) {
      // Every place taken once, the centre card in the middle, the next card after it and the previous before it.
      expect([...order(c)].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(loopSlot(c, c, 5)).toBe(2);
      expect(loopSlot((c + 1) % 5, c, 5)).toBe(3);
      expect(loopSlot((c + 4) % 5, c, 5)).toBe(1);
    }
  });

  it("moves the shortest way round: past the last is the first, before the first the last", () => {
    expect(loopDelta(4, 0, 5)).toBe(1);
    expect(loopDelta(0, 4, 5)).toBe(-1);
    expect(loopDelta(0, 3, 5)).toBe(-2);
    expect(loopDelta(3, 0, 5)).toBe(2);
    expect(loopDelta(2, 2, 5)).toBe(0);
    // Always within the two cards ready on either side.
    for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
      const d = loopDelta(a, b, 5);
      expect(Math.abs(d)).toBeLessThanOrEqual(2);
      expect((((a + d) % 5) + 5) % 5).toBe(b);
      expect(loopSlot(b, a, 5) - loopSlot(a, a, 5)).toBe(d);
    }
  });

  it("works for another number of cards: every card reachable from the middle", () => {
    for (const count of [3, 4, 6]) {
      for (let a = 0; a < count; a++) for (let b = 0; b < count; b++) expect(loopSlot(b, a, count) - loopSlot(a, a, count)).toBe(loopDelta(a, b, count));
    }
  });
});
