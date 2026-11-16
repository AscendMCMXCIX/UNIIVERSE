import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChampionChoice, ChampionNotes, DdragonChampionAbilities, MatchupNotes } from "@/domain/matchup-intel/types";
import { buildMatchupPageView, type MatchupViewDeps } from "@/server/matchup-intel/view";
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
    { id: "wiki", title: "Renekton", url: "https://wiki.leagueoflegends.com/en-us/Renekton", licence: "CC BY-SA 3.0" },
    { id: "bad", title: "Elsewhere", url: "https://example.com/x", licence: "CC BY-SA 3.0" },
  ],
  abilities: { W: { ddragonCooldown: [18, 17, 16, 15, 14], cooldown: { kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: "on-cast" }, facts: [{ kind: "crowd-control", label: "Stun", detail: "On the third hit.", source: "wiki" }, { kind: "interaction", label: "Fury", source: "bad" }], details: ["Empowered, it stuns longer."] } },
  levelNotes: [{ level: 6, text: "Dominus.", source: "wiki" }],
};
const ambessaVsRenekton: MatchupNotes = {
  championId: "Ambessa",
  vsId: "Renekton",
  verified,
  sources: [{ id: "wiki", title: "Renekton", url: "https://wiki.leagueoflegends.com/en-us/Renekton", licence: "CC BY-SA 3.0" }],
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
  return renderToStaticMarkup(createElement(MatchupFrame, { you: view.you, enemy: view.enemy, champions: ROSTER, curated, children: content }));
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the page body", () => {
  it("a curated pair: the briefing with its chips, five ability rows with cooldowns, the notes and the sources", async () => {
    const html = await render({ champion: "Ambessa", vs: "Renekton" });
    const t = text(html);
    expect(t).toContain("Ambessa vs Renekton: the ten-second briefing");
    expect(t).toContain("Checked on patch 26.22");
    expect(html).toContain('href="#ability-Renekton-W"');
    expect(html).toContain('href="#ability-Ambessa-Q"');
    expect(html.match(/data-testid="ability-row"/g)).toHaveLength(10);
    expect(t).toContain("13 s at every rank");
    expect(t).toContain("18 / 17 / 16 / 15 / 14 s");
    expect(t).toContain("Cooldown not in Riot's data");
    expect(t).toContain("No fixed cooldown in Riot's data");
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
    expect(empty).toContain("Ability details arrive with the next game-data update");
  });

  it("ability data older than the current patch says so", async () => {
    const t = text(await render({ vs: "Darius" }, { loadAbilities: async (ids) => ({ version: "16.21.1", champions: Object.fromEntries(ids.map((id) => [id, kit(id, "16.21.1")])) }) }));
    expect(t).toContain("The ability data held here is from patch 26.21; the game is on patch 26.22.");
  });
});
