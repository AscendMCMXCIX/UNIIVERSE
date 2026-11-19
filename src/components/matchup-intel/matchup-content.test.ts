import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AbilityNotes, ChampionChoice, ChampionNotes, DdragonAbility, DdragonChampionAbilities, MatchupNotes, RiotTextChampion } from "@/domain/matchup-intel/types";
import { buildMatchupPageView, type MatchupViewDeps } from "@/server/matchup-intel/view";
import { AbilityDetailsBody, AbilityList } from "./ability-list";
import { MatchupContent } from "./matchup-content";
import { MatchupFrame } from "./matchup-frame";
import { MatchupStatus } from "./matchup-status";

/*
  The page body as the server renders it (react-dom/server, no browser): every state renders, says
  what it should in the page's fixed words, and links its sources safely. The browser specs
  (e2e/matchup-intel.spec.ts) check the same on the demo, with the pickers working.
*/

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

const champ = (id: string, name = id): ChampionChoice => ({ id, name, title: "", portrait: "" });
const ROSTER = ["Ambessa", "Renekton", "Riven", "Garen", "Darius"].map((id) => champ(id));
const kit = (championId: string, version = "16.22.1"): DdragonChampionAbilities => ({
  championId,
  version,
  abilities: [
    { slot: "P", id: null, name: `${championId} passive`, icon: `${championId}_P.png`, maxRank: 1, cooldown: [], charges: null, description: "The passive." },
    { slot: "Q", id: "Q", name: `${championId} Q`, icon: `${championId}Q.png`, maxRank: 5, cooldown: [13, 13, 13, 13, 13], charges: null, description: "The Q." },
    { slot: "W", id: "W", name: `${championId} W`, icon: `${championId}W.png`, maxRank: 5, cooldown: [18, 17, 16, 15, 14], charges: null, description: "The W." },
    { slot: "E", id: "E", name: `${championId} E`, icon: `${championId}E.png`, maxRank: 5, cooldown: [0, 0, 0, 0, 0], charges: null, description: "The E." },
    { slot: "R", id: "R", name: `${championId} R`, icon: `${championId}R.png`, maxRank: 3, cooldown: [120, 100, 80], charges: null, description: "The R." },
  ],
});
const verified = { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-16" };
const renekton: ChampionNotes = {
  championId: "Renekton",
  verified,
  sources: [
    { id: "wiki", title: "Renekton", url: "https://wiki.leagueoflegends.com/en-us/Renekton", kind: "wiki-champion", licence: "CC BY-SA 3.0" },
    { id: "bad", title: "Elsewhere", url: "https://example.com/x", kind: "wiki-champion", licence: "CC BY-SA 3.0" },
  ],
  abilities: { W: { ddragonCooldown: [18, 17, 16, 15, 14], ddragonIdentity: { id: "W", name: "Renekton W", maxRank: 5, charges: null }, cooldown: { kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: "on-cast" }, facts: [{ kind: "crowd-control", label: "Stun", detail: "On the third hit.", appliesTo: "target", source: "wiki" }, { kind: "interaction", label: "Fury", appliesTo: "self", source: "bad" }], details: ["Empowered, it stuns longer."] } },
  levelNotes: [{ level: 6, text: "Dominus.", source: "wiki", basedOn: ["W"] }],
};
const ambessaVsRenekton: MatchupNotes = {
  championId: "Ambessa",
  vsId: "Renekton",
  verified,
  sources: [{ id: "wiki", title: "Renekton", url: "https://wiki.leagueoflegends.com/en-us/Renekton", kind: "wiki-champion", licence: "CC BY-SA 3.0" }],
  briefing: { threat: { text: "The empowered stun.", basedOn: ["Renekton.W"] }, opportunity: { text: "Low Fury.", basedOn: ["Ambessa.Q"] }, lane: [{ text: "Level 2.", basedOn: ["Renekton.W"] }] },
  interactions: [{ text: "Unstoppable answers it.", abilities: ["Ambessa.E"], source: "wiki" }],
};
const deps: MatchupViewDeps = {
  champions: ROSTER,
  currentPatch: { patch: "16.22", ddragonVersion: "16.22.1" },
  loadAbilities: async (ids) => ({ version: "16.22.1", champions: Object.fromEntries(ids.map((id) => [id, kit(id)])) }),
  championNotes: (id) => (id === "Renekton" ? renekton : null),
  matchupNotes: (a, b) => (a === "Ambessa" && b === "Renekton" ? ambessaVsRenekton : null),
};
const curated = { Ambessa: ["Renekton"] };
const LEGAL = "UNIIVERSE isn't endorsed by Riot Games.";
/** Who checked the checked notes, as every place that names them says it. */
const CHECKED = "Checked notes (drafted and audited by AI agents, not by a person)";

async function render(input: { champion?: string; vs?: string }, over: Partial<MatchupViewDeps> = {}) {
  const view = await buildMatchupPageView(input, { ...deps, ...over });
  const content = createElement(MatchupContent, { view, champions: ROSTER, curated, legal: LEGAL });
  return renderToStaticMarkup(createElement(MatchupFrame, { you: view.you, enemy: view.enemy, champions: ROSTER, curated }, content));
}
// A source link holds its last word's end with its icon in a nowrap span (source-link.tsx), drawn
// joined to the rest of the word: that tag is read without a space, every other tag as one.
const text = (html: string) => html.replace(/<span class="whitespace-nowrap">|<wbr\/?>/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the page body", () => {
  it("a curated pair: the briefing with its chips, five ability rows with cooldowns, the notes and the sources", async () => {
    const html = await render({ champion: "Ambessa", vs: "Renekton" });
    const t = text(html);
    // The pair is in the slots above; the heading names it for screen readers.
    expect(html).toContain('Curated briefing<span class="sr-only">: Ambessa vs Renekton</span>');
    expect(t).toContain("Checked on patch 26.22");
    expect(html).toContain('href="#ability-Renekton-W"');
    expect(html).toContain('href="#ability-Ambessa-Q"');
    expect(html.match(/data-testid="ability-row"/g)).toHaveLength(10);
    expect(t).toContain("13 s at every rank");
    expect(t).toContain("18 / 17 / 16 / 15 / 14 s");
    expect(t).toContain("Cooldown not in Riot's data");
    expect(t).toContain("No cooldown number in Riot's data");
    // Where each line comes from: the checked notes, or Riot's data that nobody has reviewed (each
    // tile says its own where the lines disagree).
    expect(t).toContain("18 / 17 / 16 / 15 / 14 s · Checked on patch 26.22");
    expect(t).toContain("13 s at every rank · Riot's data, not reviewed");
    expect(t).toContain("Base cooldowns, without ability haste");
    expect(t).toContain("Riot Data Dragon 16.22.1 · Curated notes: checked on patch 26.22");
    // A fact's chip: its kind for screen readers and its word, its sentence and source one hover away.
    expect(t).toContain("Crowd control: Stun");
    expect(t).toContain(`Stun: On the third hit. ${CHECKED} · Source: Renekton`);
    // Each tile's details window: its button names the ability; the window holds the facts with their links.
    expect(t).toContain("Details: Renekton W, W");
    const w = await detailsText({ champion: "Ambessa", vs: "Renekton" }, {}, "Renekton", "W");
    expect(w).toContain(`Checked facts ${CHECKED}. Stun : On the third hit. · Source: Renekton`);
    expect(w).toContain("Notes Empowered, it stuns longer.");
    expect(w).toContain("Riot's description The W.");
    expect(t).toContain("Unstoppable answers it.");
    expect(t).toContain("Level 6");
    expect(t).toContain("Your champion: Ambessa");
    expect(t).toContain("Ability names, icons and base cooldowns: Riot Data Dragon 16.22.1 (patch 26.22).");
    expect(t).toContain("checked on 16 Nov 2026 against patch 26.22");
    expect(t).toContain("A static reference: no live tracking");
    expect(t).toContain(LEGAL);
    // Every outside link opens in a new tab, cut off from this page; a link to another host is dropped (its title kept).
    const outside = [...html.matchAll(/<a [^>]*href="https:[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(outside.length).toBeGreaterThan(0);
    for (const a of outside) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
    }
    expect(html).not.toContain("example.com");
    expect(t).toContain("Elsewhere");
    // Icons from Data Dragon only, lazily.
    expect(html).toContain('src="https://ddragon.leagueoflegends.com/cdn/16.22.1/img/spell/RenektonW.png"');
    expect(html).toContain('src="https://ddragon.leagueoflegends.com/cdn/16.22.1/img/passive/Renekton_P.png"');
    expect(html).not.toMatch(/<img (?![^>]*loading="lazy")[^>]*>/);
  });

  it("an uncurated pair: says so, then the assembled reference, labelled every time, each side grouped by kind or saying what is missing", async () => {
    const t = text(await render({ champion: "Garen", vs: "Darius" }));
    expect(t).toContain("No curated briefing for Garen vs Darius yet.");
    expect(t).toContain("Assembled reference");
    expect(t).toContain("Put together from each champion's own facts. No person has checked Garen vs Darius as a pair.");
    // Neither has checked notes or reviewed facts here: each side says so, never an empty box.
    expect(t).toContain("Danger Darius's kit, by kind No reviewed facts for Darius yet: crowd control, mobility, defence and sustain are not recorded.");
    expect(t).toContain("Opportunity Garen's tools, by kind No reviewed facts for Garen yet: crowd control, mobility, defence and sustain are not recorded.");
    expect(t).toContain("Darius's abilities");
    expect(t).not.toContain("Curated briefing");
    expect(t).toContain("No interactions recorded for this pair: they come only from curated matchup notes and each champion's checked notes.");
    expect(t).toContain("No level changes recorded for Darius or Garen.");
    // An enemy with curated notes and no briefing for this pair: its checked facts, grouped by kind, each group saying what it holds.
    const renekton = text(await render({ champion: "Garen", vs: "Renekton" }));
    // The side names its layer under its subtitle: the checked notes' line, as their tiles' heading does.
    expect(renekton).toContain("Danger Renekton's kit, by kind Curated notes: checked on patch 26.22 Crowd control");
    expect(renekton).toContain("Burst and power · None in the checked notes");
    expect(renekton).toContain("Crowd control: Stun");
    // No abilities stored: the panel says so, and the side says nothing is stored.
    const none = text(await render({ champion: "Garen", vs: "Darius" }, { loadAbilities: async (ids) => ({ version: null, champions: Object.fromEntries(ids.map((id) => [id, null])) }) }));
    expect(none).toContain("Ability details aren't stored yet");
  });

  it("nothing chosen, one side chosen, and no ability data stored yet", async () => {
    const none = text(await render({}));
    expect(none).toContain("Choose your champion and the enemy");
    expect(none).toContain("Curated briefings so far: Ambessa vs Renekton");
    // What this device remembers is read in the browser only: the server's copy claims nothing.
    expect(await render({})).toContain('data-testid="matchup-remembered" data-state="loading"');
    expect(none).not.toContain("remembered on this device:");
    const youOnly = text(await render({ champion: "Ambessa" }));
    expect(youOnly).toContain("Playing Ambessa: now choose the enemy");
    expect(youOnly).toContain("Ambessa vs Renekton");
    const enemyOnly = text(await render({ vs: "Renekton" }));
    expect(enemyOnly).toContain("Choose your champion for a curated briefing");
    expect(enemyOnly).toContain("Renekton's abilities");
    const empty = text(await render({ vs: "Darius" }, { loadAbilities: async (ids) => ({ version: null, champions: Object.fromEntries(ids.map((id) => [id, null])) }) }));
    expect(empty).toContain("Ability details aren't stored yet Darius's abilities are read from Riot's Data Dragon once per game version, and none are stored yet.");
    // A record that is stored but cannot be read is said as that, never as missing.
    const unreadable = text(await render({ vs: "Darius" }, { loadAbilities: async (ids) => ({ version: null, champions: Object.fromEntries(ids.map((id) => [id, null])), unreadable: [...ids] }) }));
    expect(unreadable).toContain("Riot's ability data for Darius could not be read");
    expect(unreadable).not.toContain("aren't stored yet");
  });

  it("ability data older than the current patch says so", async () => {
    const t = text(await render({ vs: "Darius" }, { loadAbilities: async (ids) => ({ version: "16.21.1", champions: Object.fromEntries(ids.map((id) => [id, kit(id, "16.21.1")])) }) }));
    expect(t).toContain("The ability data held here is from patch 26.21; the game is on patch 26.22.");
  });
});

/** What an ability's Details window holds (rendered only once it opens on the page), as text. */
async function detailsText(input: { champion?: string; vs?: string }, over: Partial<MatchupViewDeps>, championId: string, slot: string): Promise<string> {
  const view = await buildMatchupPageView(input, { ...deps, ...over });
  const intel = [view.enemyIntel, view.yourIntel].find((i) => i?.champion.id === championId)!;
  const a = intel.abilities!.find((x) => x.slot === slot)!;
  return text(renderToStaticMarkup(createElement(AbilityDetailsBody, { champion: intel.champion, ability: a, intel, source: null, checkedPatch: intel.curated?.verified.patch ?? null })));
}

/** One ability row's text, by champion and slot. */
function rowText(html: string, championId: string, slot: string): string {
  const start = html.indexOf(`<li id="ability-${championId}-${slot}"`);
  expect(start, `${championId} ${slot}`).toBeGreaterThan(-1);
  // To the next row, or the end of the list.
  const next = [html.indexOf('<li id="ability-', start + 1), html.indexOf("</ol>", start)].filter((i) => i > -1);
  return text(html.slice(start, next.length ? Math.min(...next) : undefined));
}

const ability = (championId: string, over: Partial<DdragonAbility> & Pick<DdragonAbility, "slot">): DdragonAbility => ({ id: `${championId}${over.slot}`, name: `${championId} ${over.slot}`, icon: `${championId}${over.slot}.png`, maxRank: over.slot === "R" ? 3 : over.slot === "P" ? 1 : 5, cooldown: [], charges: null, description: "", ...over });

describe("the cooldown decision table, as the page says it", () => {
  it("an uncurated champion: Riot's numbers 'not reviewed', and no number, said plainly, for charges, zeros, two forms, ranks that do not fit and the known-wrong", async () => {
    const odd = (championId: string): DdragonChampionAbilities => ({
      championId,
      version: "16.22.1",
      abilities: [
        ability(championId, { slot: "P", id: null }),
        ability(championId, { slot: "Q", id: "RengarQ", cooldown: [0.25, 0.25, 0.25, 0.25, 0.25], charges: 1 }),
        ability(championId, { slot: "W", cooldown: [80, 70, 60, 50, 40], charges: 2 }),
        ability(championId, { slot: "E", name: "To the Skies! / Shock Blast", maxRank: 6, cooldown: [16, 14, 12, 10, 8, 6] }),
        ability(championId, { slot: "R", cooldown: [120, 100] }),
      ],
    });
    const html = await render({ vs: "Darius" }, { loadAbilities: async (ids) => ({ version: "16.22.1", champions: Object.fromEntries(ids.map((id) => [id, odd(id)])) }) });
    expect(rowText(html, "Darius", "P")).toContain("Cooldown not in Riot's data · Not reviewed");
    expect(rowText(html, "Darius", "Q")).toContain("Riot's number for this ability is known to be wrong · Not reviewed");
    expect(rowText(html, "Darius", "W")).toContain("Riot's data lists charges but not their recharge · Not reviewed");
    expect(rowText(html, "Darius", "E")).toContain("Two abilities share this slot in Riot's data · Not reviewed");
    expect(rowText(html, "Darius", "R")).toContain("Riot's data doesn't give one number per rank · Not reviewed");
    // No number anywhere on those lines, and no count of charges.
    for (const slot of ["Q", "W", "E", "R"]) expect(rowText(html, "Darius", slot).split("Not reviewed")[0], slot).not.toMatch(/\d/);
  });

  it("curated charges, forms, a passive's own cooldown and modifiers, as checked", async () => {
    const kitWith = (championId: string): DdragonChampionAbilities => ({
      championId,
      version: "16.22.1",
      abilities: [
        ability(championId, { slot: "P", id: null }),
        ability(championId, { slot: "Q", name: "To the Skies! / Shock Blast", maxRank: 6, cooldown: [16, 14, 12, 10, 8, 6] }),
        ability(championId, { slot: "W", cooldown: [13, 12.5, 12, 11.5, 11] }),
        ability(championId, { slot: "E", cooldown: [13, 13, 13, 13, 13] }),
        ability(championId, { slot: "R", cooldown: [0.25, 0.25, 0.25], charges: 3 }),
      ],
    });
    // No ddragonIdentity: these abilities' ids and names are the fixture's own, so only their arrays are compared.
    const at = (a: Partial<AbilityNotes> & Pick<AbilityNotes, "ddragonCooldown">): AbilityNotes => ({ facts: [], ...a }) as AbilityNotes;
    const notes: ChampionNotes = {
      championId: "Renekton",
      verified,
      sources: [{ id: "wiki", title: "A page", url: "https://wiki.leagueoflegends.com/en-us/Renekton", kind: "wiki-champion", revision: 1, revisionTime: "2026-06-05T15:05:11Z", licence: "CC BY-SA 3.0" }],
      abilities: {
        P: at({ ddragonCooldown: [], cooldown: { kind: "passive", seconds: [10], scalesWith: "none", perTarget: true, static: true }, facts: [{ kind: "empowerment", label: "Bonus AD for 15 s", appliesTo: "self", source: "wiki" }] }),
        Q: at({ ddragonCooldown: [16, 14, 12, 10, 8, 6], cooldown: { kind: "forms", forms: [{ name: "Hammer", spec: { kind: "per-rank", seconds: [16, 14, 12, 10, 8, 6], starts: null } }, { name: "Cannon", spec: { kind: "per-rank", seconds: [8, 8, 8, 8, 8, 8], starts: "after-effect-ends" } }] } }),
        W: at({ ddragonCooldown: [13, 12.5, 12, 11.5, 11], cooldown: { kind: "per-rank", seconds: [13, 12.5, 12, 11.5, 11], starts: null }, modifiers: { refund: { unit: "percent", amount: [25, 35, 45, 55, 65], when: "her first attack within 4 seconds" }, resetsAttack: true } }),
        E: at({ ddragonCooldown: [13, 13, 13, 13, 13], cooldown: { kind: "per-rank", seconds: [13, 13, 13, 13, 13], starts: "after-first-cast" }, modifiers: { lockout: { seconds: 0.3125, static: true } }, facts: [{ kind: "interaction", label: "Fails on spell shields", detail: "A spell shield on the target stops it.", appliesTo: "target", tags: ["spell-shield"], source: "wiki" }] }),
        R: at({ ddragonCooldown: [0.25, 0.25, 0.25], cooldown: { kind: "charges", charges: [3, 4, 5], recharge: [35, 30, 25] } }),
      },
    };
    const html = await render({ vs: "Renekton" }, { loadAbilities: async (ids) => ({ version: "16.22.1", champions: Object.fromEntries(ids.map((id) => [id, kitWith(id)])) }), championNotes: (id) => (id === "Renekton" ? notes : null) });
    // Every line is the checked notes': said once, in the panel's heading, with the notes' check.
    expect(text(html)).toContain("Curated notes: checked on patch 26.22");
    expect(rowText(html, "Renekton", "P")).toContain("10 s · per target · unaffected by ability haste");
    // An empowerment's chip, on the champion himself: nothing to add.
    expect(rowText(html, "Renekton", "P")).toContain("Empowerment: Bonus AD for 15 s");
    expect(rowText(html, "Renekton", "P")).not.toContain("on Renekton");
    expect(rowText(html, "Renekton", "Q")).toContain("Hammer: 16 / 14 / 12 / 10 / 8 / 6 s Cannon: 8 s at every rank · starts when the effect ends");
    expect(rowText(html, "Renekton", "W")).toContain("13 / 12.5 / 12 / 11.5 / 11 s");
    expect(rowText(html, "Renekton", "W")).toContain("Refunds 25 / 35 / 45 / 55 / 65% of the cooldown: her first attack within 4 seconds · Resets the basic-attack timer");
    expect(rowText(html, "Renekton", "E")).toContain("13 s at every rank · starts after the first cast");
    expect(rowText(html, "Renekton", "E")).toContain("0.3125 s between casts, unaffected by ability haste");
    // Who has the effect, where its kind would not say it (in the chip's tip); the tags as data, not words; the page's revision in the details.
    expect(rowText(html, "Renekton", "E")).toContain("Interaction: Fails on spell shields");
    expect(rowText(html, "Renekton", "E")).toContain(`Fails on spell shields (on the target): A spell shield on the target stops it. ${CHECKED} · Source: A page, revision of 5 Jun 2026`);
    const e = await detailsText({ vs: "Renekton" }, { loadAbilities: async (ids) => ({ version: "16.22.1", champions: Object.fromEntries(ids.map((id) => [id, kitWith(id)])) }), championNotes: (id) => (id === "Renekton" ? notes : null) }, "Renekton", "E");
    expect(e).toContain("Fails on spell shields (on the target): A spell shield on the target stops it. · Source: A page");
    expect(e).toContain(", revision of 5 Jun 2026");
    expect(e).toContain("13 s at every rank · starts after the first cast");
    expect(html).toContain('data-tags="spell-shield"');
    expect(rowText(html, "Renekton", "R")).toContain("3 / 4 / 5 charges · one back every 35 / 30 / 25 s");
    // rowText reads a no-break space as a space; the page's own markup holds the count to "charges".
    expect(html).toContain("3 / 4 / 5\u00a0charges");
  });
});

describe("Riot's data moved after the check", () => {
  const moved = (championId: string): DdragonChampionAbilities => {
    const k = kit(championId, "16.23.1");
    return { ...k, abilities: k.abilities.map((a) => (a.slot === "W" ? { ...a, cooldown: [20, 19, 18, 17, 16] } : a)) };
  };
  const changed = { currentPatch: { patch: "16.23", ddragonVersion: "16.23.1" }, loadAbilities: async (ids: readonly string[]) => ({ version: "16.23.1", champions: Object.fromEntries(ids.map((id) => [id, moved(id)])) }) } satisfies Partial<MatchupViewDeps>;
  const withStart: ChampionNotes = { ...renekton, abilities: { W: { ...renekton.abilities.W!, cooldown: { kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: "after-effect-ends" } } } };

  it("the row: Riot's new numbers as Riot's, then the notes flagged, their cooldown as checked included", async () => {
    const html = await render({ champion: "Ambessa", vs: "Renekton" }, { ...changed, championNotes: (id) => (id === "Renekton" ? withStart : null) });
    const w = rowText(html, "Renekton", "W");
    expect(w).toContain("Changed since the check");
    expect(w).toContain("20 / 19 / 18 / 17 / 16 s · Riot's data for patch 26.23, not re-checked");
    // The checked start is not on Riot's line: it goes with the notes, under their flag.
    expect(w.split("Notes from patch")[0]).not.toContain("starts when the effect ends");
    expect(w).toContain("Notes from patch 26.22 · may be out of date: Riot changed its cooldown since");
    // The window holds the notes under the flag, their cooldown as checked included.
    const details = await detailsText({ champion: "Ambessa", vs: "Renekton" }, { ...changed, championNotes: (id) => (id === "Renekton" ? withStart : null) }, "Renekton", "W");
    expect(details).toContain("Notes from patch 26.22 · may be out of date: Riot changed its cooldown since As checked: 18 / 17 / 16 / 15 / 14 s · starts when the effect ends");
    expect(w).toContain("Crowd control: Stun");
    // The champion's line says how many abilities changed.
    expect(text(html)).toContain("Riot changed one ability after the check: its notes are flagged");
  });

  it("the briefing: what rests on the changed ability is hidden, and says so in its place; the rest keeps its check", async () => {
    const t = text(await render({ champion: "Ambessa", vs: "Renekton" }, changed));
    expect(t).toContain("Checked on patch 26.22");
    expect(t).not.toContain("The empowered stun.");
    expect(t).toContain("Threat Hidden: Riot changed Renekton W after this briefing was checked.");
    expect(t).toContain("Opportunity Low Fury.");
    expect(t).toContain("One point is hidden: Riot changed Renekton W after this briefing was checked.");
    // No warning is left on the header: what it shows did not change.
    expect(t).not.toContain("may be out of date Threat");
  });

  it("the briefing with nothing left to show: one line naming what changed", async () => {
    const allOnW: MatchupNotes = { ...ambessaVsRenekton, briefing: { threat: { text: "A.", basedOn: ["Renekton.W"] }, opportunity: { text: "B.", basedOn: ["Renekton.W"] }, lane: [{ text: "C.", basedOn: ["Renekton.W"] }] } };
    const t = text(await render({ champion: "Ambessa", vs: "Renekton" }, { ...changed, matchupNotes: (a, b) => (a === "Ambessa" && b === "Renekton" ? allOnW : null) }));
    expect(t).toContain("This briefing is hidden: Riot changed Renekton W after it was checked.");
    expect(t).not.toContain("Threat");
  });

  it("the interactions: a matchup's interaction on the changed ability is hidden and said, the enemy's fact flagged", async () => {
    const onW: MatchupNotes = { ...ambessaVsRenekton, interactions: [{ text: "Unstoppable answers it.", abilities: ["Renekton.W"], source: "wiki" }] };
    const html = await render({ champion: "Ambessa", vs: "Renekton" }, { ...changed, matchupNotes: (a, b) => (a === "Ambessa" && b === "Renekton" ? onW : null) });
    const t = text(html);
    expect(t).not.toContain("Unstoppable answers it.");
    expect(t).toContain("One interaction is hidden: Riot changed Renekton W after it was checked.");
    const panel = text(html.slice(html.indexOf('data-testid="matchup-interactions"')));
    expect(panel).toContain("Renekton W Interaction: Fury");
    expect(panel).toContain("Changed since the check");
  });
});

describe("the page's structure", () => {
  it("your own champion's abilities sit under a heading of their own, not under the panel before them", async () => {
    const html = await render({ champion: "Garen", vs: "Darius" });
    const heading = html.search(/<h2 class="sr-only">Your champion: Garen<\/h2>/);
    expect(heading).toBeGreaterThan(-1);
    // After every other section's heading, and before Garen's own ability headings.
    expect(heading).toBeGreaterThan(html.indexOf("Darius&#x27;s abilities"));
    expect(heading).toBeLessThan(html.indexOf('data-testid="matchup-your-abilities-list"'));
  });

  it("keys each ability row by its champion as well as its slot, so another pair's rows start closed", async () => {
    const view = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps);
    const list = AbilityList({ intel: view.enemyIntel!, testId: "rows" }) as ReactElement<{ children: ReactElement[] }>;
    expect(list.props.children.map((row) => row.key)).toEqual(["Renekton-P", "Renekton-Q", "Renekton-W", "Renekton-E", "Renekton-R"]);
  });

  it("centres the curated links in the centred 'choose the enemy' state, and nowhere else", async () => {
    const links = (html: string) => /<p class="([^"]*)" data-testid="matchup-curated-links"/.exec(html)?.[1]?.split(" ");
    expect(links(await render({ champion: "Ambessa" }))).toContain("justify-center");
    // No briefing for the pair: the links follow the calm line, left-aligned like it.
    expect(links(await render({ champion: "Ambessa", vs: "Darius" }))).not.toContain("justify-center");
  });
});

/** Each champion stored at its own version. */
const storedAt = (versions: Record<string, string>, over: (k: DdragonChampionAbilities) => DdragonChampionAbilities = (k) => k): MatchupViewDeps["loadAbilities"] => async (ids) => ({ version: null, champions: Object.fromEntries(ids.map((id) => [id, versions[id] ? over(kit(id, versions[id])) : null])) });

describe("each champion's data, and checks a patch or more behind", () => {
  it("names whose ability data is older when only one is, and gives each version in the footer and in your champion's section", async () => {
    const html = await render({ champion: "Garen", vs: "Darius" }, { currentPatch: { patch: "16.23", ddragonVersion: "16.23.1" }, loadAbilities: storedAt({ Garen: "16.22.1", Darius: "16.23.1" }) });
    const t = text(html);
    expect(t).toContain("Garen's ability data is from patch 26.22; the game is on patch 26.23.");
    expect(t).not.toContain("The ability data held here");
    expect(t).toContain("Ability names, icons and base cooldowns: Riot Data Dragon 16.23.1 (patch 26.23) for Darius; Riot Data Dragon 16.22.1 (patch 26.22) for Garen.");
    expect(t).toContain("Your champion: Garen Abilities and base cooldowns · Riot Data Dragon 16.22.1");
    expect(text(html.slice(html.indexOf('data-testid="abilities-source"')))).toMatch(/^[^<]*Riot Data Dragon 16\.23\.1/);
  });

  it("the other way round: the enemy's data older and yours current names the enemy alone; both older on one patch is said once", async () => {
    const reverse = text(await render({ champion: "Garen", vs: "Darius" }, { currentPatch: { patch: "16.23", ddragonVersion: "16.23.1" }, loadAbilities: storedAt({ Garen: "16.23.1", Darius: "16.22.1" }) }));
    expect(reverse).toContain("Darius's ability data is from patch 26.22; the game is on patch 26.23.");
    const both = text(await render({ champion: "Garen", vs: "Darius" }, { currentPatch: { patch: "16.23", ddragonVersion: "16.23.1" }, loadAbilities: storedAt({ Garen: "16.22.1", Darius: "16.22.1" }) }));
    expect(both).toContain("The ability data held here is from patch 26.22; the game is on patch 26.23.");
    expect(both).toContain("Ability names, icons and base cooldowns: Riot Data Dragon 16.22.1 (patch 26.22).");
    // A mirror is one champion.
    const mirror = text(await render({ champion: "Darius", vs: "Darius" }, { currentPatch: { patch: "16.23", ddragonVersion: "16.23.1" }, loadAbilities: storedAt({ Darius: "16.22.1" }) }));
    expect(mirror).toContain("The ability data held here is from patch 26.22");
  });

  it("one patch since the check: 'not re-checked' for it on the briefing, the notes' line and each checked cooldown", async () => {
    const html = await render({ champion: "Ambessa", vs: "Renekton" }, { currentPatch: { patch: "16.23", ddragonVersion: "16.23.1" }, loadAbilities: storedAt({ Ambessa: "16.23.1", Renekton: "16.23.1" }) });
    const t = text(html);
    expect(text(html.slice(html.indexOf('data-testid="matchup-briefing-checked"')))).toMatch(/^[^<]*Checked on patch 26\.22 Not re-checked for 26\.23/);
    expect(t).toContain("Curated notes: checked on patch 26.22 Not re-checked for 26.23");
    expect(rowText(html, "Renekton", "W")).toContain("18 / 17 / 16 / 15 / 14 s · Checked on patch 26.22 · not re-checked for 26.23");
    // Riot's own lines say nothing of a check.
    expect(rowText(html, "Renekton", "Q")).toContain("13 s at every rank · Riot's data, not reviewed");
    expect(t).toContain("The empowered stun.");
  });

  it("three patches since the check: the briefing and its interactions hidden whole, saying why; the notes flagged; nothing of the briefing dated or credited", async () => {
    const html = await render({ champion: "Ambessa", vs: "Renekton" }, { currentPatch: { patch: "16.25", ddragonVersion: "16.25.1" }, loadAbilities: storedAt({ Ambessa: "16.25.1", Renekton: "16.25.1" }) });
    const t = text(html);
    expect(t).toContain("This briefing is hidden: it was checked on patch 26.22, three patches ago, and not since. It shows again once a person checks it.");
    expect(t).not.toContain("The empowered stun.");
    expect(t).not.toContain("Threat");
    expect(t).toContain("One interaction is hidden: it was checked on patch 26.22, three patches ago, with the briefing.");
    expect(t).not.toContain("Unstoppable answers it.");
    expect(t).toContain("Curated notes: checked on patch 26.22 Checked three patches ago: may be out of date");
    // The notes' one source said once on the panel's line, then the warning.
    expect(text(html.slice(html.indexOf('data-testid="matchup-level-notes"')))).toMatch(/^[^<]*Level changes When something becomes possible · source Source: Renekton\. Checked notes \(drafted and audited by AI agents, not by a person\)\. Checked three patches ago: may be out of date Level 6 Renekton: Dominus\. Renekton's abilities/);
    expect(t).toContain("The curated notes on this page were checked on 16 Nov 2026 against patch 26.22.");
    expect(t).not.toContain("the Ambessa vs Renekton briefing");
  });

  it("the offline copy: said in the panel and the footer, with the game's current patch not known", async () => {
    const t = text(await render({ vs: "Darius" }, { currentPatch: null, loadAbilities: async (ids) => ({ version: "16.22.1", champions: Object.fromEntries(ids.map((id) => [id, kit(id)])), offline: [...ids] }) }));
    expect(t).toContain("Offline copy of Riot Data Dragon 16.22.1 · Cooldowns: Riot's data, not reviewed");
    expect(t).toContain("Ability names, icons and base cooldowns: an offline copy of Riot Data Dragon 16.22.1 (patch 26.22); the game's current patch is not known.");
  });

  it("chips for a champion with no ability rows on the page are labels, never links to nothing", async () => {
    const html = await render({ champion: "Ambessa", vs: "Renekton" }, { loadAbilities: storedAt({ Ambessa: "16.22.1" }) });
    expect(html).not.toContain('href="#ability-Renekton-W"');
    expect(html).toMatch(/<span class="[^"]*" data-testid="briefing-ability-label">Renekton W<\/span>/);
    expect(html).toContain('href="#ability-Ambessa-Q"');
  });

  it("a source every note of a panel shares is said once, on its line; notes from different pages each say their own", async () => {
    const panel = (html: string, id: string) => html.slice(html.indexOf(`data-testid="${id}"`)).split("</section>")[0]!;
    // One page behind the matchup's interactions and the level notes: the word once, in each panel's heading.
    const one = await render({ champion: "Ambessa", vs: "Renekton" });
    const interactions = panel(one, "matchup-interactions");
    expect(interactions.match(/data-testid="interaction-source"/g)).toHaveLength(1);
    expect(text(interactions)).toMatch(/^[^<]*Interactions How abilities meet in this lane · source Source: Renekton\. Curated matchup notes\. Unstoppable answers it\./);
    const levels = panel(one, "matchup-level-notes");
    expect(levels.match(/data-testid="level-note-source"/g)).toHaveLength(1);
    expect(text(levels)).toMatch(/^[^<]*Level changes When something becomes possible · source Source: Renekton\. Checked notes \(drafted and audited by AI agents, not by a person\)\. Level 6 Renekton: Dominus\./);
    // Two pages: each interaction and each note says its own, and the headings name none.
    const two: MatchupNotes = {
      ...ambessaVsRenekton,
      sources: [...ambessaVsRenekton.sources, { id: "other", title: "Ambessa", url: "https://wiki.leagueoflegends.com/en-us/Ambessa", kind: "wiki-champion", licence: "CC BY-SA 3.0" }],
      interactions: [...ambessaVsRenekton.interactions, { text: "It goes the other way.", abilities: ["Renekton.W"], source: "other" }],
    };
    const ambessa: ChampionNotes = { ...renekton, championId: "Ambessa", sources: [{ id: "wiki", title: "Ambessa", url: "https://wiki.leagueoflegends.com/en-us/Ambessa", kind: "wiki-champion", licence: "CC BY-SA 3.0" }], abilities: {}, levelNotes: [{ level: 9, text: "Drakehound.", source: "wiki", basedOn: [] }] };
    const html = await render({ champion: "Ambessa", vs: "Renekton" }, { matchupNotes: (a, b) => (a === "Ambessa" && b === "Renekton" ? two : null), championNotes: (id) => (id === "Renekton" ? renekton : id === "Ambessa" ? ambessa : null) });
    const each = text(panel(html, "matchup-interactions"));
    expect(each).toMatch(/^[^<]*Interactions How abilities meet in this lane Unstoppable answers it\. .*source Source: Renekton\. Curated matchup notes\. It goes the other way\. .*source Source: Ambessa\. Curated matchup notes\./);
    const notes = text(panel(html, "matchup-level-notes"));
    expect(notes).toMatch(/^[^<]*Level changes When something becomes possible Level 6 Renekton: Dominus\. source Source: Renekton\. Checked notes \(drafted and audited by AI agents, not by a person\)\. Level 9 Ambessa: Drakehound\. source Source: Ambessa\. Checked notes \(drafted and audited by AI agents, not by a person\)\./);
  });

  it("the two notes panels share their row by their words: the fuller one the wider", async () => {
    const balance = (html: string) => /data-testid="matchup-notes" data-balance="([a-z]+)"/.exec(html)?.[1];
    // The fixtures' one short interaction and one short note: even, the interactions somewhat wider.
    expect(balance(await render({ champion: "Ambessa", vs: "Renekton" }))).toBe("even");
    // Two long interactions beside one short note: the interactions take the wider share.
    const long = "When the empowered stun lands during the dash, the dash she queued is cancelled and the stun runs its full length.";
    const wordy: MatchupNotes = { ...ambessaVsRenekton, interactions: [{ text: long, abilities: ["Renekton.W", "Ambessa.E"], source: "wiki" }, { text: long, abilities: ["Renekton.W"], source: "wiki" }] };
    const interactionsFirst = await render({ champion: "Ambessa", vs: "Renekton" }, { matchupNotes: (a, b) => (a === "Ambessa" && b === "Renekton" ? wordy : null) });
    expect(balance(interactionsFirst)).toBe("interactions");
    expect(interactionsFirst).toContain("@min-[40rem]/dash:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]");
    // Long level notes and no matchup of its own (the assembled reference): the notes take it, two
    // thirds where the interactions are only a champion's folded line.
    const noted: ChampionNotes = { ...renekton, levelNotes: [{ level: 6, text: long, source: "wiki", basedOn: ["W"] }, { level: 11, text: long, source: "wiki", basedOn: ["W"] }] };
    const levelsFirst = await render({ champion: "Renekton", vs: "Ambessa" }, { championNotes: (id) => (id === "Renekton" ? noted : null) });
    expect(balance(levelsFirst)).toBe("folds");
    expect(levelsFirst).toContain("@min-[40rem]/dash:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]");
    // With a note that the matchup's interactions are hidden (its check too old), the interactions keep more room.
    const old = await render({ champion: "Ambessa", vs: "Renekton" }, { currentPatch: { patch: "16.25", ddragonVersion: "16.25.1" }, loadAbilities: storedAt({ Ambessa: "16.25.1", Renekton: "16.25.1" }), championNotes: (id) => (id === "Renekton" ? noted : null) });
    expect(balance(old)).toBe("levels");
    expect(old).toContain("@min-[40rem]/dash:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]");
  });

  it("the assembled reference gives an ability's cooldown once on its side, on its first line", async () => {
    // Renekton's W in two groups (crowd control, mobility): its chips in both, its cooldown in the first only.
    const twoKinds: ChampionNotes = {
      ...renekton,
      abilities: { W: { ...renekton.abilities.W!, facts: [{ kind: "crowd-control", label: "Stun", detail: "On the third hit.", appliesTo: "target", source: "wiki" }, { kind: "mobility", label: "Dash", appliesTo: "self", source: "wiki" }] } },
    };
    const html = await render({ champion: "Garen", vs: "Renekton" }, { championNotes: (id) => (id === "Renekton" ? twoKinds : null) });
    const danger = html.slice(html.indexOf('data-testid="assembled-danger"')).split("</section>")[0]!;
    const lines = [...danger.matchAll(/<li class="[^"]*" data-testid="assembled-item" data-slot="W">([\s\S]*?)<\/li>/g)].map((m) => text(m[1]!));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Stun");
    expect(lines[0]).toContain("18/17/16/15/14 s");
    expect(lines[1]).toContain("Dash");
    expect(lines[1]).not.toMatch(/\d+ s/);
  });

  it("a level note from an ability Riot changed after the check is flagged", async () => {
    const moved = (k: DdragonChampionAbilities) => ({ ...k, abilities: k.abilities.map((a) => (a.slot === "W" ? { ...a, cooldown: [20, 19, 18, 17, 16] } : a)) });
    const html = await render({ champion: "Ambessa", vs: "Renekton" }, { loadAbilities: storedAt({ Ambessa: "16.23.1", Renekton: "16.23.1" }, moved) });
    const levels = html.slice(html.indexOf('data-testid="matchup-level-notes"'));
    expect(levels).toContain('data-testid="matchup-level-note" data-changed=""');
    expect(text(levels)).toContain("Level 6 Renekton: Dominus.");
    expect(text(levels)).toContain("Changed since the check");
  });
});

/*
  Facts from Riot's text (L3), as the review recorded them: each fact's qualifier and conditional
  marker on its chip, in the tile and in the assembled reference, its quote one hover or tap away;
  another kind Riot's other text words it as, in the details only; where Riot's two texts differ, one
  neutral chip with both quotes and no fact of either kind; an ability with no fact saying so; an
  ability whose text changed hiding all of it, and saying so.
*/
describe("facts from Riot's text, as the review recorded them", () => {
  const pin = (slot: string) => ({ name: `Darius ${slot === "P" ? "passive" : slot}`, textHash: "aaaaaaaaaaaaaaaa" });
  const darius: RiotTextChampion = {
    championId: "Darius",
    version: "16.22.1",
    reviewedOn: "2026-11-19",
    review: { automatedReviewers: 2, adjudicated: true, consistencyCheckers: 2, checkedByPerson: false },
    abilities: { P: pin("P"), Q: pin("Q"), W: pin("W"), E: pin("E"), R: pin("R") },
    facts: [
      { slot: "Q", kind: "stun", clause: "stunning enemies in an area.", source: "description", qualifier: "Mega Darius" },
      { slot: "Q", kind: "cooldownrefund", clause: "reducing the cooldowns", source: "tooltip", qualifier: "his other basic abilities", conditional: true },
      { slot: "W", kind: "slow", clause: "and Slows them", source: "tooltip", conditional: true },
      { slot: "W", kind: "dash", clause: "Darius dashes forward", source: "tooltip", alsoDescribedAs: { kind: "leap", source: "description", clause: "Darius leaps forward" } },
      { slot: "W", kind: "shield", clause: "Darius gains a Shield", source: "tooltip", qualifier: "If the axe connects", qualifierSource: "description" },
      { slot: "E", kind: "slow", clause: "slowing them", source: "description" },
      { slot: "R", kind: "heal", clause: "Darius heals", source: "tooltip" },
    ],
    disagreements: [
      { slot: "E", description: { kind: "pull", clause: "pulls enemies in" }, tooltip: { kind: "knockup", clause: "Knocking Up enemies" } },
      { slot: "R", description: { kind: "stun", clause: "stuns them" }, tooltip: { kind: "fear", clause: "Fears them" } },
    ],
  };
  // Darius's R was changed by Riot after the review: its stored hash is no longer the one pinned.
  const stored: MatchupViewDeps["loadAbilities"] = async (ids) => ({ version: "16.22.1", champions: Object.fromEntries(ids.map((id) => [id, { ...kit(id), abilities: kit(id).abilities.map((a) => ({ ...a, textHash: a.slot === "R" && id === "Darius" ? "bbbbbbbbbbbbbbbb" : "aaaaaaaaaaaaaaaa" })) }])) });
  const over: Partial<MatchupViewDeps> = { loadAbilities: stored, riotText: async (ids) => Object.fromEntries(ids.map((id) => [id, id === "Darius" ? darius : null])) };
  const chips = (row: string) => row.split('data-testid="fact-chip"').length - 1;

  it("the tiles: the qualifier and the marker on the chip, the quote and the qualifier's line in its tip, the label on every one", async () => {
    const html = await render({ champion: "Garen", vs: "Darius" }, over);
    const q = rowText(html, "Darius", "Q");
    expect(q).toContain("Crowd control: Stun · “Mega Darius”");
    expect(q).toContain("“stunning enemies in an area.” (Riot's description of Darius Q) Qualified by “Mega Darius” From Riot's ability text, reviewed automatically (not by a person).");
    // A cooldown refund names the abilities whose cooldown it cuts; the conditional one is named under
    // the chips, once, in the owner's fixed words, and its tip says the same with its quote.
    expect(q).toContain("Cooldown: Cooldown refund of “his other basic abilities”");
    expect(q).toContain("“reducing the cooldowns” (Riot's tooltip for Darius Q) Cuts the cooldown of “his other basic abilities” Conditional: see Riot's text.");
    expect(q).toContain("Conditional: see Riot's text (Cooldown refund)");
    const w = rowText(html, "Darius", "W");
    expect(w).toContain("Crowd control: Slow “and Slows them”");
    expect(w).toContain("Conditional: see Riot's text (Slow)");
    // A qualifier from the ability's other text says which.
    expect(w).toContain("Qualified by “If the axe connects” (Riot's description of Darius W)");
    // The other wording is no chip of its own, and is not counted.
    expect(chips(html.slice(html.indexOf('<li id="ability-Darius-W"')).split('<li id="ability-Darius-E"')[0]!)).toBe(3);
    expect(w).not.toMatch(/\bLeap\b|calls it/);
  });

  it("where Riot's two texts differ: one neutral chip, both quotes alike in its tip, and no chip of either kind", async () => {
    const html = await render({ champion: "Garen", vs: "Darius" }, over);
    const e = rowText(html, "Darius", "E");
    expect(e).toContain("Riot's texts differ");
    expect(e).toContain("Pull, in Riot's description of Darius E: “pulls enemies in” Knock-up, in Riot's tooltip for Darius E: “Knocking Up enemies” Neither is shown as a fact. From Riot's ability text, reviewed automatically (not by a person).");
    const row = html.slice(html.indexOf('<li id="ability-Darius-E"')).split('<li id="ability-Darius-R"')[0]!;
    expect(chips(row)).toBe(1);
    expect(row.split('data-testid="fact-chip-differ"').length - 1).toBe(1);
    expect(row).toContain('data-differ="pull knockup"');
    expect(e).not.toMatch(/Crowd control: (Pull|Knock-up)/);
  });

  it("an ability with no fact says so, never none; one whose text Riot changed hides its facts and disagreements, and says so", async () => {
    const html = await render({ champion: "Garen", vs: "Darius" }, over);
    expect(rowText(html, "Darius", "P")).toContain("No reviewed facts for this ability");
    const r = rowText(html, "Darius", "R");
    expect(r).toContain("Riot's text for R changed after the review: its fact and the note that Riot's texts differ are hidden.");
    expect(r).not.toContain("Heal");
    const row = html.slice(html.indexOf('<li id="ability-Darius-R"')).split("</ol>")[0]!;
    expect(chips(row)).toBe(0);
    expect(row).not.toContain('data-testid="fact-chip-differ"');
    expect(text(html)).not.toContain("None recorded in Riot's text");
    // The panel says where the facts come from, how, and when.
    expect(text(html)).toContain("From Riot's ability text, reviewed automatically (not by a person) · Reviewed against Riot's text of patch 26.22, on 19 Nov 2026");
  });

  it("the assembled reference: the same chips in their groups, the disagreement in its kinds' group, groups with nothing saying so", async () => {
    const html = await render({ champion: "Garen", vs: "Darius" }, over);
    const danger = html.slice(html.indexOf('data-testid="assembled-danger"')).split("</section>")[0]!;
    const t = text(danger);
    expect(t).toContain("Crowd control Q");
    expect(t).toContain("Stun · “Mega Darius”");
    expect(t).toContain("Conditional: see Riot's text (Slow)");
    expect(danger.split('data-testid="assembled-conditional"').length - 1).toBe(1);
    expect(t).toContain("Burst and power · No reviewed facts of this kind");
    expect(t).toContain("Sustain · No reviewed facts of this kind");
    const cc = danger.slice(danger.indexOf('data-group="crowd-control"')).split('data-group="power"')[0]!;
    expect(cc.split('data-testid="assembled-chip-differ"').length - 1).toBe(1);
    expect(text(cc)).toContain("Pull, in Riot's description of Darius E: “pulls enemies in”");
    // The hidden ability is said, not shown.
    expect(t).toContain("Riot's text for R changed after the review: its fact and the note that Riot's texts differ are hidden.");
    expect(t).not.toContain("Darius heals");
    // How a cooldown behaves stays on the tiles.
    expect(t).not.toContain("Cooldown refund");
  });

  it("the details window: each fact's kind, marker, quote, qualifier and other wording; the disagreement with both quotes; the review in the sources", async () => {
    const w = await detailsText({ champion: "Garen", vs: "Darius" }, over, "Darius", "W");
    expect(w).toContain("Facts from Riot's ability text From Riot's ability text, reviewed automatically (not by a person). Reviewed against Riot's text of patch 26.22, on 19 Nov 2026.");
    expect(w).toContain("Slow · Conditional: see Riot's text “and Slows them” (Riot's tooltip for Darius W)");
    expect(w).toContain("Dash “Darius dashes forward” (Riot's tooltip for Darius W) Riot's description calls it leap: “Darius leaps forward”");
    expect(w).toContain("Shield “Darius gains a Shield” (Riot's tooltip for Darius W) Qualified by “If the axe connects” (Riot's description of Darius W)");
    const q = await detailsText({ champion: "Garen", vs: "Darius" }, over, "Darius", "Q");
    expect(q).toContain("Cooldown refund · Conditional: see Riot's text “reducing the cooldowns” (Riot's tooltip for Darius Q) Cuts the cooldown of “his other basic abilities”");
    const e = await detailsText({ champion: "Garen", vs: "Darius" }, over, "Darius", "E");
    expect(e).toContain("Riot's texts differ Pull, in Riot's description of Darius E: “pulls enemies in” Knock-up, in Riot's tooltip for Darius E: “Knocking Up enemies” Neither is shown as a fact.");
    const r = await detailsText({ champion: "Garen", vs: "Darius" }, over, "Darius", "R");
    expect(r).toContain("Riot's text for R changed after the review: its fact and the note that Riot's texts differ are hidden.");
    const html = await render({ champion: "Garen", vs: "Darius" }, over);
    expect(text(html)).toContain("Reviewed by two independent automated reviewers and an adjudicator, then a consistency pass checked by two more independent automated checkers; no person has checked them. No number in that text is used for these facts.");
  });
});

/*
  The review fixes of 19 Nov 2026: a curated briefing that is hidden is said as hidden above the
  assembled reference, never as missing, and the pair on the page is no link of its own; each
  assembled side names its layer and its notes' freshness, flags a line whose ability Riot changed,
  and says once where its cooldown numbers come from, as your champion's summary does; the bar
  warns of parts hidden for a change; an unreadable record is said as that; the notes panels carry
  their freshness on their line; level notes beyond two fold; cooldown numbers break only after a
  slash.
*/
describe("hidden, changed and behind, on the assembled reference and the notes", () => {
  /** One part of the page: from the element with this test id to the end of its section, or of `until`. */
  const part = (html: string, testId: string, until = "</section>") => html.slice(html.indexOf(`data-testid="${testId}"`)).split(until)[0]!;
  const allOnW: MatchupNotes = { ...ambessaVsRenekton, briefing: { threat: { text: "A.", basedOn: ["Renekton.W"] }, opportunity: { text: "B.", basedOn: ["Renekton.W"] }, lane: [{ text: "C.", basedOn: ["Renekton.W"] }] } };
  const movedW = (k: DdragonChampionAbilities) => ({ ...k, abilities: k.abilities.map((a) => (a.slot === "W" ? { ...a, cooldown: [20, 19, 18, 17, 16] } : a)) });
  const at = (version: string, over?: (k: DdragonChampionAbilities) => DdragonChampionAbilities): Partial<MatchupViewDeps> => ({ currentPatch: { patch: version.split(".").slice(0, 2).join("."), ddragonVersion: version }, loadAbilities: storedAt(Object.fromEntries(ROSTER.map((c) => [c.id, version])), over) });

  it("a briefing hidden as too old: the assembled reference says it is hidden above, never that there is none, and links no pair already on the page", async () => {
    const html = await render({ champion: "Ambessa", vs: "Renekton" }, at("16.25.1"));
    const header = text(part(html, "matchup-no-briefing", "</header>"));
    expect(text(html)).toContain("This briefing is hidden: it was checked on patch 26.22, three patches ago, and not since.");
    expect(header).toContain("The curated briefing for Ambessa vs Renekton is hidden, above. Put together from each champion's own facts in its place. No person has checked them as a pair.");
    expect(text(html)).not.toContain("No curated briefing for Ambessa vs Renekton yet");
    expect(html).toContain('data-testid="matchup-assembled" data-briefing-hidden=""');
    // Ambessa's only curated pair is the one on the page: no link to it.
    expect(html).not.toContain('data-testid="matchup-curated-links"');
    // The checked side says how old its notes are; so do both notes panels' lines.
    expect(text(part(html, "assembled-danger"))).toContain("Danger Renekton's kit, by kind Curated notes: checked on patch 26.22 Checked three patches ago: may be out of date");
    expect(text(part(html, "matchup-interactions", "</header>"))).toContain("Checked three patches ago: may be out of date");
    expect(text(part(html, "matchup-level-notes", "</header>"))).toContain("Checked three patches ago: may be out of date");
  });

  it("a briefing with every part hidden for a change: said hidden above the assembled reference too; the bar warns, and the pair on the page is left out of the links", async () => {
    const two: MatchupViewDeps["matchupNotes"] = (a, b) => (a === "Ambessa" && (b === "Renekton" || b === "Riven") ? { ...allOnW, vsId: b } : null);
    const deps2 = { ...at("16.23.1", movedW), matchupNotes: two };
    const view = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, { ...deps, ...deps2 });
    const html = renderToStaticMarkup(createElement(MatchupContent, { view, champions: ROSTER, curated: { Ambessa: ["Renekton", "Riven"] }, legal: LEGAL }));
    expect(text(html)).toContain("This briefing is hidden: Riot changed Renekton W after it was checked.");
    expect(text(part(html, "matchup-no-briefing", "</header>"))).toContain("The curated briefing for Ambessa vs Renekton is hidden, above.");
    expect(text(html)).not.toContain("No curated briefing for");
    // The other curated pair is linked; the one on the page is not.
    const links = part(html, "matchup-curated-links", "</p>");
    expect(links).toContain("?champion=Ambessa&amp;vs=Riven");
    expect(links).not.toContain("vs=Renekton");
    const bar = text(renderToStaticMarkup(createElement(MatchupStatus, { view })));
    expect(bar).toContain("Assembled reference");
    expect(bar).toContain("Changed since the check: the briefing is hidden");
  });

  it("the bar warns of the parts hidden because Riot changed what they rest on, by count; nothing when none is", async () => {
    const changed = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, { ...deps, ...at("16.23.1", movedW) });
    const bar = text(renderToStaticMarkup(createElement(MatchupStatus, { view: changed })));
    expect(bar).toContain("Curated briefing");
    // The threat and the lane point rest on Renekton W; the opportunity and the interaction do not.
    expect(bar).toContain("Changed since the check: two parts hidden");
    const now = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, deps);
    expect(text(renderToStaticMarkup(createElement(MatchupStatus, { view: now })))).not.toContain("Changed since the check");
    // Too old is not a change: the briefing says why itself.
    const old = await buildMatchupPageView({ champion: "Ambessa", vs: "Renekton" }, { ...deps, ...at("16.25.1") });
    expect(text(renderToStaticMarkup(createElement(MatchupStatus, { view: old })))).not.toContain("Changed since the check");
  });

  it("an assembled side whose ability Riot changed after the check: its line flagged, its number said as Riot's, the side's notes line saying so", async () => {
    const html = await render({ champion: "Garen", vs: "Renekton" }, at("16.23.1", movedW));
    const danger = part(html, "assembled-danger");
    const w = text(danger.slice(danger.indexOf('data-slot="W"')).split("</li>")[0]!);
    expect(danger).toContain('data-testid="assembled-item" data-slot="W" data-flagged=""');
    expect(w).toContain("Changed since the check");
    expect(w).toContain("20/19/18/17/16 s · Riot's data for patch 26.23, not re-checked");
    expect(text(danger)).toContain("Curated notes: checked on patch 26.22 Not re-checked for 26.23 Riot changed one ability after the check: its notes are flagged");
  });

  it("one patch since the check: each checked side, and the notes panels' lines, say not re-checked; a current check says nothing", async () => {
    const html = await render({ champion: "Garen", vs: "Renekton" }, at("16.23.1"));
    expect(text(part(html, "assembled-danger"))).toContain("Renekton's kit, by kind Curated notes: checked on patch 26.22 Not re-checked for 26.23");
    // The checked numbers need no word of their own: the side's line dates them.
    expect(part(html, "assembled-danger")).not.toContain('data-testid="assembled-cooldown-source"');
    expect(text(part(html, "matchup-interactions", "</header>"))).toContain("Not re-checked for 26.23");
    expect(text(part(html, "matchup-level-notes", "</header>"))).toContain("Not re-checked for 26.23");
    const now = await render({ champion: "Garen", vs: "Renekton" });
    expect(text(now)).not.toContain("Not re-checked");
    expect(text(part(now, "matchup-level-notes", "</header>"))).not.toContain("may be out of date");
  });

  it("an unreadable record is said as unreadable on the assembled side, never as not stored", async () => {
    const html = await render({ champion: "Garen", vs: "Darius" }, { loadAbilities: async (ids) => ({ version: "16.22.1", champions: Object.fromEntries(ids.map((id) => [id, id === "Darius" ? null : kit(id)])), unreadable: ["Darius"] }) });
    expect(text(part(html, "assembled-danger"))).toContain("Riot's ability data for Darius could not be read");
    expect(text(html)).not.toContain("Ability details aren't stored yet");
    // A record not stored at all still says so.
    const none = await render({ champion: "Garen", vs: "Darius" }, { loadAbilities: async (ids) => ({ version: "16.22.1", champions: Object.fromEntries(ids.map((id) => [id, id === "Darius" ? null : kit(id)])) }) });
    expect(text(part(none, "assembled-danger"))).toContain("Ability details aren't stored yet");
  });

  it("your champion's summary says once that its cooldowns are Riot's data, not reviewed, as the enemy's panel does; a curated champion's are its notes'", async () => {
    const t = text(await render({ champion: "Garen", vs: "Darius" }));
    expect(t).toContain("Your champion: Garen Abilities and base cooldowns · Riot Data Dragon 16.22.1 · Cooldowns: Riot's data, not reviewed ·");
    expect(t).toContain("Darius's abilities Base cooldowns, without ability haste Riot Data Dragon 16.22.1 · Cooldowns: Riot's data, not reviewed");
    const curatedYou = await render({ champion: "Renekton", vs: "Darius" });
    expect(text(curatedYou)).toContain("Your champion: Renekton Abilities and base cooldowns · Riot Data Dragon 16.22.1 · Curated notes: checked on patch 26.22");
    expect(curatedYou).not.toContain('data-testid="your-cooldown-source"');
  });

  it("level notes beyond two fold behind their count, the lowest levels first, word for word inside", async () => {
    const three: ChampionNotes = { ...renekton, levelNotes: [{ level: 11, text: "Third.", source: "wiki", basedOn: ["W"] }, { level: 6, text: "Dominus.", source: "wiki", basedOn: ["W"] }, { level: 9, text: "Second.", source: "wiki", basedOn: ["W"] }] };
    const html = await render({ champion: "Garen", vs: "Renekton" }, { championNotes: (id) => (id === "Renekton" ? three : null) });
    const levels = part(html, "matchup-level-notes");
    const shown = levels.split('data-testid="matchup-level-notes-more"')[0]!;
    expect(text(shown)).toContain("Level 6 Renekton: Dominus. Level 9 Renekton: Second.");
    expect(text(shown)).not.toContain("Third.");
    expect(text(levels.slice(levels.indexOf('data-testid="matchup-level-notes-more"')))).toMatch(/^[^<]*1 more level changes Level 11 Renekton: Third\./);
    // Two notes: no fold.
    expect(await render({ champion: "Garen", vs: "Renekton" })).not.toContain("matchup-level-notes-more");
  });

  it("a tight cooldown breaks only after a slash, and each source tip is a 44px target on a touch screen", async () => {
    const html = await render({ champion: "Garen", vs: "Renekton" });
    const cd = /<span class="([^"]*)" data-testid="assembled-cooldown">([\s\S]*?)<\/span>/.exec(html)!;
    expect(cd[1]).toContain("[overflow-wrap:normal]");
    // The unit held to the last number by a no-break space.
    expect(cd[2]).toBe("18/<wbr/>17/<wbr/>16/<wbr/>15/<wbr/>14\u00a0s");
    for (const m of html.matchAll(/<button[^>]*data-testid="level-note-source"[^>]*>/g)) expect(m[0]).toMatch(/class="[^"]*\btouch-target\b/);
    expect(html).toMatch(/data-testid="level-note-source"/);
  });
});
