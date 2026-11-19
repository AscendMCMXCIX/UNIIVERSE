import { describe, expect, it } from "vitest";
import { MAX_WORDS, firingNotes, matchNotes, refusedWordsIn, wordCount, type NotesInput } from "./match-notes";
import type { FigureComparison, PersonalComparison } from "./match-analysis";

const base = (over: Partial<NotesInput> = {}): NotesInput => ({
  own: true,
  champion: "Gwen",
  role: "TOP",
  queueId: 420,
  durationS: 28 * 60,
  win: true,
  me: { kills: 7, deaths: 5, assists: 3, damageShare: 0.2, vision: 18, killParticipation: 0.5, controlWardsBought: 2, soloKills: 0, largestMultiKill: 1, turretTakedowns: 1 },
  allies: [
    { deaths: 4, damageShare: 0.22, vision: 20 },
    { deaths: 3, damageShare: 0.18, vision: 25 },
    { deaths: 6, damageShare: 0.25, vision: 15 },
    { deaths: 2, damageShare: 0.15, vision: 50 },
  ],
  enemies: [{ vision: 20 }, { vision: 22 }, { vision: 16 }, { vision: 30 }, { vision: 45 }],
  teamTowers: 6,
  opponent: "Garen",
  lane: null,
  pair: null,
  personal: null,
  deathTimes: null,
  gold: null,
  objectives: null,
  ...over,
});

const fig = (over: Partial<FigureComparison> & Pick<FigureComparison, "key">): FigureComparison => ({ label: over.key, value: 1, percentile: 0.5, below: 12, median: 1, top: 2, games: 24, best: false, ...over });
const personal = (figures: FigureComparison[]): PersonalComparison => ({ role: "TOP", group: "ranked", figures });
const lane = (cs10: [number, number], g10: [number, number], g15?: [number, number]) => [
  { minute: 10, you: { cs: cs10[0], gold: g10[0], xp: 4000 }, opponent: { cs: cs10[1], gold: g10[1], xp: 4000 } },
  { minute: 15, you: g15 ? { cs: 120, gold: g15[0], xp: 7000 } : null, opponent: g15 ? { cs: 110, gold: g15[1], xp: 7000 } : null },
];

/** Every input the tests build, to check the hard rules over every sentence they produce. */
const everyCase: NotesInput[] = [];
const notesOf = (x: NotesInput) => {
  everyCase.push(x, { ...x, own: false });
  return matchNotes(x);
};

describe("match notes", () => {
  it("says the lane at 10 minutes against the lane opponent (L1, L2), with numbers", () => {
    const up = notesOf(base({ lane: lane([71, 24], [4000, 3800]) }));
    expect(up.well.map((n) => n.id)).toContain("L1");
    expect(up.well.find((n) => n.id === "L1")!.text).toBe("You had 47 more CS than Garen at 10 minutes (71 to 24).");
    const down = notesOf(base({ lane: lane([50, 62], [3000, 3800]) }));
    expect(down.wrong.find((n) => n.id === "L2")!.text).toBe("You had 12 fewer CS and 800 less gold than Garen at 10 minutes.");
    // A small difference says nothing.
    expect(firingNotes(base({ lane: lane([60, 55], [3500, 3300]) })).filter((n) => n.topic === "lane")).toEqual([]);
  });

  it("says a lead that grew or fell between 10 and 15 minutes (L3, L4)", () => {
    const grew = notesOf(base({ lane: lane([60, 60], [3500, 3300], [6000, 5100]) }));
    expect(grew.well.find((n) => n.id === "L3")!.text).toBe("Your gold lead over Garen grew from 200 to 900 between 10 and 15 minutes.");
    const fell = notesOf(base({ lane: lane([60, 60], [3800, 3300], [5000, 5200]) }));
    expect(fell.wrong.find((n) => n.id === "L4")!.text).toBe("You went from 500 gold ahead of Garen to 200 behind between 10 and 15 minutes.");
  });

  it("gives a support no CS rule, and the bot lane two against two (L5)", () => {
    const sup = notesOf(base({ role: "SUPPORT", lane: lane([5, 30], [2500, 2550]), pair: { ally: "Jinx", opponents: ["Caitlyn", "Lux"], gold: -1200 } }));
    expect(firingNotes(base({ role: "SUPPORT", lane: lane([5, 30], [2500, 2550]) })).some((n) => n.id === "L2")).toBe(false);
    expect(sup.wrong.find((n) => n.id === "L5")!.text).toBe("You and Jinx had 1,200 less gold than Caitlyn and Lux at 10 minutes.");
    // Outside the bot lane the pair is never read.
    expect(firingNotes(base({ pair: { ally: "Jinx", opponents: ["Caitlyn", "Lux"], gold: -1200 } })).some((n) => n.id === "L5")).toBe(false);
  });

  it("counts early deaths only from the timeline (D1), and the most deaths on the team (D2)", () => {
    expect(notesOf(base({ deathTimes: [3.2, 7.9, 20] })).wrong.find((n) => n.id === "D1")!.text).toBe("2 of your 5 deaths came before 10 minutes.");
    expect(firingNotes(base({ deathTimes: null })).some((n) => n.id === "D1")).toBe(false);
    const many = notesOf(base({ me: { ...base().me, deaths: 9 } }));
    expect(many.wrong.map((n) => n.text)).toContain("9 deaths, the most on your team.");
    expect(notesOf(base({ me: { ...base().me, deaths: 1 } })).well.map((n) => n.text)).toContain("Only 1 death in 28 minutes.");
  });

  it("compares with the player's usual (P1–P3, K1), naming the sample", () => {
    const p = personal([
      fig({ key: "visionPerMin", label: "Vision/min", value: 0.63, median: 0.89, percentile: 1 / 24, below: 1, games: 24 }),
      fig({ key: "kda", label: "KDA", value: 4.5, median: 3.1, percentile: 0.9, below: 21, games: 24 }),
      fig({ key: "killParticipation", label: "Kill participation", value: 0.31, median: 0.52, percentile: 2 / 24, below: 2, games: 24 }),
    ]);
    const notes = notesOf(base({ personal: p }));
    expect(notes.well.find((n) => n.id === "P2")!.text).toBe("KDA higher than in 21 of your last 24 ranked Top games (4.50; usually 3.10).");
    expect(notes.wrong.map((n) => n.text)).toContain("Vision/min lower than in 23 of your last 24 ranked Top games (0.63; usually 0.89).");
    expect(notes.wrong.map((n) => n.text)).toContain("Kill participation lower than in 22 of your last 24 ranked Top games (31%; usually 52%).");
    const best = notesOf(base({ personal: personal([fig({ key: "damagePerMin", label: "Damage/min", value: 900, best: true, percentile: 1, below: 24 })]) }));
    expect(best.well[0]!.text).toBe("Your highest Damage/min in your last 24 ranked Top games (900).");
  });

  it("names the team's figures within the game (T1–T3, V1, S1, M1)", () => {
    const x = base({ me: { ...base().me, damageShare: 0.34, vision: 60, controlWardsBought: 0, soloKills: 3, largestMultiKill: 4, turretTakedowns: 4 } });
    const texts = firingNotes(x).map((n) => n.text);
    expect(texts).toEqual(expect.arrayContaining(["The most damage to champions on your team (34% of it).", "The highest vision score in the game (60).", "You took part in 4 of your team's 6 towers.", "No control wards bought.", "3 solo kills.", "A quadra kill."]));
    // A support is never named for damage; a missing figure says nothing.
    expect(firingNotes({ ...x, role: "SUPPORT" }).some((n) => n.id === "T1")).toBe(false);
    expect(firingNotes(base({ me: { ...base().me, controlWardsBought: undefined, soloKills: null } })).some((n) => n.id === "V1" || n.id === "S1")).toBe(false);
    everyCase.push(x, { ...x, own: false });
  });

  it("tells the team's gold story (G1, G2) and the jungle's objectives (J1)", () => {
    const won = notesOf(base({ gold: [{ minute: 5, diff: -500 }, { minute: 18.33, diff: -3400 }, { minute: 28, diff: 4000 }] }));
    expect(won.well.map((n) => n.text)).toContain("Your team won from 3,400 gold behind (at 18:20).");
    const lost = notesOf(base({ win: false, gold: [{ minute: 12, diff: 3100 }, { minute: 28, diff: -2000 }] }));
    expect(lost.wrong.map((n) => n.text)).toContain("Your team lost after leading by 3,100 gold (at 12:00).");
    const jg = notesOf(base({ role: "JUNGLE", objectives: [{ minute: 6, own: true, kind: "grubs", detail: null, count: 3 }, { minute: 9, own: true, kind: "dragon", detail: "FIRE" }, { minute: 14, own: false, kind: "herald", detail: null }] }));
    expect(jg.well.map((n) => n.text)).toContain("Before 15 minutes your team took 4 of the 5 dragons, voidgrubs and heralds.");
  });

  it("chooses at most 2 + 2 + 1, with distinct topics, whatever the result", () => {
    const x = base({
      win: false,
      lane: lane([71, 24], [4000, 3800]),
      deathTimes: [2, 4, 6, 20],
      me: { ...base().me, deaths: 9, damageShare: 0.34, vision: 60, controlWardsBought: 0, soloKills: 3, largestMultiKill: 3, turretTakedowns: 4 },
      personal: personal([fig({ key: "csPerMin", label: "CS/min", value: 4, median: 7, percentile: 0.05, below: 1 })]),
    });
    const notes = notesOf(x);
    expect(notes.well.length).toBe(2);
    expect(notes.wrong.length).toBe(2);
    expect(new Set(notes.wrong.map((n) => n.topic)).size).toBe(2);
    expect(new Set(notes.well.map((n) => n.topic)).size).toBe(2);
    // A Defeat still has Went well notes; personal notes come before highlights.
    expect(notes.well.some((n) => n.topic === "highlight")).toBe(false);
    expect(notes.focus).not.toBeNull();
  });

  it("words every note for the viewer: the champion and 'their' on a teammate's game, and no Focus next there", () => {
    const x = base({ deathTimes: [3, 8], personal: personal([fig({ key: "kda", label: "KDA", value: 1, median: 3, percentile: 0.05, below: 1 })]) });
    const own = matchNotes(x);
    const theirs = matchNotes({ ...x, own: false });
    expect(own.wrong.map((n) => n.text)).toContain("2 of your 5 deaths came before 10 minutes.");
    expect(theirs.wrong.map((n) => n.text)).toContain("2 of Gwen's 5 deaths came before 10 minutes.");
    expect(theirs.wrong.map((n) => n.text)).toContain("KDA lower than in 23 of their last 24 ranked Top games (1.00; usually 3.00).");
    expect(own.focus?.text).toBe("Staying alive before 10 minutes: 2 deaths before 10:00 this game.");
    expect(theirs.focus).toBeNull();
    for (const n of [...theirs.well, ...theirs.wrong]) expect(n.text).not.toMatch(/\byou(r)?\b/i);
    const g = matchNotes(base({ own: false, gold: [{ minute: 18, diff: -3400 }] }));
    expect(g.well.map((n) => n.text)).toContain("Their team won from 3,400 gold behind (at 18:00).");
  });

  it("falls back to one honest line: no baseline, nothing stood out, a remake", () => {
    expect(notesOf(base()).fallback).toBe("After 10 ranked games as Top, a game is compared with your usual ones.");
    expect(matchNotes(base({ own: false })).fallback).toBe("After 10 ranked games as Top, a game is compared with Gwen's usual ones.");
    const quiet = notesOf(base({ personal: personal([fig({ key: "kda" })]) }));
    expect(quiet.well).toEqual([]);
    expect(quiet.wrong).toEqual([]);
    expect(quiet.fallback).toBe("Nothing stood out against your usual Top games.");
    expect(quiet.focus).toBeNull();
    expect(matchNotes(base({ remake: true, deathTimes: [1, 2, 3] }))).toEqual({ well: [], wrong: [], focus: null, fallback: "Remakes are not analysed." });
    // A support without a timeline or a baseline still gets one line.
    expect(notesOf(base({ role: "SUPPORT", opponent: null })).fallback).toMatch(/^After 10 ranked games as Support/);
  });

  it("keeps the hard rules in every sentence: no refused word, at most 20 words, a number in each note", () => {
    expect(everyCase.length).toBeGreaterThan(10);
    for (const x of everyCase) {
      const notes = matchNotes(x);
      for (const text of [...notes.well.map((n) => n.text), ...notes.wrong.map((n) => n.text), notes.focus?.text, notes.fallback].filter((t): t is string => !!t)) {
        expect(refusedWordsIn(text), text).toEqual([]);
        expect(wordCount(text), text).toBeLessThanOrEqual(MAX_WORDS);
        expect(text).not.toMatch(/laning|phase/i);
      }
      for (const n of [...notes.well, ...notes.wrong]) if (n.id !== "V1" && n.id !== "M1") expect(n.text, n.text).toMatch(/\d/);
    }
  });

  it("the refused-words check catches what it lists, as whole words only", () => {
    expect(refusedWordsIn("A great game because of the lead.")).toEqual(["because", "great"]);
    expect(refusedWordsIn("Gold lead grew; integer counts.")).toEqual([]);
  });
});
