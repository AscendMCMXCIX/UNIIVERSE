import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_LIMIT_WORDS, HASTE_RULE_WORDS, REASON_WORDS, changedWords, cooldownWords, listedWords, rangeNoteWords, rangeWords, statsTipWords, type RangeWithPatch } from "./words";
import type { UnknownCooldownReason } from "./cooldown";

/*
  Champion Intel's fixed words (docs/CHAMPION_INTEL.md): every reason has its words, a slot of two
  abilities says Riot's array as Riot's, and nothing on the page speaks of a timer, a "ready at" or
  anything "verified" (game integrity, and no person checked Riot's data).
*/

const REASONS: UnknownCooldownReason[] = ["passive-not-in-ddragon", "charges-in-ddragon", "no-number-in-ddragon", "two-abilities-in-ddragon", "ranks-mismatch-in-ddragon", "known-wrong-in-ddragon", "several-abilities-in-ddragon", "picked-up-spell-in-ddragon", "unreadable", "no-data"];
const REFUSED = /\b(timer|countdown|ready at|ready in|verified|tracked|tracking)\b/i;

describe("the words", () => {
  it("say why for every reason there is no number", () => {
    expect(Object.keys(REASON_WORDS).sort()).toEqual([...REASONS].sort());
    for (const r of REASONS) expect(cooldownWords({ kind: "unknown", reason: r })?.line, r).toBe(REASON_WORDS[r].line);
    expect(cooldownWords({ kind: "per-rank", seconds: [8] })).toBeNull();
  });

  it("say the passive's and charges' limits plainly", () => {
    expect(cooldownWords({ kind: "unknown", reason: "passive-not-in-ddragon" })).toEqual({ line: "No cooldown in Riot's data", more: null });
    expect(cooldownWords({ kind: "unknown", reason: "charges-in-ddragon" })?.line).toBe("Charges: recharge not in Riot's data");
  });

  it("say Riot's array for a slot of two abilities as Riot's, for the slot", () => {
    expect(listedWords([10, 9, 8, 7, 6])).toBe("Riot lists 10 / 9 / 8 / 7 / 6 s for the slot");
    expect(cooldownWords({ kind: "unknown", reason: "two-abilities-in-ddragon", listed: [10, 9, 8, 7, 6] })).toEqual({ line: "Two abilities share this slot in Riot's data", more: "Riot's data doesn't say which one its cooldown is. Riot lists 10 / 9 / 8 / 7 / 6 s for the slot." });
  });

  it("keep each ⓘ short, one plain idea: at most 25 words in one or two sentences (docs/STANDARDS.md, Tooltips; the owner's 1–2 short sentences), the rule's formula and Riot's limits in them", () => {
    // Counted as tip-length.test.ts counts: whitespace-separated words with a letter or a digit.
    const words = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    // A sentence ends at a full stop, a question or an exclamation mark followed by a space or the end ("0.75" and "× 100 /" are not ends).
    const sentences = (t: string) => t.split(/[.!?](?=\s|$)/).filter((x) => x.trim()).length;
    for (const tip of [HASTE_RULE_WORDS, DATA_LIMIT_WORDS, statsTipWords(false), statsTipWords(true)]) {
      expect(words(tip), tip).toBeLessThanOrEqual(25);
      expect(sentences(tip), tip).toBeLessThanOrEqual(2);
    }
    expect(sentences("One. Two. Three.")).toBe(3);
    expect(sentences("Base × 100 / (100 + haste), 0.75 s.")).toBe(1);
    expect(HASTE_RULE_WORDS).toContain("base × 100 / (100 + haste)");
    expect(HASTE_RULE_WORDS).toContain("Ultimate haste isn't counted");
    expect(DATA_LIMIT_WORDS).toContain("no damage values or scaling");
    expect(DATA_LIMIT_WORDS).toContain("ranges only where checked against Riot's text");
    expect(statsTipWords(true)).toContain("Attack damage has no growth");
    expect(statsTipWords(false)).not.toContain("Attack damage");
  });

  it("say a range as Riot's numbers, one where every rank has the same, \"Global\", or nothing; formatted through format.ts", () => {
    const reach = (values: number[]): RangeWithPatch => ({ kind: "reach", values, reviewedVersion: "16.23.1", reviewer: "automated draft", reviewedPatch: "26.23" });
    expect(rangeWords(reach([970, 970, 970, 970, 970]))).toBe("Range 970");
    expect(rangeWords(reach([1175, 1175, 1175, 1175, 1175]))).toBe("Range 1,175");
    expect(rangeWords(reach([1300, 1550, 1800]))).toBe("Range 1,300 / 1,550 / 1,800");
    expect(rangeWords({ kind: "global", reviewedVersion: "16.23.1", reviewer: "automated draft" })).toBe("Global");
    // Cast on the champion (the owner's decision), waiting for a review, or nothing: no words.
    expect(rangeWords({ kind: "self", reviewedVersion: "16.23.1", reviewer: "automated draft" })).toBeNull();
    expect(rangeWords({ kind: "changed", reviewedKind: "reach", reviewedVersion: "16.23.1" })).toBeNull();
    expect(rangeWords(null)).toBeNull();
  });

  it("say in the opened row where a range comes from and who decided what it measures, or why it waits for a review", () => {
    const reach = (reviewer: "automated draft" | "automated review" | "owner"): RangeWithPatch => ({ kind: "reach", values: [970], reviewedVersion: "16.23.1", reviewer, reviewedPatch: "26.23" });
    expect(rangeNoteWords(reach("automated draft"))).toBe("Range from Riot's data, in game units. Classified by fixed rules from Riot's text on patch 26.23, not by a person.");
    expect(rangeNoteWords(reach("automated review"))).toBe("Range from Riot's data, in game units. Reviewed against Riot's text by an automated review on patch 26.23, not by a person.");
    expect(rangeNoteWords(reach("owner"))).toBe("Range from Riot's data, in game units. Reviewed by the team on patch 26.23.");
    expect(rangeNoteWords({ kind: "global", reviewedVersion: "16.23.1", reviewer: "automated draft", reviewedPatch: "26.23" })).toBe("Riot's text says it reaches the whole map. Classified by fixed rules from Riot's text on patch 26.23, not by a person.");
    expect(rangeNoteWords({ kind: "changed", reviewedKind: "reach", reviewedVersion: "16.23.1", reviewedPatch: "26.23" })).toBe("Range not shown: Riot changed this ability after patch 26.23, when its range was last checked.");
    // A row that showed nothing says nothing when Riot changes it; nor does an ability cast on the champion.
    expect(rangeNoteWords({ kind: "changed", reviewedKind: "self", reviewedVersion: "16.23.1", reviewedPatch: "26.23" })).toBeNull();
    expect(rangeNoteWords({ kind: "self", reviewedVersion: "16.23.1", reviewer: "owner", reviewedPatch: "26.23" })).toBeNull();
    expect(rangeNoteWords(null)).toBeNull();
    // The patch marks name a range change with the rest.
    expect(changedWords({ sincePatch: "26.22", text: true, cooldown: false, cost: false, range: true })).toBe("Riot changed this ability's text and range since patch 26.22. The numbers shown are the current ones.");
  });

  it("never call a range estimated, approximate, accurate or verified", () => {
    const reach: RangeWithPatch = { kind: "reach", values: [1300, 1550, 1800], reviewedVersion: "16.23.1", reviewer: "automated draft", reviewedPatch: "26.23" };
    const said = [
      DATA_LIMIT_WORDS,
      rangeWords(reach)!,
      ...(["automated draft", "automated review", "owner"] as const).map((reviewer) => rangeNoteWords({ ...reach, reviewer })!),
      rangeNoteWords({ kind: "changed", reviewedKind: "global", reviewedVersion: "16.23.1", reviewedPatch: "26.23" })!,
    ];
    for (const w of said) expect(w, w).not.toMatch(/\b(estimated?|about|approximate(?:ly)?|accurate|verified|exact)\b/i);
  });

  it("never speak of a timer, a ready time or anything verified, in the words or on the page's components", () => {
    for (const w of [HASTE_RULE_WORDS, DATA_LIMIT_WORDS, statsTipWords(true), ...Object.values(REASON_WORDS).flatMap((x) => [x.line, x.more ?? ""])]) expect(w, w).not.toMatch(REFUSED);
    const dir = join(process.cwd(), "src/components/champion-lookup");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
      // Visible text only: the JSX text between tags, with comments taken out.
      const text = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
      const visible = [...text.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]!).join(" ");
      expect(visible, f).not.toMatch(REFUSED);
    }
  });
});
