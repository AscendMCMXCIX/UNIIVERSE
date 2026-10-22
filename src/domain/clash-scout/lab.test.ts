import { describe, expect, it } from "vitest";
import { applyVariant, emptyLabPlayer, emptyScenario, exampleScenario, exportScenario, gradeOf, parseMasteryLines, parseScenario, renamed, scenarioOf, type LabInput, type LabScenario } from "./lab";
import { importScenario } from "./lab-file";

/*
  The Testing Lab's test as the tester types it: what is read, what is refused (and where), the
  file a tester saves and opens again, typing help, the outdated-data variants, and how a result
  with known answers is graded.
*/

const NOW = Date.parse("2026-10-22T09:00:00Z");
const DAY = 86_400_000;

const withPlayers = (...players: Array<Partial<LabScenario["players"][number]>>): LabScenario => {
  const s = emptyScenario("oc1");
  players.forEach((p, i) => {
    s.players[i] = { ...emptyLabPlayer(), ...p, champions: Array.from({ length: 5 }, (_, k) => p.champions?.[k] ?? { championId: null, points: "" }) };
  });
  return s;
};
const champ = (championId: string, points = "") => ({ championId, points });

describe("a manual test as typed", () => {
  it("reads every way a figure is written and keeps how precise it was", () => {
    const { inputs, issues } = parseScenario(withPlayers({ name: "Top Example", champions: [champ("Riven", "450,000"), champ("Ambessa", "175k"), champ("Gwen", "130.4k"), champ("Camille", "87000"), champ("Olaf", "1.2m")] }), NOW);
    expect(issues).toEqual([]);
    // The client lists the five with the most points first; the engine gets them in that order.
    expect(inputs[0]!.shown.champions).toEqual([
      { championId: "Olaf", points: 1_200_000, precision: 50_000 },
      { championId: "Riven", points: 450_000, precision: 0 },
      { championId: "Ambessa", points: 175_000, precision: 500 },
      { championId: "Gwen", points: 130_400, precision: 50 },
      { championId: "Camille", points: 87_000, precision: 0 },
    ]);
    expect(inputs[0]).toMatchObject({ slot: 0, name: "Top Example", riotId: null, shown: { totalScore: null, capturedAt: NOW } });
  });

  it("takes incomplete players: champions without points, fewer than five, no total", () => {
    const { inputs, issues } = parseScenario(withPlayers({ name: "Support", champions: [champ("Thresh", "720k"), champ("Lulu")] }), NOW);
    expect(issues).toEqual([]);
    expect(inputs[0]!.shown.champions).toEqual([
      { championId: "Thresh", points: 720_000, precision: 500 },
      { championId: "Lulu", points: null, precision: 0 },
    ]);
  });

  it("refuses what it cannot read, saying where: duplicates, points without a champion, unknown champions, bad figures", () => {
    const { issues } = parseScenario(withPlayers({ name: "A", champions: [champ("Riven", "450k"), champ("Riven", "100k"), { championId: null, points: "20k" }, champ("Nobody", "1k"), champ("Gwen", "12x")] }), NOW, (id) => id !== "Nobody");
    expect(issues.map((i) => i.path)).toEqual(["players.0.champions.1.championId", "players.0.champions.2.championId", "players.0.champions.3.championId", "players.0.champions.4.points"]);
    expect(issues[0]!.message).toMatch(/already in this player's five/);
  });

  it("a player with figures needs a name; a test needs at least one player", () => {
    expect(parseScenario(withPlayers({ champions: [champ("Riven", "450k")] }), NOW).issues).toEqual([{ path: "players.0.name", message: "Enter the name shown, or clear this player." }]);
    expect(parseScenario(emptyScenario(), NOW).issues).toEqual([{ path: "players", message: "Enter at least one player's name." }]);
  });

  it("a name needs no tag; with a full Riot ID the tag is kept for Riot's exact check, and a malformed one is refused", () => {
    const ok = parseScenario(withPlayers({ name: "RivenMain#OCE", champions: [champ("Riven", "450k")] }, { name: "Пётр Пустота", champions: [champ("Thresh", "1k")] }, { name: "토끼#KR1" }), NOW);
    expect(ok.issues).toEqual([]);
    expect(ok.inputs.map((i) => [i.name, i.riotId])).toEqual([
      ["RivenMain", "RivenMain#OCE"],
      ["Пётр Пустота", null],
      ["토끼", "토끼#KR1"],
    ]);
    const bad = parseScenario(withPlayers({ name: "RivenMain#X" }, { name: "A#B#OCE" }, { name: "Seventeen letters" }), NOW);
    expect(bad.issues.map((i) => i.path)).toEqual(["players.0.name", "players.1.name", "players.2.name"]);
  });

  it("dates: a date in the past is noon UTC that day, a future date is refused, an unknown date allows any growth", () => {
    const dated = parseScenario({ ...withPlayers({ name: "A" }), referenceDate: "2026-08-20" }, NOW);
    expect(dated.inputs[0]!.shown.capturedAt).toBe(Date.parse("2026-08-20T12:00:00Z"));
    expect(parseScenario({ ...withPlayers({ name: "A" }), referenceDate: "2026-12-01" }, NOW).issues).toEqual([{ path: "referenceDate", message: "The date is in the future." }]);
    expect(parseScenario({ ...withPlayers({ name: "A" }), dateUnknown: true }, NOW).inputs[0]!.shown.capturedAt).toBeNull();
  });

  it("the total mastery score is a whole number", () => {
    expect(parseScenario(withPlayers({ name: "A", totalScore: "1,204" }), NOW).inputs[0]!.shown.totalScore).toBe(1204);
    expect(parseScenario(withPlayers({ name: "A", totalScore: "12.5" }), NOW).issues[0]!.path).toBe("players.0.totalScore");
  });

  it("the example reads without a single issue", () => {
    const { inputs, issues } = parseScenario(exampleScenario(), NOW);
    expect(issues).toEqual([]);
    expect(inputs).toHaveLength(5);
  });
});

describe("a test file, saved and opened by the tester", () => {
  it("opens exactly what was saved", () => {
    const s = exampleScenario("euw1");
    const r = importScenario(exportScenario(s));
    expect(r).toEqual({ ok: true, scenario: s });
  });

  it("fills a short file out to five players of five champions", () => {
    const text = JSON.stringify({ kind: "uniiverse-clash-lab", version: 1, scenario: { platform: "oc1", players: [{ name: "Only", champions: [{ championId: "Riven", points: "1k" }] }] } });
    const r = importScenario(text);
    if (!r.ok) throw new Error(r.error);
    expect(r.scenario.players).toHaveLength(5);
    expect(r.scenario.players[0]!.champions).toHaveLength(5);
    expect(r.scenario).toMatchObject({ teamName: "", referenceDate: "", dateUnknown: false });
  });

  it("refuses anything else, without reading it as a test", () => {
    expect(importScenario("not json")).toEqual({ ok: false, error: "This file is not JSON." });
    expect(importScenario(JSON.stringify({ kind: "something-else", version: 1, scenario: {} })).ok).toBe(false);
    expect(importScenario(JSON.stringify({ kind: "uniiverse-clash-lab", version: 1, scenario: { platform: "../etc", players: [] } })).ok).toBe(false);
    expect(importScenario(JSON.stringify({ kind: "uniiverse-clash-lab", version: 1, scenario: { platform: "oc1", players: Array.from({ length: 6 }, () => ({ name: "x", champions: [] })) } })).ok).toBe(false);
  });
});

describe("typing help", () => {
  const champions = [
    { id: "Riven", name: "Riven" },
    { id: "Ambessa", name: "Ambessa" },
    { id: "Kaisa", name: "Kai'Sa" },
    { id: "LeeSin", name: "Lee Sin" },
  ];

  it("reads lines as people paste them", () => {
    const r = parseMasteryLines("1. Riven 450,000\nAmbessa — 175k\nKai'Sa: 120.3k\nlee sin 98.1k pts\nTeemo 10k", champions);
    expect(r.entries).toEqual([champ("Riven", "450,000"), champ("Ambessa", "175k"), champ("Kaisa", "120.3k"), champ("LeeSin", "98.1k")]);
    expect(r.unknown).toEqual(["Teemo"]);
  });

  it("a champion without a figure is kept as a champion only", () => {
    expect(parseMasteryLines("Riven", champions).entries).toEqual([champ("Riven", "")]);
  });
});

describe("the outdated-data variants", () => {
  const input: LabInput = {
    slot: 0,
    name: "RivenMain",
    riotId: null,
    shown: {
      champions: [
        { championId: "Riven", points: 450_000, precision: 0 },
        { championId: "Ambessa", points: 175_000, precision: 0 },
        { championId: "Gwen", points: 130_000, precision: 0 },
        { championId: "Camille", points: 87_000, precision: 0 },
        { championId: "Olaf", points: 42_000, precision: 0 },
      ],
      totalScore: 640,
      capturedAt: NOW,
    },
  };
  const points = (i: LabInput) => i.shown.champions.map((c) => c.points);

  it("an older screen shows fewer points, by the growth the tester chose, and an earlier date", () => {
    const aged = applyVariant(input, { kind: "aged", days: 60, growth: 25 }, NOW);
    expect(aged.shown.capturedAt).toBe(NOW - 60 * DAY);
    expect(points(aged)).toEqual([360_000, 140_000, 104_000, 69_600, 33_600]);
    expect(aged.shown.totalScore).toBe(602);
    const uneven = applyVariant(input, { kind: "aged", days: 60, growth: 25, uneven: true }, NOW);
    expect(points(uneven)).toEqual([300_000, 175_000, 86_667, 87_000, 28_000]);
  });

  it("a champion entering the top five: the older screen shows the sixth where today's fifth is", () => {
    const changed = applyVariant(input, { kind: "top-five-change", days: 60 }, NOW, { championId: "Jax", points: 30_000 });
    expect(changed.shown.champions.map((c) => c.championId)).toEqual(["Riven", "Ambessa", "Gwen", "Camille", "Jax"]);
    // Without the sixth (a manual test), only the first four.
    expect(applyVariant(input, { kind: "top-five-change", days: 60 }, NOW).shown.champions).toHaveLength(4);
  });

  it("another order, rounding, missing and fewer figures, another name", () => {
    expect(applyVariant(input, { kind: "reordered", days: 30 }, NOW).shown.champions.map((c) => [c.championId, c.points])).toEqual([
      ["Riven", 450_000],
      ["Gwen", 130_000],
      ["Ambessa", 126_100],
      ["Camille", 87_000],
      ["Olaf", 42_000],
    ]);
    expect(applyVariant({ ...input, shown: { ...input.shown, champions: [{ championId: "Riven", points: 450_449, precision: 0 }] } }, { kind: "rounded" }, NOW).shown.champions[0]).toEqual({ championId: "Riven", points: 450_000, precision: 500 });
    // A figure rounded once already: narrowed only when its whole range rounds the same way.
    const twice = (points: number) => applyVariant({ ...input, shown: { ...input.shown, champions: [{ championId: "Ezreal", points, precision: 50 }] } }, { kind: "rounded" }, NOW).shown.champions[0];
    expect(twice(105_400)).toEqual({ championId: "Ezreal", points: 105_000, precision: 500 });
    // "105.5k" is 105,450 to 105,549: a screen may show 105k or 106k; the range must still hold 105,469.
    expect(twice(105_500)).toEqual({ championId: "Ezreal", points: 106_000, precision: 550 });
    expect(points(applyVariant(input, { kind: "missing", count: 2 }, NOW))).toEqual([450_000, 175_000, 130_000, null, null]);
    expect(applyVariant(input, { kind: "incomplete", count: 3 }, NOW).shown.champions).toHaveLength(3);
    expect(applyVariant(input, { kind: "renamed" }, NOW).name).toBe(renamed("RivenMain"));
    expect(renamed("RivenMain")).not.toBe("RivenMain");
    expect(applyVariant(input, { kind: "baseline" }, NOW)).toBe(input);
  });

  it("any variant can go back into the editor and reads as the same test", () => {
    for (const v of [{ kind: "aged", days: 60, growth: 15 }, { kind: "rounded" }, { kind: "missing", count: 2 }] as const) {
      const changed = applyVariant(input, v, NOW);
      const back = parseScenario(scenarioOf([changed], "oc1", "Test"), NOW).inputs[0]!;
      expect(back.shown.champions).toEqual(changed.shown.champions);
      expect(back.name).toBe(changed.name);
      // A day's precision: the editor keeps the date, not the hour.
      expect(Math.abs(back.shown.capturedAt! - changed.shown.capturedAt!)).toBeLessThan(DAY);
    }
  });
});

describe("grading a test with known answers", () => {
  it("only a named account can be correct or incorrect; ambiguity and missing accounts are said as such", () => {
    expect(gradeOf("strong", true, 1)).toBe("correct");
    expect(gradeOf("verified", true, 1)).toBe("correct");
    expect(gradeOf("strong", false, 2)).toBe("incorrect");
    expect(gradeOf("strong", false, null)).toBe("incorrect");
    expect(gradeOf("ambiguous", false, 1)).toBe("ambiguous");
    expect(gradeOf("partial", true, 1)).toBe("not-identified");
    expect(gradeOf("differs", false, null)).toBe("not-discovered");
    expect(gradeOf("not-discovered", false, null)).toBe("not-discovered");
    expect(gradeOf("not-enough", false, 1)).toBe("not-enough");
  });
});
