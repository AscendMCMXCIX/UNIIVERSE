import { describe, expect, it } from "vitest";
import type { DdragonChampionAbilities } from "@/domain/champion-lookup/types";
import { abilityHashes, changedParts, kitHash } from "./kit-hash";

/* Matchup Intel's kit hashes (kit-hash.ts; docs/MATCHUP_INTEL.md, "Reviewed notes", Freshness): any change to what Riot's data says hides a reviewed note. */

const darius = (over: { eRange?: number[]; eCooldown?: number[] } = {}): DdragonChampionAbilities =>
  ({
    championId: "Darius",
    version: "16.23.1",
    abilities: [
      { slot: "P", name: "Hemorrhage", maxRank: 1, cooldown: [], charges: null, textHash: "p" },
      { slot: "E", name: "Apprehend", maxRank: 5, cooldown: over.eCooldown ?? [24, 21, 18, 15, 12], charges: null, textHash: "e", cost: [45, 45, 45, 45, 45], resource: "{{ cost }} {{ abilityresourcename }}", range: over.eRange ?? [535, 535, 535, 535, 535] },
    ],
    facts: { resource: "Mana", classes: ["Fighter"], stats: { hp: 652, attackrange: 175 } },
  }) as unknown as DdragonChampionAbilities;

describe("the kit hash", () => {
  it("is the same for the same stored data, and changes with a cooldown", () => {
    expect(kitHash(darius())).toBe(kitHash(darius()));
    expect(kitHash(darius())).toMatch(/^[0-9a-f]{24}$/);
    expect(kitHash(darius({ eCooldown: [20, 18, 16, 14, 12] }))).not.toBe(kitHash(darius()));
    expect(kitHash(null)).toBeNull();
  });

  // 27 Nov 2026: a range Riot changed without a word of its text kept the note fresh beside the band's "E range".
  it("changes with Riot's range alone, and the re-review names the ability", () => {
    const before = darius();
    const after = darius({ eRange: [560, 560, 560, 560, 560] });
    expect(kitHash(after)).not.toBe(kitHash(before));
    expect(changedParts(abilityHashes(before), abilityHashes(after))).toEqual(["E"]);
  });
});
