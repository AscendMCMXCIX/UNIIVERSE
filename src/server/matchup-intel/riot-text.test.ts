import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fixtureFile from "@/server/riot/fixtures/champion-abilities.fixture.json";
import { RIOT_TEXT_KINDS, SLOTS, type DdragonAbility, type RiotTextChampion } from "@/domain/matchup-intel/types";
import * as importer from "../../../scripts/matchup-intel/import-riot-text.mjs";
import { riotTextHash } from "./abilities";
import { loadRiotText, parseRiotText, riotTextChampions } from "./riot-text";
import { RIOT_TEXT_FILES } from "./riot-text/index";
import { riotTextView } from "./view";

/*
  Matchup Intel's facts from Riot's ability text (L3): the committed files' shape, how the page reads
  them defensively, how each ability's facts are pinned to Riot's text (riotTextView), and the
  import script's checks (a clause must be in Riot's text; names and versions must be Riot's).
*/

const DIR = join(__dirname, "riot-text");
const fixture = fixtureFile as unknown as { champions: Record<string, { version: string; abilities: DdragonAbility[] }> };

const ability = (over: Partial<DdragonAbility> = {}): DdragonAbility => ({ slot: "W", id: "RivenMartyr", name: "Ki Burst", icon: "RivenMartyr.png", maxRank: 5, cooldown: [11, 10, 9, 8, 7], charges: null, description: "Riven emits a Ki Burst.", textHash: "aaaaaaaaaaaaaaaa", ...over });
const reviewed = (over: Partial<RiotTextChampion> = {}): RiotTextChampion => ({
  championId: "Riven",
  version: "16.22.1",
  reviewedOn: "2026-11-18",
  review: { automatedReviews: 2, adjudicated: true, person: false },
  abilities: { W: { name: "Ki Burst", textHash: "aaaaaaaaaaaaaaaa" } },
  facts: [
    { slot: "W", kind: "stun", clause: "stunning nearby enemies", source: "tooltip" },
    { slot: "W", kind: "slow", clause: "slowing nearby enemies", source: "description" },
  ],
  ...over,
});

describe("parseRiotText: a committed file, read defensively", () => {
  it("reads a well-formed file as the champion's", () => {
    expect(parseRiotText(reviewed(), "Riven")).toEqual(reviewed());
  });

  it("refuses another champion's file, another shape, and a file without its review", () => {
    expect(parseRiotText(reviewed(), "Garen")).toBeNull();
    expect(parseRiotText({ ...reviewed(), version: "latest" }, "Riven")).toBeNull();
    expect(parseRiotText({ ...reviewed(), reviewedOn: "18 Nov" }, "Riven")).toBeNull();
    expect(parseRiotText({ ...reviewed(), review: undefined }, "Riven")).toBeNull();
    expect(parseRiotText({ ...reviewed(), abilities: { W: { name: "Ki Burst", textHash: "not a hash" } } }, "Riven")).toBeNull();
    expect(parseRiotText(null, "Riven")).toBeNull();
  });

  it("leaves out a fact that is not one: an unknown kind, slot or source, markup, a clause too long, an ability not reviewed", () => {
    const facts = [
      { slot: "W", kind: "stun", clause: "stunning nearby enemies", source: "tooltip" },
      { slot: "W", kind: "teleports-home", clause: "x x x x", source: "tooltip" },
      { slot: "Z", kind: "stun", clause: "stunning", source: "tooltip" },
      { slot: "W", kind: "stun", clause: "stunning", source: "the wiki" },
      { slot: "W", kind: "stun", clause: "<status>Stuns</status> enemies", source: "tooltip" },
      { slot: "W", kind: "stun", clause: "{{ stunduration }} seconds", source: "tooltip" },
      { slot: "W", kind: "stun", clause: "x".repeat(401), source: "tooltip" },
      { slot: "Q", kind: "dash", clause: "dashes forward", source: "tooltip" },
      { slot: "W", kind: "stun", clause: "  ", source: "tooltip" },
    ];
    expect(parseRiotText({ ...reviewed(), facts }, "Riven")!.facts).toEqual([{ slot: "W", kind: "stun", clause: "stunning nearby enemies", source: "tooltip" }]);
  });
});

describe("riotTextView: an ability's facts, as long as Riot's text is what was reviewed", () => {
  it("shows the facts while the name and the text's hash match the review", () => {
    expect(riotTextView(ability(), reviewed(), "16.23.1")).toEqual({
      facts: [
        { kind: "stun", clause: "stunning nearby enemies", source: "tooltip" },
        { kind: "slow", clause: "slowing nearby enemies", source: "description" },
      ],
      hidden: 0,
      hiddenBecause: null,
    });
  });

  it("hides them, and says how many and why, once Riot's text changed or the ability was renamed", () => {
    expect(riotTextView(ability({ textHash: "bbbbbbbbbbbbbbbb" }), reviewed(), "16.23.1")).toEqual({ facts: [], hidden: 2, hiddenBecause: "changed" });
    expect(riotTextView(ability({ name: "Ki Blast" }), reviewed(), "16.22.1")).toEqual({ facts: [], hidden: 2, hiddenBecause: "renamed" });
  });

  it("on a record stored before the rules kept the hash, shows them only on the very version reviewed", () => {
    expect(riotTextView(ability({ textHash: undefined }), reviewed(), "16.22.1").facts).toHaveLength(2);
    expect(riotTextView(ability({ textHash: undefined }), reviewed(), "16.23.1")).toEqual({ facts: [], hidden: 2, hiddenBecause: "unknown" });
  });

  it("an ability with no reviewed facts hides nothing", () => {
    expect(riotTextView(ability({ slot: "E", name: "Valor" }), reviewed({ abilities: { ...reviewed().abilities, E: { name: "Valor", textHash: "aaaaaaaaaaaaaaaa" } } }), "16.22.1")).toEqual({ facts: [], hidden: 0, hiddenBecause: null });
  });
});

describe("the committed files (src/server/matchup-intel/riot-text/)", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));

  it("lists every file in the index of loaders, and nothing else", () => {
    expect(Object.keys(RIOT_TEXT_FILES).sort()).toEqual(files.map((f) => f.replace(/\.json$/, "")).sort());
    expect(riotTextChampions().sort()).toEqual(Object.keys(RIOT_TEXT_FILES).sort());
  });

  it("reads every file as its champion's, every fact kept, each ability pinned to the offline copy's text at the version reviewed", async () => {
    for (const file of files) {
      const id = file.replace(/\.json$/, "");
      const raw = JSON.parse(readFileSync(join(DIR, file), "utf8")) as RiotTextChampion;
      const parsed = parseRiotText(raw, id);
      expect(parsed, file).not.toBeNull();
      expect(parsed!.facts, file).toHaveLength(raw.facts.length);
      expect(parsed!.review.automatedReviews, file).toBeGreaterThanOrEqual(2);
      for (const f of parsed!.facts) expect(RIOT_TEXT_KINDS, file).toContain(f.kind);
      const copy = fixture.champions[id];
      expect(copy, file).toBeDefined();
      if (copy && copy.version === parsed!.version) {
        for (const slot of SLOTS) {
          const a = copy.abilities.find((x) => x.slot === slot)!;
          expect(parsed!.abilities[slot], `${file} ${slot}`).toEqual({ name: a.name, textHash: a.textHash });
        }
      }
    }
    // The loader reads them on demand, and a champion with none gives null.
    const some = files.slice(0, 2).map((f) => f.replace(/\.json$/, ""));
    const loaded = await loadRiotText([...some, "NotAChampion"]);
    for (const id of some) expect(loaded[id]?.championId).toBe(id);
    expect(loaded.NotAChampion).toBeNull();
  });
});

describe("the import script (scripts/matchup-intel/import-riot-text.mjs)", () => {
  const full = {
    version: "16.22.1",
    data: {
      Riven: {
        passive: { name: "Runic Blade", description: "Riven's abilities charge her blade." },
        spells: [
          { name: "Broken Wings", description: "Riven lashes out.", tooltip: "Riven <status>Knocks Back</status> enemies on the third cast.{{ spellmodifierdescriptionappend }}" },
          { name: "Ki Burst", description: "Riven emits a Ki Burst, damaging and stunning nearby enemies.", tooltip: "Riven deals {{ totaldamage }} and <status>Stuns</status> nearby enemies for {{ stunduration }} seconds." },
          { name: "Valor", description: "Riven steps forward.", tooltip: "Riven dashes and gains a <shield>Shield</shield>." },
          { name: "Blade of the Exile", description: "Riven's sword reforms.", tooltip: "Riven gains bonus AD." },
        ],
      },
    },
  };
  const table = (facts: unknown[], over: Record<string, unknown> = {}) => ({ champion: "Riven", version: "16.22.1", reviewedAt: "2026-11-18T21:00:00Z", review: { reviewers: 2, adjudicator: "auto" }, abilityText: { W: { name: "Ki Burst" } }, facts, ...over });

  it("keeps the kinds every reviewed clause quotes from Riot's text, placeholders read as N, and pins each ability to riotTextHash", () => {
    const out = importer.importChampion(
      table([
        { slot: "W", kind: "stun", clause: "Riven deals N and Stuns nearby enemies for N seconds.", source: "tooltip" },
        { slot: "W", kind: "stun", clause: "damaging and stunning nearby enemies", source: "description" },
        { slot: "Q", kind: "knockback", clause: "Knocks Back enemies on the third cast.", source: "tooltip" },
      ]),
      full,
    );
    expect(out.left).toEqual([]);
    expect(out.record.facts.map((f: { slot: string; kind: string; source: string }) => `${f.slot} ${f.kind} ${f.source}`)).toEqual(["Q knockback tooltip", "W stun description", "W stun tooltip"]);
    expect(out.record.review).toEqual({ automatedReviews: 2, adjudicated: true, person: false });
    expect(out.record.reviewedOn).toBe("2026-11-18");
    const w = full.data.Riven.spells[1]!;
    expect(out.record.abilities.W).toEqual({ name: "Ki Burst", textHash: riotTextHash(w.description, w.tooltip) });
    expect(out.record.abilities.P).toEqual({ name: "Runic Blade", textHash: riotTextHash(full.data.Riven.passive.description, null) });
    // What the page reads back is what was written.
    expect(parseRiotText(JSON.parse(importer.serialise(out.record)), "Riven")).toEqual(out.record);
  });

  it("leaves out, and reports, a clause that is not in Riot's text, an unknown kind, or a tooltip for the passive", () => {
    const out = importer.importChampion(
      table([
        { slot: "W", kind: "stun", clause: "stuns every enemy on the map", source: "tooltip" },
        { slot: "W", kind: "petrify", clause: "Stuns nearby enemies", source: "tooltip" },
        { slot: "P", kind: "empower", clause: "charge her blade", source: "tooltip" },
        { slot: "W", kind: "stun", clause: "Riven deals N and Stuns nearby enemies for N seconds.", source: "tooltip", decision: "reject" },
      ]),
      full,
    );
    expect(out.record.facts).toEqual([]);
    expect(out.left).toHaveLength(3);
  });

  it("refuses a file reviewed on another version, under another name, or for a champion Riot does not have", () => {
    expect(() => importer.importChampion(table([], { version: "16.23.1" }), full)).toThrow(/16\.23\.1/);
    expect(() => importer.importChampion(table([], { abilityText: { W: { name: "Ki Blast" } } }), full)).toThrow(/Ki Blast/);
    expect(() => importer.importChampion(table([], { champion: "Zaahen" }), full)).toThrow(/Zaahen/);
  });

  it("checks a clause cut short with an ellipsis on the words it quotes", () => {
    expect(importer.clauseInText("Riven deals N and Stuns nearby…", full.data.Riven.spells[1]!.tooltip)).toBe(true);
    expect(importer.clauseInText("Riven deals N and Stuns everyone…", full.data.Riven.spells[1]!.tooltip)).toBe(false);
  });

  it("writes the index of loaders, one dynamic import per champion", () => {
    expect(importer.serialiseIndex(["Aatrox", "Riven"])).toContain('  Riven: () => import("./Riven.json"),');
    expect(importer.serialiseIndex([])).toContain("= {};");
  });

  it("knows the same kinds as the app, in the same order", () => {
    expect(importer.KINDS).toEqual([...RIOT_TEXT_KINDS]);
  });
});
