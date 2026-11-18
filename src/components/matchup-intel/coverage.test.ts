import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixtureFile from "@/server/riot/fixtures/champion-abilities.fixture.json";
import championList from "@/server/riot/fixtures/champions.fixture.json";
import { SIDE_GROUPS, abilityChips, kitOf } from "@/domain/matchup-intel/kit";
import { refusedWords } from "@/domain/matchup-intel/refused-words";
import { RIOT_TEXT_KINDS, SLOTS, type ChampionChoice, type ChampionIntelView, type DdragonChampionAbilities } from "@/domain/matchup-intel/types";
import { getChampionNotes, getMatchupNotes, curatedEnemiesFor } from "@/server/matchup-intel/curated";
import { loadRiotText } from "@/server/matchup-intel/riot-text";
import { buildMatchupPageView, curatedIndex, type MatchupViewDeps } from "@/server/matchup-intel/view";
import { MatchupContent } from "./matchup-content";
import { MatchupFrame } from "./matchup-frame";
import { KIND_GROUP_WORDS, assembledWords, noFactsWords } from "./wording";

/*
  Every pair gives a meaningful reference (the owner's request, 18 Nov 2026), checked over the real
  data with no database: Data Dragon 16.22.1's abilities for every champion (the committed offline
  copy), the curated notes and matchups, and the reviewed facts from Riot's text that are committed.
  For each pair the page body renders, and it is either the curated briefing or the assembled
  reference, labelled as such, with the enemy's five ability tiles, every group of each side saying
  what it holds or that nothing is recorded, and nothing that instructs or judges.
*/

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

const fixture = fixtureFile as unknown as { version: string; champions: Record<string, DdragonChampionAbilities> };
const ROSTER: ChampionChoice[] = championList.champions.map((c) => ({ id: c.id, name: c.name, title: "", portrait: "" }));
const deps: MatchupViewDeps = {
  champions: ROSTER,
  currentPatch: { patch: "16.22", ddragonVersion: "16.22.1" },
  loadAbilities: async (ids) => ({ version: fixture.version, champions: Object.fromEntries(ids.map((id) => [id, fixture.champions[id] ?? null])) }),
  championNotes: getChampionNotes,
  matchupNotes: getMatchupNotes,
  riotText: loadRiotText,
};
const curated = curatedIndex(ROSTER, curatedEnemiesFor);
const LEGAL = "UNIIVERSE isn't endorsed by Riot Games or anyone officially involved in producing or managing Riot Games properties.";
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

async function page(you: string, enemy: string) {
  const view = await buildMatchupPageView({ champion: you, vs: enemy }, deps);
  const html = renderToStaticMarkup(createElement(MatchupFrame, { you: view.you, enemy: view.enemy, champions: ROSTER, curated }, createElement(MatchupContent, { view, champions: ROSTER, curated, legal: LEGAL })));
  return { view, html, words: text(html) };
}

/** A deterministic shuffle, so a failure names the same pairs every run. */
function sample<T>(list: readonly T[], n: number, seed: number): T[] {
  const out = [...list];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out.slice(0, n);
}

function checkPair(you: string, enemy: string, p: Awaited<ReturnType<typeof page>>) {
  const where = `${you} vs ${enemy}`;
  const { view, html, words } = p;
  expect(view.enemyIntel?.abilities?.map((a) => a.slot), where).toEqual([...SLOTS]);
  // The enemy's five tiles, each with a name and a cooldown line.
  const panel = html.split('data-testid="matchup-enemy-abilities-list"')[1]!.split("</ol>")[0]!;
  const tiles = panel.split('data-testid="ability-row"').length - 1;
  expect(tiles, where).toBe(5);
  const curatedShown = !!view.matchup?.briefing;
  if (curatedShown) {
    expect(words, where).toContain("Curated briefing");
    expect(html, where).toContain('data-testid="briefing-threat"');
    expect(html, where).not.toContain('data-testid="matchup-assembled"');
  } else {
    expect(words, where).toContain("Assembled reference");
    expect(words, where).toContain(assembledWords(view.you!.name, view.enemy!.name));
    expect(html, where).not.toContain("Curated briefing");
    // Each side: every group says what it holds or that none is recorded, or the side says it has no facts at all.
    const mirror = you === enemy;
    for (const intel of mirror ? [view.enemyIntel!] : [view.enemyIntel!, view.yourIntel!]) {
      const kit = kitOf(intel);
      if (kit.from === "none") expect(words, `${where}: ${intel.champion.id}`).toContain(noFactsWords(intel.champion.name));
      else for (const g of SIDE_GROUPS) expect(words, `${where}: ${intel.champion.id} ${g}`).toContain(KIND_GROUP_WORDS[g]);
    }
  }
  // Never "verified", and no fixed words that instruct or judge (curated texts are held to the same list by curated.test.ts).
  expect(words, where).not.toMatch(/\bverified\b/i);
  for (const fixed of ["Assembled reference", "Danger", "Opportunity", "None recorded in Riot's text", "None in the checked notes"]) if (words.includes(fixed)) expect(refusedWords(fixed)).toEqual([]);
  // The sources and Riot's notice, one press away, their summary on the page.
  expect(html, where).toContain('data-testid="matchup-sources-summary"');
  expect(words, where).toContain(LEGAL);
}

describe("every pair gives a meaningful reference", () => {
  it("Ambessa, Gwen and Riven against every champion on the roster, and every champion against them", async () => {
    const ids = ROSTER.map((c) => c.id);
    for (const you of ["Ambessa", "Gwen", "Riven"]) {
      for (const enemy of ids) checkPair(you, enemy, await page(you, enemy));
      for (const other of sample(ids, 25, you.length)) checkPair(other, you, await page(other, you));
    }
  }, 120_000);

  it("a random sweep of other pairs, a mirror among them", async () => {
    const ids = ROSTER.map((c) => c.id);
    const pairs = sample(ids, 60, 7).map((a, i) => [a, sample(ids, 60, 11)[i]!] as const);
    for (const [a, b] of [...pairs, ["Garen", "Garen"] as const]) checkPair(a, b, await page(a, b));
  }, 120_000);

  it("the three curated pairs show their briefing, and their reverse the assembled reference", async () => {
    for (const [a, b] of [
      ["Ambessa", "Renekton"],
      ["Gwen", "Ornn"],
      ["Riven", "Mordekaiser"],
    ] as const) {
      expect((await page(a, b)).words).toContain("Curated briefing");
      expect((await page(b, a)).words).toContain("Assembled reference");
    }
  });
});

describe("kitOf: one champion's facts, grouped by kind, never judged", () => {
  const intel = (abilities: ChampionIntelView["abilities"], over: Partial<ChampionIntelView> = {}): ChampionIntelView => ({
    champion: { id: "Darius", name: "Darius", title: "", portrait: "" },
    dataVersion: "16.22.1",
    offlineCopy: false,
    abilities,
    abilitiesUnreadable: false,
    curated: null,
    levelNotes: [],
    sources: [],
    riotText: { version: "16.22.1", patch: "26.22", reviewedOn: "2026-11-18", review: { automatedReviews: 2, adjudicated: true, person: false } },
    ...over,
  });
  const ability = (slot: (typeof SLOTS)[number], facts: Array<{ kind: (typeof RIOT_TEXT_KINDS)[number]; clause: string; source?: "tooltip" | "description" }>, hidden = 0) => ({
    slot,
    name: `${slot} name`,
    icon: null,
    maxRank: 5,
    cooldown: { kind: "per-rank" as const, seconds: [10, 9, 8, 7, 6], starts: null, from: "ddragon" as const },
    checkedCooldown: null,
    changes: [],
    cooldownNote: null,
    modifiers: null,
    recast: null,
    facts: [],
    description: "",
    details: [],
    freshness: null,
    riotText: { facts: facts.map((f) => ({ kind: f.kind, clause: f.clause, source: f.source ?? "tooltip" })), hidden, hiddenBecause: hidden ? ("changed" as const) : null },
  });

  it("sorts each ability's kinds into their groups, in slot order, one chip per kind holding every clause", () => {
    const kit = kitOf(
      intel([
        ability("P", []),
        ability("Q", [{ kind: "heal", clause: "heals per champion hit" }]),
        ability("W", [{ kind: "slow", clause: "slows the target" }, { kind: "cooldownrefund", clause: "reduces its cooldown" }]),
        ability("E", [
          { kind: "slow", clause: "slowing", source: "description" },
          { kind: "pull", clause: "pulls them to him", source: "description" },
          { kind: "pull", clause: "Pulling", source: "tooltip" },
          { kind: "knockup", clause: "Knocking Up" },
        ]),
        ability("R", [{ kind: "reset", clause: "resets its cooldown" }]),
      ]),
    );
    const cc = kit.groups.find((g) => g.group === "crowd-control")!;
    expect(cc.items.map((i) => i.slot)).toEqual(["W", "E"]);
    // The kinds' own order (knock-up, pull, slow), never a ranking by danger.
    expect(cc.items[1]!.chips.map((c) => (c.layer === "riot-text" ? c.kind : ""))).toEqual(["knockup", "pull", "slow"]);
    const pull = cc.items[1]!.chips.find((c) => c.layer === "riot-text" && c.kind === "pull")!;
    expect(pull.layer === "riot-text" && pull.clauses).toEqual([
      { clause: "pulls them to him", source: "description" },
      { clause: "Pulling", source: "tooltip" },
    ]);
    expect(kit.groups.find((g) => g.group === "sustain")!.items.map((i) => i.slot)).toEqual(["Q"]);
    expect(kit.groups.find((g) => g.group === "cooldown")!.items.map((i) => i.slot)).toEqual(["W", "R"]);
    expect(kit.groups.find((g) => g.group === "mobility")!.items).toEqual([]);
    expect(kit.from).toBe("riot-text");
  });

  it("names the abilities whose facts are hidden, and a champion with no facts at all", () => {
    const kit = kitOf(intel([ability("P", []), ability("Q", [], 2), ability("W", []), ability("E", []), ability("R", [])]));
    expect(kit.hidden).toEqual([{ slot: "Q", ability: "Q name", count: 2, because: "changed" }]);
    expect(kitOf(intel([ability("P", [])], { riotText: null })).from).toBe("none");
  });

  it("uses checked facts where a champion has them, their own labels, interactions apart", () => {
    const a = { ...ability("W", [{ kind: "stun", clause: "never shown" }]), riotText: null, facts: [{ kind: "interaction" as const, label: "Blockable", detail: null, appliesTo: "target" as const, tags: [], source: { title: "", url: "", revisionTime: null } }, { kind: "crowd-control" as const, label: "Stun", detail: "0.75 s", appliesTo: "target" as const, tags: ["stun" as const], source: { title: "", url: "", revisionTime: null } }] };
    expect(abilityChips(a).map((c) => (c.layer === "checked" ? c.word : ""))).toEqual(["Stun", "Blockable"]);
    const kit = kitOf(intel([a], { curated: { verified: { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-17" }, freshness: "current", recheck: null }, riotText: null }));
    expect(kit.from).toBe("checked");
    expect(kit.interactions.map((i) => i.slot)).toEqual(["W"]);
  });
});
