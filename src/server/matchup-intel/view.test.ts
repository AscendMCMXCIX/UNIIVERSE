import { describe, expect, it, vi } from "vitest";
import type { AbilityView, ChampionChoice, ChampionNotes, DdragonAbility, DdragonChampionAbilities, Fact, MatchupNotes, MatchupPageView } from "@/domain/matchup-intel/types";
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
    { id: "wiki", title: "Renekton (League of Legends Wiki)", url: WIKI, revision: 1, revisionTime: "2026-09-23T19:37:45Z", kind: "wiki-champion", licence: "CC BY-SA 3.0" },
    { id: "elsewhere", title: "A guide elsewhere", url: "https://example.com/renekton", kind: "wiki-champion", licence: "CC BY-SA 3.0" },
  ],
  abilities: {
    W: {
      ddragonCooldown: [18, 17, 16, 15, 14],
      ddragonIdentity: { id: "XW", name: "W ability", maxRank: 5, charges: null },
      cooldown: { kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: "after-effect-ends" },
      modifiers: { resetsAttack: true, lockout: { seconds: 0.5 } },
      cooldownNote: "Held for up to 7 seconds.",
      facts: [
        { kind: "crowd-control", label: "Stun", detail: "Stuns on the third hit.", appliesTo: "target", tags: ["stun", "stun", "teleport" as "stun"], source: "wiki" },
        // No appliesTo, as malformed notes may come: the page then says nothing of who has it.
        { kind: "interaction", label: "Empowered with Fury", source: "elsewhere" } as Fact,
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
  sources: [{ id: "wiki", title: "Renekton (League of Legends Wiki)", url: WIKI, kind: "wiki-champion", licence: "CC BY-SA 3.0" }],
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

const slotOf = (v: MatchupPageView, slot: string): AbilityView => v.enemyIntel!.abilities!.find((a) => a.slot === slot)!;

describe("a curated matchup (Ambessa vs Renekton)", () => {
  it("brings the briefing, the enemy's five abilities with cooldowns and checked facts, and both patches", async () => {
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps());
    expect(v.you?.id).toBe("Ambessa");
    expect(v.enemy?.id).toBe("Renekton");
    expect(v.matchup?.briefing.threat).toEqual({ kind: "point", text: "His empowered stun.", basedOn: ["Renekton.W"] });
    expect(v.matchup?.freshness).toBe("current");
    expect(v.matchup?.verified.patch).toBe("26.22");
    expect(v.patch).toEqual({ current: "26.22", data: "26.22" });

    const abilities = v.enemyIntel!.abilities!;
    expect(abilities.map((a) => a.slot)).toEqual(["P", "Q", "W", "E", "R"]);
    const w = slotOf(v, "W");
    // The checked notes are the line, with their start and modifiers; nothing as-checked beside them.
    expect(w.cooldown).toEqual({ kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: "after-effect-ends", from: "curated" });
    expect(w.checkedCooldown).toBeNull();
    expect(w.changes).toEqual([]);
    expect(w.modifiers).toEqual({ resetsAttack: true, lockout: { seconds: 0.5 } });
    expect(w.cooldownNote).toBe("Held for up to 7 seconds.");
    // Who has the effect, the tags from the vocabulary only and each once, and when the page read was saved.
    expect(w.facts[0]).toEqual({ kind: "crowd-control", label: "Stun", detail: "Stuns on the third hit.", appliesTo: "target", tags: ["stun"], source: { title: "Renekton (League of Legends Wiki)", url: WIKI, revisionTime: "2026-09-23T19:37:45Z" } });
    expect(w.facts[1]).toMatchObject({ appliesTo: null, tags: [], source: { title: "A guide elsewhere", url: "", revisionTime: null } });
    expect(w.details).toEqual(["Empowered, it stuns for longer."]);
    expect(w.freshness).toBe("current");
    expect(w.description).toBe("What W does.");
    // Data Dragon only where nothing is curated: the passive's cooldown is not Riot's to give.
    expect(slotOf(v, "P").cooldown).toEqual({ kind: "unknown", reason: "passive-not-in-ddragon" });
    expect(slotOf(v, "Q")).toMatchObject({ cooldown: { kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: null, from: "ddragon" }, checkedCooldown: null, modifiers: null, facts: [], freshness: null });

    expect(v.enemyIntel!.curated).toEqual({ verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" }, freshness: "current" });
    // Level notes in level order, each with its source.
    expect(v.enemyIntel!.levelNotes.map((l) => l.level)).toEqual([2, 6]);
    expect(v.enemyIntel!.levelNotes[0]!.source).toEqual({ title: "Renekton (League of Legends Wiki)", url: WIKI, revisionTime: "2026-09-23T19:37:45Z" });
    // Sources keep their kind and revision time for the footer.
    expect(v.enemyIntel!.sources[0]).toMatchObject({ kind: "wiki-champion", revisionTime: "2026-09-23T19:37:45Z" });
  });

  it("keeps the briefing to the two champions' abilities", async () => {
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps());
    expect(v.matchup!.briefing.lane[0]).toEqual({ kind: "point", text: "Respect level 2.", basedOn: ["Renekton.W"] });
    expect(v.matchup!.briefing.opportunity).toEqual({ kind: "point", text: "Trade when Fury is low.", basedOn: ["Renekton.P", "Ambessa.Q"] });
    expect(v.matchup!.interactions[0]).toEqual({ kind: "interaction", text: "Unstoppable answers the stun.", abilities: ["Ambessa.E", "Renekton.W"], source: "wiki" });
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

/** Both champions stored as given (keyed by id), at the version each record carries. */
const storedAs =
  (stored: Record<string, DdragonChampionAbilities>): MatchupViewDeps["loadAbilities"] =>
  async (ids) => ({ version: null, champions: Object.fromEntries(ids.map((id) => [id, stored[id] ?? null])) });

describe("Riot's data changed after the check", () => {
  const changedW = { Ambessa: kit("Ambessa", "16.23.1"), Renekton: kit("Renekton", "16.23.1", [20, 19, 18, 17, 16]) };

  it("shows Riot's current numbers as Riot's, keeps the notes' cooldown as checked beside them, and flags the ability and the champion", async () => {
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps({ currentPatch: { patch: "16.23", ddragonVersion: "16.23.1" }, loadAbilities: storedAs(changedW) }));
    const w = slotOf(v, "W");
    // Riot's numbers, never labelled checked, with no start: the checked timing goes with the notes.
    expect(w.cooldown).toEqual({ kind: "per-rank", seconds: [20, 19, 18, 17, 16], starts: null, from: "ddragon" });
    expect(w.checkedCooldown).toEqual({ kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: "after-effect-ends", from: "curated" });
    expect(w.changes).toEqual(["cooldown"]);
    expect(w.freshness).toBe("changed-since");
    // The notes are still there, to be shown flagged.
    expect(w.modifiers).toEqual({ resetsAttack: true, lockout: { seconds: 0.5 } });
    expect(w.facts.map((f) => f.label)).toEqual(["Stun", "Empowered with Fury"]);
    expect(v.enemyIntel!.curated!.freshness).toBe("changed-since");
    expect(v.patch).toEqual({ current: "26.23", data: "26.23" });
  });

  it("hides every briefing point and interaction that rests on the changed ability, saying which, and keeps the rest", async () => {
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps({ loadAbilities: storedAs(changedW) }));
    const m = v.matchup!;
    // The threat rests on Renekton W: hidden, with the ability named in its place; its words stay on the server.
    expect(m.briefing.threat).toEqual({ kind: "hidden", changed: ["Renekton.W"] });
    expect(JSON.stringify(m)).not.toContain("His empowered stun.");
    // The opportunity rests on abilities that did not change: shown, as checked.
    expect(m.briefing.opportunity).toEqual({ kind: "point", text: "Trade when Fury is low.", basedOn: ["Renekton.P", "Ambessa.Q"] });
    expect(m.briefing.lane).toEqual([{ kind: "hidden", changed: ["Renekton.W"] }]);
    expect(m.interactions).toEqual([{ kind: "hidden", changed: ["Renekton.W"] }]);
    // What is shown is as fresh as its own abilities: checked on 26.22, nothing changed since.
    expect(m.freshness).toBe("unchanged-since");
  });

  it("treats a rework that keeps its cooldowns as a change: the name, the id, the ranks or the charges", async () => {
    for (const over of [{ name: "Renamed W" }, { id: "XW2" }, { charges: 2 }] as Array<Partial<DdragonAbility>>) {
      const renekton = kit("Renekton", "16.23.1");
      renekton.abilities = renekton.abilities.map((a) => (a.slot === "W" ? { ...a, ...over } : a));
      const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps({ loadAbilities: storedAs({ Ambessa: kit("Ambessa", "16.23.1"), Renekton: renekton }) }));
      const w = slotOf(v, "W");
      expect(w.freshness, JSON.stringify(over)).toBe("changed-since");
      expect(w.changes, JSON.stringify(over)).toEqual([Object.keys(over)[0] === "charges" ? "charges" : Object.keys(over)[0]!]);
      // Same numbers, but Riot's now: a charge count from Data Dragon alone is no number at all.
      expect(w.cooldown, JSON.stringify(over)).toEqual(over.charges ? { kind: "unknown", reason: "charges-in-ddragon" } : { kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: null, from: "ddragon" });
      expect(v.matchup!.briefing.threat, JSON.stringify(over)).toEqual({ kind: "hidden", changed: ["Renekton.W"] });
    }
  });

  it("hides the whole briefing when every part rests on a changed ability, naming each", async () => {
    const v = await buildMatchupPageView(
      { champion: "Ambessa", vs: "Renekton" },
      deps({
        loadAbilities: storedAs(changedW),
        matchupNotes: () => ambessaVsRenekton({ briefing: { threat: { text: "A.", basedOn: ["Renekton.W"] }, opportunity: { text: "B.", basedOn: ["Renekton.W", "Ambessa.Q"] }, lane: [{ text: "C.", basedOn: ["Renekton.W"] }] } }),
      }),
    );
    const { threat, opportunity, lane } = v.matchup!.briefing;
    expect([threat, opportunity, ...lane].every((p) => p.kind === "hidden")).toBe(true);
    expect(opportunity).toEqual({ kind: "hidden", changed: ["Renekton.W"] });
  });

  it("says only 'checked on' a patch when the record held but the patch moved on", async () => {
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps({ loadAbilities: storedAs({ Ambessa: kit("Ambessa", "16.23.1"), Renekton: kit("Renekton", "16.23.1") }) }));
    expect(v.enemyIntel!.curated!.freshness).toBe("unchanged-since");
    expect(slotOf(v, "W").cooldown).toMatchObject({ from: "curated", starts: "after-effect-ends" });
    expect(v.matchup!.freshness).toBe("unchanged-since");
    expect(v.matchup!.briefing.threat.kind).toBe("point");
  });

  it("claims no change by Riot when the data held is older than the check: the notes stay the line, and nothing is hidden", async () => {
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps({ loadAbilities: storedAs({ Ambessa: kit("Ambessa", "16.21.1"), Renekton: kit("Renekton", "16.21.1", [20, 19, 18, 17, 16]) }) }));
    const w = slotOf(v, "W");
    expect(w.freshness).toBe("unchanged-since");
    expect(w.cooldown).toMatchObject({ from: "curated", seconds: [18, 17, 16, 15, 14] });
    expect(w.checkedCooldown).toBeNull();
    expect(v.matchup!.briefing.threat.kind).toBe("point");
    expect(v.patch.data).toBe("26.21");
  });
});

describe("a matchup checked on another version than the champion notes it rests on", () => {
  const at = (ddragonVersion: string, patch: string) => ({ patch, ddragonVersion, checkedOn: "2026-11-16" });
  /** Both champions' abilities stored at one version, Renekton's W as given. */
  const storedAt =
    (version: string, w?: number[]): MatchupViewDeps["loadAbilities"] =>
    async (ids) => ({ version, champions: Object.fromEntries(ids.map((id) => [id, id === "Renekton" ? kit(id, version, w) : kit(id, version)])) });
  /** Renekton's notes checked on `version`, with W's numbers as Riot gave them then. */
  const renektonAt = (version: string, patch: string, w: number[]): ChampionNotes => {
    const base = renektonNotes();
    return { ...base, verified: at(version, patch), abilities: { W: { ...base.abilities.W!, ddragonCooldown: w, cooldown: { kind: "per-rank", seconds: w, starts: "on-cast" } } } };
  };
  const view = (over: Partial<MatchupViewDeps>) => buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps(over));

  it("re-checked on the data's own version after Riot changed W, it is current, while the champion's older notes are flagged", async () => {
    const v = await view({ currentPatch: { patch: "16.23", ddragonVersion: "16.23.1" }, loadAbilities: storedAt("16.23.1", [16, 15, 14, 13, 12]), matchupNotes: () => ambessaVsRenekton({ verified: at("16.23.1", "26.23") }) });
    // The briefing was checked against exactly the numbers shown: no warning beside "Checked on patch 26.23".
    expect(v.matchup!.freshness).toBe("current");
    expect(v.matchup!.verified.patch).toBe("26.23");
    // Renekton's own notes took W's numbers on 16.22.1: they, and the row, may be out of date.
    expect(v.enemyIntel!.curated!.freshness).toBe("changed-since");
    expect(v.enemyIntel!.abilities!.find((a) => a.slot === "W")!.freshness).toBe("changed-since");
  });

  it("checked before the champion's notes were refreshed, it claims only its patch: whether W moved in between is not known", async () => {
    const w = [16, 15, 14, 13, 12];
    const v = await view({ loadAbilities: storedAt("16.23.1", w), championNotes: (id) => (id === "Renekton" ? renektonAt("16.23.1", "26.23", w) : null) });
    expect(v.enemyIntel!.curated!.freshness).toBe("current");
    // Not "current" (it was checked on 16.22.1), and no warning drawn from numbers taken after its check.
    expect(v.matchup!.freshness).toBe("unchanged-since");
  });

  it("hides what rests on an ability whose numbers moved after champion notes taken on a later version than its check (versions compared by number)", async () => {
    const v = await view({
      loadAbilities: storedAt("16.11.1", [14, 13, 12, 11, 10]),
      championNotes: (id) => (id === "Renekton" ? renektonAt("16.10.1", "26.10", [16, 15, 14, 13, 12]) : null),
      matchupNotes: () => ambessaVsRenekton({ verified: at("16.9.1", "26.9") }),
    });
    // 16.9.1 (the matchup) before 16.10.1 (the notes) before 16.11.1 (the data): the change came after the matchup's check.
    expect(v.matchup!.briefing.threat).toEqual({ kind: "hidden", changed: ["Renekton.W"] });
    expect(v.matchup!.briefing.opportunity.kind).toBe("point");
  });

  it("with champion notes older than its check, a change in Riot's numbers may predate the check: nothing is hidden", async () => {
    const v = await view({ loadAbilities: storedAt("16.24.1", [20, 19, 18, 17, 16]), matchupNotes: () => ambessaVsRenekton({ verified: at("16.23.1", "26.23") }) });
    expect(v.enemyIntel!.curated!.freshness).toBe("changed-since");
    expect(v.matchup!.freshness).toBe("unchanged-since");
    expect(v.matchup!.briefing.threat.kind).toBe("point");
  });
});

describe("stored records that are not what they should be", () => {
  it("never throw, and never become a number: the line says it cannot read them", async () => {
    const odd = kit("Renekton");
    odd.abilities = odd.abilities.map((a) => (a.slot === "E" ? { ...a, cooldown: [16, Number.NaN, 14, 13, 12] } : a.slot === "R" ? { ...a, cooldown: undefined as unknown as number[] } : a));
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps({ loadAbilities: storedAs({ Ambessa: kit("Ambessa"), Renekton: odd }) }));
    expect(slotOf(v, "E").cooldown).toEqual({ kind: "unknown", reason: "unreadable" });
    expect(slotOf(v, "R").cooldown).toEqual({ kind: "unknown", reason: "unreadable" });
  });

  it("keep the notes' numbers off the line when they cannot be read, and Riot's own on it", async () => {
    const notes = renektonNotes();
    notes.abilities.W = { ...notes.abilities.W!, cooldown: { kind: "per-rank", seconds: [18, 17, 16], starts: "on-cast" }, modifiers: { refund: { unit: "percent", amount: [200], when: "never" } } };
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps({ championNotes: (id) => (id === "Renekton" ? notes : null) }));
    expect(slotOf(v, "W").cooldown).toEqual({ kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: null, from: "ddragon" });
    expect(slotOf(v, "W").modifiers).toBeNull();
  });

  it("show a checked cooldown against the ranks it was checked with, once the ranks moved", async () => {
    const renekton = kit("Renekton", "16.23.1", [18, 17, 16, 15, 14, 13]);
    renekton.abilities = renekton.abilities.map((a) => (a.slot === "W" ? { ...a, maxRank: 6 } : a));
    const v = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps({ loadAbilities: storedAs({ Ambessa: kit("Ambessa", "16.23.1"), Renekton: renekton }) }));
    const w = slotOf(v, "W");
    expect(w.changes).toEqual(["cooldown", "ranks"]);
    expect(w.cooldown).toEqual({ kind: "per-rank", seconds: [18, 17, 16, 15, 14, 13], starts: null, from: "ddragon" });
    expect(w.checkedCooldown).toEqual({ kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: "after-effect-ends", from: "curated" });
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
    expect(w.facts[1]!.source).toEqual({ title: "A guide elsewhere", url: "", revisionTime: null });
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
