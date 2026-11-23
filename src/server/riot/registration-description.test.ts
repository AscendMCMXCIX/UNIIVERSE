import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
  The product's description in Riot's Developer Portal must describe every use: "Any new features
  or changes to a product must be audited through the product's page in the Developer Portal"
  (docs/RIOT_COMPLIANCE.md, items 4 and 9). The owner pastes the description from
  RIOT_COMPLIANCE.md. The registered one ("Description for the registration") still names Matchup
  Intel, retired on 23 Nov 2026; the proposed one names Champion Lookup in its place, and
  docs/CHAMPION_LOOKUP.md ("For the owner") repeats that part word for word, so the two copies never
  drift apart, and both keep saying what Riot needs to know about the page.
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
const proposed = quoteAfter(read("docs/RIOT_COMPLIANCE.md"), "**Proposed description for the registration**");
const championLookup = quoteAfter(read("docs/CHAMPION_LOOKUP.md"), "## For the owner");
/** The registered description's Matchup Intel part: from its name to the end of its own sentence about timers. */
const matchupIntel = /Matchup Intel, [\s\S]*?no timers or tracking\./.exec(registration)?.[0] ?? "";

describe("the registration's description", () => {
  it("is in RIOT_COMPLIANCE.md, the registered one still naming Matchup Intel", () => {
    expect(registration).toMatch(/^Private team tool/);
    expect(matchupIntel).toMatch(/^Matchup Intel, for signed-in accounts/);
    expect(registration).toContain("No live-game or champion-select features, no client integration");
  });

  it("the proposed one names Champion Lookup in Matchup Intel's place, and CHAMPION_LOOKUP.md repeats that part word for word", () => {
    expect(proposed).toMatch(/^Private team tool/);
    expect(championLookup).toMatch(/^Champion Lookup, /);
    expect(proposed).toContain(championLookup);
    expect(proposed).not.toContain("Matchup Intel");
    // The rest of the product's description is the registered one's.
    expect(proposed.replace(championLookup, "")).toBe(registration.replace(matchupIntel, ""));
  });

  it("says what Riot needs to know about Champion Lookup", () => {
    for (const words of ["static reference", "chosen by hand", "base cooldowns per rank from Data Dragon", "short description", "ability haste", "no Riot API request", "no timers or tracking"]) {
      expect(championLookup, words).toContain(words);
    }
  });
});
