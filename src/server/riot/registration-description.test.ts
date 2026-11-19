import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
  The product's description in Riot's Developer Portal must describe every use: "Any new features
  or changes to a product must be audited through the product's page in the Developer Portal"
  (docs/RIOT_COMPLIANCE.md, items 4 and 9). The owner pastes the description from
  RIOT_COMPLIANCE.md ("Description for the registration"); docs/MATCHUP_INTEL.md ("For the owner")
  repeats its Matchup Intel part word for word, so the two copies never drift apart, and both keep
  saying what Riot needs to know about the page.
*/

const ROOT = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/** The text of the first quoted line ("> …") after `marker`. */
function quoteAfter(doc: string, marker: string): string {
  const from = doc.indexOf(marker);
  if (from < 0) return "";
  const line = doc
    .slice(from)
    .split("\n")
    .find((l) => l.trimStart().startsWith("> "));
  return line ? line.trimStart().slice(2).trim() : "";
}

const registration = quoteAfter(read("docs/RIOT_COMPLIANCE.md"), "**Description for the registration**");
const matchupIntel = quoteAfter(read("docs/MATCHUP_INTEL.md"), "## For the owner");
// The description proposed for Matchup Intel's redesign of 18 Nov 2026 (the owner's action, decision 6):
// RIOT_COMPLIANCE.md's whole text, and MATCHUP_INTEL.md's Matchup Intel part, under step 1.
const proposed = quoteAfter(read("docs/RIOT_COMPLIANCE.md"), "**Proposed description for the registration**");
const proposedMatchupIntel = quoteAfter(read("docs/MATCHUP_INTEL.md"), "**For the redesign of 18 Nov 2026, the owner's action**");

describe("the registration's description", () => {
  it("is in RIOT_COMPLIANCE.md, and MATCHUP_INTEL.md repeats its Matchup Intel part word for word", () => {
    expect(registration).toMatch(/^Private team tool/);
    expect(matchupIntel).toMatch(/^Matchup Intel, /);
    expect(registration).toContain(matchupIntel);
  });

  it("says what Riot needs to know about Matchup Intel", () => {
    for (const words of ["static reference", "chosen by hand", "base cooldowns per rank from Data Dragon", "League of Legends Wiki", "no Riot API request", "no timers or tracking"]) {
      expect(matchupIntel, words).toContain(words);
    }
    expect(registration).toContain("No live-game or champion-select features, no client integration");
  });

  it("the description proposed for the redesign is in both, word for word, and says the same about Matchup Intel and what it now reads and shows", () => {
    expect(proposed).toMatch(/^Private team tool/);
    expect(proposedMatchupIntel).toMatch(/^Matchup Intel, /);
    expect(proposed).toContain(proposedMatchupIntel);
    // The rest of the product's description is the registered one's.
    expect(proposed.replace(proposedMatchupIntel, "")).toBe(registration.replace(matchupIntel, ""));
    for (const words of ["static reference", "chosen by hand", "base cooldowns per rank from Data Dragon", "League of Legends Wiki", "no Riot API request", "no timers or tracking", "Riot's own ability text", "reviewed automatically", "each champion's facts set side by side"]) {
      expect(proposedMatchupIntel, words).toContain(words);
    }
  });
});
