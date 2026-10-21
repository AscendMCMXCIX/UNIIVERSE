import { describe, expect, it } from "vitest";
import { compareWithGames, compareWithScout, evidenceOf, identityState, judgeCandidate, pointsAgree, rankCandidates, type Evidence } from "./identity";
import { emptyPlayer } from "./types";

/*
  Who is behind a name: what counts as agreement between what the screenshots show and what
  UNIIVERSE knows of an account, and that agreement is only ever a reason to check, never proof.
*/

const name = (id: string) => id;
const day = (n: number) => new Date(Date.UTC(2026, 9, n));

/** Jettos as the client showed him in the reference screenshots (mastery top five, total, rank). */
const jettos: Evidence = {
  rank: { tier: "PLATINUM", division: "IV", lp: null },
  totalMastery: 811,
  ranked: [{ championId: "Ornn", games: 2 }, { championId: "Yuumi", games: 1 }],
  mastery: [
    { championId: "Ornn", points: 175_400, level: 19 },
    { championId: "Thresh", points: 122_900, level: 11 },
    { championId: "Jhin", points: 112_400, level: 13 },
    { championId: "Senna", points: 101_900, level: 12 },
    { championId: "Jinx", points: 96_800, level: 11 },
  ],
};

describe("mastery points", () => {
  it("only grow, at most so fast, allowing for the screenshots' rounding", () => {
    expect(pointsAgree(175_400, 175_400, 0)).toBe(true);
    expect(pointsAgree(175_400, 175_449, 0)).toBe(true); // "175.4k" against 175,449
    expect(pointsAgree(190_000, 175_400, 14)).toBe(true);
    expect(pointsAgree(160_000, 175_400, 14)).toBe(false); // points never go down
    expect(pointsAgree(900_000, 175_400, 3)).toBe(false); // not in three days
  });
});

describe("an earlier scout of the same account", () => {
  it("agrees: the same mastery champions with points that only grew, the same total or more, a close rank", () => {
    const then = { opponentName: "WTF", scoutedAt: day(1), evidence: { ...jettos, totalMastery: 790, mastery: jettos.mastery.map((c) => ({ ...c, points: c.points! - 5_000 })) } };
    const r = compareWithScout(jettos, then, day(15), name);
    expect(r.contradicts).toBe(false);
    expect(r.score).toBe(1);
    expect(r.facts[0]).toMatch(/^5 of 5 mastery champions as in your scout of WTF \(1 Oct\): Ornn, Thresh, Jhin…$/);
  });

  it("contradicts: mastery points lower than before belong to another account, however alike the champions", () => {
    const then = { opponentName: "WTF", scoutedAt: day(1), evidence: { ...jettos, mastery: jettos.mastery.map((c) => ({ ...c, points: c.points! + 80_000 })) } };
    const r = compareWithScout(jettos, then, day(15), name);
    expect(r.contradicts).toBe(true);
    expect(r.facts).toContain("Some mastery points are lower than before: probably another account");
  });
});

describe("judging candidates", () => {
  const scout = { opponentName: "WTF", scoutedAt: day(1), evidence: jettos };
  it("calls a candidate strong only when the evidence agrees and nothing contradicts it", () => {
    expect(judgeCandidate(jettos, { riotId: "Jettos#OCE", scouts: [scout], games: null }, day(2), name).strength).toBe("strong");
    const lower = { ...scout, evidence: { ...jettos, mastery: jettos.mastery.map((c) => ({ ...c, points: c.points! * 2 })) } };
    expect(judgeCandidate(jettos, { riotId: "Jettos#OCE", scouts: [lower], games: null }, day(2), name).strength).toBe("name");
  });

  it("weighs the champions an account played against the team as weaker evidence", () => {
    const games = { games: 4, lastPlayedAt: day(9), champions: ["Ornn", "Thresh", "Lux"] };
    const r = compareWithGames(jettos, games, name);
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.facts[0]).toBe("Played with or against your team in 4 recorded games (last 9 Oct), on Ornn, Thresh");
    expect(judgeCandidate(jettos, { riotId: "Jettos#AU1", scouts: [], games }, day(10), name).strength).toBe("some");
    expect(judgeCandidate(jettos, { riotId: "Jettos#AU2", scouts: [], games: { games: 1, lastPlayedAt: day(9), champions: ["Lux"] } }, day(10), name).strength).toBe("name");
  });

  it("lists several accounts of the same name best first, choosing none of them", () => {
    const strong = judgeCandidate(jettos, { riotId: "Jettos#OCE", scouts: [scout], games: null }, day(2), name);
    const weak = judgeCandidate(jettos, { riotId: "Jettos#AU2", scouts: [], games: { games: 1, lastPlayedAt: day(9), champions: ["Lux"] } }, day(10), name);
    const ranked = rankCandidates([weak, strong]);
    expect(ranked.map((c) => c.riotId)).toEqual(["Jettos#OCE", "Jettos#AU2"]);
    expect(ranked[0]).not.toHaveProperty("score");
  });
});

describe("identity states and evidence", () => {
  it("is verified only with Riot's confirmation; a candidate is a possibility; no candidate is unresolved", () => {
    const p = { ...emptyPlayer(0), name: "Jettos" };
    expect(identityState({ ...p, verification: "verified" }, undefined)).toBe("verified");
    expect(identityState(p, [{ riotId: "Jettos#OCE", strength: "strong", facts: [] }])).toBe("possible");
    expect(identityState(p, [])).toBe("unresolved");
    expect(identityState(p, undefined)).toBe("unresolved");
    expect(identityState({ ...p, name: " " }, undefined)).toBe("none");
  });

  it("counts recognised and chosen champions as evidence, never a suggestion still to check", () => {
    const p = { ...emptyPlayer(0), name: "Jettos", mastery: [{ championId: "Ornn", championCertainty: "high" as const, points: 1, level: 1, certainty: "high" as const }, { championId: "Mel", championCertainty: "low" as const, points: 2, level: 2, certainty: "high" as const }, { championId: null, points: 3, level: 3, certainty: "low" as const }] };
    expect(evidenceOf(p).mastery.map((c) => c.championId)).toEqual(["Ornn"]);
  });
});
