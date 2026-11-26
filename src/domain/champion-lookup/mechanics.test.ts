import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import championsFixture from "@/server/riot/fixtures/champions.fixture.json";
import { MECHANIC_RULES, NOT_THE_MECHANIC, mechanicsOf, type MechanicFact } from "./mechanics";
import type { DdragonChampionAbilities, Slot } from "./types";

/*
  Champion Intel's mechanics from Riot's own descriptions (docs/CHAMPION_INTEL.md, "Mechanics (the
  rows' chips)"): the word rules on every description of the committed Data Dragon copy (16.22.1, 173
  champions, 865 descriptions), each fact carrying Riot's sentence and the words matched; the hard
  cases the roster showed, both ways; the exceptions, pinned to Riot's text; nothing from an empty
  or unusual description.
*/

const records = (abilityFixture as unknown as { champions: Record<string, DdragonChampionAbilities> }).champions;
const names = Object.fromEntries(championsFixture.champions.map((c) => [c.id, c.name]));
const factsOf = (id: string, slot: Slot) => {
  const a = records[id]!.abilities.find((x) => x.slot === slot)!;
  return mechanicsOf(a, { id, name: names[id]! });
};
const kinds = (id: string, slot: Slot) => factsOf(id, slot).map((f) => f.kind);
const all: Array<{ id: string; slot: Slot; facts: MechanicFact[]; description: string }> = Object.entries(records).flatMap(([id, r]) => r.abilities.map((a) => ({ id, slot: a.slot, description: a.description, facts: mechanicsOf(a, { id, name: names[id]! }) })));

describe("the rules on every description of Data Dragon 16.22.1", () => {
  it("find 1,015 facts on 647 of the 865 abilities, at least one for every champion, and these many of each kind", () => {
    expect(all).toHaveLength(865);
    expect(all.reduce((n, x) => n + x.facts.length, 0)).toBe(1015);
    expect(all.filter((x) => x.facts.length).length).toBe(647);
    for (const id of Object.keys(records)) expect(all.some((x) => x.id === id && x.facts.length), id).toBe(true);
    const count: Record<string, number> = {};
    for (const x of all) for (const f of x.facts) count[f.kind] = (count[f.kind] ?? 0) + 1;
    expect(count).toEqual({ blind: 1, blink: 17, charm: 4, cleanse: 4, damagereduction: 15, dash: 76, fear: 8, ground: 3, heal: 87, invulnerable: 5, knockback: 25, knockup: 37, leap: 34, lifesteal: 7, magic: 136, physical: 42, pull: 14, recast: 27, reset: 42, root: 22, shield: 55, silence: 6, sleep: 2, slow: 133, speed: 76, stealth: 17, stun: 57, suppression: 4, taunt: 3, transform: 25, true: 17, unstoppable: 2, untargetable: 12 });
  });

  it("give every fact Riot's own sentence from that description, and the words matched where they stand in it", () => {
    for (const { id, slot, description, facts } of all) {
      for (const f of facts) {
        const where = `${id} ${slot} ${f.kind}`;
        expect(description.includes(f.clause), where).toBe(true);
        const words = description.slice(f.at[0], f.at[1]);
        expect(words.length, where).toBeGreaterThan(0);
        expect(f.clause.includes(words), where).toBe(true);
        expect(MECHANIC_RULES.find((r) => r.kind === f.kind)?.group, where).toBe(f.group);
      }
      // One fact per kind and ability, in the rules' order.
      const order = facts.map((f) => MECHANIC_RULES.findIndex((r) => r.kind === f.kind));
      expect(order, `${id} ${slot}`).toEqual([...order].sort((a, b) => a - b));
      expect(new Set(facts.map((f) => f.kind)).size, `${id} ${slot}`).toBe(facts.length);
    }
  });

  it("never put a number in a clause that Riot's description does not hold, nor a placeholder", () => {
    for (const { facts } of all) for (const f of facts) expect(f.clause).not.toMatch(/\{\{|\}\}|@[A-Za-z]/);
  });
});

describe("the hard cases the roster showed", () => {
  it("find what Riot's words say", () => {
    expect(kinds("Ahri", "E")).toEqual(expect.arrayContaining(["charm"]));
    expect(kinds("Ahri", "Q")).toEqual(expect.arrayContaining(["magic", "true"]));
    expect(kinds("Ahri", "R")).toEqual(expect.arrayContaining(["dash", "recast"]));
    expect(kinds("Renekton", "W")).toEqual(expect.arrayContaining(["stun", "physical"]));
    expect(kinds("Malphite", "R")).toEqual(expect.arrayContaining(["leap", "knockup"]));
    expect(kinds("Sett", "E")).toEqual(expect.arrayContaining(["pull", "stun"]));
    expect(kinds("Singed", "E")).toContain("knockup");
    expect(kinds("Vladimir", "W")).toContain("slow");
    expect(kinds("Rell", "R")).toContain("pull");
    expect(kinds("Olaf", "R")).toContain("unstoppable");
    expect(kinds("Gangplank", "W")).toEqual(expect.arrayContaining(["cleanse", "heal"]));
    expect(kinds("Garen", "Q")).toEqual(expect.arrayContaining(["cleanse", "speed"]));
    expect(kinds("Swain", "R")).toEqual(expect.arrayContaining(["transform", "lifesteal"]));
    expect(kinds("Nidalee", "R")).toContain("transform");
    expect(kinds("Darius", "R")).toEqual(expect.arrayContaining(["leap", "true", "reset"]));
    expect(kinds("Vayne", "Q")).toContain("dash");
    expect(kinds("Irelia", "W")).toContain("damagereduction");
  });

  it("leave out an effect someone is freed from or immune to, its trigger, and one on the champion itself or on minions only", () => {
    // "making him immune to all slowing effects": no slow.
    expect(kinds("MasterYi", "R")).not.toContain("slow");
    // "removing all crowd control effects on himself": a cleanse, and "reducing incoming physical and magical damage": no damage type.
    expect(kinds("Alistar", "R")).toEqual(expect.arrayContaining(["cleanse", "damagereduction"]));
    expect(kinds("Alistar", "R")).not.toContain("physical");
    expect(kinds("Alistar", "R")).not.toContain("magic");
    // "charges his roar by stunning or displacing": the passive's trigger, not a stun.
    expect(kinds("Alistar", "P")).not.toContain("stun");
    // "fearing nearby enemy minions": not crowd control a champion meets.
    expect(kinds("Aatrox", "R")).not.toContain("fear");
    // "roots herself in place", "slows himself", "The recoil knocks Caitlyn back", "knocks back Kled".
    expect(kinds("Belveth", "E")).not.toContain("root");
    expect(kinds("Urgot", "W")).not.toContain("slow");
    expect(kinds("Caitlyn", "E")).not.toContain("knockback");
    expect(kinds("Kled", "Q")).not.toContain("knockback");
    // "pulls back her orb": pulls no one.
    expect(kinds("Ahri", "Q")).not.toContain("pull");
    // "revealing them if they are not stealthed": no stealth; "with blinding speed": no blind.
    expect(kinds("Diana", "Q")).not.toContain("stealth");
    expect(kinds("MasterYi", "Q")).not.toContain("blind");
    // "his bonus Move Speed" is a scaling, not a gain; "his shield", "her shield": an object, not a shield.
    expect(kinds("Hecarim", "P")).not.toContain("speed");
    expect(kinds("Braum", "Q")).not.toContain("shield");
    expect(kinds("Leona", "W")).not.toContain("shield");
    // "Cannot be re-cast on the same enemy": no recast; "If enemies dash through it": no dash of Taliyah's.
    expect(kinds("Yasuo", "E")).not.toContain("recast");
    expect(kinds("Taliyah", "E")).not.toContain("dash");
    // "reduces their self healing and regeneration": healing lost, not a heal.
    expect(kinds("Varus", "E")).not.toContain("heal");
    // "Allies' immobilizing effects help stack Plasma": no root.
    expect(kinds("Kaisa", "P")).not.toContain("root");
  });
});

describe("the exceptions", () => {
  it("are each pinned to Riot's text at 16.22.1 and leave out a match the rules would make", () => {
    expect(NOT_THE_MECHANIC.size).toBe(23);
    for (const [key, { textHash, why }] of NOT_THE_MECHANIC) {
      const [id, slot, kind] = key.split("|") as [string, Slot, string];
      const ability = records[id]!.abilities.find((a) => a.slot === slot)!;
      expect(ability.textHash, key).toBe(textHash);
      expect(why.length, key).toBeGreaterThan(20);
      expect(kinds(id, slot), key).not.toContain(kind);
      // Riot's text changed (another hash): the rules judge it again, and find the words.
      expect(mechanicsOf({ ...ability, textHash: "0000000000000000" }, { id, name: names[id]! }).map((f) => f.kind), key).toContain(kind);
    }
  });
});

describe("unusual input", () => {
  it("gives nothing for an empty, missing or oversized description, and never throws", () => {
    for (const description of ["", "   ", null, undefined, 42, {}, "x".repeat(5000)]) expect(mechanicsOf({ slot: "Q", description }, { id: "Ahri", name: "Ahri" })).toEqual([]);
    expect(mechanicsOf({ slot: "Q", description: "Stuns." }, { id: "X", name: "" })).toMatchObject([{ kind: "stun", clause: "Stuns." }]);
    // A sentence ends at a stop followed by a space: "0.75 seconds" stays in one sentence.
    expect(mechanicsOf({ slot: "W", description: "Deals physical damage and stuns them for 0.75 seconds. Then more." }, { id: "Renekton", name: "Renekton" })[0]!.clause).toBe("Deals physical damage and stuns them for 0.75 seconds.");
  });
});
