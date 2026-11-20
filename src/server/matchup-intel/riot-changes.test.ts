import { afterEach, describe, expect, it, vi } from "vitest";
import fixtureFile from "@/server/riot/fixtures/champion-abilities.fixture.json";
import championList from "@/server/riot/fixtures/champions.fixture.json";
import type { ChampionChoice, DdragonChampionAbilities } from "@/domain/matchup-intel/types";
import type { MatchupEvidence } from "@/domain/matchup-intel/evidence";
import { fieldLine } from "@/domain/matchup-intel/evidence";
import { getChampionNotes, getMatchupNotes } from "./curated";
import { changedOf, digestsOf } from "./digests";
import { riotChangesForTest } from "./notes-age";
import { namedOnPage, withRiotChanges } from "./riot-changes";
import { buildMatchupPageView, type MatchupViewDeps } from "./view";
import { riotChangedAfterTierWords, riotChangedLead, riotChangedWords } from "@/components/matchup-intel/wording";

/*
  "Riot changed this on 26.24" (riot-changes.ts): the per-version diff per entity, and the labels it
  sets on the page's view and evidence lines.
*/

afterEach(() => vi.unstubAllEnvs());

const fixture = fixtureFile as unknown as { version: string; champions: Record<string, DdragonChampionAbilities> };
const ROSTER: ChampionChoice[] = championList.champions.map((c) => ({ id: c.id, name: c.name, title: "", portrait: "" }));

function view(you: string, enemy: string) {
  const deps: MatchupViewDeps = {
    champions: ROSTER,
    currentPatch: { patch: "16.22", ddragonVersion: fixture.version },
    loadAbilities: async (ids) => ({ version: fixture.version, champions: Object.fromEntries(ids.map((id) => [id, fixture.champions[id] ?? null])) }),
    knownPatches: ["16.22"],
    championNotes: getChampionNotes,
    matchupNotes: getMatchupNotes,
  };
  return buildMatchupPageView({ champion: you, vs: enemy }, deps);
}

/** Two patches' digests from Data Dragon-shaped files: a champion, an item and a rune. */
function digests(version: string, opts: { cooldown?: number; stats?: number; itemGold?: number; runeText?: string } = {}) {
  const abilities = { version, source: "ddragon", champions: { Ahri: { version, abilities: [{ slot: "Q", cooldown: [opts.cooldown ?? 7], maxRank: 5, charges: null, textHash: "t" }] } } } as never;
  const champions = { data: { Ahri: { id: "Ahri", stats: { hp: opts.stats ?? 590 } } } };
  const items = { data: { "3020": { name: "Sorcerer's Shoes", gold: { total: opts.itemGold ?? 1100 } } } };
  const runes = [{ id: 8100, slots: [{ runes: [{ id: 8112, name: "Electrocute", longDesc: opts.runeText ?? "a" }] }] }];
  return digestsOf(champions, items, runes, abilities, version).map((r) => ({ ...r, patch: version.split(".").slice(0, 2).join(".") }));
}
const KEYS = ["champion:Ahri", "item:3020", "rune:8112"];

describe("the per-version diff, per entity", () => {
  it("nothing changed: no key reads as changed", () => {
    expect([...changedOf([...digests("16.23.1"), ...digests("16.24.1")], "16.24", "16.23", KEYS)]).toEqual([]);
  });
  it("a champion: an ability's cooldown or a base stat changes its digest", () => {
    expect([...changedOf([...digests("16.23.1"), ...digests("16.24.1", { cooldown: 6 })], "16.24", "16.23", KEYS)]).toEqual(["champion:Ahri"]);
    expect([...changedOf([...digests("16.23.1"), ...digests("16.24.1", { stats: 600 })], "16.24", "16.23", KEYS)]).toEqual(["champion:Ahri"]);
  });
  it("an item: its gold; a rune: its text", () => {
    expect([...changedOf([...digests("16.23.1"), ...digests("16.24.1", { itemGold: 1000 })], "16.24", "16.23", KEYS)]).toEqual(["item:3020"]);
    expect([...changedOf([...digests("16.23.1"), ...digests("16.24.1", { runeText: "b" })], "16.24", "16.23", KEYS)]).toEqual(["rune:8112"]);
  });
  it("a key recorded at one patch only is not a change (unknown is never changed)", () => {
    const rows = [...digests("16.23.1").filter((r) => r.kind !== "item"), ...digests("16.24.1", { itemGold: 1 })];
    expect([...changedOf(rows, "16.24", "16.23", KEYS)]).toEqual([]);
  });
});

describe("the labels on the page", () => {
  it("label the champion whose digest changed, with the patch's public name, and nobody else", async () => {
    const v = await view("Ahri", "Zed");
    const { view: out } = withRiotChanges(v, null, { patch: "26.24", changed: new Set(["champion:Zed"]) });
    expect(out.enemyIntel?.riotChangedOn).toBe("26.24");
    expect(out.yourIntel?.riotChangedOn).toBeNull();
    expect(riotChangedWords("26.24")).toBe("Riot changed this on 26.24");
    // The page's words are the lead and "on 26.24" kept together: the same sentences.
    expect(`${riotChangedLead(false)} on 26.24`).toBe(riotChangedWords("26.24"));
    expect(`${riotChangedLead(true)} on 26.24`).toBe(riotChangedAfterTierWords("26.24"));
  });
  it("set nothing without changes (fewer than two patches recorded)", async () => {
    const v = await view("Ahri", "Zed");
    const { view: out } = withRiotChanges(v, null, null);
    expect(out.enemyIntel?.riotChangedOn ?? null).toBeNull();
    expect(out.yourIntel?.riotChangedOn ?? null).toBeNull();
  });
  it("label an evidence line naming a changed item, and never send the line's keys to the page", async () => {
    const counts = { games: [], fields: { start: [{ patch: "16.24", queue: 420, value: "1056,2003", n: 4 }] }, objectives: [], ends: [] };
    const line = fieldLine("start", counts, { current: "16.24", previous: null, unchanged: () => false }, ["Ahri"], { champion: (id) => id, item: (id) => `Item ${id}`, spell: () => null, rune: () => null })!;
    expect(line.named).toEqual([{ kind: "item", key: "1056" }, { kind: "item", key: "2003" }]);
    const evidence: MatchupEvidence = { patch: "26.24", ignored: [], sections: [{ scope: "own", tier: "In your games (n = 4)", n: 4, lines: [line], empty: null, positionNote: null }] };
    const v = await view("Ahri", "Zed");
    expect(namedOnPage(v, evidence)).toEqual([{ kind: "champion", key: "Ahri" }, { kind: "champion", key: "Zed" }, { kind: "item", key: "1056" }, { kind: "item", key: "2003" }]);
    const changed = withRiotChanges(v, evidence, { patch: "26.24", changed: new Set(["item:2003"]) }).evidence!.sections[0]!.lines[0]!;
    expect(changed.changedOn).toBe("26.24");
    expect("named" in changed).toBe(false);
    const quiet = withRiotChanges(v, evidence, null).evidence!.sections[0]!.lines[0]!;
    expect(quiet.changedOn).toBeUndefined();
    expect("named" in quiet).toBe(false);
  });
});

describe("the browser tests' hook", () => {
  it("only on the in-memory demo, never on a deployment or with a database address, and only a list of keys", () => {
    vi.stubEnv("UNIIVERSE_DB_MODE", "memory");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "");
    expect([...riotChangesForTest("champion:Zed,item:1055,rune:8112", "26.22")!.changed]).toEqual(["champion:Zed", "item:1055", "rune:8112"]);
    expect(riotChangesForTest("champion:Zed", "26.22")!.patch).toBe("26.22");
    expect(riotChangesForTest("champion:Zed;drop", "26.22")).toBeNull();
    expect(riotChangesForTest("champion:Zed", null)).toBeNull();
    expect(riotChangesForTest(Array.from({ length: 21 }, (_, i) => `item:${i}`).join(","), "26.22")).toBeNull();
    vi.stubEnv("VERCEL", "1");
    expect(riotChangesForTest("champion:Zed", "26.22")).toBeNull();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    expect(riotChangesForTest("champion:Zed", "26.22")).toBeNull();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("UNIIVERSE_DB_MODE", "postgres");
    expect(riotChangesForTest("champion:Zed", "26.22")).toBeNull();
  });
});
