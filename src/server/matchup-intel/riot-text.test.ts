import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
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
  import script's checks: the review record read as the review wrote it, the review's hashes of
  Riot's text, every span verbatim in Riot's text, Riot's placeholders kept unresolved.
*/

const DIR = join(__dirname, "riot-text");
const fixture = fixtureFile as unknown as { champions: Record<string, { version: string; abilities: DdragonAbility[] }> };
const REVIEW = { automatedReviewers: 2, adjudicated: true, consistencyCheckers: 2, checkedByPerson: false };

const ability = (over: Partial<DdragonAbility> = {}): DdragonAbility => ({ slot: "W", id: "RivenMartyr", name: "Ki Burst", icon: "RivenMartyr.png", maxRank: 5, cooldown: [11, 10, 9, 8, 7], charges: null, description: "Riven emits a Ki Burst.", textHash: "aaaaaaaaaaaaaaaa", ...over });
const reviewed = (over: Partial<RiotTextChampion> = {}): RiotTextChampion => ({
  championId: "Riven",
  version: "16.22.1",
  reviewedOn: "2026-11-19",
  review: { ...REVIEW },
  abilities: { W: { name: "Ki Burst", textHash: "aaaaaaaaaaaaaaaa" } },
  facts: [
    { slot: "W", kind: "stun", clause: "stunning nearby enemies", source: "tooltip", qualifier: "Mega Riven" },
    { slot: "W", kind: "slow", clause: "slowing nearby enemies", source: "description", conditional: true },
    { slot: "W", kind: "dash", clause: "Riven dashes", source: "tooltip", alsoDescribedAs: { kind: "leap", source: "description", clause: "Riven leaps" } },
  ],
  disagreements: [{ slot: "W", description: { kind: "knockup", clause: "knocking up enemies" }, tooltip: { kind: "knockback", clause: "Knocks Back enemies" } }],
  ...over,
});

describe("parseRiotText: a committed file, read defensively", () => {
  it("reads a well-formed file as the champion's, every field the review recorded kept", () => {
    expect(parseRiotText(reviewed(), "Riven")).toEqual(reviewed());
  });

  it("refuses another champion's file, another shape, a file without its review record, and one whose record says a person checked it (no label for that yet)", () => {
    expect(parseRiotText(reviewed(), "Garen")).toBeNull();
    expect(parseRiotText({ ...reviewed(), version: "latest" }, "Riven")).toBeNull();
    expect(parseRiotText({ ...reviewed(), reviewedOn: "19 Nov" }, "Riven")).toBeNull();
    expect(parseRiotText({ ...reviewed(), review: undefined }, "Riven")).toBeNull();
    // The record of the first version (a count named otherwise, no consistency checkers): not this one.
    expect(parseRiotText({ ...reviewed(), review: { automatedReviews: 2, adjudicated: true, person: false } }, "Riven")).toBeNull();
    expect(parseRiotText({ ...reviewed(), review: { ...REVIEW, consistencyCheckers: undefined } }, "Riven")).toBeNull();
    expect(parseRiotText({ ...reviewed(), review: { ...REVIEW, automatedReviewers: 0 } }, "Riven")).toBeNull();
    expect(parseRiotText({ ...reviewed(), review: { ...REVIEW, checkedByPerson: true } }, "Riven")).toBeNull();
    expect(parseRiotText({ ...reviewed(), disagreements: undefined }, "Riven")).toBeNull();
    expect(parseRiotText({ ...reviewed(), abilities: { W: { name: "Ki Burst", textHash: "not a hash" } } }, "Riven")).toBeNull();
    expect(parseRiotText(null, "Riven")).toBeNull();
  });

  it("leaves out a fact that is not one: an unknown kind, slot, source or field, markup, a placeholder, a clause too long, an ability not reviewed", () => {
    const facts = [
      { slot: "W", kind: "stun", clause: "stunning nearby enemies", source: "tooltip" },
      { slot: "W", kind: "teleports-home", clause: "x x x x", source: "tooltip" },
      { slot: "Z", kind: "stun", clause: "stunning", source: "tooltip" },
      { slot: "W", kind: "root", clause: "rooting", source: "the wiki" },
      { slot: "W", kind: "root", clause: "<status>Roots</status> enemies", source: "tooltip" },
      { slot: "W", kind: "root", clause: "{{ rootduration }} seconds", source: "tooltip" },
      { slot: "W", kind: "root", clause: "x".repeat(401), source: "tooltip" },
      { slot: "W", kind: "root", clause: "rooting them", source: "tooltip", onlyOnCast: true },
      { slot: "Q", kind: "dash", clause: "dashes forward", source: "tooltip" },
      { slot: "W", kind: "root", clause: "  ", source: "tooltip" },
    ];
    expect(parseRiotText({ ...reviewed(), facts, disagreements: [] }, "Riven")!.facts).toEqual([{ slot: "W", kind: "stun", clause: "stunning nearby enemies", source: "tooltip" }]);
  });

  it("leaves out a fact whose qualifier, marker or other wording is not one, never showing it without them", () => {
    const base = { slot: "W", kind: "stun", clause: "stunning nearby enemies", source: "tooltip" };
    const read = (f: Record<string, unknown>) => parseRiotText({ ...reviewed(), facts: [f], disagreements: [] }, "Riven")!.facts;
    expect(read({ ...base, qualifier: "Mega Riven" })).toHaveLength(1);
    expect(read({ ...base, qualifier: "" })).toEqual([]);
    expect(read({ ...base, qualifier: "<b>Mega</b>" })).toEqual([]);
    expect(read({ ...base, qualifier: "for {{ duration }} seconds" })).toEqual([]);
    // The qualifier's source: only beside a qualifier, and only the ability's other text.
    expect(read({ ...base, qualifier: "Mega Riven", qualifierSource: "description" })).toEqual([{ ...base, qualifier: "Mega Riven", qualifierSource: "description" }]);
    expect(read({ ...base, qualifier: "Mega Riven", qualifierSource: "tooltip" })).toEqual([]);
    expect(read({ ...base, qualifierSource: "description" })).toEqual([]);
    expect(read({ ...base, conditional: true })).toHaveLength(1);
    expect(read({ ...base, conditional: false })).toEqual([]);
    expect(read({ ...base, conditional: "yes" })).toEqual([]);
    expect(read({ ...base, alsoDescribedAs: { kind: "stun", source: "description", clause: "stuns them" } })).toEqual([]);
    expect(read({ ...base, alsoDescribedAs: { kind: "petrify", source: "description", clause: "petrifies them" } })).toEqual([]);
    expect(read({ ...base, alsoDescribedAs: { kind: "knockup", source: "description" } })).toEqual([]);
  });

  it("keeps one fact per ability and kind, and none of a kind Riot's two texts differ on there (that would pick one)", () => {
    const facts = [
      { slot: "W", kind: "stun", clause: "stunning nearby enemies", source: "tooltip" },
      { slot: "W", kind: "stun", clause: "Stuns nearby enemies", source: "description" },
      { slot: "W", kind: "knockup", clause: "knocking up enemies", source: "description" },
    ];
    expect(parseRiotText({ ...reviewed(), facts }, "Riven")!.facts.map((f) => f.clause)).toEqual(["stunning nearby enemies"]);
    // A disagreement that is not one (the same kind twice, a clause missing) is left out.
    const disagreements = [{ slot: "W", description: { kind: "stun", clause: "stuns" }, tooltip: { kind: "stun", clause: "Stuns" } }, { slot: "W", description: { kind: "pull", clause: "pulls" }, tooltip: { kind: "knockup" } }];
    expect(parseRiotText({ ...reviewed(), disagreements }, "Riven")!.disagreements).toEqual([]);
  });
});

describe("riotTextView: an ability's facts, as long as Riot's text is what was reviewed", () => {
  it("shows the facts, with their qualifier, marker and other wording, and where Riot's texts differ, while the name and the text's hash match the review", () => {
    expect(riotTextView(ability(), reviewed(), "16.23.1")).toEqual({
      facts: [
        { kind: "stun", clause: "stunning nearby enemies", source: "tooltip", qualifier: "Mega Riven" },
        { kind: "slow", clause: "slowing nearby enemies", source: "description", conditional: true },
        { kind: "dash", clause: "Riven dashes", source: "tooltip", alsoDescribedAs: { kind: "leap", source: "description", clause: "Riven leaps" } },
      ],
      disagreements: [{ description: { kind: "knockup", clause: "knocking up enemies" }, tooltip: { kind: "knockback", clause: "Knocks Back enemies" } }],
      hidden: 0,
      hiddenDisagreements: 0,
      hiddenBecause: null,
    });
  });

  it("hides them, and says how many and why, once Riot's text changed or the ability was renamed", () => {
    expect(riotTextView(ability({ textHash: "bbbbbbbbbbbbbbbb" }), reviewed(), "16.23.1")).toEqual({ facts: [], disagreements: [], hidden: 3, hiddenDisagreements: 1, hiddenBecause: "changed" });
    expect(riotTextView(ability({ name: "Ki Blast" }), reviewed(), "16.22.1")).toEqual({ facts: [], disagreements: [], hidden: 3, hiddenDisagreements: 1, hiddenBecause: "renamed" });
    // Only a disagreement on the ability: it is hidden as well, and said.
    expect(riotTextView(ability({ textHash: "bbbbbbbbbbbbbbbb" }), reviewed({ facts: [] }), "16.23.1")).toEqual({ facts: [], disagreements: [], hidden: 0, hiddenDisagreements: 1, hiddenBecause: "changed" });
  });

  it("on a record stored before the rules kept the hash, shows them only on the very version reviewed", () => {
    expect(riotTextView(ability({ textHash: undefined }), reviewed(), "16.22.1").facts).toHaveLength(3);
    expect(riotTextView(ability({ textHash: undefined }), reviewed(), "16.23.1")).toEqual({ facts: [], disagreements: [], hidden: 3, hiddenDisagreements: 1, hiddenBecause: "unknown" });
  });

  it("an ability with no reviewed facts hides nothing", () => {
    expect(riotTextView(ability({ slot: "E", name: "Valor" }), reviewed({ abilities: { ...reviewed().abilities, E: { name: "Valor", textHash: "aaaaaaaaaaaaaaaa" } } }), "16.22.1")).toEqual({ facts: [], disagreements: [], hidden: 0, hiddenDisagreements: 0, hiddenBecause: null });
  });
});

describe("the committed files (src/server/matchup-intel/riot-text/)", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  const all = files.map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as RiotTextChampion);

  it("lists every file in the index of loaders, and nothing else", () => {
    expect(Object.keys(RIOT_TEXT_FILES).sort()).toEqual(files.map((f) => f.replace(/\.json$/, "")).sort());
    expect(riotTextChampions().sort()).toEqual(Object.keys(RIOT_TEXT_FILES).sort());
  });

  it("holds the whole reviewed table of Data Dragon 16.22.1: every champion of the offline copy, 1,112 facts, 7 disagreements, and its markers", () => {
    expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual(Object.keys(fixture.champions).sort());
    const facts = all.flatMap((r) => r.facts);
    expect(facts).toHaveLength(1112);
    expect(all.reduce((n, r) => n + r.disagreements.length, 0)).toBe(7);
    expect(facts.filter((f) => f.qualifier !== undefined)).toHaveLength(68);
    expect(facts.filter((f) => f.qualifierSource !== undefined)).toHaveLength(4);
    expect(facts.filter((f) => f.conditional)).toHaveLength(44);
    expect(facts.filter((f) => f.alsoDescribedAs !== undefined)).toHaveLength(11);
  });

  it("reads every file as its champion's, every fact and disagreement kept, each ability pinned to the offline copy's text at the version reviewed", async () => {
    for (const [i, file] of files.entries()) {
      const id = file.replace(/\.json$/, "");
      const raw = all[i]!;
      const parsed = parseRiotText(raw, id);
      expect(parsed, file).not.toBeNull();
      expect(parsed!.facts, file).toHaveLength(raw.facts.length);
      expect(parsed!.disagreements, file).toHaveLength(raw.disagreements.length);
      // The review as it was recorded: two automated reviewers and an adjudicator, two automated checkers, no person.
      expect(parsed!.review, file).toEqual(REVIEW);
      expect(parsed!.version, file).toBe("16.22.1");
      for (const f of parsed!.facts) expect(RIOT_TEXT_KINDS, file).toContain(f.kind);
      const copy = fixture.champions[id];
      expect(copy, file).toBeDefined();
      expect(copy!.version, file).toBe(parsed!.version);
      for (const slot of SLOTS) {
        const a = copy!.abilities.find((x) => x.slot === slot)!;
        expect(parsed!.abilities[slot], `${file} ${slot}`).toEqual({ name: a.name, textHash: a.textHash });
      }
    }
    // The loader reads them on demand, and a champion with none gives null.
    const loaded = await loadRiotText(["Gnar", "Yone", "NotAChampion"]);
    expect(loaded.Gnar?.championId).toBe("Gnar");
    expect(loaded.Yone?.disagreements).toHaveLength(1);
    expect(loaded.NotAChampion).toBeNull();
  });

  it("never holds a number: Riot's placeholders stay unresolved as […], never effectBurn's values (Twisted Fate's W and R)", () => {
    const spans = all.flatMap((r) => [...r.facts.flatMap((f) => [f.clause, f.qualifier ?? "", f.alsoDescribedAs?.clause ?? ""]), ...r.disagreements.flatMap((d) => [d.description.clause, d.tooltip.clause])]);
    for (const s of spans) {
      expect(s, s).not.toMatch(/\d|\{\{|\}\}/);
    }
    // The 224 fact clauses the review kept Riot's placeholders in, each now "[…]".
    expect(all.flatMap((r) => r.facts).filter((f) => f.clause.includes("[…]"))).toHaveLength(224);
    const tf = all.find((r) => r.championId === "TwistedFate")!;
    expect(tf.facts.find((f) => f.slot === "W" && f.kind === "stun")!.clause).toBe("The Gold Card deals […] and Stuns for […] seconds.");
    expect(tf.facts.find((f) => f.slot === "R" && f.kind === "teleport")!.clause).toBe("Recast: Twisted Fate teleports up to […] units away.");
  });

  it("records the markers where the review put them: Gnar W's qualifier, Yone R's disagreement, Fizz E's other wording", () => {
    const champion = (id: string) => all.find((r) => r.championId === id)!;
    expect(champion("Gnar").facts.find((f) => f.slot === "W" && f.kind === "stun")).toMatchObject({ clause: "stunning enemies in an area.", qualifier: "Mega Gnar" });
    expect(champion("Yone").disagreements).toEqual([{ slot: "R", description: { kind: "pull", clause: expect.stringContaining("pulls all enemies hit towards him") }, tooltip: { kind: "knockup", clause: expect.stringContaining("Knocking Up victims towards Yone") } }]);
    // No fact of a kind Riot's texts differ on.
    for (const r of all) for (const d of r.disagreements) expect(r.facts.filter((f) => f.slot === d.slot && (f.kind === d.description.kind || f.kind === d.tooltip.kind)), `${r.championId} ${d.slot}`).toEqual([]);
    expect(champion("Fizz").facts.find((f) => f.slot === "E" && f.kind === "dash")!.alsoDescribedAs).toMatchObject({ kind: "leap", source: "description" });
  });
});

describe("the import script (scripts/matchup-intel/import-riot-text.mjs)", () => {
  const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
  // Riot's own text for the abilities of a made-up champion, with Riot's markup, line breaks and placeholders.
  const full = {
    version: "16.22.1",
    data: {
      Riven: {
        passive: { name: "Runic Blade", description: "Riven's abilities charge her blade.<br><br>Her attacks <font color='#FFF673'>expend</font> charges." },
        spells: [
          { name: "Broken Wings", description: "Riven lashes out.", tooltip: "Riven <status>Knocks Back</status> enemies on the last cast.{{ spellmodifierdescriptionappend }}", effectBurn: [null, "1/2/3"] },
          { name: "Ki Burst", description: "Riven emits a Ki Burst, damaging and stunning nearby enemies.", tooltip: "Riven deals {{ totaldamage }} and <status>Stuns</status> nearby enemies for {{ e1 }} seconds.<br />Mega Riven: she also <status>Slows</status> them.", effectBurn: [null, "0.75"] },
          { name: "Valor", description: "Riven steps forward and leaps over walls.", tooltip: "Riven dashes and gains a <shield>Shield</shield>." },
          { name: "Blade of the Exile", description: "Riven's sword reforms, knocking up enemies.", tooltip: "Riven gains bonus AD and <status>Knocks Back</status> enemies." },
        ],
      },
    },
  };
  const texts = (id: "Riven") => {
    const e = full.data[id];
    return { P: [e.passive.description, null], Q: [e.spells[0]!.description, e.spells[0]!.tooltip], W: [e.spells[1]!.description, e.spells[1]!.tooltip], E: [e.spells[2]!.description, e.spells[2]!.tooltip], R: [e.spells[3]!.description, e.spells[3]!.tooltip] } as Record<string, [string, string | null]>;
  };
  // The review's record of the text it read: each ability's name and the hashes of its cleaned texts.
  const abilityText = () =>
    Object.fromEntries(
      Object.entries(texts("Riven")).map(([slot, [d, t]], i) => [slot, { name: i === 0 ? full.data.Riven.passive.name : full.data.Riven.spells[i - 1]!.name, descriptionHash: sha(importer.preparedText(d)), tooltipHash: t === null ? null : sha(importer.preparedText(t)) }]),
    );
  const table = (facts: unknown[], over: Record<string, unknown> = {}) => ({ champion: "Riven", version: "16.22.1", reviewedAt: "2026-11-19", review: "two independent automated reviews and an adjudicator, then a consistency pass checked by two more; not checked by a person", reviewRecord: { ...REVIEW }, abilityText: abilityText(), facts, disagreements: [], ...over });
  const stun = { slot: "W", kind: "stun", clause: "Riven deals {{ totaldamage }} and Stuns nearby enemies for {{ e1 }} seconds.", source: "tooltip" };

  it("cleans Riot's text as the drafts did: markup removed, one line per line break, placeholders kept; the review's hash of Braum's passive in Data Dragon 16.22.1", () => {
    expect(importer.preparedText(full.data.Riven.spells[1]!.tooltip)).toBe("Riven deals {{ totaldamage }} and Stuns nearby enemies for {{ e1 }} seconds.\nMega Riven: she also Slows them.");
    expect(importer.preparedText(full.data.Riven.spells[0]!.tooltip)).toBe("Riven Knocks Back enemies on the last cast.");
    expect(importer.preparedText(full.data.Riven.passive.description)).toBe("Riven's abilities charge her blade.\n\nHer attacks expend charges.");
    // Riot's raw passive for Braum (Data Dragon 16.22.1), and the hash the review recorded for it.
    const braum = "Braum's basic attacks apply Concussive Blows. Once the first stack is applied, <font color='#FFF673'>ally</font> basic attacks also stack Concussive Blows. <br><br>Upon reaching 4 stacks, the target is stunned and takes magic damage. For the next few seconds they cannot receive new stacks, but take bonus magic damage from Braum's attacks.";
    expect(sha(importer.preparedText(braum))).toBe("e5e3c0b22266e0ba3c92e6dda4882bad0e4eff870e85d4b5670691be8541fed3");
  });

  it("keeps every reviewed fact with its markers, Riot's placeholders as […], never resolved, and pins each ability to riotTextHash", () => {
    const { record } = importer.importChampion(
      table(
        [
          stun,
          { slot: "W", kind: "slow", clause: "she also Slows them.", source: "tooltip", qualifier: "Mega Riven" },
          { slot: "Q", kind: "knockback", clause: "Riven Knocks Back enemies on the last cast.", source: "tooltip", conditional: true },
          { slot: "E", kind: "dash", clause: "Riven dashes and gains a Shield.", source: "tooltip", alsoDescribedAs: { kind: "leap", source: "description", clause: "Riven steps forward and leaps over walls." } },
          { slot: "E", kind: "shield", clause: "Riven dashes and gains a Shield.", source: "tooltip", qualifier: "Riven steps forward", qualifierSource: "description" },
        ],
        { disagreements: [{ slot: "R", description: { kind: "knockup", clause: "knocking up enemies." }, tooltip: { kind: "knockback", clause: "Knocks Back enemies." } }] },
      ),
      full,
    );
    expect(record.facts).toEqual([
      { slot: "Q", kind: "knockback", clause: "Riven Knocks Back enemies on the last cast.", source: "tooltip", conditional: true },
      { slot: "W", kind: "stun", clause: "Riven deals […] and Stuns nearby enemies for […] seconds.", source: "tooltip" },
      { slot: "W", kind: "slow", clause: "she also Slows them.", source: "tooltip", qualifier: "Mega Riven" },
      { slot: "E", kind: "dash", clause: "Riven dashes and gains a Shield.", source: "tooltip", alsoDescribedAs: { kind: "leap", source: "description", clause: "Riven steps forward and leaps over walls." } },
      { slot: "E", kind: "shield", clause: "Riven dashes and gains a Shield.", source: "tooltip", qualifier: "Riven steps forward", qualifierSource: "description" },
    ]);
    // Riot's {{ e1 }} is 0.75 in its effectBurn: the page never gets it.
    expect(JSON.stringify(record)).not.toMatch(/0\.75|\{\{/);
    expect(record.disagreements).toEqual([{ slot: "R", description: { kind: "knockup", clause: "knocking up enemies." }, tooltip: { kind: "knockback", clause: "Knocks Back enemies." } }]);
    expect(record.review).toEqual(REVIEW);
    expect(record.reviewedOn).toBe("2026-11-19");
    const w = full.data.Riven.spells[1]!;
    expect(record.abilities.W).toEqual({ name: "Ki Burst", textHash: riotTextHash(w.description, w.tooltip) });
    expect(record.abilities.P).toEqual({ name: "Runic Blade", textHash: riotTextHash(full.data.Riven.passive.description, null) });
    // What the page reads back is what was written.
    expect(parseRiotText(JSON.parse(importer.serialise(record)), "Riven")).toEqual(record);
  });

  it("refuses a file without its review record, or with one that is not whole: no count is ever assumed", () => {
    expect(() => importer.importChampion(table([stun], { reviewRecord: undefined }), full)).toThrow(/no review record/);
    // The first version's free-form review ("reviewers: 2") is not a record.
    expect(() => importer.importChampion(table([stun], { reviewRecord: undefined, review: { reviewers: 2, adjudicator: "auto" } }), full)).toThrow(/no review record/);
    expect(() => importer.importChampion(table([stun], { reviewRecord: { adjudicated: true, consistencyCheckers: 2, checkedByPerson: false } }), full)).toThrow(/how many automated reviewers/);
    expect(() => importer.importChampion(table([stun], { reviewRecord: { ...REVIEW, adjudicated: "yes" } }), full)).toThrow(/adjudicator/);
    expect(() => importer.importChampion(table([stun], { reviewRecord: { ...REVIEW, consistencyCheckers: undefined } }), full)).toThrow(/consistency pass/);
    expect(() => importer.importChampion(table([stun], { reviewRecord: { ...REVIEW, checkedByPerson: undefined } }), full)).toThrow(/whether a person/);
    expect(() => importer.importChampion(table([stun], { reviewRecord: { ...REVIEW, checkedByPerson: true } }), full)).toThrow(/owner's decision/);
    expect(() => importer.importChampion(table([stun], { reviewRecord: { ...REVIEW, reviewers: 3 } }), full)).toThrow(/does not read/);
    expect(importer.reviewRecordOf({ ...REVIEW })).toEqual(REVIEW);
    // A copy of the drafts (their own list, no review) is not a reviewed table.
    expect(() => importer.importChampion({ ...table([]), facts: undefined, drafts: [stun] }, full)).toThrow(/no list of reviewed facts/);
    expect(() => importer.importChampion({ ...table([]), disagreements: undefined }, full)).toThrow(/no list of disagreements/);
  });

  it("refuses a file whose hashes are not Riot's text of that version, as the drafts cleaned it", () => {
    const at = abilityText();
    expect(() => importer.importChampion(table([stun], { abilityText: { ...at, W: { ...at.W, descriptionHash: sha("Riven emits a Ki Blast.") } } }), full)).toThrow(/W: the review's description hash is not Data Dragon 16\.22\.1's description/);
    expect(() => importer.importChampion(table([stun], { abilityText: { ...at, Q: { ...at.Q, tooltipHash: sha("Riven Knocks Back enemies.") } } }), full)).toThrow(/Q: the review's tooltip hash/);
    // The hash of the raw text, markup and all, is not the review's.
    expect(() => importer.importChampion(table([stun], { abilityText: { ...at, W: { ...at.W, tooltipHash: sha(full.data.Riven.spells[1]!.tooltip) } } }), full)).toThrow(/W: the review's tooltip hash/);
    expect(() => importer.importChampion(table([stun], { abilityText: { ...at, E: { ...at.E, tooltipHash: undefined } } }), full)).toThrow(/E: no tooltip hash/);
    expect(() => importer.importChampion(table([stun], { abilityText: { ...at, P: { ...at.P, tooltipHash: sha("x") } } }), full)).toThrow(/passive, which has no tooltip/);
    const { R: _r, ...four } = at;
    expect(() => importer.importChampion(table([stun], { abilityText: four }), full)).toThrow(/R: the review does not say which text it read/);
  });

  it("refuses a clause, qualifier, other wording or disagreement that is not verbatim in the text it names, or holds a number", () => {
    const refuse = (facts: unknown[], over: Record<string, unknown> = {}) => expect(() => importer.importChampion(table(facts, over), full));
    refuse([{ ...stun, clause: "Riven stuns every enemy on the map." }]).toThrow(/its clause: not verbatim/);
    // Verbatim means Riot's characters: placeholders as Riot wrote them, not read as N.
    refuse([{ ...stun, clause: "Riven deals N and Stuns nearby enemies for N seconds." }]).toThrow(/not verbatim/);
    // On one line: a span across a line break is not one sentence of Riot's.
    refuse([{ ...stun, clause: "seconds. Mega Riven" }]).toThrow(/not verbatim/);
    refuse([{ ...stun, clause: "Riven emits a Ki Burst" }]).toThrow(/not verbatim/);
    refuse([{ ...stun, qualifier: "Ultra Riven" }]).toThrow(/its qualifier: not verbatim/);
    refuse([{ ...stun, qualifier: "Mega Riven", qualifierSource: "tooltip" }]).toThrow(/slot's other text/);
    // The other text, where the qualifier's source says so.
    expect(importer.importChampion(table([{ ...stun, qualifier: "Riven emits a Ki Burst", qualifierSource: "description" }]), full).record.facts[0]).toMatchObject({ qualifier: "Riven emits a Ki Burst", qualifierSource: "description" });
    refuse([{ slot: "E", kind: "dash", clause: "Riven dashes and gains a Shield.", source: "tooltip", alsoDescribedAs: { kind: "leap", source: "description", clause: "Riven leaps over everything." } }]).toThrow(/alsoDescribedAs clause: not verbatim/);
    refuse([], { disagreements: [{ slot: "R", description: { kind: "knockup", clause: "knocking everyone up." }, tooltip: { kind: "knockback", clause: "Knocks Back enemies." } }] }).toThrow(/description clause: not verbatim/);
    refuse([{ slot: "P", kind: "empower", clause: "charge her blade", source: "tooltip" }]).toThrow(/a tooltip the passive does not have/);
    refuse([{ slot: "Q", kind: "knockback", clause: "on the last cast.", source: "tooltip", qualifier: "the 3rd cast" }]).toThrow(/a number in it/);
    refuse([{ ...stun, clause: "<status>Stuns</status> nearby enemies" }]).toThrow(/markup/);
  });

  it("refuses what the page could not show truthfully: an unknown kind, slot, source or field, a second fact of one kind, a marker that is not one, a fact that picks a side of a disagreement", () => {
    const refuse = (facts: unknown[], over: Record<string, unknown> = {}) => expect(() => importer.importChampion(table(facts, over), full));
    refuse([{ ...stun, kind: "petrify" }]).toThrow(/unknown kind/);
    refuse([{ ...stun, slot: "D" }]).toThrow(/unknown slot/);
    refuse([{ ...stun, source: "wiki" }]).toThrow(/unknown source/);
    refuse([{ ...stun, decision: "accept" }]).toThrow(/fields the app does not show \(decision\)/);
    refuse([stun, { ...stun, clause: "Stuns nearby enemies" }]).toThrow(/a second fact/);
    refuse([{ ...stun, conditional: false }]).toThrow(/not true/);
    refuse([{ ...stun, qualifierSource: "description" }]).toThrow(/without a qualifier/);
    refuse([{ ...stun, alsoDescribedAs: { kind: "stun", source: "description", clause: "stunning nearby enemies" } }]).toThrow(/not another known kind/);
    refuse([{ slot: "R", kind: "knockback", clause: "Knocks Back enemies.", source: "tooltip" }], { disagreements: [{ slot: "R", description: { kind: "knockup", clause: "knocking up enemies." }, tooltip: { kind: "knockback", clause: "Knocks Back enemies." } }] }).toThrow(/one of the two kinds Riot's texts differ on/);
    refuse([], { disagreements: [{ slot: "R", description: { kind: "knockup", clause: "knocking up enemies." }, tooltip: { kind: "knockup", clause: "Knocks Back enemies." } }] }).toThrow(/no disagreement/);
  });

  it("refuses a file reviewed on another version, under another name, or for a champion Riot does not have", () => {
    expect(() => importer.importChampion(table([], { version: "16.23.1" }), full)).toThrow(/16\.23\.1/);
    const at = abilityText();
    expect(() => importer.importChampion(table([], { abilityText: { ...at, W: { ...at.W, name: "Ki Blast" } } }), full)).toThrow(/Ki Blast/);
    expect(() => importer.importChampion(table([], { champion: "Zaahen" }), full)).toThrow(/Zaahen/);
  });

  describe("the whole table, all or nothing", () => {
    const root = mkdtempSync(join(tmpdir(), "riot-text-table-"));
    afterAll(() => rmSync(root, { recursive: true, force: true }));
    let n = 0;
    /** A reviewed table on disk: champions/<Id>.json, _index.json and DONE, each changeable. */
    const write = (over: { file?: Record<string, unknown>; index?: Record<string, unknown>; done?: string | null } = {}) => {
      const dir = join(root, `t${(n += 1)}`);
      mkdirSync(join(dir, "champions"), { recursive: true });
      const file = { ...table([stun]), ...over.file };
      writeFileSync(join(dir, "champions", "Riven.json"), JSON.stringify(file));
      writeFileSync(join(dir, "_index.json"), JSON.stringify({ version: "16.22.1", reviewRecord: { ...REVIEW }, totals: { champions: 1, facts: 1, disagreements: 0 }, champions: [{ champion: "Riven", facts: 1, disagreements: 0 }], ...over.index }));
      if (over.done !== null) writeFileSync(join(dir, "DONE"), over.done ?? JSON.stringify({ champions: 1, facts: 1, disagreements: 0, conditional: 0 }));
      return dir;
    };

    it("imports a complete table", async () => {
      const records = await importer.importTable(write(), full);
      expect(records.map((r) => r.championId)).toEqual(["Riven"]);
      expect(importer.countsOf(records)).toEqual({ champions: 1, facts: 1, disagreements: 0, qualifier: 0, qualifierSource: 0, conditional: 0, alsoDescribedAs: 0 });
    });

    it("refuses a table not marked done, without its index or the index's review record, whose index or DONE gives other counts, or whose file's record is not the index's", async () => {
      await expect(importer.importTable(write({ done: null }), full)).rejects.toThrow(/no DONE/);
      await expect(importer.importTable(write({ index: { reviewRecord: undefined } }), full)).rejects.toThrow(/no review record/);
      await expect(importer.importTable(write({ index: { champions: [{ champion: "Riven", facts: 2, disagreements: 0 }] } }), full)).rejects.toThrow(/_index\.json says 2/);
      await expect(importer.importTable(write({ index: { champions: [{ champion: "Riven", facts: 1, disagreements: 0 }, { champion: "Garen", facts: 1, disagreements: 0 }] } }), full)).rejects.toThrow(/missing Garen/);
      await expect(importer.importTable(write({ index: { totals: { champions: 1, facts: 9, disagreements: 0 } } }), full)).rejects.toThrow(/total of facts/);
      await expect(importer.importTable(write({ done: JSON.stringify({ facts: 2 }) }), full)).rejects.toThrow(/DONE gives 2 facts/);
      await expect(importer.importTable(write({ index: { reviewRecord: { ...REVIEW, consistencyCheckers: 1 } } }), full)).rejects.toThrow(/not the one _index\.json gives it/);
      // A file that fails stops the whole table.
      await expect(importer.importTable(write({ file: { facts: [{ ...stun, clause: "Riven stuns everyone." }] } }), full)).rejects.toThrow(/not verbatim/);
    });
  });

  it("writes the index of loaders, one dynamic import per champion", () => {
    expect(importer.serialiseIndex(["Aatrox", "Riven"])).toContain('  Riven: () => import("./Riven.json"),');
    expect(importer.serialiseIndex([])).toContain("= {};");
  });

  it("knows the same kinds as the app, in the same order", () => {
    expect(importer.KINDS).toEqual([...RIOT_TEXT_KINDS]);
  });
});
