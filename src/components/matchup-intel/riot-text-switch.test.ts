import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixtureFile from "@/server/riot/fixtures/champion-abilities.fixture.json";
import championList from "@/server/riot/fixtures/champions.fixture.json";
import type { ChampionChoice, DdragonChampionAbilities } from "@/domain/matchup-intel/types";
import { getChampionNotes, getMatchupNotes, curatedEnemiesFor } from "@/server/matchup-intel/curated";
import { loadRiotText } from "@/server/matchup-intel/riot-text";
import { RIOT_TEXT_FILES } from "@/server/matchup-intel/riot-text/index";
import { RIOT_TEXT_FACTS_ENABLED, riotTextFactsShown } from "@/server/matchup-intel/riot-text/switch";
import { buildMatchupPageView, curatedIndex, riotTextReader, type MatchupViewDeps } from "@/server/matchup-intel/view";
import { MatchupContent } from "./matchup-content";
import { MatchupFrame } from "./matchup-frame";
import { MatchupStatus } from "./matchup-status";
import { CONDITIONAL_WORDS, DIFFER_WORDS, NO_ABILITY_FACTS_WORDS, RIOT_TEXT_LABEL, RIOT_TEXT_NO_NUMBERS_WORDS, noFactsWords, noneRecordedWords } from "./wording";

/*
  The switch for the facts from Riot's text (src/server/matchup-intel/riot-text/switch.ts): on
  since 23 Nov 2026 (OD1), and it shipped off before the registration described the layer.
  Off, no file of it is read and the page shows nothing of it: a champion without checked notes
  reads as one with no reviewed facts, one line per side. Rendered over the real data (Data Dragon
  16.22.1's committed copy, the curated notes, the committed reviewed files), whatever the switch
  says today; the layer itself, on, is tested in coverage.test.ts and beside its modules.
*/

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

const fixture = fixtureFile as unknown as { version: string; champions: Record<string, DdragonChampionAbilities> };
const ROSTER: ChampionChoice[] = championList.champions.map((c) => ({ id: c.id, name: c.name, title: "", portrait: "" }));
const curated = curatedIndex(ROSTER, curatedEnemiesFor);
const LEGAL = "UNIIVERSE isn't endorsed by Riot Games or anyone officially involved in producing or managing Riot Games properties.";
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

/** Every reviewed file the page reads while a test runs, by champion: each loader in the index, counted. */
const loads: string[] = [];
for (const id of Object.keys(RIOT_TEXT_FILES)) {
  const load = RIOT_TEXT_FILES[id]!;
  (RIOT_TEXT_FILES as Record<string, () => Promise<{ default: unknown }>>)[id] = () => {
    loads.push(id);
    return load();
  };
}

function deps(shown: boolean): MatchupViewDeps {
  return {
    champions: ROSTER,
    currentPatch: { patch: "16.22", ddragonVersion: "16.22.1" },
    loadAbilities: async (ids) => ({ version: fixture.version, champions: Object.fromEntries(ids.map((id) => [id, fixture.champions[id] ?? null])) }),
    championNotes: getChampionNotes,
    matchupNotes: getMatchupNotes,
    riotText: riotTextReader(shown),
  };
}

/** The page as the server renders it: the bar, the dashboard and the sources, closed parts included. */
async function page(you: string, enemy: string, shown: boolean) {
  const view = await buildMatchupPageView({ champion: you, vs: enemy }, deps(shown));
  const html = renderToStaticMarkup(createElement(MatchupFrame, { you: view.you, enemy: view.enemy, champions: ROSTER, curated, patchState: createElement(MatchupStatus, { view }) }, createElement(MatchupContent, { view, champions: ROSTER, curated, legal: LEGAL })));
  return { view, html, words: text(html) };
}

/** Gnar (W's "Mega Gnar"), Yone (R, where Riot's texts differ) and Twisted Fate (placeholders): the layer's most telling facts when it is on. */
const PAIRS: Array<{ you: string; enemy: string; none: Array<["danger" | "yours", string]> }> = [
  { you: "Riven", enemy: "Gnar", none: [["danger", "Gnar"]] },
  { you: "Yone", enemy: "TwistedFate", none: [["danger", "Twisted Fate"], ["yours", "Yone"]] },
  { you: "TwistedFate", enemy: "Yone", none: [["danger", "Yone"], ["yours", "Twisted Fate"]] },
  { you: "Gnar", enemy: "Yone", none: [["danger", "Yone"], ["yours", "Gnar"]] },
];

/** One side of the assembled reference, as rendered: from its section's attributes to its end. */
const sideOf = (html: string, side: "danger" | "yours") => html.split(`data-testid="assembled-${side}"`)[1]!.split("</section>")[0]!;

/** What only the layer draws or says. */
const LAYER_MARKUP = ["riot-text", 'data-testid="fact-chip-differ"', 'data-testid="fact-qualifier"', 'data-testid="ability-facts-conditional"', 'data-testid="assembled-conditional"', 'data-testid="ability-facts-hidden"', 'data-testid="assembled-hidden"'];
const LAYER_WORDS = [RIOT_TEXT_LABEL, CONDITIONAL_WORDS, DIFFER_WORDS, NO_ABILITY_FACTS_WORDS, noneRecordedWords("riot-text"), RIOT_TEXT_NO_NUMBERS_WORDS, "Riot's text", "Riot's ability text", "reviewed automatically", "“Mega Gnar”"];

afterEach(() => {
  loads.length = 0;
  vi.unstubAllEnvs();
});

describe("the facts from Riot's text, switched off", () => {
  it("read no reviewed file, and show no chip, marker, label or sentence of them for Gnar, Yone and Twisted Fate", async () => {
    for (const { you, enemy, none } of PAIRS) {
      const where = `${you} vs ${enemy}`;
      const { view, html, words } = await page(you, enemy, false);
      expect(view.enemyIntel?.riotText, where).toBeNull();
      expect(view.enemyIntel?.abilities?.every((a) => a.riotText === null), where).toBe(true);
      for (const m of LAYER_MARKUP) expect(html, `${where}: ${m}`).not.toContain(m);
      for (const w of LAYER_WORDS) expect(words, `${where}: ${w}`).not.toContain(w);
      // Each side without checked notes: one line in place of its groups, and no chip.
      for (const [side, name] of none) {
        const own = sideOf(html, side);
        expect(own, `${where}: ${side}`).toMatch(/^ data-from="none"/);
        expect(own.split('data-testid="assembled-no-facts"').length - 1, `${where}: ${side}`).toBe(1);
        expect(text(own), `${where}: ${side}`).toContain(noFactsWords(name));
        expect(own, `${where}: ${side}`).not.toContain('data-testid="assembled-group"');
        expect(own, `${where}: ${side}`).not.toContain('data-testid="fact-chip');
      }
      // The enemy's five tiles keep their names and cooldowns, with no chip.
      const tiles = html.split('data-testid="matchup-enemy-abilities-list"')[1]!.split("</ol>")[0]!;
      expect(tiles.split('data-testid="ability-row"').length - 1, where).toBe(5);
      expect(tiles, where).not.toContain('data-testid="fact-chip"');
    }
    expect(loads).toEqual([]);
  });

  it("are there, the same pairs, once on: the switch is what hides them", async () => {
    const gnar = await page("Riven", "Gnar", true);
    expect(gnar.words).toContain(RIOT_TEXT_LABEL);
    expect(gnar.words).toContain("Mega Gnar");
    const yone = await page("TwistedFate", "Yone", true);
    expect(yone.html).toContain('data-testid="fact-chip-differ"');
    expect(new Set(loads)).toEqual(new Set(["Gnar", "TwistedFate", "Yone"]));
  });

  it("are read by the page only while their switch is on", () => {
    expect(riotTextReader(true)).toBe(loadRiotText);
    expect(riotTextReader(false)).toBeUndefined();
  });
});

describe("the switch", () => {
  it("decides alone on a deployment and on a real database, whatever a cookie says", () => {
    vi.stubEnv("UNIIVERSE_DB_MODE", "memory");
    vi.stubEnv("VERCEL", "1");
    for (const cookie of [undefined, null, "on", "off", "yes"]) expect(riotTextFactsShown(cookie), String(cookie)).toBe(RIOT_TEXT_FACTS_ENABLED);
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("UNIIVERSE_DB_MODE", "postgres");
    for (const cookie of [undefined, "on", "off"]) expect(riotTextFactsShown(cookie), String(cookie)).toBe(RIOT_TEXT_FACTS_ENABLED);
  });

  it("gives a browser test on the in-memory demo the state its cookie names, and the switch's otherwise", () => {
    vi.stubEnv("UNIIVERSE_DB_MODE", "memory");
    vi.stubEnv("VERCEL", "");
    expect(riotTextFactsShown("on")).toBe(true);
    expect(riotTextFactsShown("off")).toBe(false);
    for (const cookie of [undefined, null, "", "ON", "1"]) expect(riotTextFactsShown(cookie), String(cookie)).toBe(RIOT_TEXT_FACTS_ENABLED);
  });
});
