import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import { abilityIconUrl, behindPatch, championResolver, lookupChampion, publicPatchOf } from "./view";
import type { ChampionChoice, DdragonChampionAbilities } from "./types";

/* Champion Intel's page as data (docs/CHAMPION_INTEL.md): the roster resolver, icons, patches, one champion's view. */

const roster: ChampionChoice[] = [
  { id: "Ahri", name: "Ahri", title: "the Nine-Tailed Fox", portrait: "" },
  { id: "MonkeyKing", name: "Wukong", title: "the Monkey King", portrait: "" },
  { id: "Khazix", name: "Kha'Zix", title: "the Voidreaver", portrait: "" },
  { id: "Nunu", name: "Nunu & Willump", title: "the Boy and His Yeti", portrait: "" },
];
const fixture = (abilityFixture as unknown as { champions: Record<string, DdragonChampionAbilities> }).champions;

describe("the champion an address names", () => {
  const resolve = championResolver(roster);
  it("takes the roster's id, or its id or name with case, accents and punctuation ignored", () => {
    expect(resolve("Ahri")?.id).toBe("Ahri");
    expect(resolve("ahri")?.id).toBe("Ahri");
    expect(resolve("Wukong")?.id).toBe("MonkeyKing");
    expect(resolve("monkeyking")?.id).toBe("MonkeyKing");
    expect(resolve("kha'zix")?.id).toBe("Khazix");
    expect(resolve(" Kha Zix ")?.id).toBe("Khazix");
    expect(resolve("nunu & willump")?.id).toBe("Nunu");
  });

  it("drops anything else, never repeating it back", () => {
    for (const raw of ["", "   ", "Teemo", "<script>", "a".repeat(65), null, 5, ["Ahri"]]) expect(resolve(raw), String(raw)).toBeNull();
  });
});

describe("icons and patches", () => {
  it("links an ability's icon on Data Dragon, the passive's under img/passive", () => {
    expect(abilityIconUrl("16.22.1", "Q", "AhriQ.png")).toBe("https://ddragon.leagueoflegends.com/cdn/16.22.1/img/spell/AhriQ.png");
    expect(abilityIconUrl("16.22.1", "P", "Ahri_SoulEater2.png")).toBe("https://ddragon.leagueoflegends.com/cdn/16.22.1/img/passive/Ahri_SoulEater2.png");
    for (const [v, f] of [[null, "a.png"], ["x", "a.png"], ["16.22.1", "../a.png"], ["16.22.1", "a.svg"], ["16.22.1", "a b/c.png"]] as const) expect(abilityIconUrl(v, "Q", f), `${v} ${f}`).toBeNull();
  });

  it("names a version's public patch, and says when the abilities are older than the game", () => {
    expect(publicPatchOf("16.22.1")).toBe("26.22");
    expect(publicPatchOf("not a version")).toBeNull();
    expect(publicPatchOf(null)).toBeNull();
    expect(behindPatch("26.22", "26.23")).toBe(true);
    expect(behindPatch("26.23", "26.23")).toBe(false);
    expect(behindPatch(null, "26.23")).toBe(false);
    expect(behindPatch("26.22", null)).toBe(false);
  });
});

describe("one champion's view", () => {
  it("gives the five abilities in slot order, each through the guard, from the record's own version", () => {
    const v = lookupChampion(roster[0]!, fixture.Ahri!, { offline: true });
    expect(v.version).toBe("16.22.1");
    expect(v.patch).toBe("26.22");
    expect(v.offline).toBe(true);
    expect(v.unreadable).toBe(false);
    expect(v.abilities!.map((a) => a.slot)).toEqual(["P", "Q", "W", "E", "R"]);
    expect(v.abilities![0]!.cooldown).toEqual({ kind: "unknown", reason: "passive-not-in-ddragon" });
    expect(v.abilities![1]).toMatchObject({ name: "Orb of Deception", ranks: 5, cooldown: { kind: "per-rank", seconds: [7, 7, 7, 7, 7] } });
    expect(v.abilities![1]!.icon).toMatch(/^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/16\.22\.1\/img\/spell\//);
    expect(v.abilities!.every((a) => a.description.length > 0)).toBe(true);
  });

  it("gives each ability its cost by the cost rule, its mechanics from Riot's description, and the champion's facts, and sends no grouped mechanics (the rows' chips are built from each ability's own)", () => {
    const v = lookupChampion(roster[0]!, fixture.Ahri!);
    expect(v.abilities![1]!.cost).toEqual({ kind: "per-rank", values: [55, 65, 75, 85, 95], resource: "Mana" });
    expect(v.abilities![0]!.cost).toBeNull();
    expect(v.abilities![3]!.mechanics.map((m) => m.kind)).toContain("charm");
    expect(v.abilities!.every((a) => a.changed === null)).toBe(true);
    expect(v.facts).toMatchObject({ resource: "Mana", resourceless: false, classes: ["Mage", "Assassin"], statsChangedSincePatch: null });
    expect(v.facts!.stats.find((s) => s.key === "attackrange")!.base).toBe(550);
    // The grouped "key mechanics" block went on 25 Nov 2026: nothing of it is computed or sent to the browser.
    expect(v).not.toHaveProperty("mechanics");
    // A champion with no resource is said as that (Garen: "None").
    expect(lookupChampion({ id: "Garen", name: "Garen", title: "", portrait: "" }, fixture.Garen!).facts).toMatchObject({ resource: null, resourceless: true });
  });

  it("names the patch an ability changed since, from the stored mark, and drops a mark that says nothing", () => {
    const marked = structuredClone(fixture.Ahri!);
    marked.abilities[1]!.changed = { since: "16.21.1", text: true, cooldown: false, cost: false };
    marked.abilities[2]!.changed = { since: "16.21.1", text: false, cooldown: false, cost: false };
    marked.facts = { ...marked.facts!, statsChangedSince: "16.21.1" };
    const v = lookupChampion(roster[0]!, marked);
    expect(v.abilities![1]!.changed).toEqual({ sincePatch: "26.21", text: true, cooldown: false, cost: false });
    expect(v.abilities![2]!.changed).toBeNull();
    expect(v.facts!.statsChangedSincePatch).toBe("26.21");
  });

  it("reads a record stored before rules format 4 without facts or costs: none shown, nothing made up", () => {
    const old = structuredClone(fixture.Ahri!);
    delete old.facts;
    for (const a of old.abilities) {
      delete a.cost;
      delete a.resource;
    }
    const v = lookupChampion(roster[0]!, old);
    expect(v.facts).toBeNull();
    expect(v.abilities!.every((a) => a.cost === null)).toBe(true);
    expect(v.abilities![1]!.cooldown).toEqual({ kind: "per-rank", seconds: [7, 7, 7, 7, 7] });
  });

  it("says when nothing is stored, or what is stored cannot be read", () => {
    expect(lookupChampion(roster[0]!, null)).toMatchObject({ abilities: null, unreadable: false, version: null, offline: false });
    expect(lookupChampion(roster[0]!, null, { unreadable: true })).toMatchObject({ abilities: null, unreadable: true });
    const missing = { ...fixture.Ahri!, abilities: fixture.Ahri!.abilities.slice(0, 4) };
    expect(lookupChampion(roster[0]!, missing)).toMatchObject({ abilities: null, unreadable: true });
  });
});
