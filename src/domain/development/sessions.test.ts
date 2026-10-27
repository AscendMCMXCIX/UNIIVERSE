import { describe, expect, it } from "vitest";
import { planAssociation, SESSION_IDLE_MS, summariseSession, type CandidateGame, type SessionWindow, type SummaryGame } from "./sessions";
import { areaCounts, cleanReview, executionTrend } from "./reviews";

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 9, 27, 8);

const session = (over: Partial<SessionWindow> = {}): SessionWindow => ({ id: "s1", startedAt: T0, endedAt: null, lastActivityAt: T0, rule: "target", losses: 0, accountId: null, ...over });
const game = (id: string, startMin: number, over: Partial<CandidateGame> = {}): CandidateGame => ({ matchId: id, accountId: "a1", start: T0 + startMin * MIN, end: T0 + (startMin + 30) * MIN, win: true, ...over });

describe("which session a synced game joins", () => {
  it("joins the running session when it finished after the session started", () => {
    const plan = planAssociation([session()], [game("m1", 5), game("m2", 40)], T0 + 2 * HOUR);
    expect(plan.assign).toEqual([
      { matchId: "m1", sessionId: "s1", ambiguousWith: null },
      { matchId: "m2", sessionId: "s1", ambiguousWith: null },
    ]);
    expect(plan.end).toEqual([]);
  });

  it("includes the game being played when the session was started, not one that ended before it", () => {
    const plan = planAssociation([session()], [game("in-progress", -10), game("before", -45)], T0 + HOUR);
    expect(plan.assign.map((a) => a.matchId)).toEqual(["in-progress"]);
  });

  it("follows only the session's account when it has one", () => {
    const plan = planAssociation([session({ accountId: "a2" })], [game("main", 5, { accountId: "a1" }), game("alt", 40, { accountId: "a2" })], T0 + 2 * HOUR);
    expect(plan.assign.map((a) => a.matchId)).toEqual(["alt"]);
  });

  it("puts a late game into the ended session it was played in", () => {
    const ended = session({ endedAt: T0 + 2 * HOUR, lastActivityAt: T0 + 2 * HOUR });
    const plan = planAssociation([ended], [game("late", 80), game("after", 130)], T0 + 6 * HOUR);
    expect(plan.assign.map((a) => a.matchId)).toEqual(["late"]);
  });

  it("marks a game that fits two sessions for confirmation and gives it to the earlier one", () => {
    const first = session({ id: "s1", endedAt: T0 + 50 * MIN, lastActivityAt: T0 + 50 * MIN });
    const second = session({ id: "s2", startedAt: T0 + 52 * MIN, lastActivityAt: T0 + 52 * MIN });
    const plan = planAssociation([second, first], [game("overlap", 35)], T0 + 2 * HOUR);
    expect(plan.assign).toEqual([{ matchId: "overlap", sessionId: "s1", ambiguousWith: "s2" }]);
  });

  it("ends a session left idle at its last activity, so a game the next day does not join it", () => {
    const plan = planAssociation([session({ lastActivityAt: T0 + 30 * MIN })], [game("next-day", 26 * 60)], T0 + 30 * HOUR);
    expect(plan.assign).toEqual([]);
    expect(plan.end).toEqual([{ sessionId: "s1", at: T0 + 30 * MIN, reason: "idle" }]);
  });

  it("ends an idle session on reading too, with no new game at all", () => {
    expect(planAssociation([session()], [], T0 + SESSION_IDLE_MS + 1).end).toEqual([{ sessionId: "s1", at: T0, reason: "idle" }]);
    expect(planAssociation([session()], [], T0 + SESSION_IDLE_MS).end).toEqual([]);
  });

  it("ends a two-loss session on its second loss; later games stay out of it", () => {
    const plan = planAssociation([session({ rule: "two-losses", losses: 1 })], [game("w", 5), game("l", 40, { win: false }), game("after", 75)], T0 + 3 * HOUR);
    expect(plan.assign.map((a) => a.matchId)).toEqual(["w", "l"]);
    expect(plan.end).toEqual([{ sessionId: "s1", at: T0 + 70 * MIN, reason: "two-losses" }]);
  });

  it("joins nothing when no session covers the game", () => {
    expect(planAssociation([], [game("m", 5)], T0 + HOUR)).toEqual({ assign: [], end: [] });
  });
});

const g = (over: Partial<SummaryGame> = {}): SummaryGame => ({ championId: "Ahri", result: "win", reviewStatus: "done", execution: 2, wentWell: null, wentWrong: null, learning: "", adjustment: "", playedAt: 1, ...over });

describe("a session's summary", () => {
  it("counts results, champions and reviews, and keeps the player's own words", () => {
    const s = summariseSession(
      [
        g({ playedAt: 1, learning: "Ward earlier", wentWrong: "vision" }),
        g({ playedAt: 2, result: "loss", championId: "Syndra", execution: 3, wentWrong: "vision", adjustment: "Buy a Control Ward on every back" }),
        g({ playedAt: 3, reviewStatus: "skipped", execution: null }),
        g({ playedAt: 4, reviewStatus: "pending", execution: null }),
      ],
      "jungle-awareness",
    );
    expect(s).toMatchObject({ games: 4, wins: 3, losses: 1, reviews: { done: 2, skipped: 1, pending: 1 }, execution: { rated: 2, followed: 2 } });
    expect(s.champions).toEqual([
      { championId: "Ahri", games: 3, wins: 3 },
      { championId: "Syndra", games: 1, wins: 0 },
    ]);
    expect(s.recurring).toEqual([{ key: "vision", count: 2 }]);
    expect(s.learnings).toEqual(["Ward earlier"]);
    expect(s.nextAdjustment).toBe("Buy a Control Ward on every back");
    expect(s.suggestions.join(" ")).toMatch(/followed your plan in 2 of 2/);
    expect(s.suggestions.join(" ")).toMatch(/Vision was the hardest part in 2 games/);
  });

  it("suggests nothing it cannot support", () => {
    const s = summariseSession([g({ reviewStatus: "skipped", execution: null })], null);
    expect(s.suggestions).toEqual(["Review a game or two next time: this summary can only draw on your reviews."]);
    expect(summariseSession([], null).suggestions).toEqual([]);
  });

  it("notices a plan that was hard to apply", () => {
    const s = summariseSession([g({ execution: 0 }), g({ execution: 1 }), g({ execution: 0 })], null);
    expect(s.suggestions.join(" ")).toMatch(/hard to apply \(followed in 0 of 3/);
  });

  it("does not suggest adding the area the objective already covers", () => {
    const s = summariseSession([g({ wentWrong: "vision" }), g({ wentWrong: "vision" })], "vision");
    expect(s.suggestions.join(" ")).not.toMatch(/Development library/);
  });
});

describe("reviews", () => {
  it("accept any one answer, and refuse an empty review (skip exists for that)", () => {
    expect(cleanReview({ execution: 2 })).toMatchObject({ ok: true, value: { execution: 2, learning: "" } });
    expect(cleanReview({ learning: "  Ward   first " })).toMatchObject({ ok: true, value: { learning: "Ward first", execution: null } });
    expect(cleanReview({})).toMatchObject({ ok: false, error: expect.stringMatching(/skip/) });
    expect(cleanReview({ execution: 4 })).toMatchObject({ ok: false });
    expect(cleanReview({ execution: 1, wentWell: "farming" })).toMatchObject({ ok: false });
    expect(cleanReview({ execution: 1, adjustment: "x".repeat(201) })).toMatchObject({ ok: false });
  });

  it("follow self-reported plan follow-through over the latest reviews", () => {
    const reviews = [3, 3, 2, 1, 0, 0, 0, 0, 0, 0].map((execution, i) => ({ execution, reviewedAt: 100 - i }));
    expect(executionTrend(reviews, 4)).toEqual({ recent: { rated: 4, followed: 3 }, previous: { rated: 4, followed: 0 } });
    expect(executionTrend([{ execution: null, reviewedAt: 1 }])).toEqual({ recent: { rated: 0, followed: 0 }, previous: { rated: 0, followed: 0 } });
  });

  it("count the areas named, keeping only repeated ones when asked", () => {
    expect(areaCounts(["vision", "trading", "vision", null, "bogus"], 2)).toEqual([{ key: "vision", count: 2 }]);
  });
});
