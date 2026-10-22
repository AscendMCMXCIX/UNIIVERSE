import { describe, expect, it } from "vitest";
import { decide, judgeAccount, judgeSnapshot, rankJudged, type MasterySnapshot, type ShownPlayer } from "./mastery-match";

/*
  Matching on champion mastery: what agrees and what contradicts, with the brief's example opponent
  (Riven, Ambessa, Gwen, Camille, Olaf). The rules rest on Riot's facts: points and the total
  mastery score never go down, and the client shows the five champions with the most points.
*/

const name = (id: string) => id;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 22, 6);

const shown = (over: Partial<ShownPlayer> = {}, precision = 0): ShownPlayer => ({
  champions: [
    { championId: "Riven", points: 450_000, precision },
    { championId: "Ambessa", points: 175_000, precision },
    { championId: "Gwen", points: 130_000, precision },
    { championId: "Camille", points: 87_000, precision },
    { championId: "Olaf", points: 42_000, precision },
  ],
  totalScore: null,
  capturedAt: NOW,
  ...over,
});

const riot = (points: Record<string, number>, over: Partial<MasterySnapshot> = {}): MasterySnapshot => ({
  champions: Object.entries(points).map(([championId, p]) => ({ championId, points: p })),
  coverage: "full",
  totalScore: null,
  capturedAt: NOW,
  label: "Riot, now",
  ...over,
});

const owner = { Riven: 450_000, Ambessa: 175_000, Gwen: 130_000, Camille: 87_000, Olaf: 42_000, Jax: 30_000, Fiora: 12_000 };

describe("one account against what the screen showed", () => {
  it("the same figures on the same day agree exactly and strongly", () => {
    const j = judgeSnapshot(shown(), riot(owner), name);
    expect(j.strength).toBe("strong");
    expect(j.agreements).toBe(5);
    expect(j.contradictions).toEqual([]);
    expect(j.facts[0]).toBe("5 of 5 champions agree (5 exactly)");
  });

  it("allows for the screen's rounding: 450k stands for 449,500 to 450,499", () => {
    const j = judgeSnapshot(shown({}, 500), riot({ ...owner, Riven: 450_400, Olaf: 41_600 }), name);
    expect(j.strength).toBe("strong");
    expect(j.perChampion.every((p) => p.verdict === "same")).toBe(true);
  });

  it("an older screen: points that grew since agree, however much over two months", () => {
    const old = shown({ capturedAt: NOW - 60 * DAY });
    const j = judgeSnapshot(old, riot({ ...owner, Riven: 610_000, Ambessa: 260_000, Gwen: 131_000, Camille: 87_000, Olaf: 99_000 }), name);
    expect(j.strength).toBe("strong");
    expect(j.perChampion.map((p) => p.verdict)).toEqual(["grew", "grew", "grew", "same", "grew"]);
    expect(j.facts[0]).toBe("5 of 5 champions agree (1 exactly) over 60 days");
  });

  it("points never go down: fewer now than the screen showed contradicts the account", () => {
    const j = judgeSnapshot(shown(), riot({ ...owner, Gwen: 110_000 }), name);
    expect(j.strength).toBe("differs");
    expect(j.contradictions).toEqual(["Gwen: 110,000 now, fewer than the 130,000 shown (points never go down)"]);
  });

  it("growth no play could explain contradicts: 120,000 more on the same day", () => {
    const j = judgeSnapshot(shown(), riot({ ...owner, Ambessa: 295_000 }), name);
    expect(j.strength).toBe("differs");
    expect(j.contradictions[0]).toMatch(/^Ambessa: 120,000 more in the same day, more than play could add$/);
  });

  it("a champion shown with points that the account has never played contradicts it", () => {
    const { Olaf: _olaf, ...noOlaf } = owner;
    const j = judgeSnapshot(shown(), riot(noOlaf), name);
    expect(j.strength).toBe("differs");
    expect(j.contradictions).toContain("Olaf shows 42,000, but the account has never played it");
  });

  it("a champion with clearly more points than the fifth shown would have been one of the five", () => {
    const j = judgeSnapshot(shown(), riot({ ...owner, Jinx: 300_000 }), name);
    expect(j.strength).toBe("differs");
    expect(j.contradictions).toEqual(["Jinx has 300,000 now: it would have been among the five shown"]);
  });

  it("over two months a champion may enter the top five and another leave it", () => {
    const old = shown({ capturedAt: NOW - 60 * DAY });
    const j = judgeSnapshot(old, riot({ ...owner, Jinx: 300_000, Olaf: 45_000 }), name);
    expect(j.strength).toBe("strong");
  });

  it("an older screen that listed the champions in another order still agrees when the points only grew", () => {
    // Two months ago Gwen was above Ambessa; Ambessa has since passed her.
    const old: ShownPlayer = { ...shown({ capturedAt: NOW - 60 * DAY }), champions: [
      { championId: "Riven", points: 430_000, precision: 0 },
      { championId: "Gwen", points: 128_000, precision: 0 },
      { championId: "Ambessa", points: 120_000, precision: 0 },
      { championId: "Camille", points: 80_000, precision: 0 },
      { championId: "Olaf", points: 40_000, precision: 0 },
    ] };
    expect(judgeSnapshot(old, riot(owner), name).strength).toBe("strong");
  });

  it("champions without points only say whether the account plays them; two or three figures make a partial match at best", () => {
    const sparse: ShownPlayer = { ...shown(), champions: [
      { championId: "Riven", points: 450_000, precision: 0 },
      { championId: "Ambessa", points: 175_000, precision: 0 },
      { championId: "Gwen", points: 130_000, precision: 0 },
      { championId: "Camille", points: null, precision: 0 },
      { championId: "Teemo", points: null, precision: 0 },
    ] };
    const j = judgeSnapshot(sparse, riot(owner), name);
    expect(j.strength).toBe("differs"); // Teemo has never been played
    expect(j.contradictions).toEqual(["Teemo is shown, but the account has never played it"]);
    const fair = { ...sparse, champions: sparse.champions.slice(0, 4) };
    const k = judgeSnapshot(fair, riot(owner), name);
    expect(k.strength).toBe("partial");
    expect(k.facts).toContain("Plays the champion shown without points");
  });

  it("with the screen's date unknown, growth of any size is possible; only figures that went down contradict", () => {
    const undated = shown({ capturedAt: null });
    expect(judgeSnapshot(undated, riot({ ...owner, Riven: 2_000_000, Jinx: 900_000 }), name).strength).toBe("strong");
    expect(judgeSnapshot(undated, riot({ ...owner, Riven: 400_000 }), name).strength).toBe("differs");
  });

  it("the total mastery score never goes down, and grows only so fast", () => {
    const withTotal = shown({ totalScore: 811 });
    expect(judgeSnapshot(withTotal, riot(owner, { totalScore: 811 }), name).facts).toContain("Total mastery 811, the same");
    expect(judgeSnapshot(withTotal, riot(owner, { totalScore: 790 }), name).contradictions).toEqual(["Total mastery 790 now, against 811 shown (it never goes down)"]);
    expect(judgeSnapshot(withTotal, riot(owner, { totalScore: 900 }), name).contradictions).toEqual(["Total mastery 89 higher in the same day, more than play could add"]);
  });

  it("an earlier scout's top five: a champion it showed with more than today's fifth must be shown today", () => {
    const earlier: MasterySnapshot = { champions: [{ championId: "Riven", points: 400_000 }, { championId: "Zed", points: 90_000 }, { championId: "Gwen", points: 100_000 }, { championId: "Camille", points: 60_000 }, { championId: "Olaf", points: 30_000 }], coverage: "top", totalScore: null, capturedAt: NOW - 30 * DAY, label: "your scout of Night Owls (22 Sep)" };
    const j = judgeSnapshot(shown(), earlier, name);
    expect(j.contradictions).toEqual(["Zed has 90,000 before: it would have been among the five shown"]);
  });

  it("no mastery known is said as such, never as a mismatch", () => {
    const j = judgeSnapshot(shown(), null, name);
    expect(j.strength).toBe("unscored");
    expect(j.facts).toEqual(["No mastery known for this account"]);
  });

  it("judges an account on its latest figures, and any earlier ones may still contradict it", () => {
    const later = riot(owner);
    const earlier = { ...riot({ ...owner, Riven: 700_000 }), capturedAt: NOW - 10 * DAY, label: "your scout of WTF (12 Oct)" };
    const j = judgeAccount(shown(), [earlier, later], name);
    expect(j.strength).toBe("differs");
    expect(j.contradictions[0]).toMatch(/Riven: 700,000 before, more than the 450,000 shown now .*\(your scout of WTF \(12 Oct\)\)$/);
  });
});

describe("a player's candidates together", () => {
  const judged = (snaps: Array<[string, MasterySnapshot | null]>, s = shown()) =>
    rankJudged(
      snaps.map(([riotId, snap]) => ({ candidate: riotId, judgement: judgeSnapshot(s, snap, name), verified: false })),
      (c) => c,
    );

  it("one strong account among others is a strong statistical match, best first", () => {
    const ranked = judged([
      ["Decoy#OCE", riot({ ...owner, Jinx: 300_000 })],
      ["Owner#OCE", riot(owner)],
    ]);
    expect(ranked.map((r) => r.candidate)).toEqual(["Owner#OCE", "Decoy#OCE"]);
    expect(decide(shown(), ranked).outcome).toBe("strong");
  });

  it("two accounts the mastery shown cannot tell apart are ambiguous, never a pick", () => {
    const ranked = judged([
      ["Twin#OCE", riot({ ...owner, Riven: 451_000 })],
      ["Owner#OCE", riot(owner)],
    ]);
    const d = decide(shown(), ranked);
    expect(d.outcome).toBe("ambiguous");
    expect(d.reasons[0]).toBe("2 accounts agree equally well: the mastery shown cannot tell them apart");
  });

  it("names nobody when no account was discovered, and says when too little was shown", () => {
    expect(decide(shown(), []).outcome).toBe("not-discovered");
    const thin: ShownPlayer = { champions: [{ championId: "Riven", points: 450_000, precision: 0 }], totalScore: null, capturedAt: NOW };
    expect(decide(thin, judged([["Owner#OCE", riot(owner)]], thin)).outcome).toBe("not-enough");
  });

  it("candidates that could not be compared are reported as such", () => {
    expect(decide(shown(), judged([["Owner#OCE", null]])).outcome).toBe("unscored");
    expect(decide(shown(), judged([["Other#OCE", riot({ ...owner, Gwen: 5_000 })]])).outcome).toBe("differs");
  });

  it("a verified Riot ID outranks every statistical match", () => {
    const ranked = rankJudged(
      [
        { candidate: "Owner#OCE", judgement: judgeSnapshot(shown(), riot(owner), name), verified: false },
        { candidate: "Typed#OCE", judgement: judgeSnapshot(shown(), null, name), verified: true },
      ],
      (c) => c,
    );
    expect(ranked[0]!.candidate).toBe("Typed#OCE");
    expect(decide(shown(), ranked).outcome).toBe("verified");
  });
});
