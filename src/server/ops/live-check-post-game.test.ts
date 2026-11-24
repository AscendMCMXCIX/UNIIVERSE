import { describe, expect, it } from "vitest";
import { PANEL_WORDS, REMOVED_WORDS, postGameVerdicts, readInspection, readPostGame, switchVerdicts, type InspectionRead, type PostGameRead } from "../../../scripts/post-game-facts.mjs";

/*
  The Production check's post-game facts (scripts/post-game-facts.mjs). The reading below is a demo
  game as the live check's own reader sees it: no notes and no gold curve (removed 23 Nov 2026), and
  since Release 16 Build Path | Skill Order | Runes above the lane, a performance score beside each
  of the ten players with one MVP and one ACE, and any player inspected with a press on their row.
*/

const DEMO: PostGameRead = {
  open: true,
  result: "Defeat",
  itemSlots: 7,
  itemsNotRecorded: false,
  trinketRound: true,
  spellRuneSlots: 4,
  tiles: 6,
  kda: 1,
  csPerMin: 1,
  damageShare: 1,
  lane: "clear",
  laneWords: "Lane vs",
  timeline: "ok",
  panels: { words: ["Build Path", "Skill Order", "Runes"], above: true, path: 8, missing: false },
  scores: { rows: 10, shown: 10, inRange: true, mvp: 1, ace: 1, removed: 0, panel: true },
  removed: { parts: 0, words: 0 },
  steps: 6,
};
const failed = (at: PostGameRead) => postGameVerdicts({ kind: "desktop", at }).filter((v) => v.status === "FAIL").map((v) => v.name);

describe("the post-game facts", () => {
  it("pass on the demo's open game", () => {
    expect(postGameVerdicts({ kind: "desktop", at: DEMO }).map((v) => v.status)).toEqual(Array(10).fill("PASS"));
  });
  it("fail the regressions they exist for", () => {
    expect(failed({ ...DEMO, result: "" })).toHaveLength(1);
    expect(failed({ ...DEMO, itemSlots: 6 })).toHaveLength(1);
    expect(failed({ ...DEMO, spellRuneSlots: 2 })).toHaveLength(1);
    expect(failed({ ...DEMO, kda: 2 })).toHaveLength(1);
    expect(failed({ ...DEMO, tiles: 4 })).toHaveLength(1);
    expect(failed({ ...DEMO, lane: null, laneWords: "" })).toHaveLength(1);
    expect(failed({ ...DEMO, steps: 3 })).toHaveLength(1);
  });
  it("fail without the three headings above the lane, in their order", () => {
    expect(failed({ ...DEMO, panels: null }).length).toBeGreaterThanOrEqual(1);
    expect(failed({ ...DEMO, panels: { ...DEMO.panels!, words: ["Build Path", "Runes"] } })).toHaveLength(1);
    expect(failed({ ...DEMO, panels: { ...DEMO.panels!, above: false } })).toHaveLength(1);
    expect(PANEL_WORDS).toEqual(["Build Path", "Skill Order", "Runes"]);
  });
  it("fail a build path that is neither the timeline's nor the unavailable line, and one shown without a timeline", () => {
    expect(failed({ ...DEMO, panels: { ...DEMO.panels!, path: 0 } })).toHaveLength(1);
    // A game without a timeline: the plain line, never a path.
    expect(failed({ ...DEMO, timeline: "unavailable", panels: { ...DEMO.panels!, path: 0, missing: true } })).toEqual([]);
    expect(failed({ ...DEMO, timeline: "unavailable", panels: { ...DEMO.panels!, path: 3, missing: false } })).toHaveLength(1);
  });
  it("fail scores missing, out of range, or without exactly one MVP and one ACE; a removed player has none", () => {
    expect(failed({ ...DEMO, scores: { ...DEMO.scores!, shown: 9 } })).toHaveLength(1);
    expect(failed({ ...DEMO, scores: { ...DEMO.scores!, inRange: false } })).toHaveLength(1);
    expect(failed({ ...DEMO, scores: { ...DEMO.scores!, mvp: 2 } })).toHaveLength(1);
    expect(failed({ ...DEMO, scores: { ...DEMO.scores!, ace: 0 } })).toHaveLength(1);
    expect(failed({ ...DEMO, scores: { ...DEMO.scores!, panel: false } })).toHaveLength(1);
    expect(failed({ ...DEMO, scores: { ...DEMO.scores!, shown: 9, removed: 1 } })).toEqual([]);
  });
  it("fail when a removed section is back: the notes or the gold curve, by their parts or their names", () => {
    expect(failed({ ...DEMO, removed: { parts: 1, words: 0 } })).toHaveLength(1);
    expect(failed({ ...DEMO, removed: { parts: 0, words: 2 } })).toHaveLength(1);
    expect(failed({ ...DEMO, removed: undefined })).toHaveLength(1);
  });
  it("look for every removed section's name in the page (the reader's own list is the exported one)", () => {
    const source = readPostGame.toString();
    for (const w of REMOVED_WORDS) expect(source).toContain(JSON.stringify(w));
    expect(REMOVED_WORDS).toEqual(["Went well", "Went wrong", "Focus next", "Gold over the game"]);
  });
  it("warn, not fail, for a game without its items, or whose timeline is still loading (the build path and the scores then wait)", () => {
    const v = postGameVerdicts({ kind: "desktop", at: { ...DEMO, itemsNotRecorded: true, itemSlots: 0, timeline: "loading", scores: undefined } });
    expect(v.filter((x) => x.status === "FAIL")).toEqual([]);
    expect(v.filter((x) => x.status === "WARN")).toHaveLength(2);
  });
});

describe("inspecting another player", () => {
  const before: InspectionRead = { open: true, selected: 2, current: 2, currents: 1, headerMatchesRow: true, own: true, panels: true, lane: true, back: false };
  const after: InspectionRead = { open: true, selected: 7, current: 7, currents: 1, headerMatchesRow: true, own: false, panels: true, lane: true, back: true };
  const fails = (a: InspectionRead, b: InspectionRead = before) => switchVerdicts({ kind: "desktop", before, after: a, back: b }).filter((v) => v.status === "FAIL").length;
  it("pass when the view follows the row pressed and Back returns", () => {
    expect(switchVerdicts({ kind: "desktop", before, after, back: before }).map((v) => v.status)).toEqual(["PASS", "PASS", "PASS"]);
  });
  it("fail when the view did not follow, two rows are current, the header names another player, or Back stays", () => {
    expect(fails({ ...after, selected: 2, current: 2 })).toBe(1);
    expect(fails({ ...after, currents: 2 })).toBe(1);
    expect(fails({ ...after, headerMatchesRow: false })).toBe(1);
    expect(fails({ ...after, panels: false })).toBe(1);
    expect(fails(after, { ...after })).toBe(1);
  });
  it("reads only places, counts and true or false (no name leaves the page)", () => {
    const source = readInspection.toString();
    expect(source).not.toMatch(/return \{[^}]*name:/);
  });
});
