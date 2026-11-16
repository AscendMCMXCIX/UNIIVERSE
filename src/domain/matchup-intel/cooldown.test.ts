import { describe, expect, it } from "vitest";
import { abilityChanges, abilityFreshness, compareDdragonVersions, cooldownDisplay, cooldownFrom, curatedCooldownDisplay, ddragonCooldownDisplay, modifiersView, weakestFreshness } from "./cooldown";
import type { AbilityNotes, CooldownSpec, DdragonAbility, PerRankCooldown } from "./types";

/*
  The cooldown rules (docs/MATCHUP_INTEL.md, "Cooldowns"), case by case: the decision table's rows
  in order, then curated specs of every kind, freshness and the changes it compares, and input that
  is not what it should be, which never throws and never becomes a number.
*/

const ability = (over: Partial<DdragonAbility>): DdragonAbility => ({ slot: "Q", id: "SomeQ", name: "Some Q", icon: "SomeQ.png", maxRank: 5, cooldown: [8, 7, 6, 5, 4], charges: null, description: "", ...over });
// Without `ddragonIdentity` unless a case gives one: the type requires it of curated notes, and the
// rules read notes that lack it (older or malformed ones) by their cooldown array alone.
const notes = (over: Partial<AbilityNotes>): AbilityNotes => ({ ddragonCooldown: [8, 7, 6, 5, 4], facts: [], ...over }) as AbilityNotes;
const perRank = (seconds: number[], starts: PerRankCooldown["starts"] = null): PerRankCooldown => ({ kind: "per-rank", seconds, starts });
const identity = { id: "SomeQ", name: "Some Q", maxRank: 5, charges: null };

describe("the decision table, row by row", () => {
  it("1. curated per rank and Riot's array still matches: the curated numbers, with their start only when the source states it", () => {
    expect(cooldownDisplay(ability({ cooldown: [13, 13, 13, 13, 13] }), notes({ ddragonCooldown: [13, 13, 13, 13, 13], cooldown: perRank([13, 13, 13, 13, 13], "after-first-cast") }))).toEqual({ kind: "per-rank", seconds: [13, 13, 13, 13, 13], starts: "after-first-cast", from: "curated" });
    // The source states no start: none is assumed.
    expect(cooldownDisplay(ability({}), notes({ cooldown: perRank([8, 7, 6, 5, 4], null) }))).toEqual({ kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: null, from: "curated" });
  });

  it("2. curated per rank and Riot's array moved after the check: Riot's numbers, from Riot's data, with no start (the checked timing stays with the notes)", () => {
    const moved = ability({ cooldown: [9, 8, 7, 6, 5] });
    const n = notes({ cooldown: perRank([8, 7, 6, 5, 4], "after-effect-ends") });
    expect(cooldownDisplay(moved, n)).toEqual({ kind: "per-rank", seconds: [9, 8, 7, 6, 5], starts: null, from: "ddragon" });
    // The same when the freshness says so: the versions decide, not only the arrays.
    expect(cooldownDisplay(moved, n, "changed-since")).toEqual({ kind: "per-rank", seconds: [9, 8, 7, 6, 5], starts: null, from: "ddragon" });
    // Riot's new array still goes through the guard: an all-zero one is no number.
    expect(cooldownDisplay(ability({ cooldown: [0, 0, 0, 0, 0] }), n)).toEqual({ kind: "unknown", reason: "no-number-in-ddragon" });
  });

  it("2. a rework that keeps the cooldowns is a change too: the name, the id, the ranks or the charges", () => {
    const n = notes({ ddragonIdentity: identity, cooldown: perRank([8, 7, 6, 5, 4], "on-cast") });
    expect(cooldownDisplay(ability({}), n)).toMatchObject({ from: "curated" });
    for (const over of [{ name: "Some Other Q" }, { id: "SomeQ2" }, { maxRank: 6, cooldown: [8, 7, 6, 5, 4] }, { charges: 2 }] as Array<Partial<DdragonAbility>>) {
      expect(cooldownDisplay(ability(over), n), JSON.stringify(over)).not.toMatchObject({ from: "curated" });
    }
    expect(cooldownDisplay(ability({ name: "Some Other Q" }), n)).toEqual({ kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: null, from: "ddragon" });
  });

  it("3. curated charges, forms, a passive's own cooldown and 'none' are the curated spec", () => {
    const teemoR = ability({ slot: "R", id: "TeemoR", maxRank: 3, cooldown: [0.25, 0.25, 0.25], charges: 3 });
    expect(cooldownDisplay(teemoR, notes({ ddragonCooldown: [0.25, 0.25, 0.25], cooldown: { kind: "charges", charges: [3, 4, 5], recharge: [35, 30, 25] } }))).toEqual({ kind: "charges", charges: [3, 4, 5], recharge: [35, 30, 25] });
    expect(cooldownDisplay(ability({ slot: "P", id: null, maxRank: 1, cooldown: [] }), notes({ ddragonCooldown: [], cooldown: { kind: "passive", seconds: [10], scalesWith: "none", perTarget: true, static: true } }))).toEqual({ kind: "passive", seconds: [10], scalesWith: "none", levels: null, perTarget: true, static: true, starts: null });
    expect(cooldownDisplay(ability({ slot: "P", id: null, maxRank: 1, cooldown: [] }), notes({ ddragonCooldown: [], cooldown: { kind: "none" } }))).toEqual({ kind: "none" });
    const jayceQ = ability({ id: "JayceToTheSkies", name: "To the Skies! / Shock Blast", maxRank: 6, cooldown: [16, 14, 12, 10, 8, 6] });
    const forms: CooldownSpec = { kind: "forms", forms: [{ name: "Mercury Hammer", spec: perRank([16, 14, 12, 10, 8, 6]) }, { name: "Mercury Cannon", spec: perRank([8, 8, 8, 8, 8, 8], "on-cast") }] };
    expect(cooldownDisplay(jayceQ, notes({ ddragonCooldown: [16, 14, 12, 10, 8, 6], cooldown: forms }))).toEqual({
      kind: "forms",
      forms: [
        { name: "Mercury Hammer", cooldown: { kind: "per-rank", seconds: [16, 14, 12, 10, 8, 6], starts: null, from: "curated" } },
        { name: "Mercury Cannon", cooldown: { kind: "per-rank", seconds: [8, 8, 8, 8, 8, 8], starts: "on-cast", from: "curated" } },
      ],
    });
  });

  it("4. no notes, the passive: not in Riot's data, never 'no cooldown'", () => {
    expect(cooldownDisplay(ability({ slot: "P", id: null, cooldown: [], maxRank: 1 }), undefined)).toEqual({ kind: "unknown", reason: "passive-not-in-ddragon" });
    // Notes without a cooldown spec say no more than Riot's data.
    expect(cooldownDisplay(ability({ slot: "P", id: null, cooldown: [], maxRank: 1 }), notes({ ddragonCooldown: [] }))).toEqual({ kind: "unknown", reason: "passive-not-in-ddragon" });
  });

  it("5. no notes, maxammo above 0: no number and no count (Rengar's 1, Warwick's W and LeBlanc's R 2 are not reliable)", () => {
    expect(cooldownDisplay(ability({ id: "WarwickW", cooldown: [80, 70, 60, 50, 40], charges: 2 }), undefined)).toEqual({ kind: "unknown", reason: "charges-in-ddragon" });
    expect(cooldownDisplay(ability({ slot: "R", id: "LeblancR", maxRank: 3, cooldown: [45, 35, 25], charges: 2 }), undefined)).toEqual({ kind: "unknown", reason: "charges-in-ddragon" });
    expect(cooldownDisplay(ability({ id: "KalistaW", cooldown: [30, 30, 30, 30, 30], charges: 2 }), undefined)).toEqual({ kind: "unknown", reason: "charges-in-ddragon" });
  });

  it("6. no notes, an empty or all-zero array: no number", () => {
    expect(cooldownDisplay(ability({ id: "TeemoE", cooldown: [0, 0, 0, 0, 0] }), undefined)).toEqual({ kind: "unknown", reason: "no-number-in-ddragon" });
    expect(cooldownDisplay(ability({ cooldown: [] }), undefined)).toEqual({ kind: "unknown", reason: "no-number-in-ddragon" });
  });

  it("7. no notes, a name with two abilities: no number, for two forms and for an ability cast again alike", () => {
    expect(cooldownDisplay(ability({ id: "JayceToTheSkies", name: "To the Skies! / Shock Blast", maxRank: 6, cooldown: [16, 14, 12, 10, 8, 6] }), undefined)).toEqual({ kind: "unknown", reason: "two-abilities-in-ddragon" });
    expect(cooldownDisplay(ability({ id: "Bushwhack", name: "Bushwhack / Pounce", cooldown: [13, 12, 11, 10, 9] }), undefined)).toEqual({ kind: "unknown", reason: "two-abilities-in-ddragon" });
    expect(cooldownDisplay(ability({ id: "LeeSinQOne", name: "Sonic Wave / Resonating Strike", cooldown: [10, 9, 8, 7, 6] }), undefined)).toEqual({ kind: "unknown", reason: "two-abilities-in-ddragon" });
    // A slash without the spaces is part of a name, not two forms.
    expect(cooldownDisplay(ability({ name: "Q/E" }), undefined)).toMatchObject({ kind: "per-rank", from: "ddragon" });
  });

  it("2 and 7. a two-part name checked as one cooldown: Riot's later array for it is Riot's numbers, while it names the same ability", () => {
    const ambessaQ = (over: Partial<DdragonAbility> = {}) => ability({ id: "AmbessaQ", name: "Cunning Sweep / Sundering Slam", cooldown: [15, 14, 13, 12, 11], ...over });
    const checked = notes({ ddragonCooldown: [14, 13, 12, 11, 10], ddragonIdentity: { id: "AmbessaQ", name: "Cunning Sweep / Sundering Slam", maxRank: 5, charges: null }, cooldown: perRank([14, 13, 12, 11, 10], "on-cast") });
    expect(cooldownDisplay(ambessaQ(), checked)).toEqual({ kind: "per-rank", seconds: [15, 14, 13, 12, 11], starts: null, from: "ddragon" });
    // Renamed, the slot may be something else now: Data Dragon's rule applies again.
    expect(cooldownDisplay(ambessaQ({ name: "Cunning Sweep / Sundering Slam / Third" }), checked)).toEqual({ kind: "unknown", reason: "two-abilities-in-ddragon" });
    // Checked as forms, the array is one form's: no number from it alone.
    const forms = notes({ ddragonCooldown: [14, 13, 12, 11, 10], cooldown: { kind: "forms", forms: [{ name: "A", spec: perRank([14, 13, 12, 11, 10]) }, { name: "B", spec: { kind: "none" } }] } });
    expect(cooldownDisplay(ambessaQ(), forms)).toEqual({ kind: "unknown", reason: "two-abilities-in-ddragon" });
  });

  it("8. no notes, an array without one number per rank: no number", () => {
    expect(cooldownDisplay(ability({ cooldown: [8, 7, 6] }), undefined)).toEqual({ kind: "unknown", reason: "ranks-mismatch-in-ddragon" });
    expect(cooldownDisplay(ability({ maxRank: 3, cooldown: [8, 7, 6, 5, 4] }), undefined)).toEqual({ kind: "unknown", reason: "ranks-mismatch-in-ddragon" });
    expect(cooldownDisplay(ability({ maxRank: Number.NaN }), undefined)).toEqual({ kind: "unknown", reason: "ranks-mismatch-in-ddragon" });
  });

  it("8. no notes, an ability on the exception list with the array checked: no number, and the reason its evidence gives", () => {
    // Rengar's Q, W and E: 0.25 s, reported wrong to Riot (developer-relations issue 787).
    for (const id of ["RengarQ", "RengarW", "RengarE"]) expect(cooldownDisplay(ability({ id, cooldown: [0.25, 0.25, 0.25, 0.25, 0.25], charges: 1 }), undefined), id).toEqual({ kind: "unknown", reason: "known-wrong-in-ddragon" });
    // Even if Riot dropped the maxammo that flags it today.
    expect(cooldownDisplay(ability({ id: "RengarQ", cooldown: [0.25, 0.25, 0.25, 0.25, 0.25], charges: null }), undefined)).toEqual({ kind: "unknown", reason: "known-wrong-in-ddragon" });
    // Corki's R, Teemo's R and Gangplank's E hold charges: the wiki's recharge is not in Riot's data.
    expect(cooldownDisplay(ability({ slot: "R", id: "MissileBarrage", maxRank: 3, cooldown: [2, 2, 2], charges: null }), undefined)).toEqual({ kind: "unknown", reason: "charges-in-ddragon" });
    expect(cooldownDisplay(ability({ slot: "R", id: "TeemoR", maxRank: 3, cooldown: [0.25, 0.25, 0.25], charges: 3 }), undefined)).toEqual({ kind: "unknown", reason: "charges-in-ddragon" });
    expect(cooldownDisplay(ability({ slot: "E", id: "GangplankE", cooldown: [0, 0, 0, 0, 0], charges: 3 }), undefined)).toEqual({ kind: "unknown", reason: "charges-in-ddragon" });
    // A different array is new data, which the other rules judge.
    expect(cooldownDisplay(ability({ id: "RengarQ", cooldown: [6, 5.5, 5, 4.5, 4], charges: null }), undefined)).toEqual({ kind: "per-rank", seconds: [6, 5.5, 5, 4.5, 4], starts: null, from: "ddragon" });
  });

  it("9. no notes, everything else: Riot's array per rank, with no claim about when it starts", () => {
    expect(cooldownDisplay(ability({}), undefined)).toEqual({ kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: null, from: "ddragon" });
    // maxammo "0" is stored as no charges, and the array is the cooldown (Qiyana, Xerath, Malzahar W, Nidalee W, Yuumi E).
    expect(cooldownDisplay(ability({ id: "QiyanaQ", cooldown: [7, 7, 7, 7, 7] }), undefined)).toEqual({ kind: "per-rank", seconds: [7, 7, 7, 7, 7], starts: null, from: "ddragon" });
  });

  it("10. no record for the champion: nothing is known", () => {
    expect(cooldownDisplay(null, undefined)).toEqual({ kind: "unknown", reason: "no-data" });
    expect(ddragonCooldownDisplay(undefined)).toEqual({ kind: "unknown", reason: "no-data" });
  });

  it("says where each line comes from", () => {
    expect(cooldownFrom({ kind: "per-rank", seconds: [8], starts: null, from: "ddragon" })).toBe("ddragon");
    expect(cooldownFrom({ kind: "per-rank", seconds: [8], starts: null, from: "curated" })).toBe("curated");
    expect(cooldownFrom({ kind: "charges", charges: [2], recharge: [20] })).toBe("curated");
    expect(cooldownFrom({ kind: "none" })).toBe("curated");
    expect(cooldownFrom({ kind: "unknown", reason: "no-data" })).toBeNull();
  });
});

describe("curated specs as the page shows them", () => {
  it("charges: one count for every rank, or one per rank; the recharge likewise", () => {
    expect(curatedCooldownDisplay({ kind: "charges", charges: 2, recharge: [20] }, 3)).toEqual({ kind: "charges", charges: [2], recharge: [20] });
    expect(curatedCooldownDisplay({ kind: "charges", charges: [3, 4, 5], recharge: [35, 30, 25] }, 3)).toEqual({ kind: "charges", charges: [3, 4, 5], recharge: [35, 30, 25] });
    expect(curatedCooldownDisplay({ kind: "charges", charges: 3, recharge: [17, 16, 15, 14, 13] }, 5)).toEqual({ kind: "charges", charges: [3], recharge: [17, 16, 15, 14, 13] });
  });

  it("a passive's levels pair with its values, its start and options only as stated", () => {
    expect(curatedCooldownDisplay({ kind: "passive", seconds: [18, 13, 7], scalesWith: "level", levels: [1, 7, 13], static: true })).toEqual({ kind: "passive", seconds: [18, 13, 7], scalesWith: "level", levels: [1, 7, 13], perTarget: false, static: true, starts: null });
    expect(curatedCooldownDisplay({ kind: "passive", seconds: [11], scalesWith: "none", static: true, starts: "on-trigger" })).toMatchObject({ static: true, starts: "on-trigger", perTarget: false });
  });

  it("never reads a spec that is not what it should be: no number from it, never a throw", () => {
    const bad: unknown[] = [
      undefined,
      null,
      "per-rank",
      {},
      { kind: "sometimes" },
      { kind: "per-rank", seconds: [], starts: null },
      { kind: "per-rank", seconds: [8, Number.NaN, 6, 5, 4], starts: null },
      { kind: "per-rank", seconds: [8, -1, 6, 5, 4], starts: null },
      { kind: "per-rank", seconds: [8, 7, 6], starts: null },
      { kind: "per-rank", seconds: "8 / 7 / 6", starts: null },
      { kind: "per-rank", starts: null },
      { kind: "charges", charges: 0, recharge: [20] },
      { kind: "charges", charges: 2.5, recharge: [20] },
      { kind: "charges", charges: [3, 4], recharge: [20] },
      { kind: "charges", charges: [], recharge: [20] },
      { kind: "charges", charges: 2, recharge: [] },
      { kind: "charges", charges: 2, recharge: [0] },
      { kind: "charges", charges: 2 },
      { kind: "passive", seconds: [12, 9], scalesWith: "level", levels: [1] },
      { kind: "passive", seconds: [12, 9], scalesWith: "level", levels: [7, 1] },
      { kind: "passive", seconds: [12, 9], scalesWith: "level", levels: [1, 19] },
      { kind: "passive", seconds: [Number.POSITIVE_INFINITY], scalesWith: "none" },
      { kind: "forms", forms: [] },
      { kind: "forms", forms: [{ name: "Hammer", spec: { kind: "per-rank", seconds: [16, 14, 12, 10, 8], starts: null } }] },
      { kind: "forms", forms: [{ name: "Hammer", spec: { kind: "none" } }, { name: " ", spec: { kind: "none" } }] },
      { kind: "forms", forms: [{ name: "Hammer", spec: { kind: "none" } }, { name: "Cannon", spec: { kind: "passive", seconds: [3], scalesWith: "none" } }] },
      { kind: "forms", forms: [{ name: "Hammer", spec: { kind: "none" } }, { name: "Cannon", spec: { kind: "forms", forms: [] } }] },
      { kind: "forms", forms: [{ name: "Hammer", spec: { kind: "none" } }, null] },
      { kind: "forms", forms: "Hammer / Cannon" },
    ];
    for (const spec of bad) expect(curatedCooldownDisplay(spec as CooldownSpec, 5), JSON.stringify(spec)).toBeNull();
    // An unknown start is no start, never a guess.
    expect(curatedCooldownDisplay({ kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: "whenever" as "on-cast" }, 5)).toMatchObject({ starts: null });
  });

  it("an unreadable spec gives way to what Riot's data supports, labelled as Riot's", () => {
    expect(cooldownDisplay(ability({}), notes({ cooldown: { kind: "per-rank", seconds: [8, Number.NaN, 6, 5, 4], starts: "on-cast" } }))).toEqual({ kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: null, from: "ddragon" });
    expect(cooldownDisplay(ability({ id: "TeemoR", slot: "R", maxRank: 3, cooldown: [0.25, 0.25, 0.25], charges: 3 }), notes({ ddragonCooldown: [0.25, 0.25, 0.25], cooldown: { kind: "charges", charges: [3, 4], recharge: [30] } }))).toEqual({ kind: "unknown", reason: "charges-in-ddragon" });
  });

  it("returns copies, never the stored arrays", () => {
    const n = notes({ cooldown: perRank([8, 7, 6, 5, 4], "on-cast") });
    const d = cooldownDisplay(ability({}), n);
    if (d.kind === "per-rank") d.seconds.push(1);
    expect(n.cooldown).toEqual({ kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: "on-cast" });
    const a = ability({});
    const r = ddragonCooldownDisplay(a);
    if (r.kind === "per-rank") r.seconds.push(1);
    expect(a.cooldown).toEqual([8, 7, 6, 5, 4]);
  });
});

describe("Riot's data that is not what it should be", () => {
  it("never throws and never becomes a number", () => {
    const odd: Array<Partial<DdragonAbility> | Record<string, unknown>> = [
      { cooldown: [8, Number.NaN, 6, 5, 4] },
      { cooldown: [8, -7, 6, 5, 4] },
      { cooldown: [8, Number.POSITIVE_INFINITY, 6, 5, 4] },
      { cooldown: ["8", 7, 6, 5, 4] as unknown as number[] },
      { cooldown: undefined as unknown as number[] },
      { cooldown: null as unknown as number[] },
      { cooldown: "8/7/6/5/4" as unknown as number[] },
    ];
    for (const over of odd) {
      const d = ddragonCooldownDisplay(ability(over as Partial<DdragonAbility>));
      expect(d, JSON.stringify(over)).toEqual({ kind: "unknown", reason: "unreadable" });
    }
    expect(ddragonCooldownDisplay("Riven Q" as unknown as DdragonAbility)).toEqual({ kind: "unknown", reason: "no-data" });
    expect(ddragonCooldownDisplay(ability({ name: undefined as unknown as string }))).toMatchObject({ kind: "per-rank", from: "ddragon" });
  });

  it("compares notes whose arrays are missing or malformed as changed, never as current", () => {
    expect(abilityChanges(ability({}), notes({ ddragonCooldown: undefined as unknown as number[] }))).toEqual(["cooldown"]);
    expect(abilityChanges(ability({ cooldown: undefined as unknown as number[] }), notes({}))).toEqual(["cooldown"]);
    expect(abilityFreshness(ability({ cooldown: null as unknown as number[] }), notes({}), "16.22.1", "16.22.1")).toBe("changed-since");
  });
});

describe("freshness", () => {
  it("is current on the verified version, unchanged-since later with the same record, changed-since when it moved", () => {
    const n = notes({});
    expect(abilityFreshness(ability({}), n, "16.22.1", "16.22.1")).toBe("current");
    expect(abilityFreshness(ability({}), n, "16.22.1", "16.23.1")).toBe("unchanged-since");
    expect(abilityFreshness(ability({ cooldown: [9, 8, 7, 6, 5] }), n, "16.22.1", "16.23.1")).toBe("changed-since");
    // Even on the verified version, a record that disagrees with the check is flagged.
    expect(abilityFreshness(ability({ cooldown: [9, 8, 7, 6, 5] }), n, "16.22.1", "16.22.1")).toBe("changed-since");
  });

  it("compares the id, name, ranks and charges the notes recorded, so a rework with the same cooldowns is caught", () => {
    const n = notes({ ddragonIdentity: identity });
    expect(abilityChanges(ability({}), n)).toEqual([]);
    expect(abilityFreshness(ability({ name: "Radiant Barrage" }), n, "16.22.1", "16.23.1")).toBe("changed-since");
    expect(abilityChanges(ability({ name: "Radiant Barrage", id: "SomeQ2" }), n)).toEqual(["id", "name"]);
    expect(abilityChanges(ability({ maxRank: 6, cooldown: [8, 7, 6, 5, 4, 3] }), n)).toEqual(["cooldown", "ranks"]);
    expect(abilityChanges(ability({ charges: 2 }), n)).toEqual(["charges"]);
    // Notes that do not record it yet compare the array alone.
    expect(abilityChanges(ability({ name: "Radiant Barrage" }), notes({}))).toEqual([]);
  });

  it("claims no change by Riot when the data is older than the check: the difference is the data's age", () => {
    const n = notes({ ddragonCooldown: [9, 8, 7, 6, 5] });
    expect(abilityFreshness(ability({}), n, "16.23.1", "16.22.1")).toBe("unchanged-since");
    // So the line is the notes' own (checked on the newer version), not Riot's older numbers.
    expect(cooldownDisplay(ability({}), notes({ ddragonCooldown: [9, 8, 7, 6, 5], cooldown: perRank([9, 8, 7, 6, 5]) }), abilityFreshness(ability({}), n, "16.23.1", "16.22.1"))).toEqual({ kind: "per-rank", seconds: [9, 8, 7, 6, 5], starts: null, from: "curated" });
    // Versions are compared by number: 16.9.1 is older than 16.10.1.
    expect(abilityFreshness(ability({ cooldown: [9, 8, 7, 6, 5] }), notes({}), "16.10.1", "16.9.1")).toBe("unchanged-since");
    expect(abilityFreshness(ability({ cooldown: [9, 8, 7, 6, 5] }), notes({}), "16.9.1", "16.10.1")).toBe("changed-since");
  });

  it("never claims 'current' without Riot's data to compare", () => {
    expect(abilityFreshness(null, notes({}), "16.22.1", "16.22.1")).toBe("unchanged-since");
    expect(abilityFreshness(ability({}), notes({}), "16.22.1", null)).toBe("unchanged-since");
  });

  it("orders versions by number, and gives no order for what is not a version", () => {
    expect(compareDdragonVersions("16.9.1", "16.10.1")).toBeLessThan(0);
    expect(compareDdragonVersions("16.22.1", "16.22.1")).toBe(0);
    expect(compareDdragonVersions("16.23.1", "16.22.1")).toBeGreaterThan(0);
    for (const bad of ["", "16", "16.22.1-fixture", "../16.22.1"]) expect(compareDdragonVersions(bad, "16.22.1"), bad).toBeNull();
    // Not versions: the strings decide, so nothing is called current unless they are the same.
    expect(abilityFreshness(ability({}), notes({}), "fixture", "fixture")).toBe("current");
    expect(abilityFreshness(ability({}), notes({}), "fixture", "other")).toBe("unchanged-since");
    expect(abilityFreshness(ability({ cooldown: [9, 8, 7, 6, 5] }), notes({}), "fixture", "other")).toBe("changed-since");
  });

  it("weakestFreshness takes the least fresh", () => {
    expect(weakestFreshness(["current", "current"])).toBe("current");
    expect(weakestFreshness(["current", "unchanged-since"])).toBe("unchanged-since");
    expect(weakestFreshness(["unchanged-since", "changed-since", "current"])).toBe("changed-since");
    expect(weakestFreshness([])).toBe("current");
  });
});

describe("modifiers", () => {
  it("keeps a refund, an attack reset, a static cooldown and a wait between casts as stated", () => {
    expect(modifiersView({ refund: { unit: "percent", amount: [25, 35, 45, 55, 65], when: " her first attack within 4 seconds " }, resetsAttack: true }, 5)).toEqual({ refund: { unit: "percent", amount: [25, 35, 45, 55, 65], when: "her first attack within 4 seconds" }, resetsAttack: true });
    expect(modifiersView({ lockout: { seconds: 0.3125, static: true } }, 5)).toEqual({ lockout: { seconds: 0.3125, static: true } });
    expect(modifiersView({ lockout: { seconds: 1 }, static: true })).toEqual({ lockout: { seconds: 1 }, static: true });
  });

  it("leaves out what cannot be read, and is null when nothing remains", () => {
    expect(modifiersView(undefined)).toBeNull();
    expect(modifiersView({})).toBeNull();
    expect(modifiersView({ refund: { unit: "percent", amount: [25, 35], when: "a hit" } }, 5)).toBeNull();
    expect(modifiersView({ refund: { unit: "percent", amount: [140], when: "a hit" } }, 5)).toBeNull();
    expect(modifiersView({ refund: { unit: "percent", amount: [40], when: " " } }, 5)).toBeNull();
    expect(modifiersView({ refund: { unit: "half" as "percent", amount: [40], when: "a hit" } }, 5)).toBeNull();
    expect(modifiersView({ lockout: { seconds: 0 } })).toBeNull();
    expect(modifiersView({ lockout: { seconds: Number.NaN } })).toBeNull();
    expect(modifiersView({ resetsAttack: "yes" as unknown as true })).toBeNull();
    // Seconds back may be more than 100.
    expect(modifiersView({ refund: { unit: "seconds", amount: [120], when: "a takedown" } })).toEqual({ refund: { unit: "seconds", amount: [120], when: "a takedown" } });
  });
});
