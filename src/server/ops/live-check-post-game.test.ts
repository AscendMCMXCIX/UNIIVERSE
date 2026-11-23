import { describe, expect, it } from "vitest";
import { REMOVED_WORDS, postGameVerdicts, readPostGame, type PostGameRead } from "../../../scripts/post-game-facts.mjs";

/*
  The Production check's post-game facts (scripts/post-game-facts.mjs). The reading below is a demo
  game as the live check's own reader sees it: since 23 Nov 2026 the view has no notes and no folds,
  and the check asserts they stay gone.
*/

const DEMO: PostGameRead = {
  open: true,
  result: "Defeat",
  itemSlots: 7,
  itemsNotRecorded: false,
  trinketRound: true,
  spellRuneSlots: 4,
  runePage: true,
  tiles: 6,
  kda: 1,
  csPerMin: 1,
  damageShare: 1,
  lane: "clear",
  laneWords: "Lane vs",
  timeline: "ok",
  removed: { parts: 0, words: 0 },
  steps: 6,
};
const failed = (at: PostGameRead) => postGameVerdicts({ kind: "desktop", at }).filter((v) => v.status === "FAIL").map((v) => v.name);

describe("the post-game facts", () => {
  it("pass on the demo's open game", () => {
    expect(postGameVerdicts({ kind: "desktop", at: DEMO }).map((v) => v.status)).toEqual(Array(7).fill("PASS"));
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
  it("fail when a removed section is back: the notes or the folds, by their parts or their names", () => {
    expect(failed({ ...DEMO, removed: { parts: 1, words: 0 } })).toHaveLength(1);
    expect(failed({ ...DEMO, removed: { parts: 0, words: 2 } })).toHaveLength(1);
    expect(failed({ ...DEMO, removed: undefined })).toHaveLength(1);
  });
  it("look for every removed section's name in the page (the reader's own list is the exported one)", () => {
    const source = readPostGame.toString();
    for (const w of REMOVED_WORDS) expect(source).toContain(JSON.stringify(w));
    expect(REMOVED_WORDS).toEqual(["Went well", "Went wrong", "Focus next", "Gold over the game", "Build and skill order"]);
  });
  it("warn, not fail, for a game without its items or its rune page, or whose timeline is still loading", () => {
    const v = postGameVerdicts({ kind: "desktop", at: { ...DEMO, itemsNotRecorded: true, itemSlots: 0, runePage: false, timeline: "loading" } });
    expect(v.filter((x) => x.status === "FAIL")).toEqual([]);
    expect(v.filter((x) => x.status === "WARN")).toHaveLength(3);
  });
});
