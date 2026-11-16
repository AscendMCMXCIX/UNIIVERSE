import { describe, expect, it } from "vitest";
import { abilityFreshness, cooldownDisplay, weakestFreshness } from "./cooldown";
import type { AbilityNotes, DdragonAbility } from "./types";

const ability = (over: Partial<DdragonAbility>): DdragonAbility => ({ slot: "Q", id: "SomeQ", name: "Some Q", icon: "SomeQ.png", maxRank: 5, cooldown: [8, 7, 6, 5, 4], charges: null, description: "", ...over });
const notes = (over: Partial<AbilityNotes>): AbilityNotes => ({ ddragonCooldown: [8, 7, 6, 5, 4], facts: [], ...over });

describe("cooldownDisplay without curated notes (Data Dragon only)", () => {
  it("shows Data Dragon's array per rank, with no claim about when it starts", () => {
    expect(cooldownDisplay(ability({}), undefined)).toEqual({ kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: null, from: "ddragon" });
  });

  it("never turns a passive's missing cooldown into 'none'", () => {
    expect(cooldownDisplay(ability({ slot: "P", cooldown: [], maxRank: 1 }), undefined)).toEqual({ kind: "unknown", reason: "passive-not-in-ddragon" });
  });

  it("never shows an all-zero placeholder as a cooldown", () => {
    expect(cooldownDisplay(ability({ cooldown: [0, 0, 0, 0, 0] }), undefined)).toEqual({ kind: "unknown", reason: "no-number-in-ddragon" });
    expect(cooldownDisplay(ability({ cooldown: [] }), undefined)).toEqual({ kind: "unknown", reason: "no-number-in-ddragon" });
  });

  it("for charges, gives the time between casts and no recharge (Data Dragon has none)", () => {
    expect(cooldownDisplay(ability({ charges: 3, cooldown: [0.25, 0.25, 0.25, 0.25, 0.25] }), undefined)).toEqual({ kind: "charges", charges: 3, recharge: null, betweenCasts: 0.25, from: "ddragon" });
    // Uneven between-cast numbers are not reduced to one.
    expect(cooldownDisplay(ability({ charges: 2, cooldown: [2, 1.5, 1, 1, 1] }), undefined)).toMatchObject({ kind: "charges", betweenCasts: null, recharge: null });
  });

  it("says when nothing is known", () => {
    expect(cooldownDisplay(null, undefined)).toEqual({ kind: "unknown", reason: "no-data" });
  });
});

describe("cooldownDisplay with curated notes", () => {
  it("uses the curated array and when it starts", () => {
    expect(cooldownDisplay(ability({ cooldown: [13, 13, 13, 13, 13] }), notes({ ddragonCooldown: [13, 13, 13, 13, 13], cooldown: { kind: "per-rank", seconds: [13, 13, 13, 13, 13], starts: "after-first-cast" } }))).toEqual({ kind: "per-rank", seconds: [13, 13, 13, 13, 13], starts: "after-first-cast", from: "curated" });
  });

  it("shows Riot's newer numbers when they moved after the check (and keeps the start, which freshness flags)", () => {
    const d = cooldownDisplay(ability({ cooldown: [9, 8, 7, 6, 5] }), notes({ cooldown: { kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: "on-cast" } }));
    expect(d).toEqual({ kind: "per-rank", seconds: [9, 8, 7, 6, 5], starts: "on-cast", from: "curated" });
  });

  it("gives curated charges with their recharge, passives with their own cooldown, and 'none'", () => {
    expect(cooldownDisplay(ability({ charges: 2, cooldown: [2, 2, 2, 2, 2] }), notes({ ddragonCooldown: [2, 2, 2, 2, 2], cooldown: { kind: "charges", charges: 2, recharge: [20, 18, 16, 14, 12], betweenCasts: 2 } }))).toEqual({ kind: "charges", charges: 2, recharge: [20, 18, 16, 14, 12], betweenCasts: 2, from: "curated" });
    expect(cooldownDisplay(ability({ slot: "P", cooldown: [] }), notes({ ddragonCooldown: [], cooldown: { kind: "passive", seconds: [12, 9, 6], scalesWith: "level", levels: [1, 7, 13] } }))).toEqual({ kind: "passive", seconds: [12, 9, 6], scalesWith: "level", levels: [1, 7, 13] });
    expect(cooldownDisplay(ability({ slot: "P", cooldown: [] }), notes({ ddragonCooldown: [], cooldown: { kind: "none" } }))).toEqual({ kind: "none" });
  });

  it("returns copies, never the stored arrays", () => {
    const n = notes({ cooldown: { kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: "on-cast" } });
    const d = cooldownDisplay(ability({}), n);
    if (d.kind === "per-rank") d.seconds.push(1);
    expect(n.cooldown).toEqual({ kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: "on-cast" });
  });
});

describe("abilityFreshness", () => {
  it("is current on the verified version, unchanged-since later with the same numbers, changed-since when they moved", () => {
    const n = notes({});
    expect(abilityFreshness(ability({}), n, "16.22.1", "16.22.1")).toBe("current");
    expect(abilityFreshness(ability({}), n, "16.22.1", "16.23.1")).toBe("unchanged-since");
    expect(abilityFreshness(ability({ cooldown: [9, 8, 7, 6, 5] }), n, "16.22.1", "16.23.1")).toBe("changed-since");
    // Even on the verified version, numbers that disagree with the check are flagged.
    expect(abilityFreshness(ability({ cooldown: [9, 8, 7, 6, 5] }), n, "16.22.1", "16.22.1")).toBe("changed-since");
  });

  it("never claims 'current' without Data Dragon data to compare", () => {
    expect(abilityFreshness(null, notes({}), "16.22.1", "16.22.1")).toBe("unchanged-since");
    expect(abilityFreshness(ability({}), notes({}), "16.22.1", null)).toBe("unchanged-since");
  });

  it("weakestFreshness takes the least fresh", () => {
    expect(weakestFreshness(["current", "current"])).toBe("current");
    expect(weakestFreshness(["current", "unchanged-since"])).toBe("unchanged-since");
    expect(weakestFreshness(["unchanged-since", "changed-since", "current"])).toBe("changed-since");
    expect(weakestFreshness([])).toBe("current");
  });
});
