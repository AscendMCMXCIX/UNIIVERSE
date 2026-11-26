import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import { MECHANIC_GROUPS } from "./mechanics";
import { alignedStats, listedStats, mechanicChips, rankColumns } from "./board";
import { lookupChampion } from "./view";
import type { DdragonChampionAbilities } from "./types";

/* Champion Intel's board (docs/CHAMPION_INTEL.md, "The page" and "Compare"): rank columns, the base statistics listed and aligned, the rows' chips. */

const fixture = (abilityFixture as unknown as { champions: Record<string, DdragonChampionAbilities> }).champions;
const view = (id: string) => lookupChampion({ id, name: id, title: "", portrait: "" }, fixture[id]!);

describe("rank columns", () => {
  it("are the most ranks any cooldown or cost has, at least five", () => {
    expect(rankColumns(view("Ahri").abilities)).toBe(5);
    expect(rankColumns(view("Udyr").abilities)).toBe(6);
    expect(rankColumns(null)).toBe(5);
    expect(rankColumns([])).toBe(5);
  });

  it("cover every ability of the whole roster: no row has more values than its champion's columns", () => {
    for (const id of Object.keys(fixture)) {
      const abilities = view(id).abilities ?? [];
      const columns = rankColumns(abilities);
      for (const a of abilities) {
        if (a.cooldown.kind === "per-rank") expect(a.cooldown.seconds.length, `${id} ${a.slot}`).toBeLessThanOrEqual(columns);
        if (a.cost?.kind === "per-rank") expect(a.cost.values.length, `${id} ${a.slot} cost`).toBeLessThanOrEqual(columns);
      }
      expect(columns, id).toBeLessThanOrEqual(6);
    }
  });
});

describe("the base statistics", () => {
  it("leave out attack range, which the champion's facts say once", () => {
    const facts = view("Ahri").facts!;
    expect(facts.stats.some((s) => s.key === "attackrange")).toBe(true);
    expect(listedStats(facts).some((s) => s.key === "attackrange")).toBe(false);
    expect(listedStats(facts).map((s) => s.key)).toEqual(["hp", "hpregen", "mp", "mpregen", "attackdamage", "attackspeed", "armor", "spellblock", "movespeed"]);
    expect(listedStats(null)).toEqual([]);
  });

  it("line two champions up row by row, a statistic only one has kept with nothing beside it", () => {
    // Ahri has mana; Garen has no resource, so no Mana rows.
    const rows = alignedStats(view("Ahri").facts, view("Garen").facts);
    expect(rows.map((r) => r.key)).toEqual(["hp", "hpregen", "mp", "mpregen", "attackdamage", "attackspeed", "armor", "spellblock", "movespeed"]);
    expect(rows.find((r) => r.key === "mp")).toMatchObject({ a: { label: "Mana" }, b: null });
    expect(rows.find((r) => r.key === "hp")!.b).not.toBeNull();
    // Mana beside Energy: one row each, each with its own label.
    const energy = alignedStats(view("Ahri").facts, view("Zed").facts).find((r) => r.key === "mp")!;
    expect([energy.a?.label, energy.b?.label]).toEqual(["Mana", "Energy"]);
    // The same champion twice: every row on both sides.
    expect(alignedStats(view("Ahri").facts, view("Ahri").facts).every((r) => r.a && r.b)).toBe(true);
    expect(alignedStats(null, null)).toEqual([]);
  });
});

describe("the rows' chips", () => {
  it("put crowd control first, each kind once, damage types as damage", () => {
    expect(mechanicChips(view("Ahri").abilities!.find((a) => a.slot === "E")!)).toEqual([{ kind: "charm", word: "Charm", group: "crowd-control" }]);
    expect(mechanicChips(view("Ahri").abilities!.find((a) => a.slot === "Q")!).map((c) => c.word)).toEqual(["Magic damage", "True damage"]);
    // Aurelion Sol's R: crowd control (stun, knock up, slow) before the damage type.
    expect(mechanicChips(view("AurelionSol").abilities!.find((a) => a.slot === "R")!).map((c) => c.word)).toEqual(["Stun", "Knock up", "Slow", "Magic damage"]);
  });

  it("keep the groups' order on every ability of the roster", () => {
    for (const id of Object.keys(fixture)) {
      for (const a of view(id).abilities ?? []) {
        const order = mechanicChips(a).map((c) => MECHANIC_GROUPS.indexOf(c.group));
        expect(order, `${id} ${a.slot}`).toEqual([...order].sort((x, y) => x - y));
        expect(mechanicChips(a).length, `${id} ${a.slot}`).toBe(new Set(a.mechanics.map((m) => m.kind)).size);
      }
    }
  });
});
