import { describe, expect, it } from "vitest";
import { NICKNAMES, initialsOf, searchChampions, searchKey } from "./search";
import championList from "@/server/riot/fixtures/champions.fixture.json";

const roster = [
  { id: "AurelionSol", name: "Aurelion Sol" },
  { id: "DrMundo", name: "Dr. Mundo" },
  { id: "Kaisa", name: "Kai'Sa" },
  { id: "Khazix", name: "Kha'Zix" },
  { id: "MonkeyKing", name: "Wukong" },
  { id: "Mordekaiser", name: "Mordekaiser" },
  { id: "Nunu", name: "Nunu & Willump" },
  { id: "Renekton", name: "Renekton" },
  { id: "Riven", name: "Riven" },
];
const ids = (q: string) => searchChampions(roster, q).map((c) => c.id);

describe("the pickers' search", () => {
  it("ignores case, accents, spaces and punctuation", () => {
    expect(searchKey("Kha'Zix")).toBe("khazix");
    expect(searchKey("  DR. m ")).toBe("drm");
    expect(searchKey("Rénekton")).toBe("renekton");
    expect(searchKey("Nunu & Willump")).toBe("nunuwillump");
  });

  it("finds Kha'Zix by 'kha', Wukong by 'wu' and Dr. Mundo by 'dr m'", () => {
    expect(ids("kha")).toEqual(["Khazix"]);
    expect(ids("wu")).toEqual(["MonkeyKing"]);
    expect(ids("dr m")).toEqual(["DrMundo"]);
    expect(ids("KAI SA")).toEqual(["Kaisa"]);
    expect(ids("rének")).toEqual(["Renekton"]);
  });

  it("puts names that start with the search first, then a later word, then the rest", () => {
    // "mo": Mordekaiser starts with it; Wukong's id (MonkeyKing) only contains it.
    expect(ids("mo")).toEqual(["Mordekaiser", "MonkeyKing"]);
    expect(ids("mundo")).toEqual(["DrMundo"]);
    expect(ids("sol")).toEqual(["AurelionSol"]);
    expect(ids("will")).toEqual(["Nunu"]);
    expect(ids("monkey")).toEqual(["MonkeyKing"]);
    expect(ids("r")).toEqual(["Renekton", "Riven", "AurelionSol", "DrMundo", "Mordekaiser"]);
  });

  it("finds nothing for an empty search or one that matches no champion", () => {
    expect(ids("")).toEqual([]);
    expect(ids("   ")).toEqual([]);
    expect(ids("'.")).toEqual([]);
    expect(ids("zzz")).toEqual([]);
  });

  it("finds what players type for a name: its initials, and a few reviewed nicknames, after every name match", () => {
    const full = championList.champions.map((c) => ({ id: c.id, name: c.name }));
    const first = (q: string) => searchChampions(full, q)[0]?.id;
    expect(first("tf")).toBe("TwistedFate");
    expect(first("mf")).toBe("MissFortune");
    expect(first("tk")).toBe("TahmKench");
    expect(first("lb")).toBe("Leblanc");
    expect(first("j4")).toBe("JarvanIV");
    expect(first("asol")).toBe("AurelionSol");
    expect(first("ww")).toBe("Warwick");
    expect(first("gp")).toBe("Gangplank");
    // Name matches still come first: K'Sante starts with "ks", Akshan, Fiddlesticks and Rek'Sai hold it; Kai'Sa follows by her initials.
    expect(searchChampions(full, "ks").map((c) => c.id)).toEqual(["KSante", "Akshan", "Fiddlesticks", "RekSai", "Kaisa"]);
    // Names keep their order: "kai" is Kai'Sa first, "vel" Vel'Koz, "sol" Aurelion Sol.
    expect(first("kai")).toBe("Kaisa");
    expect(first("vel")).toBe("Velkoz");
    expect(first("sol")).toBe("AurelionSol");
    // One letter is never taken for initials (Kha'Zix's "kz" does not answer "k" before Kai'Sa's name); a name of one part has none.
    expect(searchChampions(roster, "k").map((c) => c.id)).toEqual(["Kaisa", "Khazix", "MonkeyKing", "Mordekaiser", "Renekton"]);
    expect(initialsOf("Riven")).toBe("");
    expect(initialsOf("Nunu & Willump")).toBe("nw");
    expect(initialsOf("Dr. Mundo")).toBe("dm");
    // Every nickname names a champion on the roster.
    for (const [nick, id] of Object.entries(NICKNAMES)) expect(full.some((c) => c.id === id), nick).toBe(true);
  });
});
