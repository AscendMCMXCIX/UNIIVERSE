import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as script from "../../../../scripts/static/build-ability-fixture.mjs";
import sample from "../../../../tests/fixtures/ddragon-16.22.1-sample.json";
import digestFile from "../../../../tests/fixtures/ddragon-16.22.1-ability-digest.json";
import fixtureFile from "@/server/riot/fixtures/champion-abilities.fixture.json";
import championsFixture from "@/server/riot/fixtures/champions.fixture.json";
import { SLOTS, type DdragonChampionAbilities } from "@/domain/champion-lookup/types";
import { ddragonCooldownDisplay } from "@/domain/champion-lookup/cooldown";
import { ABILITY_FIXTURE_VERSION, ABILITY_RULES_FORMAT, DESCRIPTION_MAX, CHAMPION_ID, TIP_MAX, cleanDescription, compactChampionAbilities, riotTips } from "./abilities";
import { abilityFixture } from "./ability-fixture";

/*
  Champion Intel's Data Dragon abilities: what the rules take from a champion's file, the committed
  offline copy, and the build script (plain Node, scripts/static/build-ability-fixture.mjs)
  giving the same results as the app's rules. The sample (tests/fixtures/ddragon-16.22.1-sample.json)
  is Data Dragon's own entries for seven champions, untouched; the digest
  (tests/fixtures/ddragon-16.22.1-ability-digest.json) is Data Dragon's own numbers for every
  champion, so CI checks all 173 without championFull.json. With CHAMPION_FULL_JSON pointing at
  Data Dragon 16.22.1's championFull.json, every champion goes through the rules as well, and both
  committed files are checked byte for byte:
    CHAMPION_FULL_JSON=path/to/championFull.json pnpm vitest run src/server/riot/static/abilities.test.ts
*/

const V = "16.22.1";
const entry = (id: keyof typeof sample.data) => sample.data[id] as unknown;
const ability = (record: DdragonChampionAbilities | null, slot: string) => record?.abilities.find((a) => a.slot === slot);
const fixture = abilityFixture();

describe("compactChampionAbilities: what is taken from a champion's Data Dragon file", () => {
  it("takes Riven's Q as Data Dragon gives it: 13 s at every rank, 5 ranks, no charges", () => {
    const riven = compactChampionAbilities(entry("Riven"), V);
    expect(ability(riven, "Q")).toEqual({
      slot: "Q",
      id: "RivenTriCleave",
      name: "Broken Wings",
      icon: "RivenTriCleave.png",
      maxRank: 5,
      cooldown: [13, 13, 13, 13, 13],
      charges: null,
      description: "Riven lashes out in a series of strikes. This ability can be reactivated three times in a short time frame with the third hit knocking back nearby enemies.",
      // A hash of Riot's raw description and tooltip, never the text: whether it is still the text reviewed.
      textHash: "dddc41c53134d5e2",
      // Rules format 4: Riot's cost and resource line as given (the page's cost rule decides what shows).
      cost: [0, 0, 0, 0, 0],
      resource: "No Cost",
      // Rules format 5: Riot's range as given (the reviewed rule, src/domain/champion-lookup/range.ts, decides what shows).
      range: [275, 275, 275, 275, 275],
    });
    expect(riven).toMatchObject({ championId: "Riven", version: V });
    expect(riven!.abilities.map((a) => a.slot)).toEqual([...SLOTS]);
    // The passive: no cooldown in Data Dragon (never "none"), one rank, its icon from img/passive.
    expect(ability(riven, "P")).toMatchObject({ slot: "P", id: null, name: "Runic Blade", icon: "RivenRunicBlades.png", maxRank: 1, cooldown: [], charges: null });
    expect(ability(riven, "P")).not.toHaveProperty("cost");
    // Data Dragon has no passive range.
    expect(ability(riven, "P")).not.toHaveProperty("range");
    // The champion's own facts (rules format 4): Riot's resource, classes and base stats, as given.
    expect(riven!.facts).toMatchObject({ partype: "None", tags: ["Fighter", "Assassin"], stats: { hp: 630, attackrange: 125, movespeed: 340 } });
  });

  it("takes a spell's cost and resource line, and the champion's facts, as Data Dragon gives them; one in another shape is left out, never the champion", () => {
    const xerath = compactChampionAbilities(entry("Xerath"), V)!;
    expect(ability(xerath, "W")).toMatchObject({ cost: (sample.data.Xerath.spells[1] as { cost: number[] }).cost, resource: "{{ cost }} {{ abilityresourcename }}" });
    expect(xerath.facts!.partype).toBe("Mana");
    expect(Object.keys(xerath.facts!.stats)).toHaveLength(20);
    const odd = structuredClone(sample.data.Riven) as Record<string, unknown> & { spells: Array<Record<string, unknown>> };
    odd.spells[0]!.cost = ["a"];
    odd.spells[1]!.resource = 7;
    odd.stats = { hp: "lots" };
    odd.tags = "Fighter";
    odd.spells[2]!.range = [325, "far", 325];
    odd.spells[3]!.range = [Number.POSITIVE_INFINITY];
    const read = compactChampionAbilities(odd, V)!;
    expect(read).not.toBeNull();
    expect(ability(read, "Q")).not.toHaveProperty("cost");
    expect(ability(read, "W")).not.toHaveProperty("resource");
    // A range in another shape is left out, never the ability or the champion (rules format 5).
    expect(ability(read, "E")).not.toHaveProperty("range");
    expect(ability(read, "R")).not.toHaveProperty("range");
    expect(ability(read, "Q")!.range).toEqual([275, 275, 275, 275, 275]);
    expect(read.facts).toBeNull();
    expect(script.compactChampionAbilities(odd, V)).toEqual(read);
  });

  it("gives every passive an empty cooldown and one rank, in the fixture and from Data Dragon's files", () => {
    for (const record of Object.values(fixture.champions)) expect(ability(record, "P"), record.championId).toMatchObject({ slot: "P", id: null, cooldown: [], maxRank: 1, charges: null });
    for (const id of Object.keys(sample.data) as Array<keyof typeof sample.data>) expect(ability(compactChampionAbilities(entry(id), V), "P"), id).toMatchObject({ cooldown: [], maxRank: 1, charges: null });
  });

  it("reads maxammo as charges only above 0: '3' is 3 charges, '1' is 1, '0' and '-1' none", () => {
    const gangplank = compactChampionAbilities(entry("Gangplank"), V);
    expect((sample.data.Gangplank.spells[2] as { maxammo: string }).maxammo).toBe("3");
    expect(ability(gangplank, "E")).toMatchObject({ id: "GangplankE", charges: 3, cooldown: [0, 0, 0, 0, 0] });
    expect(ability(compactChampionAbilities(entry("Rengar"), V), "Q")).toMatchObject({ charges: 1 });
    expect((sample.data.Xerath.spells[0] as { maxammo: string }).maxammo).toBe("0");
    expect(ability(compactChampionAbilities(entry("Xerath"), V), "Q")).toMatchObject({ charges: null });
    expect(ability(compactChampionAbilities(entry("Riven"), V), "R")).toMatchObject({ charges: null });
    // With charges, Data Dragon's array is the time between casts: neither a number nor a count is shown from it.
    expect(ddragonCooldownDisplay(ability(gangplank, "E")!)).toEqual({ kind: "unknown", reason: "charges-in-ddragon" });
    expect(ddragonCooldownDisplay(ability(compactChampionAbilities(entry("Rengar"), V), "Q")!)).toEqual({ kind: "unknown", reason: "known-wrong-in-ddragon" });
  });

  it("keeps ranks as Data Dragon has them (6-rank abilities, a 1-rank ultimate)", () => {
    const aphelios = compactChampionAbilities(entry("Aphelios"), V);
    expect(ability(aphelios, "Q")).toMatchObject({ maxRank: 6, cooldown: [9, 9, 9, 9, 9, 9] });
    expect(ability(compactChampionAbilities(entry("Jayce"), V), "R")).toMatchObject({ maxRank: 1, cooldown: [6] });
  });

  it("gives null for input that is not a champion's detail object, and never throws", () => {
    const riven = structuredClone(sample.data.Riven) as Record<string, unknown> & { spells: Array<Record<string, unknown>>; passive: Record<string, unknown> };
    const broken = (change: (c: typeof riven) => void) => {
      const c = structuredClone(riven);
      change(c);
      return c;
    };
    const hostile = new Proxy({}, { get: () => { throw new Error("no"); }, has: () => { throw new Error("no"); }, ownKeys: () => { throw new Error("no"); } });
    const cases: unknown[] = [
      null,
      undefined,
      "Riven",
      42,
      [],
      {},
      hostile,
      broken((c) => delete (c as { passive?: unknown }).passive),
      broken((c) => (c.spells = c.spells.slice(0, 3))),
      broken((c) => (c.spells[0]!.cooldown = ["13", 13, 13, 13, 13])),
      broken((c) => (c.spells[0]!.cooldown = [13, Number.NaN, 13, 13, 13])),
      broken((c) => (c.spells[0]!.cooldown = [-1, 13, 13, 13, 13])),
      broken((c) => (c.spells[0]!.maxrank = 0)),
      broken((c) => (c.spells[0]!.maxrank = 2.5)),
      broken((c) => (c.spells[1]!.image = { full: "../../evil.png" })),
      broken((c) => (c.passive.image = { full: "a/b.png" })),
      broken((c) => (c.spells[3]!.name = "   ")),
      broken((c) => (c.id = "Riv en")),
      broken((c) => (c.id = "A".repeat(41))),
    ];
    for (const input of cases) {
      expect(compactChampionAbilities(input, V)).toBeNull();
      expect(script.compactChampionAbilities(input, V)).toBeNull();
    }
    // A version that is not Data Dragon's (the offline champion fixture's placeholder, a path).
    for (const version of ["0.0.0-fixture", "", "../16.22.1", "16"]) expect(compactChampionAbilities(entry("Riven"), version)).toBeNull();
  });
});

describe("cleanDescription: Riot's short description as plain text", () => {
  it("removes every tag, keeps its text, and reads a line break as a space", () => {
    expect(cleanDescription("Periodically, Aatrox's next basic attack deals bonus <magicDamage>magic damage</magicDamage> and heals him. ")).toBe("Periodically, Aatrox's next basic attack deals bonus magic damage and heals him.");
    expect(cleanDescription("<font color='#FF9900'>Meeps:</font> Bard attracts spirits.<br><br><font color='#FF9900'>Chimes:</font> Ancient chimes appear.<br/>")).toBe("Meeps: Bard attracts spirits. Chimes: Ancient chimes appear.");
    expect(cleanDescription("<passive>Passive:</passive> Stores damage.<BR /><active>Active:</active> Convert it.<!-- note -->")).toBe("Passive: Stores damage. Active: Convert it.");
    // Riot's inline icons go; the word after them stays.
    expect(cleanDescription("Twitch's basic attacks infect the target %i:OnHit% <OnHit>On-Hit</OnHit>, dealing true damage each second.")).toBe("Twitch's basic attacks infect the target On-Hit, dealing true damage each second.");
    expect(cleanDescription(" Lots \n of\t\tspace  ")).toBe("Lots of space");
  });

  it("decodes entities once, and leaves what is not one", () => {
    expect(cleanDescription("Nunu &amp; Willump create a blizzard&nbsp;&#x2014; Riot&#39;s &quot;words&quot; &mdash; &lt;b&gt;")).toBe('Nunu & Willump create a blizzard — Riot\'s "words" — <b>');
    expect(cleanDescription("&amp;lt; stays &lt;")).toBe("&lt; stays <");
    expect(cleanDescription("&toString; &valueOf; &bogus; &#0; &#xD800;")).toBe("&toString; &valueOf; &bogus;");
  });

  it("removes placeholders and keeps the words around them when they still read; otherwise drops the description", () => {
    expect(cleanDescription("Deals {{ totaldamage }} magic damage to enemies hit.")).toBe("Deals magic damage to enemies hit.");
    expect(cleanDescription("Deals {{ damage }} (+{{ ap }}) magic damage and slows.")).toBe("Deals magic damage and slows.");
    expect(cleanDescription("Gains @Effect1Amount@ Move Speed while near allies.")).toBe("Gains Move Speed while near allies.");
    // A quantity without its number, a phrase left hanging, too little left, or an unclosed placeholder: dropped.
    expect(cleanDescription("Slows by {{ slow }}% for a short time.")).toBe("");
    expect(cleanDescription("Stuns enemies hit for {{ duration }} seconds.")).toBe("");
    expect(cleanDescription("Heals Soraka for {{ heal }}.")).toBe("");
    expect(cleanDescription("{{ spellmodifierdescriptionappend }}")).toBe("");
    expect(cleanDescription("Deals {{ damage magic damage to enemies hit.")).toBe("");
    // Data Dragon 16.22.1's descriptions carry none: the rule is for the day one does.
    for (const record of Object.values(fixture.champions)) for (const a of record.abilities) expect(a.description, `${record.championId} ${a.slot}`).not.toMatch(/[<>]|\{\{|\}\}|%i:/);
  });

  it("caps a long description at a word, ending in …", () => {
    const long = `${"Aurelion Sol drags a giant star down from the heavens. ".repeat(24)}`;
    const capped = cleanDescription(long);
    expect(capped.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(capped.endsWith("…")).toBe(true);
    const head = capped.slice(0, -1);
    expect(long.startsWith(head)).toBe(true);
    expect(long[head.length]).toMatch(/[\s.]/);
    expect(cleanDescription("x".repeat(DESCRIPTION_MAX + 100))).toBe(`${"x".repeat(DESCRIPTION_MAX - 1)}…`);
    expect(cleanDescription("Short and whole.")).toBe("Short and whole.");
    // Data Dragon's longest (Aurelion Sol's R, 617 characters with its markup): whole since rules
    // format 4 raised the cap from 400, like every other description at 16.22.1.
    const solR = ability(fixture.champions.AurelionSol!, "R")!.description;
    expect(solR.endsWith("…")).toBe(false);
    expect(solR).toMatch(/knocking up nearby enemies\.|The Skies Descend/);
    for (const record of Object.values(fixture.champions)) for (const a of record.abilities) expect(a.description.endsWith("…"), `${record.championId} ${a.slot}`).toBe(false);
  });
});

describe("the committed offline copy (champion-abilities.fixture.json)", () => {
  it("covers all 173 champions of the offline champion fixture, five slots each, at Data Dragon 16.22.1", () => {
    const ids = championsFixture.champions.map((c) => c.id).sort();
    expect(ids).toHaveLength(173);
    expect(Object.keys(fixture.champions).sort()).toEqual(ids);
    expect(fixture).toMatchObject({ format: ABILITY_RULES_FORMAT, version: ABILITY_FIXTURE_VERSION });
    expect(fixtureFile.source).toBe("fixture");
    for (const [id, record] of Object.entries(fixture.champions)) {
      expect(CHAMPION_ID.test(id), id).toBe(true);
      expect(record.championId, id).toBe(id);
      expect(record.version, id).toBe(ABILITY_FIXTURE_VERSION);
      expect(record.abilities.map((a) => a.slot), id).toEqual([...SLOTS]);
      for (const a of record.abilities) {
        expect(a.name.length, `${id} ${a.slot}`).toBeGreaterThan(0);
        expect(a.icon, `${id} ${a.slot}`).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]*\.png$/);
        expect(a.cooldown.every((n) => typeof n === "number" && n >= 0), `${id} ${a.slot}`).toBe(true);
        expect(a.charges === null || (Number.isInteger(a.charges) && a.charges > 0), `${id} ${a.slot}`).toBe(true);
        if (a.slot !== "P") expect(a.maxRank, `${id} ${a.slot}`).toBeGreaterThanOrEqual(1);
      }
    }
    // Data Dragon 16.22.1: 24 spells hold charges (maxammo above 0; 34 have a maxammo other than
    // "-1", but 10 of those are "0", which is none) and 20 have all-zero arrays.
    const spells = Object.values(fixture.champions).flatMap((r) => r.abilities.filter((a) => a.slot !== "P"));
    expect(spells).toHaveLength(692);
    expect(spells.filter((a) => a.charges !== null)).toHaveLength(24);
    expect(spells.filter((a) => a.cooldown.every((n) => n === 0))).toHaveLength(20);
  });

  it("has Riot's tips byte-equal to Data Dragon's for every champion: 147 with enemy tips, 149 with ally tips (the digest, in CI)", () => {
    const digest = digestFile as unknown as script.AbilityDigest;
    expect(Object.keys(digest.tips ?? {}).sort()).toEqual(Object.keys(fixture.champions).sort());
    let ally = 0;
    let enemy = 0;
    for (const [id, raw] of Object.entries(digest.tips!)) {
      const tips = fixture.champions[id]!.tips!;
      // Every tip is one of Riot's, character for character, in Riot's order; none is left out at 16.22.1.
      expect(tips.ally, id).toEqual(raw.ally ?? []);
      expect(tips.enemy, id).toEqual(raw.enemy ?? []);
      if (tips.ally.length) ally += 1;
      if (tips.enemy.length) enemy += 1;
    }
    expect({ ally, enemy }).toEqual({ ally: 149, enemy: 147 });
  });

  it("keeps a tip verbatim or leaves it out whole, never cut or changed", () => {
    expect(riotTips(["  Keep its spaces. ", "", 3, "x".repeat(TIP_MAX + 1), "<b>As given</b>"])).toEqual(["  Keep its spaces. ", "<b>As given</b>"]);
    expect(riotTips(undefined)).toEqual([]);
    expect(script.riotTips(["a", 2])).toEqual(riotTips(["a", 2]));
    expect(script.TIP_MAX).toBe(TIP_MAX);
  });

  it("keeps every spell's range as Data Dragon gives it, the sentinels too (rules format 5): 692 spells, 81 with a placeholder or engine number, none on a passive", () => {
    const spells = Object.values(fixture.champions).flatMap((r) => r.abilities.filter((a) => a.slot !== "P"));
    expect(spells.filter((a) => Array.isArray(a.range) && a.range.length === a.maxRank)).toHaveLength(692);
    for (const record of Object.values(fixture.champions)) expect(ability(record, "P"), record.championId).not.toHaveProperty("range");
    // The numbers that are no reach on their own: 0 to 50, and 10,000 or more (the engine's "unlimited").
    expect(spells.filter((a) => a.range!.some((v) => v <= 50 || v >= 10_000))).toHaveLength(81);
    expect(ability(fixture.champions.Janna!, "W")!.range).toEqual([4_294_967_295, 4_294_967_295, 4_294_967_295, 4_294_967_295, 4_294_967_295]);
  });

  it("has Data Dragon's own numbers for every champion: spell ids, ranks, cooldowns, charges, costs and ranges (the digest, in CI)", () => {
    const digest = digestFile as unknown as script.AbilityDigest;
    expect(digest.version).toBe(ABILITY_FIXTURE_VERSION);
    expect(Object.keys(digest.champions).sort()).toEqual(Object.keys(fixture.champions).sort());
    // Charges written out here, apart from the rules: maxammo above 0, a whole number; "0", "-1" and none are none.
    const charges = (maxammo: unknown) => (Number.isInteger(Number(maxammo)) && Number(maxammo) > 0 ? Number(maxammo) : null);
    let compared = 0;
    for (const [id, digestSpells] of Object.entries(digest.champions)) {
      const spells = fixture.champions[id]!.abilities.filter((a) => a.slot !== "P");
      expect(spells.map((a) => [a.id, a.maxRank, a.cooldown, a.charges, a.cost ?? null, a.resource ?? null, a.range ?? null]), id).toEqual(digestSpells.map(([spellId, maxrank, cooldown, maxammo, cost, resource, range]) => [spellId, maxrank, cooldown, charges(maxammo), cost, resource, range]));
      compared += spells.length;
      // The champion's facts (rules format 4), as Data Dragon gives them.
      const facts = digest.facts![id]!;
      expect(fixture.champions[id]!.facts, id).toEqual({ partype: facts.partype, tags: facts.tags, stats: facts.stats });
    }
    expect(compared).toBe(692);
  });

  it("is what the rules make of Data Dragon's own files (the sample), in the app and in the build script", () => {
    for (const id of Object.keys(sample.data) as Array<keyof typeof sample.data>) {
      const fromApp = compactChampionAbilities(entry(id), sample.version);
      expect(fromApp, id).toEqual(fixture.champions[id]);
      expect(script.compactChampionAbilities(entry(id), sample.version), id).toEqual(fromApp);
    }
  });

  it.skipIf(!process.env.CHAMPION_FULL_JSON)("is what the rules make of every champion in championFull.json (CHAMPION_FULL_JSON)", () => {
    const full = JSON.parse(readFileSync(process.env.CHAMPION_FULL_JSON!, "utf8")) as { version: string; data: Record<string, unknown> };
    expect(full.version).toBe(ABILITY_FIXTURE_VERSION);
    expect(Object.keys(full.data).sort()).toEqual(Object.keys(fixture.champions).sort());
    for (const [id, detail] of Object.entries(full.data)) {
      const fromApp = compactChampionAbilities(detail, full.version);
      expect(fromApp, id).toEqual(fixture.champions[id]);
      expect(script.compactChampionAbilities(detail, full.version), id).toEqual(fromApp);
    }
    // Byte for byte: the committed files are the script's output for this championFull.json.
    expect(script.serialiseFixture(script.buildFixture(full))).toBe(readFileSync(new URL("../fixtures/champion-abilities.fixture.json", import.meta.url), "utf8"));
    expect(script.serialiseDigest(script.buildDigest(full))).toBe(readFileSync(new URL("../../../../tests/fixtures/ddragon-16.22.1-ability-digest.json", import.meta.url), "utf8"));
  });
});

describe("the build script (plain Node) and the app give the same results", () => {
  it("shares the rules' revision and the description cap", () => {
    expect(script.ABILITY_RULES_FORMAT).toBe(ABILITY_RULES_FORMAT);
    expect(script.DESCRIPTION_MAX).toBe(DESCRIPTION_MAX);
  });

  it("cleans every description the same way, Data Dragon's and the edge cases", () => {
    const texts = [
      ...Object.values(sample.data).flatMap((c) => [c.passive.description, ...c.spells.map((s) => s.description)]),
      // Riot's tooltips are never read, but their placeholders and markup make good edge cases.
      ...Object.values(sample.data).flatMap((c) => c.spells.map((s) => (s as { tooltip: string }).tooltip)),
      "Deals {{ totaldamage }} magic damage to enemies hit.",
      "Deals {{ damage }} (+{{ ap }}) magic damage and slows.",
      "Slows by {{ slow }}% for a short time.",
      "Heals for {{ heal }}.",
      "&amp;lt; &toString; &#x1F600; &#0; &nbsp;&nbsp;x",
      "<font color='#fff'>A</font><br><br>B<!-- c -->",
      "Attacks apply %i:On_Hit2% <OnHit>On-Hit</OnHit> effects to enemies.",
      "Stuns for {{ x }}s and @Effect2Amount@ STACKS. (  ) [ - ]",
      "x".repeat(450),
      `${"word ".repeat(120)}`,
      "",
    ];
    for (const text of texts) expect(script.cleanDescription(text), text.slice(0, 60)).toBe(cleanDescription(text));
  });

  it("refuses to build a fixture from a file with a champion it cannot read", () => {
    const riven = structuredClone(sample.data.Riven) as { spells: unknown[] };
    riven.spells = [];
    expect(() => script.buildFixture({ version: V, data: { Riven: riven } })).toThrow(/1 champions could not be read: Riven/);
    expect(() => script.buildFixture({ version: "latest", data: {} })).toThrow(/no usable version/);
    const built = script.buildFixture({ version: V, data: { Xerath: sample.data.Xerath, Riven: sample.data.Riven } });
    expect(Object.keys(built.champions)).toEqual(["Riven", "Xerath"]);
    expect(JSON.parse(script.serialiseFixture(built))).toMatchObject({ format: ABILITY_RULES_FORMAT, version: V, source: "fixture", champions: built.champions });
  });

  it("writes the digest as Data Dragon gives the numbers: the committed one, for the seven champions of the untouched sample", () => {
    const fromSample = script.buildDigest(sample);
    const committed = (digestFile as unknown as script.AbilityDigest).champions;
    expect(Object.keys(fromSample.champions)).toHaveLength(7);
    for (const [id, spells] of Object.entries(fromSample.champions)) expect(committed[id], id).toEqual(spells);
    expect(fromSample.champions.Gangplank![2]!.slice(0, 4)).toEqual(["GangplankE", 5, [0, 0, 0, 0, 0], "3"]);
    // Each spell's range, the seventh place (rules format 5).
    expect(fromSample.champions.Riven![0]![6]).toEqual([275, 275, 275, 275, 275]);
    expect(JSON.parse(script.serialiseDigest(fromSample))).toMatchObject({ version: V, champions: fromSample.champions });
    expect(() => script.buildDigest({ version: V, data: { Riven: { spells: [] } } })).toThrow(/1 champions have no four spells: Riven/);
    expect(() => script.buildDigest({ version: "latest", data: {} })).toThrow(/no usable version/);
  });
});
