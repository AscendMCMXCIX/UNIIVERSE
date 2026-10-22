import { describe, expect, it } from "vitest";
import { candidateView, evidenceOf, identityState, shownFromEvidence, type Evidence } from "./identity";
import { judgeSnapshot } from "./mastery-match";
import { emptyPlayer } from "./types";

/*
  Who is behind a name: what the screenshots give the matching rules, how a judgement reads on a
  card, and that agreement is only ever a reason to check, never proof (mastery-match.test.ts holds
  the rules themselves).
*/

const NOW = Date.UTC(2026, 9, 22);

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

describe("what the screenshots give the matching rules", () => {
  it("reads the client's figures as precisely as it writes them, taken now", () => {
    const shown = shownFromEvidence(jettos, NOW);
    expect(shown.capturedAt).toBe(NOW);
    expect(shown.totalScore).toBe(811);
    expect(shown.champions[0]).toEqual({ championId: "Ornn", points: 175_400, precision: 50 });
    expect(shown.champions.map((c) => c.championId)).toEqual(["Ornn", "Thresh", "Jhin", "Senna", "Jinx"]);
  });

  it("the account the reference screenshots show agrees with itself, and the card calls it strong, contradictions first", () => {
    const shown = shownFromEvidence(jettos, NOW);
    const same = judgeSnapshot(shown, { champions: jettos.mastery.map((c) => ({ championId: c.championId!, points: c.points! + 30 })), coverage: "full", totalScore: 811, capturedAt: NOW, label: "Riot, now" }, (id) => id);
    expect(candidateView("Jettos#OCE", same, ["Played with or against your team in 2 recorded games (last 12 Oct)"])).toEqual({
      riotId: "Jettos#OCE",
      strength: "strong",
      facts: ["5 of 5 champions agree (5 exactly)", "Total mastery 811, the same", "Played with or against your team in 2 recorded games (last 12 Oct)"],
    });
    const other = judgeSnapshot(shown, { champions: [{ championId: "Ornn", points: 90_000 }], coverage: "full", totalScore: 300, capturedAt: NOW, label: "Riot, now" }, (id) => id);
    const view = candidateView("Jettos#AU2", other, []);
    expect(view.strength).toBe("name");
    expect(view.facts[0]).toBe("Ornn: 90,000 now, fewer than the 175.4k shown (points never go down)");
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
    const p = { ...emptyPlayer(0), name: "Jettos", mastery: [
      { championId: "Ornn", championCertainty: "high" as const, level: 19, points: 175_400, certainty: "high" as const },
      { championId: "Thresh", championCertainty: "low" as const, level: 11, points: 122_900, certainty: "high" as const },
    ] };
    expect(evidenceOf(p).mastery.map((c) => c.championId)).toEqual(["Ornn"]);
  });
});
