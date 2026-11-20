import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import { TIP_LABEL } from "@/components/matchup-intel/riot-tips";
import { NO_HIGH_ELO } from "@/components/matchup-intel/evidence-panel";
import { slotWords } from "@/components/matchup-intel/slots";
import { ROLES } from "./types";
import { EVIDENCE_REFUSED_WORDS, evidenceRefusedWords, refusedWords } from "./refused-words";

/*
  The two word lists (docs/MATCHUP_INTEL.md, "Words"): REFUSED_WORDS for curated text, kit facts and
  the page's fixed sentences; EVIDENCE_REFUSED_WORDS for the sentences built from the team's games.
  Riot's tips are exempt from both as attributed quotes (abilities.test.ts holds them byte-equal to
  Data Dragon instead).
*/

/** The evidence lines S7a shows in place of the counts S7b builds: each held to the evidence list. */
const EVIDENCE_LINES = [NO_HIGH_ELO, "No curated notes for this 2v2", "Runes, items and skill order:"];

describe("EVIDENCE_REFUSED_WORDS", () => {
  it("allows 'your' only as the possessive of the viewer's own games, and 'won/lost' as counted results", () => {
    expect(evidenceRefusedWords("In your games: 4 of 9 won · patch 26.23 · Solo/Duo 3, Normal Draft 6")).toEqual([]);
    expect(evidenceRefusedWords("4 of your 9 games lost")).toEqual([]);
    expect(evidenceRefusedWords("In the team's games (n = 12): 7 won")).toEqual([]);
  });

  it("refuses instructions, verdicts and absolutes, and 'you/your' anywhere else", () => {
    const words = (t: string) => evidenceRefusedWords(t).map((w) => w.word);
    expect(words("You should build Eclipse")).toEqual(expect.arrayContaining(["should", "you"]));
    expect(words("Your best rune page")).toEqual(expect.arrayContaining(["best", "your"]));
    expect(words("Always max Q first")).toEqual(["always"]);
    expect(words("An easy lane to win")).toEqual(expect.arrayContaining(["easy", "win"]));
    expect(words("Wait for level 6, avoid trades")).toEqual(expect.arrayContaining(["wait for", "avoid"]));
    expect(words("The recommended core build")).toEqual(expect.arrayContaining(["recommended", "core build"]));
    for (const { words: list } of EVIDENCE_REFUSED_WORDS) for (const w of list) expect(evidenceRefusedWords(`a ${w} b`).length, w).toBeGreaterThan(0);
  });

  it("passes on every evidence line the page shows now", () => {
    for (const line of EVIDENCE_LINES) expect(evidenceRefusedWords(line), line).toEqual([]);
  });
});

describe("REFUSED_WORDS on the page's new fixed sentences", () => {
  it("passes on the tips' label and the evidence lines", () => {
    for (const line of [TIP_LABEL, ...EVIDENCE_LINES]) expect(refusedWords(line), line).toEqual([]);
  });

  it("leaves the slot prompts out: they are the controls' own words to the viewer ('Choose your ADC'), not facts", () => {
    // The prompts address the viewer by design; the curated and evidence rules do not apply to controls.
    for (const role of ROLES) expect(slotWords(role, "you").choose).toMatch(/^Choose your /);
  });
});

describe("Riot's tips are exempt, as attributed quotes", () => {
  const champions = (abilityFixture as unknown as { champions: Record<string, { tips?: { ally: string[]; enemy: string[] } }> }).champions;
  it("needs the exemption: Riot's own words use the refused words (Ornn's 'Try to stay away from walls')", () => {
    expect(champions.Ornn!.tips!.enemy[0]).toBe("Try to stay away from walls. Ornn is much less strong if he cannot stun you.");
    expect(refusedWords(champions.Ornn!.tips!.enemy[0]!).map((w) => w.word)).toEqual(expect.arrayContaining(["try to", "you"]));
    const all = Object.values(champions).flatMap((c) => [...(c.tips?.ally ?? []), ...(c.tips?.enemy ?? [])]);
    expect(all.filter((t) => refusedWords(t).length).length).toBeGreaterThan(100);
  });
});
