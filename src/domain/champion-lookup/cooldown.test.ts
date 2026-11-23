import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import { NOT_THE_COOLDOWN, compareDdragonVersions, ddragonCooldownDisplay } from "./cooldown";
import type { DdragonAbility, DdragonChampionAbilities } from "./types";

/*
  Champion Lookup's cooldown guard (docs/CHAMPION_LOOKUP.md, "Cooldowns"), rule by rule, then every
  ability of the committed Data Dragon copy, then input that is not what it should be, which never
  throws and never becomes a number.
*/

const ability = (over: Partial<DdragonAbility>): DdragonAbility => ({ slot: "Q", id: "SomeQ", name: "Some Q", icon: "SomeQ.png", maxRank: 5, cooldown: [8, 7, 6, 5, 4], charges: null, description: "", ...over });
const champions = Object.values((abilityFixture as unknown as { champions: Record<string, DdragonChampionAbilities> }).champions);
const of = (id: string, slot: string) => champions.find((c) => c.championId === id)!.abilities.find((a) => a.slot === slot)!;

describe("the guard, rule by rule", () => {
  it("1. the passive: not in Riot's data, never 'no cooldown'", () => {
    expect(ddragonCooldownDisplay(ability({ slot: "P", id: null, maxRank: 1, cooldown: [] }))).toEqual({ kind: "unknown", reason: "passive-not-in-ddragon" });
    // Even with an array, a passive's is not shown.
    expect(ddragonCooldownDisplay(ability({ slot: "P", id: null, maxRank: 1, cooldown: [10] }))).toEqual({ kind: "unknown", reason: "passive-not-in-ddragon" });
  });

  it("2. the exception list, each pinned to the array checked", () => {
    for (const id of ["RengarQ", "RengarW", "RengarE"]) expect(ddragonCooldownDisplay(ability({ id, cooldown: [0.25, 0.25, 0.25, 0.25, 0.25], charges: 1 })), id).toEqual({ kind: "unknown", reason: "known-wrong-in-ddragon" });
    expect(ddragonCooldownDisplay(ability({ id: "RengarQ", cooldown: [0.25, 0.25, 0.25, 0.25, 0.25], charges: null }))).toEqual({ kind: "unknown", reason: "known-wrong-in-ddragon" });
    expect(ddragonCooldownDisplay(ability({ slot: "R", id: "MissileBarrage", maxRank: 3, cooldown: [2, 2, 2] }))).toEqual({ kind: "unknown", reason: "charges-in-ddragon" });
    expect(ddragonCooldownDisplay(ability({ id: "TaricQ", cooldown: [3, 3, 3, 3, 3] }))).toEqual({ kind: "unknown", reason: "charges-in-ddragon" });
    expect(ddragonCooldownDisplay(ability({ id: "ApheliosQ_ClientTooltipWrapper", maxRank: 6, cooldown: [9, 9, 9, 9, 9, 9] }))).toEqual({ kind: "unknown", reason: "several-abilities-in-ddragon" });
    expect(ddragonCooldownDisplay(ability({ slot: "W", id: "ZoeW", cooldown: [0.25, 0.25, 0.25, 0.25, 0.25] }))).toEqual({ kind: "unknown", reason: "picked-up-spell-in-ddragon" });
    // A different array is new data, which the other rules judge.
    expect(ddragonCooldownDisplay(ability({ id: "RengarQ", cooldown: [6, 5.5, 5, 4.5, 4] }))).toEqual({ kind: "per-rank", seconds: [6, 5.5, 5, 4.5, 4] });
    expect(ddragonCooldownDisplay(ability({ id: "TaricQ", cooldown: [4, 4, 4, 4, 4] }))).toEqual({ kind: "per-rank", seconds: [4, 4, 4, 4, 4] });
  });

  it("3. charges (maxammo above 0): no number and no count", () => {
    expect(ddragonCooldownDisplay(ability({ cooldown: [1, 1, 1, 1, 1], charges: 2 }))).toEqual({ kind: "unknown", reason: "charges-in-ddragon" });
  });

  it("4. a value that is not a number of seconds", () => {
    expect(ddragonCooldownDisplay(ability({ cooldown: [8, -1, 6, 5, 4] }))).toEqual({ kind: "unknown", reason: "unreadable" });
    expect(ddragonCooldownDisplay(ability({ cooldown: ["8"] as unknown as number[] }))).toEqual({ kind: "unknown", reason: "unreadable" });
    expect(ddragonCooldownDisplay(ability({ cooldown: null as unknown as number[] }))).toEqual({ kind: "unknown", reason: "unreadable" });
  });

  it("5. two abilities in one slot: no number as the cooldown, Riot's array kept as Riot's for the slot", () => {
    expect(ddragonCooldownDisplay(ability({ name: "Sonic Wave / Resonating Strike", cooldown: [10, 9, 8, 7, 6] }))).toEqual({ kind: "unknown", reason: "two-abilities-in-ddragon", listed: [10, 9, 8, 7, 6] });
    // Nothing listed where Riot's array is a placeholder or not one per rank.
    expect(ddragonCooldownDisplay(ability({ name: "A / B", cooldown: [0, 0, 0, 0, 0] }))).toEqual({ kind: "unknown", reason: "two-abilities-in-ddragon" });
    expect(ddragonCooldownDisplay(ability({ name: "A / B", cooldown: [8, 7] }))).toEqual({ kind: "unknown", reason: "two-abilities-in-ddragon" });
  });

  it("6 and 7. an empty or all-zero array; not one number per rank", () => {
    expect(ddragonCooldownDisplay(ability({ cooldown: [] }))).toEqual({ kind: "unknown", reason: "no-number-in-ddragon" });
    expect(ddragonCooldownDisplay(ability({ cooldown: [0, 0, 0, 0, 0] }))).toEqual({ kind: "unknown", reason: "no-number-in-ddragon" });
    expect(ddragonCooldownDisplay(ability({ cooldown: [8, 7, 6] }))).toEqual({ kind: "unknown", reason: "ranks-mismatch-in-ddragon" });
  });

  it("8. everything else: Riot's array per rank, a copy", () => {
    const a = ability({});
    const d = ddragonCooldownDisplay(a);
    expect(d).toEqual({ kind: "per-rank", seconds: [8, 7, 6, 5, 4] });
    if (d.kind === "per-rank") d.seconds.push(1);
    expect(a.cooldown).toEqual([8, 7, 6, 5, 4]);
  });

  it("nothing held: nothing known", () => {
    expect(ddragonCooldownDisplay(null)).toEqual({ kind: "unknown", reason: "no-data" });
    expect(ddragonCooldownDisplay(undefined)).toEqual({ kind: "unknown", reason: "no-data" });
    expect(ddragonCooldownDisplay("Q" as unknown as DdragonAbility)).toEqual({ kind: "unknown", reason: "no-data" });
  });
});

describe("every ability of Data Dragon 16.22.1 (the committed copy)", () => {
  const all = champions.flatMap((c) => c.abilities.map((a) => ({ id: `${c.championId} ${a.slot}`, a, d: ddragonCooldownDisplay(a) })));

  it("passes 623 of 865 as a cooldown per rank, and says why for the rest", () => {
    expect(champions).toHaveLength(173);
    expect(all).toHaveLength(865);
    const count = (k: string) => all.filter((x) => (x.d.kind === "per-rank" ? "per-rank" : x.d.reason) === k).length;
    expect(count("per-rank")).toBe(623);
    expect(count("passive-not-in-ddragon")).toBe(173);
    expect(count("two-abilities-in-ddragon")).toBe(26);
    expect(count("charges-in-ddragon")).toBe(22);
    expect(count("no-number-in-ddragon")).toBe(16);
    expect(count("known-wrong-in-ddragon")).toBe(3);
    expect(count("several-abilities-in-ddragon")).toBe(1);
    expect(count("picked-up-spell-in-ddragon")).toBe(1);
  });

  it("shows every cooldown it passes exactly as Riot gives it, one positive number per rank", () => {
    for (const { id, a, d } of all) {
      if (d.kind !== "per-rank") continue;
      expect(d.seconds, id).toEqual(a.cooldown);
      expect(d.seconds.length, id).toBe(a.maxRank);
      expect(d.seconds.some((s) => s > 0), id).toBe(true);
    }
  });

  it("keeps the examples the docs give", () => {
    expect(ddragonCooldownDisplay(of("Ahri", "Q"))).toEqual({ kind: "per-rank", seconds: [7, 7, 7, 7, 7] });
    expect(ddragonCooldownDisplay(of("Darius", "R"))).toEqual({ kind: "per-rank", seconds: [120, 100, 80] });
    expect(ddragonCooldownDisplay(of("Teemo", "R"))).toEqual({ kind: "unknown", reason: "charges-in-ddragon" });
    expect(ddragonCooldownDisplay(of("LeeSin", "Q"))).toEqual({ kind: "unknown", reason: "two-abilities-in-ddragon", listed: [10, 9, 8, 7, 6] });
    expect(ddragonCooldownDisplay(of("Ashe", "Q"))).toEqual({ kind: "unknown", reason: "no-number-in-ddragon" });
  });

  it("lists only exceptions whose checked array is still Riot's at 16.22.1", () => {
    for (const [id, { cooldown }] of NOT_THE_COOLDOWN) {
      const a = champions.flatMap((c) => c.abilities).find((x) => x.id === id);
      expect(a?.cooldown, id).toEqual(cooldown);
    }
  });
});

describe("versions", () => {
  it("orders Data Dragon versions by number, and gives no order for what is not one", () => {
    expect(compareDdragonVersions("16.9.1", "16.10.1")).toBeLessThan(0);
    expect(compareDdragonVersions("16.22.1", "16.22.1")).toBe(0);
    expect(compareDdragonVersions("16.23.1", "16.22.1")).toBeGreaterThan(0);
    expect(compareDdragonVersions("lolpatch_3.7", "16.22.1")).toBeNull();
  });
});
