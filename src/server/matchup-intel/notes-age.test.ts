import { afterEach, describe, expect, it, vi } from "vitest";
import fixtureFile from "@/server/riot/fixtures/champion-abilities.fixture.json";
import championList from "@/server/riot/fixtures/champions.fixture.json";
import type { ChampionChoice, DdragonChampionAbilities } from "@/domain/matchup-intel/types";
import { getChampionNotes, getMatchupNotes } from "./curated";
import { checkedEarlier, notesAgeForTest } from "./notes-age";
import { buildMatchupPageView, type MatchupViewDeps } from "./view";

/*
  The browser tests' way to see Matchup Intel as production shows it once patches have come out
  after the curated notes' check (notes-age.ts): the notes read as checked one, two or three patches
  earlier, on the in-memory demo only. Built here over the real data (the committed copy of Data
  Dragon 16.22.1, the version the notes were checked on, and the committed notes), so what the
  browser tests measure is the state production is in, not one made up for them.
*/

afterEach(() => {
  vi.unstubAllEnvs();
});

const fixture = fixtureFile as unknown as { version: string; champions: Record<string, DdragonChampionAbilities> };
const ROSTER: ChampionChoice[] = championList.champions.map((c) => ({ id: c.id, name: c.name, title: "", portrait: "" }));

/** The page's view of a pair on the demo's data, its curated notes read as checked `age` patches earlier. */
function view(you: string, enemy: string, age: number) {
  const deps: MatchupViewDeps = {
    champions: ROSTER,
    currentPatch: { patch: "16.22", ddragonVersion: fixture.version },
    loadAbilities: async (ids) => ({ version: fixture.version, champions: Object.fromEntries(ids.map((id) => [id, fixture.champions[id] ?? null])) }),
    knownPatches: ["16.22"],
    championNotes: (id) => checkedEarlier(getChampionNotes(id), age),
    matchupNotes: (a, b) => checkedEarlier(getMatchupNotes(a, b), age),
  };
  return buildMatchupPageView({ champion: you, vs: enemy }, deps);
}

describe("the curated notes read as checked earlier, for the browser tests", () => {
  it("only on the in-memory demo, never on a deployment or a real database, and only for one to three patches", () => {
    vi.stubEnv("UNIIVERSE_DB_MODE", "memory");
    vi.stubEnv("VERCEL", "");
    expect(["1", "2", "3"].map(notesAgeForTest)).toEqual([1, 2, 3]);
    for (const cookie of [undefined, null, "", "0", "4", "-1", "1.5", " 1", "one"]) expect(notesAgeForTest(cookie), String(cookie)).toBe(0);
    vi.stubEnv("VERCEL", "1");
    expect(notesAgeForTest("1")).toBe(0);
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("UNIIVERSE_DB_MODE", "postgres");
    expect(notesAgeForTest("1")).toBe(0);
  });

  it("move the notes' version and patch back, and nothing else", () => {
    const notes = getMatchupNotes("Riven", "Mordekaiser")!;
    expect(notes.verified).toMatchObject({ patch: "26.22", ddragonVersion: "16.22.1" });
    const earlier = checkedEarlier(notes, 1)!;
    expect(earlier.verified).toEqual({ ...notes.verified, patch: "26.21", ddragonVersion: "16.21.1" });
    expect({ ...earlier, verified: notes.verified }).toEqual(notes);
    expect(checkedEarlier(notes, 3)!.verified).toMatchObject({ patch: "26.19", ddragonVersion: "16.19.1" });
    // As they are: none, no age, or further back than the version's year.
    expect(checkedEarlier(null, 1)).toBeNull();
    expect(checkedEarlier(notes, 0)).toBe(notes);
    expect(checkedEarlier({ ...notes, verified: { ...notes.verified, ddragonVersion: "16.1.1" } }, 1)!.verified.ddragonVersion).toBe("16.1.1");
  });

  it("one patch on: production's state until the notes are re-checked, every curated part not re-checked for the demo's patch and nothing read as changed", async () => {
    const v = await view("Riven", "Mordekaiser", 1);
    expect(v.matchup).toMatchObject({ verified: { patch: "26.21" }, freshness: "unchanged-since", recheck: { patch: "26.22", patches: 1, expired: false } });
    expect([v.matchup!.briefing!.threat.kind, v.matchup!.briefing!.opportunity.kind, ...v.matchup!.briefing!.lane.map((p) => p.kind), ...v.matchup!.interactions.map((i) => i.kind)].every((k) => k === "point" || k === "interaction")).toBe(true);
    for (const intel of [v.enemyIntel!, v.yourIntel!]) {
      expect(intel.curated, intel.champion.id).toMatchObject({ verified: { patch: "26.21" }, freshness: "unchanged-since", recheck: { patch: "26.22", patches: 1, expired: false } });
      expect(intel.abilities!.some((a) => a.freshness === "changed-since"), intel.champion.id).toBe(false);
    }
    // Without it, the demo's state: checked on the patch it shows.
    const now = await view("Riven", "Mordekaiser", 0);
    expect(now.matchup).toMatchObject({ verified: { patch: "26.22" }, recheck: null });
  });

  it("three patches on: the briefing hidden as too old, as production shows it then", async () => {
    const v = await view("Riven", "Mordekaiser", 3);
    expect(v.matchup).toMatchObject({ recheck: { patch: "26.22", patches: 3, expired: true }, briefing: null, interactions: [] });
    expect(v.matchup!.expiredInteractions).toBeGreaterThan(0);
  });
});
