import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AbilityNotes, ChampionChoice, ChampionNotes, DdragonAbility, DdragonChampionAbilities, MatchupNotes } from "@/domain/matchup-intel/types";
import { buildMatchupPageView, type MatchupViewDeps } from "@/server/matchup-intel/view";
import { AbilityList } from "./ability-list";
import { MatchupContent } from "./matchup-content";
import { MatchupFrame } from "./matchup-frame";

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

async function render(input: { champion?: string; vs?: string }, over: Partial<MatchupViewDeps> = {}) {
  const view = await buildMatchupPageView(input, { ...deps, ...over });
  const content = createElement(MatchupContent, { view, champions: ROSTER, curated, legal: LEGAL });
  return renderToStaticMarkup(createElement(MatchupFrame, { you: view.you, enemy: view.enemy, champions: ROSTER, curated }, content));
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the page body", () => {
  it("a curated pair: the briefing with its chips, five ability rows with cooldowns, the notes and the sources", async () => {
    const html = await render({ champion: "Ambessa", vs: "Renekton" });
    const t = text(html);
    // The pair is in the slots above; the heading names it for screen readers.
    expect(html).toContain('The ten-second briefing<span class="sr-only">: Ambessa vs Renekton</span>');
    expect(t).toContain("Checked on patch 26.22");
    expect(html).toContain('href="#ability-Renekton-W"');
    expect(html).toContain('href="#ability-Ambessa-Q"');
    expect(html.match(/data-testid="ability-row"/g)).toHaveLength(10);
    expect(t).toContain("13 s at every rank");
    expect(t).toContain("18 / 17 / 16 / 15 / 14 s");
    expect(t).toContain("Cooldown not in Riot's data");
    expect(t).toContain("No cooldown number in Riot's data");
    // Where each line comes from: the checked notes, or Riot's data that nobody has reviewed.
    expect(t).toContain("18 / 17 / 16 / 15 / 14 s Checked on patch 26.22");
    expect(t).toContain("13 s at every rank Riot's data, not reviewed");
    expect(t).toContain("Base cooldowns, without ability haste · Riot Data Dragon 16.22.1");
    expect(t).toContain("Crowd control: Stun");
    expect(t).toContain("Details and sources");
    expect(t).toContain("Unstoppable answers it.");
    expect(t).toContain("Level 6");
    expect(t).toContain("Your champion: Ambessa");
    expect(t).toContain("Ability names, icons and base cooldowns: Riot Data Dragon 16.22.1 (patch 26.22).");
    expect(t).toContain("checked on 16 Nov 2026 against patch 26.22");
    expect(t).toContain("A static reference for preparation: no live tracking");
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

  it("an uncurated pair: says so calmly, then the enemy's general reference", async () => {
    const t = text(await render({ champion: "Garen", vs: "Darius" }));
    expect(t).toContain("No curated briefing for Garen vs Darius yet.");
    expect(t).toContain("What follows is the general reference for Darius");
    expect(t).toContain("Darius's abilities");
    expect(t).not.toContain("the ten-second briefing");
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
    expect(rowText(html, "Darius", "P")).toContain("Cooldown not in Riot's data Not reviewed");
    expect(rowText(html, "Darius", "Q")).toContain("Riot's number for this ability is known to be wrong Not reviewed");
    expect(rowText(html, "Darius", "W")).toContain("Riot's data lists charges but not their recharge Not reviewed");
    expect(rowText(html, "Darius", "E")).toContain("Two abilities share this slot in Riot's data Not reviewed");
    expect(rowText(html, "Darius", "R")).toContain("Riot's data doesn't give one number per rank Not reviewed");
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
    expect(rowText(html, "Renekton", "P")).toContain("10 s · per target · unaffected by ability haste Checked on patch 26.22");
    // An empowerment's badge, on the champion himself: nothing to add.
    expect(rowText(html, "Renekton", "P")).toContain("Empowerment: Bonus AD for 15 s");
    expect(rowText(html, "Renekton", "P")).not.toContain("on Renekton");
    expect(rowText(html, "Renekton", "Q")).toContain("Hammer: 16 / 14 / 12 / 10 / 8 / 6 s Cannon: 8 s at every rank · starts when the effect ends Checked on patch 26.22");
    expect(rowText(html, "Renekton", "W")).toContain("13 / 12.5 / 12 / 11.5 / 11 s Checked on patch 26.22 Refunds 25 / 35 / 45 / 55 / 65% of the cooldown: her first attack within 4 seconds Resets the basic-attack timer");
    expect(rowText(html, "Renekton", "E")).toContain("13 s at every rank · starts after the first cast Checked on patch 26.22 0.3125 s between casts, unaffected by ability haste");
    // Who has the effect, where its kind would not say it; the tags as data, not words; the page's revision in the details.
    expect(rowText(html, "Renekton", "E")).toContain("Interaction: Fails on spell shields · on the target");
    expect(rowText(html, "Renekton", "E")).toContain("Fails on spell shields (on the target): A spell shield on the target stops it. · Source: A page");
    expect(rowText(html, "Renekton", "E")).toContain(", revision of 5 Jun 2026");
    expect(html).toContain('data-tags="spell-shield"');
    expect(rowText(html, "Renekton", "R")).toContain("3 / 4 / 5 charges · one back every 35 / 30 / 25 s Checked on patch 26.22");
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
    expect(w).toContain("20 / 19 / 18 / 17 / 16 s Riot's data for patch 26.23, not re-checked");
    // The checked start is not on Riot's line: it goes with the notes, under their flag.
    expect(w.split("Notes from patch")[0]).not.toContain("starts when the effect ends");
    expect(w).toContain("Notes from patch 26.22 · may be out of date: Riot changed its cooldown since As checked: 18 / 17 / 16 / 15 / 14 s · starts when the effect ends");
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
    expect(panel).toContain("Renekton W Interaction: Fury Changed since the check");
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
    expect(t).toContain("Your champion: Garen Abilities and base cooldowns, for reference · Riot Data Dragon 16.22.1");
    expect(t).toContain("Base cooldowns, without ability haste · Riot Data Dragon 16.23.1");
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
    expect(rowText(html, "Renekton", "W")).toContain("18 / 17 / 16 / 15 / 14 s Checked on patch 26.22 · not re-checked for 26.23");
    // Riot's own lines say nothing of a check.
    expect(rowText(html, "Renekton", "Q")).toContain("13 s at every rank Riot's data, not reviewed");
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
    expect(text(html.slice(html.indexOf('data-testid="matchup-level-notes"')))).toMatch(/^[^<]*By level When something notable becomes possible Checked three patches ago: may be out of date/);
    expect(t).toContain("The curated notes on this page were checked on 16 Nov 2026 against patch 26.22.");
    expect(t).not.toContain("the Ambessa vs Renekton briefing");
  });

  it("the offline copy: said in the panel and the footer, with the game's current patch not known", async () => {
    const t = text(await render({ vs: "Darius" }, { currentPatch: null, loadAbilities: async (ids) => ({ version: "16.22.1", champions: Object.fromEntries(ids.map((id) => [id, kit(id)])), offline: [...ids] }) }));
    expect(t).toContain("Base cooldowns, without ability haste · Offline copy of Riot Data Dragon 16.22.1");
    expect(t).toContain("Ability names, icons and base cooldowns: an offline copy of Riot Data Dragon 16.22.1 (patch 26.22); the game's current patch is not known.");
  });

  it("chips for a champion with no ability rows on the page are labels, never links to nothing", async () => {
    const html = await render({ champion: "Ambessa", vs: "Renekton" }, { loadAbilities: storedAt({ Ambessa: "16.22.1" }) });
    expect(html).not.toContain('href="#ability-Renekton-W"');
    expect(html).toMatch(/<span class="[^"]*" data-testid="briefing-ability-label">Renekton W<\/span>/);
    expect(html).toContain('href="#ability-Ambessa-Q"');
  });

  it("a level note from an ability Riot changed after the check is flagged", async () => {
    const moved = (k: DdragonChampionAbilities) => ({ ...k, abilities: k.abilities.map((a) => (a.slot === "W" ? { ...a, cooldown: [20, 19, 18, 17, 16] } : a)) });
    const html = await render({ champion: "Ambessa", vs: "Renekton" }, { loadAbilities: storedAt({ Ambessa: "16.23.1", Renekton: "16.23.1" }, moved) });
    const levels = html.slice(html.indexOf('data-testid="matchup-level-notes"'));
    expect(levels).toContain('data-testid="matchup-level-note" data-changed=""');
    expect(text(levels)).toContain("Level 6 Renekton: Dominus. Changed since the check");
  });
});
