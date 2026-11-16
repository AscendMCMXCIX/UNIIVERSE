import { describe, expect, it, vi } from "vitest";
import type { ChampionChoice, ChampionNotes, DdragonAbility, DdragonChampionAbilities, MatchupNotes } from "@/domain/matchup-intel/types";
import { abilityIconUrl, buildMatchupPageView, championResolver, curatedIndex, safeSourceUrl, type MatchupViewDeps } from "./view";

/*
  The page's view, built from injected parts (no database): the roster, the current patch, the
  stored Data Dragon abilities and the curated notes. Fixtures follow the demo's shape (Data Dragon
  16.22.1, patch 26.22); the numbers are illustrative, not Riot's.
*/

const champ = (id: string, name = id): ChampionChoice => ({ id, name, title: "", portrait: `https://ddragon.leagueoflegends.com/cdn/16.22.1/img/champion/${id}.png` });
const ROSTER = [champ("Ambessa"), champ("Renekton"), champ("Riven"), champ("Mordekaiser"), champ("Garen"), champ("Darius"), champ("MonkeyKing", "Wukong"), champ("Khazix", "Kha'Zix")];

const ability = (slot: DdragonAbility["slot"], cooldown: number[], over: Partial<DdragonAbility> = {}): DdragonAbility => ({
  slot,
  id: slot === "P" ? null : `X${slot}`,
  name: `${slot} ability`,
  icon: slot === "P" ? "X_Passive.png" : `X${slot}.png`,
  maxRank: slot === "P" ? 1 : slot === "R" ? 3 : 5,
  cooldown,
  charges: null,
  description: `What ${slot} does.`,
  ...over,
});

const kit = (championId: string, version = "16.22.1", w = [18, 17, 16, 15, 14]): DdragonChampionAbilities => ({
  championId,
  version,
  abilities: [ability("P", []), ability("Q", [8, 7, 6, 5, 4]), ability("W", w), ability("E", [16, 15, 14, 13, 12]), ability("R", [120, 100, 80])],
});

const WIKI = "https://wiki.leagueoflegends.com/en-us/Renekton";
const renektonNotes = (over: Partial<ChampionNotes> = {}): ChampionNotes => ({
  championId: "Renekton",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [
    { id: "wiki", title: "Renekton (League of Legends Wiki)", url: WIKI, revision: 1, licence: "CC BY-SA 3.0" },
    { id: "elsewhere", title: "A guide elsewhere", url: "https://example.com/renekton", licence: "CC BY-SA 3.0" },
  ],
  abilities: {
    W: {
      ddragonCooldown: [18, 17, 16, 15, 14],
      cooldown: { kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: "on-cast" },
      facts: [
        { kind: "crowd-control", label: "Stun", detail: "Stuns on the third hit.", source: "wiki" },
        { kind: "interaction", label: "Empowered with Fury", source: "elsewhere" },
      ],
      details: ["Empowered, it stuns for longer."],
    },
  },
  levelNotes: [
    { level: 6, text: "Dominus is available.", source: "wiki" },
    { level: 2, text: "Two abilities.", source: "wiki" },
  ],
  ...over,
});

const ambessaVsRenekton = (over: Partial<MatchupNotes> = {}): MatchupNotes => ({
  championId: "Ambessa",
  vsId: "Renekton",
  verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" },
  sources: [{ id: "wiki", title: "Renekton (League of Legends Wiki)", url: WIKI, licence: "CC BY-SA 3.0" }],
  briefing: {
    threat: { text: "His empowered stun.", basedOn: ["Renekton.W"] },
    opportunity: { text: "Trade when Fury is low.", basedOn: ["Renekton.P", "Ambessa.Q"] },
    lane: [{ text: "Respect level 2.", basedOn: ["Renekton.W", "Garen.Q"] }],
  },
  interactions: [{ text: "Unstoppable answers the stun.", abilities: ["Ambessa.E", "Renekton.W"], source: "wiki" }],
  ...over,
});

function deps(over: Partial<MatchupViewDeps> = {}): MatchupViewDeps & { loadAbilities: ReturnType<typeof vi.fn> } {
  const stored: Record<string, DdragonChampionAbilities> = Object.fromEntries(["Ambessa", "Renekton", "Riven", "Mordekaiser", "Garen", "Darius"].map((id) => [id, kit(id)]));
  const loadAbilities = vi.fn(async (ids: readonly string[]) => ({ version: "16.22.1", champions: Object.fromEntries(ids.map((id) => [id, stored[id] ?? null])) }));
  return {
    champions: ROSTER,
    currentPatch: { patch: "16.22", ddragonVersion: "16.22.1" },
    loadAbilities,
    championNotes: (id) => (id === "Renekton" ? renektonNotes() : null),
    matchupNotes: (a, b) => (a === "Ambessa" && b === "Renekton" ? ambessaVsRenekton() : null),
    ...over,
  } as MatchupViewDeps & { loadAbilities: ReturnType<typeof vi.fn> };
}

describe("a curated matchup (Ambessa vs Renekton)", () => {
  it("brings the briefing, the enemy's five abilities with cooldowns and checked facts, and both patches", async () => {
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps());
    expect(v.you?.id).toBe("Ambessa");
    expect(v.enemy?.id).toBe("Renekton");
    expect(v.matchup?.briefing.threat).toEqual({ text: "His empowered stun.", basedOn: ["Renekton.W"] });
    expect(v.matchup?.freshness).toBe("current");
    expect(v.matchup?.verified.patch).toBe("26.22");
    expect(v.patch).toEqual({ current: "26.22", data: "26.22" });

    const abilities = v.enemyIntel!.abilities!;
    expect(abilities.map((a) => a.slot)).toEqual(["P", "Q", "W", "E", "R"]);
    const w = abilities.find((a) => a.slot === "W")!;
    expect(w.cooldown).toEqual({ kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: "on-cast", from: "curated" });
    expect(w.facts[0]).toEqual({ kind: "crowd-control", label: "Stun", detail: "Stuns on the third hit.", source: { title: "Renekton (League of Legends Wiki)", url: WIKI } });
    expect(w.details).toEqual(["Empowered, it stuns for longer."]);
    expect(w.freshness).toBe("current");
    expect(w.description).toBe("What W does.");
    // Data Dragon only where nothing is curated: the passive's cooldown is not Riot's to give.
    expect(abilities.find((a) => a.slot === "P")!.cooldown).toEqual({ kind: "unknown", reason: "passive-not-in-ddragon" });
    expect(abilities.find((a) => a.slot === "Q")!).toMatchObject({ cooldown: { kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: null, from: "ddragon" }, facts: [], freshness: null });

    expect(v.enemyIntel!.curated).toEqual({ verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" }, freshness: "current" });
    // Level notes in level order, each with its source.
    expect(v.enemyIntel!.levelNotes.map((l) => l.level)).toEqual([2, 6]);
    expect(v.enemyIntel!.levelNotes[0]!.source).toEqual({ title: "Renekton (League of Legends Wiki)", url: WIKI });
  });

  it("keeps the briefing to the two champions' abilities", async () => {
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps());
    expect(v.matchup!.briefing.lane[0]!.basedOn).toEqual(["Renekton.W"]);
    expect(v.matchup!.briefing.opportunity.basedOn).toEqual(["Renekton.P", "Ambessa.Q"]);
    expect(v.matchup!.interactions[0]).toEqual({ text: "Unstoppable answers the stun.", abilities: ["Ambessa.E", "Renekton.W"], source: "wiki" });
  });

  it("is for this direction only", async () => {
    const reversed = await buildMatchupPageView({ champion: "Renekton", vs: "Ambessa" }, deps());
    expect(reversed.matchup).toBeNull();
    // Notes handed back for another pair are never shown as this one's.
    const wrong = await buildMatchupPageView({ champion: "Garen", vs: "Darius" }, deps({ matchupNotes: () => ambessaVsRenekton() }));
    expect(wrong.matchup).toBeNull();
  });
});

describe("no curated matchup (Garen vs Darius)", () => {
  it("shows the enemy's general reference, with no curated layer and no invented facts", async () => {
    const d = deps();
    const v = await buildMatchupPageView({ champion: "Garen", vs: "Darius" }, d);
    expect(v.matchup).toBeNull();
    expect(v.enemyIntel!.champion.id).toBe("Darius");
    expect(v.enemyIntel!.curated).toBeNull();
    expect(v.enemyIntel!.levelNotes).toEqual([]);
    expect(v.enemyIntel!.sources).toEqual([]);
    expect(v.enemyIntel!.abilities!.every((a) => a.facts.length === 0 && a.freshness === null && a.details.length === 0)).toBe(true);
    expect(v.yourIntel!.champion.id).toBe("Garen");
    expect(d.loadAbilities).toHaveBeenCalledWith(["Garen", "Darius"]);
  });

  it("with one champion chosen, reads only that one", async () => {
    const d = deps();
    const enemyOnly = await buildMatchupPageView({ vs: "Renekton" }, d);
    expect(enemyOnly.you).toBeNull();
    expect(enemyOnly.enemyIntel!.abilities).toHaveLength(5);
    expect(enemyOnly.matchup).toBeNull();
    expect(d.loadAbilities).toHaveBeenLastCalledWith(["Renekton"]);
  });

  it("with nothing chosen, reads no abilities at all", async () => {
    const d = deps();
    const v = await buildMatchupPageView({}, d);
    expect(v).toMatchObject({ you: null, enemy: null, enemyIntel: null, yourIntel: null, matchup: null, patch: { current: "26.22", data: null } });
    expect(d.loadAbilities).not.toHaveBeenCalled();
  });
});

describe("Riot's numbers changed after the check", () => {
  it("shows Riot's current numbers and marks the ability, the champion and the matchup as possibly out of date", async () => {
    const stored = { Ambessa: kit("Ambessa", "16.23.1"), Renekton: kit("Renekton", "16.23.1", [20, 19, 18, 17, 16]) };
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps({ currentPatch: { patch: "16.23", ddragonVersion: "16.23.1" }, loadAbilities: async (ids) => ({ version: "16.23.1", champions: Object.fromEntries(ids.map((id) => [id, stored[id as keyof typeof stored] ?? null])) }) }));
    const w = v.enemyIntel!.abilities!.find((a) => a.slot === "W")!;
    expect(w.cooldown).toMatchObject({ kind: "per-rank", seconds: [20, 19, 18, 17, 16] });
    expect(w.freshness).toBe("changed-since");
    expect(v.enemyIntel!.curated!.freshness).toBe("changed-since");
    expect(v.matchup!.freshness).toBe("changed-since");
    expect(v.patch).toEqual({ current: "26.23", data: "26.23" });
  });

  it("says only 'checked on' a patch when the numbers held but the patch moved on", async () => {
    const stored = { Ambessa: kit("Ambessa", "16.23.1"), Renekton: kit("Renekton", "16.23.1") };
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps({ loadAbilities: async (ids) => ({ version: "16.23.1", champions: Object.fromEntries(ids.map((id) => [id, stored[id as keyof typeof stored] ?? null])) }) }));
    expect(v.enemyIntel!.curated!.freshness).toBe("unchanged-since");
    expect(v.matchup!.freshness).toBe("unchanged-since");
  });
});

describe("no ability data stored yet", () => {
  it("says so (null), keeps the curated layer it has, and never claims it current", async () => {
    const v = await buildMatchupPageView({ champion: "Riven", vs: "Renekton" }, deps({ loadAbilities: async (ids) => ({ version: null, champions: Object.fromEntries(ids.map((id) => [id, null])) }) }));
    expect(v.enemyIntel!.abilities).toBeNull();
    expect(v.enemyIntel!.dataVersion).toBeNull();
    expect(v.enemyIntel!.curated!.freshness).toBe("unchanged-since");
    expect(v.yourIntel!.abilities).toBeNull();
    expect(v.patch.data).toBeNull();
  });

  it("is told apart from data older than the current patch", async () => {
    const stored = { Riven: kit("Riven", "16.21.1"), Mordekaiser: kit("Mordekaiser", "16.21.1") };
    const v = await buildMatchupPageView({ champion: "Riven", vs: "Mordekaiser" }, deps({ loadAbilities: async (ids) => ({ version: "16.21.1", champions: Object.fromEntries(ids.map((id) => [id, stored[id as keyof typeof stored] ?? null])) }) }));
    expect(v.patch).toEqual({ current: "26.22", data: "26.21" });
    expect(v.enemyIntel!.dataVersion).toBe("16.21.1");
  });

  it("knows no current patch while the game data is the offline fixture", async () => {
    const v = await buildMatchupPageView({ vs: "Renekton" }, deps({ currentPatch: null }));
    expect(v.patch).toEqual({ current: null, data: "26.22" });
  });
});

describe("the address", () => {
  it("drops unknown champions and never reads their abilities", async () => {
    const d = deps();
    const v = await buildMatchupPageView({ champion: '"><script>alert(1)</script>', vs: "NotAChampion" }, d);
    expect(v.you).toBeNull();
    expect(v.enemy).toBeNull();
    expect(d.loadAbilities).not.toHaveBeenCalled();
    const half = await buildMatchupPageView({ champion: "Riven", vs: "../../etc" }, d);
    expect(half.you?.id).toBe("Riven");
    expect(half.enemy).toBeNull();
    expect(d.loadAbilities).toHaveBeenLastCalledWith(["Riven"]);
  });

  it("finds a champion by its id or name whatever the case, accents or punctuation, and answers with the roster's id", () => {
    const resolve = championResolver(ROSTER);
    expect(resolve("riven")?.id).toBe("Riven");
    expect(resolve("Wukong")?.id).toBe("MonkeyKing");
    expect(resolve("kha'zix")?.id).toBe("Khazix");
    expect(resolve(" Ambessa ")?.id).toBe("Ambessa");
    for (const bad of [undefined, null, 3, ["Riven"], "", "   ", "x".repeat(65), "Rivenn", "!!!"]) expect(resolve(bad), String(bad)).toBeNull();
  });

  it("reads a mirror matchup's champion once", async () => {
    const d = deps();
    const v = await buildMatchupPageView({ champion: "Riven", vs: "Riven" }, d);
    expect(v.you?.id).toBe("Riven");
    expect(v.enemy?.id).toBe("Riven");
    expect(d.loadAbilities).toHaveBeenCalledWith(["Riven"]);
  });
});

describe("links", () => {
  it("keep only https addresses on the League of Legends Wiki and Riot's own hosts", () => {
    expect(safeSourceUrl(WIKI)).toBe(WIKI);
    expect(safeSourceUrl("https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/Riven.json")).toBe("https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/champion/Riven.json");
    expect(safeSourceUrl("https://developer.riotgames.com/docs/lol")).toBe("https://developer.riotgames.com/docs/lol");
    for (const bad of ["http://wiki.leagueoflegends.com/en-us/Riven", "https://wiki.leagueoflegends.com.example.com/x", "https://evil.example/?u=https://wiki.leagueoflegends.com", "https://user:pw@wiki.leagueoflegends.com/x", "https://wiki.leagueoflegends.com:8443/x", "javascript:alert(1)", "//wiki.leagueoflegends.com/x", "not a url"]) expect(safeSourceUrl(bad), bad).toBeNull();
  });

  it("drop a fact's link to another host but keep its title, and do the same in the sources", async () => {
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps());
    const w = v.enemyIntel!.abilities!.find((a) => a.slot === "W")!;
    expect(w.facts[1]!.source).toEqual({ title: "A guide elsewhere", url: "" });
    expect(v.enemyIntel!.sources.map((s) => s.url)).toEqual([WIKI, ""]);
  });

  it("build ability icons on Data Dragon only, passives under img/passive", () => {
    expect(abilityIconUrl("16.22.1", "Q", "RivenTriCleave.png")).toBe("https://ddragon.leagueoflegends.com/cdn/16.22.1/img/spell/RivenTriCleave.png");
    expect(abilityIconUrl("16.22.1", "P", "Renekton_Predator.png")).toBe("https://ddragon.leagueoflegends.com/cdn/16.22.1/img/passive/Renekton_Predator.png");
    expect(abilityIconUrl(null, "Q", "RivenTriCleave.png")).toBeNull();
    expect(abilityIconUrl("16.22.1/../../x", "Q", "RivenTriCleave.png")).toBeNull();
    expect(abilityIconUrl("16.22.1", "Q", "../secret.png")).toBeNull();
    expect(abilityIconUrl("16.22.1", "Q", "x.svg")).toBeNull();
  });
});

describe("the curated index for the pickers", () => {
  it("lists, per champion, the enemies a curated matchup exists for, on the roster only", () => {
    const index = curatedIndex(ROSTER, (id) => (id === "Ambessa" ? ["Renekton", "Renekton", "Gone"] : id === "Riven" ? ["Mordekaiser"] : []));
    expect(index).toEqual({ Ambessa: ["Renekton"], Riven: ["Mordekaiser"] });
  });
});
