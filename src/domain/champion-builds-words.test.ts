import { describe, expect, it } from "vitest";
import {
  HIGHEST_TIP,
  MOST_COMMON_TIP,
  PART_LABELS,
  QUEUE_TIP,
  RANK_TIP,
  SOURCE_TIP,
  UNAVAILABLE_WORDS,
  FULL_EMPTY_WORDS,
  NO_BOOTS,
  DIFFERS_WORDS,
  RUNE_PAGE_WORDS,
  CORE_ORDER_WORDS,
  choiceFigures,
  choiceTip,
  fewTip,
  fewWords,
  FIRST_POINTS_WORDS,
  fullTip,
  gamesTip,
  gamesWords,
  partEmptyWords,
  patchTip,
  patchWords,
  queueWords,
  sourceWords,
  type BuildPartKey,
} from "./champion-builds-words";

/*
  Champion Intel's builds in words: the source line as the coordinator's brief words it ("From 143
  games in the team's matches · patch 26.23 · all ranks · Draft and Ranked"), each ⓘ one idea in at
  most 25 words, plain statistics (no advice, no "best", nothing verified or tracked).
*/

/** Words as tip-length.test.ts counts them: whitespace-separated, each with a letter or a digit. */
const words = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const REFUSED = /\b(timer|countdown|ready at|ready in|verified|tracked|tracking|best|should|recommend\w*|optimal)\b/i;
const PARTS: BuildPartKey[] = ["runes", "shards", "spells", "skills", "start", "boots", "core"];

describe("the builds' words", () => {
  it("write the source line's parts", () => {
    expect(gamesWords({ games: 143 })).toBe("From 143 games");
    expect(gamesWords({ games: 1 })).toBe("From 1 game");
    expect(patchWords({ patches: ["26.23"], currentGames: 40 })).toBe("patch 26.23");
    expect(patchWords({ patches: ["26.23", "26.22"], currentGames: 7 })).toBe("patches 26.22–26.23");
    expect(queueWords([400, 420, 440])).toBe("Draft and Ranked");
    expect(queueWords([420])).toBe("Ranked");
    expect(queueWords([400, 440, 700])).toBe("Draft, Ranked and Clash");
    expect(queueWords([])).toBe("Draft and Ranked");
    expect(sourceWords({ games: 143, patches: ["26.23"], currentGames: 143, queues: [400, 420] })).toBe("From 143 games in the team's matches · patch 26.23 · all ranks · Draft and Ranked");
  });

  it("never put the current patch in the sample's range when it has no game yet: the previous patch alone, said as that", () => {
    // The first days of a patch: every game counted is on the previous one.
    expect(patchWords({ patches: ["26.23", "26.22"], currentGames: 0 })).toBe("patch 26.22, none yet on 26.23");
    expect(sourceWords({ games: 31, patches: ["26.23", "26.22"], currentGames: 0, queues: [420] })).toBe("From 31 games in the team's matches · patch 26.22, none yet on 26.23 · all ranks · Ranked");
    expect(patchTip({ patches: ["26.23", "26.22"], games: 31, currentGames: 0 })).toBe("Patch 26.23 has no games yet, so only the 31 games on 26.22 are counted.");
    // One game on the current patch: a range again, both counts in the ⓘ.
    expect(patchWords({ patches: ["26.23", "26.22"], currentGames: 1 })).toBe("patches 26.22–26.23");
  });

  it("say why the previous patch was added, with both counts", () => {
    expect(patchTip({ patches: ["26.23"], games: 40, currentGames: 40 })).toBe("Only games on the current patch, 26.23.");
    expect(patchTip({ patches: ["26.23", "26.22"], games: 31, currentGames: 7 })).toBe("Patch 26.23 has 7 games so far, fewer than 20, so the 24 on 26.22 are counted too.");
  });

  it("give each choice's record in plain words: won, of how many games, made in how many, naming what was counted together", () => {
    // A rune choice is its keystone and secondary tree (the page shown is the commonest of them), never "this rune page".
    expect(choiceTip("runes", { winRate: 0.54, games: 87, share: 0.61, total: 143 })).toBe("Won 54% of the 87 games with this keystone and secondary tree; 61% of the 143 games with a full rune page recorded made it.");
    expect(choiceTip("core", { winRate: 0.5, games: 40, share: 0.4, total: 100 })).toBe("Won 50% of the 40 games with these core items in any order; 40% of the 100 games with three completed items recorded made it.");
    expect(RUNE_PAGE_WORDS).toContain("most common page");
    expect(CORE_ORDER_WORDS).toContain("most common order");
    expect(FIRST_POINTS_WORDS).toBe("most often first");
    expect(choiceFigures({ winRate: 0.5449, share: 0.605 })).toEqual({ win: "54%", pick: "61%" });
    expect(partEmptyWords("few", 12)).toBe("Too few recorded yet (12 games)");
    expect(partEmptyWords("varied", 31)).toBe("No common choice in 31 games");
  });

  it("say the empty section honestly", () => {
    expect(fewWords("26.23")).toBe("Not enough games on patch 26.23 in the team's matches yet");
    expect(fewTip(12, "MID")).toBe("Builds show from 20 games of a champion in one role. The team's matches have 12 as Mid on this patch and the one before.");
    expect(fewTip(0, null)).toContain("none on this patch or the one before");
  });

  it("keep every ⓘ to one idea of at most 25 words, and never advise, judge or speak of tracking", () => {
    const tips = [
      SOURCE_TIP,
      RANK_TIP,
      QUEUE_TIP,
      MOST_COMMON_TIP,
      HIGHEST_TIP,
      UNAVAILABLE_WORDS,
      patchTip({ patches: ["26.23", "26.22"], games: 1234, currentGames: 19 }),
      patchTip({ patches: ["26.23"], games: 40, currentGames: 40 }),
      gamesTip({ games: 1234, timelineGames: 1000, teamGames: 120 }),
      fewTip(19, "SUPPORT"),
      fewTip(0, null),
      fullTip({ items: [], fourth: { games: 12, total: 40 }, fifth: { games: 10, total: 30 } }),
      fullTip({ items: [], fourth: { games: 12, total: 40 }, fifth: null }),
      fullTip({ items: [], fourth: { games: 1234, total: 4000 }, fifth: { games: 1000, total: 3000 } }, true),
      fullTip({ items: [], fourth: { games: 12, total: 40 }, fifth: null }, true),
      patchTip({ patches: ["26.23", "26.22"], games: 1234, currentGames: 0 }),
      ...PARTS.map((p) => choiceTip(p, { winRate: 0.5, games: 1234, share: 0.5, total: 2468 })),
    ];
    for (const tip of tips) {
      expect(words(tip), tip).toBeLessThanOrEqual(25);
      expect(tip, tip).not.toMatch(REFUSED);
    }
    for (const label of [...Object.values(PART_LABELS), FULL_EMPTY_WORDS, NO_BOOTS, DIFFERS_WORDS, RUNE_PAGE_WORDS, CORE_ORDER_WORDS, FIRST_POINTS_WORDS]) expect(label).not.toMatch(REFUSED);
    expect(SOURCE_TIP).toContain("Not a global sample");
    expect(RANK_TIP).toContain("not filtered by rank");
  });

  it("say which core the full build starts from: the most common, or in the \"Highest win rate\" view the one with the highest win rate", () => {
    const full = { items: [], fourth: { games: 12, total: 40 }, fifth: { games: 10, total: 30 } };
    expect(fullTip(full)).toBe("The most common core items, then the items most often bought fourth (30% of 40 games) and fifth (33% of 30) after them.");
    expect(fullTip(full, true)).toBe("The core items with the highest win rate, then those most often bought fourth (30% of 40 games) and fifth (33% of 30) after them.");
    expect(fullTip({ ...full, fifth: null }, true)).toBe("The core items with the highest win rate, then the item most often bought fourth after them (30% of 40 games).");
    expect(fullTip(full, true)).not.toContain("most common core");
  });
});
