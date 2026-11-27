import { describe, expect, it } from "vitest";
import { words } from "@/components/ui/tip-length.test";
import type { LaneQueueEvidence } from "./lane-evidence";
import { refusedWords } from "./refused-words";
import * as W from "./words";

/* Matchup Intel's band in words (docs/MATCHUP_INTEL.md; docs/HELP_TEXT.md): every ⓘ short, every fixed sentence neutral. */

const evidence = (over: Partial<LaneQueueEvidence> = {}): LaneQueueEvidence => ({
  queue: "solo",
  games: 14,
  stored: 16,
  noTimeline: 2,
  withKillTimes: 12,
  withMember: 5,
  currentPatchGames: 3,
  window: { kind: "season", change: { patch: "16.22", champions: ["Darius"] }, before: 9, comparedFrom: "16.21" },
  figures: null,
  ...over,
});
const share = { n: 9, of: 14, share: 9 / 14, low: 0.39, high: 0.84 };

/** Every sentence the band can show, with sample values. */
function everySentence(): string[] {
  return [
    W.NOTES_TIP,
    W.TEAM_TIP,
    W.RIOT_TIP,
    W.FEW_TIP,
    W.RANGE_TIP,
    W.UNAVAILABLE_WORDS,
    W.MIRROR_WORDS,
    W.shareTip(share),
    W.shareTip({ ...share, low: 0.55 }),
    W.sampleTip(evidence(), "16.23"),
    W.sampleTip(evidence({ window: { kind: "since-change", change: { patch: "16.22", champions: ["Riven", "Darius"] } } }), "16.23"),
    W.sampleTip(evidence({ window: { kind: "season", change: null, before: 0, comparedFrom: "16.22" } }), null),
    W.noneWords("Riven", "Darius", "TOP", "solo"),
    W.fewWords(evidence({ games: 4 }), 16),
    W.untimedWords(evidence({ stored: 3 })),
    W.medianTip("Riven", "Darius", { low: -220, high: 540 }),
    W.medianSpoken({ gold: 180, cs: 6, xp: -120 }, "Riven", "Darius"),
    W.killsTip({ games: 12, gamesA: 4, gamesB: 5 }, "Riven", "Darius"),
    W.noNotesWords("Riven", "Darius", "TOP"),
    W.freshnessWords({ state: "hidden-changed", changed: ["Darius"] }, "16.23", "16.24", { Darius: "Darius" }).hidden!,
    W.freshnessWords({ state: "hidden-old", distance: 4 }, "16.19", "16.23", {}).hidden!,
    W.freshnessWords({ state: "stale", distance: 2 }, "16.21", "16.23", {}).meta!,
    W.kitChangeWords({ champion: "Darius", sincePatch: "26.22", parts: ["E text and cooldowns", "base stats"] }),
    W.shareSpoken(share),
    W.sampleWords(evidence(), 16),
    W.aheadLabel("Riven"),
    W.wonLabel("Riven"),
    W.bandLabel("TOP", "Riven", "Darius"),
  ];
}

describe("the band's words", () => {
  it("keep every ⓘ to one or two plain sentences of at most about 25 words", () => {
    const tips = [W.NOTES_TIP, W.TEAM_TIP, W.RIOT_TIP, W.FEW_TIP, W.RANGE_TIP, W.shareTip(share), W.sampleTip(evidence(), "16.23"), W.medianTip("Riven", "Darius", { low: -220, high: 540 }), W.killsTip({ games: 12, gamesA: 4, gamesB: 5 }, "Riven", "Darius")];
    for (const t of tips) {
      expect(words(t), t).toBeLessThanOrEqual(25);
      expect(t.split(/[.!?](\s|$)/).filter((s) => s.trim()).length, t).toBeLessThanOrEqual(2);
    }
  });

  it("use no refused word, no 'you', no verdict and no comparison word", () => {
    for (const s of everySentence()) {
      expect(refusedWords(s), s).toEqual([]);
    }
  });

  it("write shares with their range and signs with a true minus", () => {
    expect(W.shareWords(share)).toBe("9 of 14 · 64% (39–84%)");
    expect(W.shareSpoken(share)).toBe("9 of 14 games, 64 percent, 95% range 39 to 84 percent");
    expect(W.medianWords({ gold: 180, cs: 6, xp: -120 })).toBe("gold +180 · CS +6 · XP −120");
    expect(W.medianWords({ gold: 0, cs: null, xp: 15 })).toBe("gold 0 · XP +15");
    expect(W.medianSpoken({ gold: 180, cs: null, xp: -120 }, "Riven", "Darius")).toBe("In the middle game at 10:00: 180 more gold for Riven, 120 more experience for Darius.");
    expect(W.sampleWords(evidence(), 16)).toBe("14 games · Season 2026");
    expect(W.sampleWords(evidence({ window: { kind: "since-change", change: { patch: "16.22", champions: ["Darius"] } } }), 16)).toBe("14 games · Season 2026 · since 26.22");
    expect(W.sampleTip(evidence(), "16.23")).toBe("Riot changed Darius on 26.22: 9 of these games came before it. 3 on patch 26.23; 2 more without a timeline.");
    expect(W.evenInRange(share)).toBe(true);
    expect(W.shareTip(share)).toMatch(/don't show a difference beyond chance/);
  });

  it("say the notes' states in words, never by colour alone", () => {
    expect(W.freshnessWords({ state: "fresh", distance: 0 }, "16.23", "16.23", {}).meta).toBe("Patch 26.23");
    expect(W.freshnessWords({ state: "stale", distance: 2 }, "16.21", "16.23", {}).meta).toBe("Reviewed on 26.21 · not re-checked for 26.23");
    expect(W.freshnessWords({ state: "hidden-changed", changed: ["Darius"] }, "16.23", "16.24", { Darius: "Darius" }).hidden).toBe("A reviewed note is hidden: Riot's data for Darius changed after its review on 26.23.");
    expect(W.freshnessWords({ state: "hidden-old", distance: 4 }, "16.19", "16.23", {}).hidden).toBe("A reviewed note is hidden: its last review (26.19) is 4 patches old.");
  });
});
