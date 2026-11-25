import { describe, expect, it } from "vitest";
import { cardScoreVerdicts, firstScored, readCardScores, readTogetherScores, togetherScoreVerdicts, type CardScoreRead, type TogetherMemberScoreRead, type TogetherScoreRead } from "../../../scripts/card-score-facts.mjs";

/*
  The Production check's card score facts (scripts/card-score-facts.mjs): the first page of Match
  History shows each card's performance score or the quiet fallback, and the first scored game,
  opened, shows the same score and place. Since the owner's requirements of 25 Nov 2026: each badge
  says its card's place in its colour (MVP gold on a won game, ACE violet on a lost one, other places
  neutral), the score keeps one place from card to card, and Team → Matches' members show theirs.
  The readings below are what readCardScores, readOpenedScore and readTogetherScores return in a page.
*/

const ok = (index: number, score = 5.2, rank = 3, over: Partial<CardScoreRead> = {}): CardScoreRead => ({ index, state: "ok", result: "W", score, rank, marks: 1, markScore: score, markRank: rank, mvp: false, ace: false, place: "place", placeRank: rank, tone: "neutral", slots: 1, column: 774, underKda: null, spoken: true, ...over });
const mvp = (index: number, rank = 1) => ok(index, 7.4, rank, { mvp: true, place: "mvp", tone: "gold", result: "W" });
const ace = (index: number, rank = 2) => ok(index, 6.1, rank, { ace: true, place: "ace", tone: "violet", result: "L" });
const pending = (index: number): CardScoreRead => ({ index, state: "pending", result: "L", score: null, rank: null, marks: 0, markScore: null, markRank: null, place: null, placeRank: null, tone: null, slots: 1, column: 774, underKda: null, spoken: true });
const none = (index: number): CardScoreRead => ({ ...pending(index), state: "none", spoken: false });
const statuses = (v: ReturnType<typeof cardScoreVerdicts>) => v.map((x) => x.status);
const OPENED = { open: true, timeline: "ok", score: 7.4, rank: 1, loading: false };

describe("the card score facts", () => {
  it("pass when every card shows its score or the fallback, the opened game agrees, the badges say their places and the score keeps its column", () => {
    const cards = [pending(0), mvp(1), none(2), ok(3), ace(4)];
    expect(firstScored(cards)).toBe(1);
    const v = cardScoreVerdicts({ kind: "desktop", cards, opened: OPENED });
    expect(statuses(v)).toEqual(["PASS", "PASS", "PASS", "PASS"]);
    expect(v[0]!.detail).toMatchObject({ cards: 5, ok: 3, pending: 1, none: 1, wrong: [] });
    expect(v[2]!.detail).toMatchObject({ scored: 3, mvp: 1, ace: 1, place: 1, wrong: [] });
  });

  it("fail on a card with a score but no mark, two marks, a mark that differs, or a mark without a score", () => {
    for (const bad of [{ ...ok(0), marks: 0 }, { ...ok(0), marks: 2 }, { ...ok(0), markScore: 4.9 }, { ...pending(0), marks: 1 }, { ...ok(0), spoken: false }, { ...ok(0), state: "odd" }]) {
      expect(cardScoreVerdicts({ kind: "phone", cards: [bad, ok(1)], opened: { open: true, timeline: "ok", score: 5.2, rank: 3 } })[0]!.status).toBe("FAIL");
    }
  });

  it("fail when the opened game shows another score or place, or did not open", () => {
    const cards = [ok(0, 5.2, 3)];
    const second = (opened: Parameters<typeof cardScoreVerdicts>[0]["opened"]) => statuses(cardScoreVerdicts({ kind: "tablet", cards, opened }))[1];
    expect(second({ open: true, timeline: "ok", score: 5.3, rank: 3 })).toBe("FAIL");
    expect(second({ open: true, timeline: "ok", score: 5.2, rank: 4 })).toBe("FAIL");
    expect(second({ open: false })).toBe("FAIL");
    expect(second(null)).toBe("FAIL");
  });

  it("fail a badge that says another place, another colour, an MVP on a lost game or an ACE on a won one", () => {
    const badge = (c: CardScoreRead) => cardScoreVerdicts({ kind: "desktop", cards: [mvp(0), c], opened: OPENED })[2]!;
    for (const bad of [ok(1, 5, 3, { place: "mvp" }), ok(1, 5, 3, { placeRank: 4 }), ok(1, 5, 3, { tone: "gold" }), { ...mvp(1), tone: "neutral" as const }, { ...mvp(1), result: "L" }, { ...ace(1), result: "W" }, { ...ace(1), tone: "gold" as const }]) {
      expect(badge(bad).status).toBe("FAIL");
      expect(badge(bad).detail).toMatchObject({ wrong: [1] });
    }
  });

  it("fail when the score moves from card to card: another column, not under the K/D/A, or no place kept without a score", () => {
    const place = (cards: CardScoreRead[]) => cardScoreVerdicts({ kind: "desktop", cards, opened: OPENED })[3]!;
    expect(place([mvp(0), ok(1, 5, 3, { column: 776 })]).status).toBe("FAIL");
    expect(place([mvp(0), ok(1, 5, 3, { column: 775 })]).status).toBe("PASS");
    expect(place([mvp(0, 1), { ...none(1), slots: 0 }]).status).toBe("FAIL");
    // A narrow card: no column, the score under the K/D/A.
    const narrow = (over: Partial<CardScoreRead>) => ok(0, 5, 3, { column: null, underKda: true, ...over });
    expect(place([narrow({}), narrow({ index: 1 })]).status).toBe("PASS");
    expect(place([narrow({}), narrow({ index: 1, underKda: false })]).detail).toMatchObject({ notUnder: [1] });
  });

  it("warn, not fail, without a scored card or without cards", () => {
    expect(statuses(cardScoreVerdicts({ kind: "desktop", cards: [pending(0), none(1)], opened: null }))).toEqual(["PASS", "WARN", "WARN", "PASS"]);
    expect(statuses(cardScoreVerdicts({ kind: "desktop", cards: [], opened: null }))).toEqual(["WARN", "WARN", "WARN", "WARN"]);
  });

  it("read places, colours, positions and counts only (no name, match id or text leaves the page)", () => {
    for (const reader of [readCardScores, readTogetherScores]) {
      const source = reader.toString();
      expect(source).not.toMatch(/textContent|innerText|data-match\b|data-match-id/);
    }
  });
});

describe("Team Matches' member scores", () => {
  const member = (rank: number, over: Partial<TogetherMemberScoreRead> = {}): TogetherMemberScoreRead => ({ slots: 1, scored: true, markScore: 5, markRank: rank, mvp: false, ace: false, place: "place", placeRank: rank, tone: "neutral", ...over });
  const dash: TogetherMemberScoreRead = { slots: 1, scored: false, markScore: null, markRank: null, mvp: false, ace: false, place: null, placeRank: null, tone: null };
  const won: TogetherScoreRead = { index: 0, result: "W", members: [member(1, { mvp: true, place: "mvp", tone: "gold" }), member(4)] };
  const lost: TogetherScoreRead = { index: 1, result: "L", members: [member(2, { ace: true, place: "ace", tone: "violet" }), member(6), dash] };
  const verdicts = (games: TogetherScoreRead[]) => togetherScoreVerdicts({ kind: "desktop", games });

  it("pass when every member shows a score or the dash, each place once, MVP gold on a win and ACE violet on a loss", () => {
    expect(verdicts([won, lost]).map((v) => v.status)).toEqual(["PASS", "PASS"]);
    expect(verdicts([won, lost])[0]!.detail).toMatchObject({ games: 2, members: 5, scored: 4, missing: [], shared: [] });
  });

  it("fail a member row without its score or dash, two members on one place, an MVP on a lost game or a badge in the wrong colour", () => {
    expect(verdicts([{ ...won, members: [won.members[0]!, { ...dash, slots: 0 }] }])[0]!.status).toBe("FAIL");
    expect(verdicts([{ ...won, members: [won.members[0]!, member(1)] }])[0]!.detail).toMatchObject({ shared: [0] });
    expect(verdicts([{ ...won, result: "L" }])[1]!.status).toBe("FAIL");
    expect(verdicts([{ ...lost, result: "W" }])[1]!.status).toBe("FAIL");
    expect(verdicts([{ ...won, members: [member(1, { mvp: true, place: "mvp", tone: "neutral" })] }])[1]!.status).toBe("FAIL");
  });

  it("warn, not fail, without games or without a scored member", () => {
    expect(verdicts([]).map((v) => v.status)).toEqual(["WARN"]);
    expect(verdicts([{ index: 0, result: "W", members: [dash] }]).map((v) => v.status)).toEqual(["PASS", "WARN"]);
  });
});
