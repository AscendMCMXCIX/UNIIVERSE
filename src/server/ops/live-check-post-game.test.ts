import { describe, expect, it } from "vitest";
import { PANEL_WORDS, REMOVED_PARTS, REMOVED_WORDS, fitVerdicts, postGameVerdicts, readFit, readInspection, readPostGame, switchVerdicts, type FitRead, type InspectionRead, type PostGameRead } from "../../../scripts/post-game-facts.mjs";

/*
  The Production check's post-game facts (scripts/post-game-facts.mjs). The reading below is a demo
  game as the live check's own reader sees it: no notes and no gold curve (removed 23 Nov 2026), and
  since Release 16 Build Path | Skill Order | Runes above the lane, a performance score beside each
  of the ten players with one MVP and one ACE, and any player inspected with a press on their row.
  Since the owner's brief of 24 Nov 2026: the open game fits the window with nothing inside it
  scrolling (readFit), and the comparison, the written why, the score strip, the build legend and the
  grey notes under the scoreboard stay removed. Since the owner's requirements of 25 Nov 2026: the
  score through the game stays removed, the MVP is on the team that won and the ACE on the team that
  lost, and the open card's header shows its card's score and place.
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
  scores: { rows: 10, shown: 10, inRange: true, mvp: 1, ace: 1, removed: 0, panel: true, mvpOnWin: true, aceOnLoss: true },
  header: { score: 6, rank: 1, rowScore: 6, rowRank: 1 },
  removed: { parts: 0, words: 0 },
  steps: 6,
};
const failed = (at: PostGameRead) => postGameVerdicts({ kind: "desktop", at }).filter((v) => v.status === "FAIL").map((v) => v.name);

describe("the post-game facts", () => {
  it("pass on the demo's open game", () => {
    expect(postGameVerdicts({ kind: "desktop", at: DEMO }).map((v) => v.status)).toEqual(Array(12).fill("PASS"));
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
    expect(failed({ ...DEMO, scores: { ...DEMO.scores!, mvp: 2 } })).toHaveLength(2);
    expect(failed({ ...DEMO, scores: { ...DEMO.scores!, ace: 0 } })).toHaveLength(2);
    expect(failed({ ...DEMO, scores: { ...DEMO.scores!, panel: false } })).toHaveLength(1);
    expect(failed({ ...DEMO, scores: { ...DEMO.scores!, shown: 9, removed: 1 } })).toEqual([]);
  });
  it("fail an MVP on the team that lost or an ACE on the team that won", () => {
    expect(failed({ ...DEMO, scores: { ...DEMO.scores!, mvpOnWin: false } })).toEqual(["desktop: the MVP is on the team that won and the ACE on the team that lost"]);
    expect(failed({ ...DEMO, scores: { ...DEMO.scores!, aceOnLoss: false } })).toEqual(["desktop: the MVP is on the team that won and the ACE on the team that lost"]);
  });
  it("fail an open card's header whose score or place differs from the player's row; none there is not applicable", () => {
    expect(failed({ ...DEMO, header: { score: 6.1, rank: 1, rowScore: 6, rowRank: 1 } })).toEqual(["desktop: the open card's header shows the game's score and place, the same as the player's row"]);
    expect(failed({ ...DEMO, header: { score: 6, rank: 2, rowScore: 6, rowRank: 1 } })).toHaveLength(1);
    expect(postGameVerdicts({ kind: "desktop", at: { ...DEMO, header: null } }).find((v) => v.name.includes("header"))).toMatchObject({ status: "PASS", detail: "not applicable: this game's card had no score" });
  });
  it("fail when a removed section is back: the notes or the gold curve, by their parts or their names", () => {
    expect(failed({ ...DEMO, removed: { parts: 1, words: 0 } })).toHaveLength(1);
    expect(failed({ ...DEMO, removed: { parts: 0, words: 2 } })).toHaveLength(1);
    expect(failed({ ...DEMO, removed: undefined })).toHaveLength(1);
  });
  it("look for every removed section's name and part in the page (the reader's own lists are the exported ones)", () => {
    const source = readPostGame.toString();
    for (const w of REMOVED_WORDS) expect(source).toContain(JSON.stringify(w));
    expect(source).toContain(JSON.stringify(REMOVED_PARTS));
    expect(REMOVED_WORDS.slice(0, 4)).toEqual(["Went well", "Went wrong", "Focus next", "Gold over the game"]);
    // The comparison, the written why and the grey notes of 24 Nov 2026.
    for (const w of ["No comparison", "Stood out:", "Held back by", "Ranks around the time of this game", "not enough recorded history"]) expect(REMOVED_WORDS).toContain(w);
    for (const id of ["performance-compare", "performance-why", "performance-strip", "build-legend", "build-row"]) expect(REMOVED_PARTS).toContain(`[data-testid=${id}]`);
    // The score through the game of 25 Nov 2026: its heading, its (i), its chart and its missing line.
    for (const w of ["Score through the game", "About the score through the game"]) expect(REMOVED_WORDS).toContain(w);
    for (const id of ["performance", "performance-chart-area", "performance-chart-info", "performance-timeline-missing", "score-chart", "score-chart-table"]) expect(REMOVED_PARTS).toContain(`[data-testid=${id}]`);
  });
  it("warn, not fail, for a game without its items, or whose timeline is still loading (the build path and the scores then wait)", () => {
    const v = postGameVerdicts({ kind: "desktop", at: { ...DEMO, itemsNotRecorded: true, itemSlots: 0, timeline: "loading", scores: undefined } });
    expect(v.filter((x) => x.status === "FAIL")).toEqual([]);
    expect(v.filter((x) => x.status === "WARN")).toHaveLength(2);
  });
});

describe("the open game against the window", () => {
  const fits: FitRead = { open: true, size: "1280x720", height: 645, room: 668, scrollers: 0, clipped: 0, parts: null };
  const failedFit = (at: FitRead) => fitVerdicts({ kind: "desktop", at }).filter((v) => v.status === "FAIL").length;
  it("pass when the card and its game fit the room under the pinned bars and nothing inside scrolls", () => {
    expect(fitVerdicts({ kind: "desktop", at: fits }).map((v) => v.status)).toEqual(["PASS", "PASS"]);
  });
  it("fail a game taller than the room, a scroll container inside it, or something cut off", () => {
    expect(failedFit({ ...fits, height: 700, parts: { card: 50 } })).toBe(1);
    expect(failedFit({ ...fits, scrollers: 1 })).toBe(1);
    expect(failedFit({ ...fits, clipped: 2 })).toBe(1);
    expect(failedFit({ open: false })).toBe(1);
  });
  it("reads only sizes, counts and test ids (no name or text leaves the page)", () => {
    const source = readFit.toString();
    expect(source).not.toMatch(/textContent|innerText/);
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
