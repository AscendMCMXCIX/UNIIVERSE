import { describe, expect, it } from "vitest";
import { searchChampions, searchKey } from "./search";

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
});
