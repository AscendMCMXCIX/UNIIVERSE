import { describe, expect, it } from "vitest";
import { cardScoreVerdicts, firstScored, type CardScoreRead } from "../../../scripts/card-score-facts.mjs";

/*
  The Production check's card score facts (scripts/card-score-facts.mjs): the first page of Match
  History shows each card's performance score or the quiet fallback, and the first scored game,
  opened, shows the same score and place. The readings below are what readCardScores and
  readOpenedScore return in a page.
*/

const ok = (index: number, score = 5.2, rank = 3): CardScoreRead => ({ index, state: "ok", score, rank, marks: 1, markScore: score, markRank: rank, spoken: true });
const pending = (index: number): CardScoreRead => ({ index, state: "pending", score: null, rank: null, marks: 0, markScore: null, markRank: null, spoken: true });
const none = (index: number): CardScoreRead => ({ index, state: "none", score: null, rank: null, marks: 0, markScore: null, markRank: null, spoken: false });
const statuses = (v: ReturnType<typeof cardScoreVerdicts>) => v.map((x) => x.status);

describe("the card score facts", () => {
  it("pass when every card shows its score or the fallback and the opened game agrees", () => {
    const cards = [pending(0), ok(1, 6.1, 1), none(2), ok(3)];
    expect(firstScored(cards)).toBe(1);
    const v = cardScoreVerdicts({ kind: "desktop", cards, opened: { open: true, timeline: "ok", score: 6.1, rank: 1, loading: false } });
    expect(statuses(v)).toEqual(["PASS", "PASS"]);
    expect(v[0]!.detail).toMatchObject({ cards: 4, ok: 2, pending: 1, none: 1, wrong: [] });
  });

  it("fail on a card with a score but no mark, two marks, a mark that differs, or a mark without a score", () => {
    for (const bad of [{ ...ok(0), marks: 0 }, { ...ok(0), marks: 2 }, { ...ok(0), markScore: 4.9 }, { ...pending(0), marks: 1 }, { ...ok(0), spoken: false }, { ...ok(0), state: "odd" }]) {
      expect(cardScoreVerdicts({ kind: "phone", cards: [bad, ok(1)], opened: { open: true, timeline: "ok", score: 5.2, rank: 3 } })[0]!.status).toBe("FAIL");
    }
  });

  it("fail when the opened game shows another score or place, or did not open", () => {
    const cards = [ok(0, 5.2, 3)];
    expect(statuses(cardScoreVerdicts({ kind: "tablet", cards, opened: { open: true, timeline: "ok", score: 5.3, rank: 3 } }))).toEqual(["PASS", "FAIL"]);
    expect(statuses(cardScoreVerdicts({ kind: "tablet", cards, opened: { open: true, timeline: "ok", score: 5.2, rank: 4 } }))).toEqual(["PASS", "FAIL"]);
    expect(statuses(cardScoreVerdicts({ kind: "tablet", cards, opened: { open: false } }))).toEqual(["PASS", "FAIL"]);
    expect(statuses(cardScoreVerdicts({ kind: "tablet", cards, opened: null }))).toEqual(["PASS", "FAIL"]);
  });

  it("warn, not fail, without a scored card or without cards", () => {
    expect(statuses(cardScoreVerdicts({ kind: "desktop", cards: [pending(0), none(1)], opened: null }))).toEqual(["PASS", "WARN"]);
    expect(statuses(cardScoreVerdicts({ kind: "desktop", cards: [], opened: null }))).toEqual(["WARN", "WARN"]);
  });
});
