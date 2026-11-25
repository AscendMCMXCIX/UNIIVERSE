import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { HASTE_RULE_WORDS, REASON_WORDS, cooldownWords, listedWords } from "./words";
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

  it("never speak of a timer, a ready time or anything verified, in the words or on the page's components", () => {
    for (const w of [HASTE_RULE_WORDS, ...Object.values(REASON_WORDS).flatMap((x) => [x.line, x.more ?? ""])]) expect(w, w).not.toMatch(REFUSED);
    const dir = join(process.cwd(), "src/components/champion-lookup");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
      // Visible text only: the JSX text between tags, with comments taken out.
      const text = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
      const visible = [...text.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]!).join(" ");
      expect(visible, f).not.toMatch(REFUSED);
    }
  });
});
