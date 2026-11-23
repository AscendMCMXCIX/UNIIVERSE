import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MatchupEvidence } from "@/domain/matchup-intel/evidence";
import { SUMMONER_SPELL_HASTE_WORDS } from "@/domain/matchup-intel/haste";
import { HasteContext } from "./matchup-frame";
import { EvidenceBody, hasteWordsAt } from "./evidence-panel";

/*
  The summoner spells' base cooldowns on the evidence's spells line (docs/MATCHUP_INTEL.md,
  "Summoner spells"): Riot's base only, never shortened by the haste choice, with "Summoner spell
  haste is a separate stat" said once in the panel however many sections show the line.
*/

const line = { key: "spells", label: "Summoner spells", values: "Flash + Ignite in 6", sample: "of 9 games · patch 26.22 · Solo/Duo 9", cooldowns: "Base cooldowns in Riot's data: Flash 300 s, Ignite 180 s" };
const evidence: MatchupEvidence = {
  patch: "26.22",
  ignored: [],
  sections: [
    { scope: "own", tier: "In your games (n = 9)", n: 9, lines: [line], empty: null, positionNote: null },
    { scope: "team", tier: "In the team's games (n = 9)", n: 9, lines: [line], empty: null, positionNote: null },
  ],
};

const at = (haste: number) =>
  renderToStaticMarkup(React.createElement(HasteContext.Provider, { value: { haste, setHaste: () => undefined } }, React.createElement(EvidenceBody, { evidence, duo: false, pair: { chosen: true, curated: false } })));

describe("the evidence's summoner spells' cooldowns", () => {
  it("show Riot's base, the same at every haste choice", () => {
    const base = at(0);
    expect(base).toContain("Flash 300 s, Ignite 180 s");
    for (const h of [20, 40, 60, 300]) expect(at(h)).toBe(base);
  });

  it("say once that summoner spell haste is a separate stat", () => {
    expect(hasteWordsAt(evidence)).toBe("own:spells");
    expect(at(0).split(SUMMONER_SPELL_HASTE_WORDS).length - 1).toBe(1);
  });
});
