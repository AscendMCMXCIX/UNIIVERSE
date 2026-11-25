import { describe, expect, it } from "vitest";
import { abilityChange, statsChanged, withChanges } from "./changes";
import type { DdragonAbility, DdragonChampionAbilities } from "./types";

/* Champion Intel's patch marks (docs/CHAMPION_INTEL.md, "Changed this patch"): whether, never by how much. */

const ability = (over: Partial<DdragonAbility> = {}): DdragonAbility => ({ slot: "Q", id: "XQ", name: "X Q", icon: "x.png", maxRank: 5, cooldown: [8, 7, 6, 5, 4], charges: null, description: "Deals damage.", textHash: "aaaaaaaaaaaaaaaa", cost: [50, 50, 50, 50, 50], resource: "{{ cost }} {{ abilityresourcename }}", ...over });
const record = (version: string, q: Partial<DdragonAbility> = {}, stats: Record<string, number> = { hp: 600 }): DdragonChampionAbilities => ({ championId: "X", version, abilities: [ability({ slot: "P", id: null, maxRank: 1, cooldown: [], cost: undefined, resource: undefined }), ability(q)], facts: { partype: "Mana", tags: ["Mage"], stats } });

describe("what changed between two records", () => {
  it("says which of Riot's text, cooldowns and cost changed", () => {
    expect(abilityChange(ability(), ability(), "16.21.1")).toBeNull();
    expect(abilityChange(ability(), ability({ textHash: "bbbbbbbbbbbbbbbb" }), "16.21.1")).toEqual({ since: "16.21.1", text: true, cooldown: false, cost: false });
    expect(abilityChange(ability(), ability({ cooldown: [8, 7, 6, 5, 3] }), "16.21.1")).toEqual({ since: "16.21.1", text: false, cooldown: true, cost: false });
    expect(abilityChange(ability(), ability({ cost: [40, 40, 40, 40, 40] }), "16.21.1")).toEqual({ since: "16.21.1", text: false, cooldown: false, cost: true });
  });

  it("calls nothing a change it cannot compare: no earlier record, another slot, a record from before costs or text hashes", () => {
    expect(abilityChange(null, ability(), "16.21.1")).toBeNull();
    expect(abilityChange(ability({ slot: "W" }), ability(), "16.21.1")).toBeNull();
    expect(abilityChange(ability({ cost: undefined }), ability(), "16.21.1")).toBeNull();
    expect(abilityChange(ability({ textHash: undefined }), ability({ textHash: "bbbbbbbbbbbbbbbb" }), "16.21.1")).toBeNull();
  });

  it("compares base stats only where both records have them", () => {
    expect(statsChanged(record("1.1.1"), record("1.2.1"))).toBe(false);
    expect(statsChanged(record("1.1.1"), record("1.2.1", {}, { hp: 610 }))).toBe(true);
    expect(statsChanged(record("1.1.1"), record("1.2.1", {}, { hp: 600, armor: 30 }))).toBe(true);
    expect(statsChanged({ ...record("1.1.1"), facts: undefined }, record("1.2.1", {}, { hp: 610 }))).toBe(false);
  });
});

describe("a new record with its marks", () => {
  it("against an earlier version: each ability's change and the stats'", () => {
    const next = withChanges(record("16.22.1", { cooldown: [9, 8, 7, 6, 5] }, { hp: 620 }), record("16.21.1"));
    expect(next.abilities[1]!.changed).toEqual({ since: "16.21.1", text: false, cooldown: true, cost: false });
    expect(next.abilities[0]!.changed).toBeUndefined();
    expect(next.facts!.statsChangedSince).toBe("16.21.1");
  });

  it("against the same version, read again: the marks it had, carried over", () => {
    const held = withChanges(record("16.22.1", { cooldown: [9, 8, 7, 6, 5] }, { hp: 620 }), record("16.21.1"));
    const again = withChanges(record("16.22.1", { cooldown: [9, 8, 7, 6, 5] }, { hp: 620 }), held);
    expect(again.abilities[1]!.changed).toEqual(held.abilities[1]!.changed);
    expect(again.facts!.statsChangedSince).toBe("16.21.1");
  });

  it("with nothing held, or a later version held, or an unreadable one: no marks", () => {
    expect(withChanges(record("16.22.1"), null)).toEqual(record("16.22.1"));
    expect(withChanges(record("16.22.1", { cooldown: [1, 1, 1, 1, 1] }), record("16.23.1")).abilities[1]!.changed).toBeUndefined();
    expect(withChanges(record("16.22.1", { cooldown: [1, 1, 1, 1, 1] }), record("latest")).abilities[1]!.changed).toBeUndefined();
  });
});
