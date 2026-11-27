import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FRESH_PATCHES, SHOWN_PATCHES } from "@/domain/matchup/notes";

/*
  The product's description in Riot's Developer Portal must describe every use: "Any new features
  or changes to a product must be audited through the product's page in the Developer Portal"
  (docs/RIOT_COMPLIANCE.md, items 4 and 9). The owner pastes the description from
  RIOT_COMPLIANCE.md. The registered one ("Description for the registration") still names Matchup
  Intel, retired on 23 Nov 2026; the proposed one (the owner's D1 of 26 Nov 2026) names Champion
  Intel (Champion Lookup until 24 Nov 2026) in its place, with its builds by queue, ranges, Compare's
  early-lane band and the high-elo collection (switched off until it is reviewed), and docs/CHAMPION_INTEL.md ("For the owner") repeats that part word for word, so the two copies never
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
const championIntel = quoteAfter(read("docs/CHAMPION_INTEL.md"), "## For the owner");
/** The registered description's Matchup Intel part: from its name to the end of its own sentence about timers. */
const matchupIntel = /Matchup Intel, [\s\S]*?no timers or tracking\./.exec(registration)?.[0] ?? "";

describe("the registration's description", () => {
  it("is in RIOT_COMPLIANCE.md, the registered one still naming Matchup Intel", () => {
    expect(registration).toMatch(/^Private team tool/);
    expect(matchupIntel).toMatch(/^Matchup Intel, for signed-in accounts/);
    expect(registration).toContain("No live-game or champion-select features, no client integration");
  });

  it("the proposed one names Champion Intel in Matchup Intel's place, and CHAMPION_INTEL.md repeats that part word for word", () => {
    expect(proposed).toMatch(/^Private team tool/);
    expect(championIntel).toMatch(/^Champion Intel, /);
    expect(proposed).toContain(championIntel);
    expect(proposed).not.toContain("Matchup Intel");
    expect(proposed).not.toContain("Champion Lookup");
    // The rest of the product's description is the registered one's.
    expect(proposed.replace(championIntel, "")).toBe(registration.replace(matchupIntel, ""));
  });

  it("says what Riot needs to know about Champion Intel", () => {
    for (const words of ["static reference", "one or two champions chosen by hand", "base cooldowns per rank from Data Dragon", "description", "cost", "base statistics from Data Dragon", "with Riot's sentence for each", "ability haste", "no Riot API request", "no timers or tracking"]) {
      expect(championIntel, words).toContain(words);
    }
    // Its build totals (25 Nov 2026; by queue and with their uncertainty rule, D5 and D6 of 26 Nov 2026): what they are counted from, who sees them, what they are not,
    // and the anonymous high-elo collection (D2), switched on only after the description is reviewed.
    for (const words of [
      "members who may see teammates' statistics",
      "totals of the rune pages, summoner spells, items and skill orders",
      "the team's stored completed games",
      "one queue at a time",
      "never mixed",
      "of the current patch, or of the previous one too where the current has too few",
      "counts only, no player named",
      "win rates, likely ranges, pick rates and numbers of games",
      "not a global sample",
      "no advice",
      "only from 30 games",
      "statistically clear",
      "anonymous high-elo games",
      "LEAGUE-V4",
      "MATCH-V5",
      "no player identifier, name, Riot ID or match id is stored",
      "counts older than the previous patch are deleted",
      "switched on only after this description is reviewed",
    ]) {
      expect(championIntel, words).toContain(words);
    }
  });

  // 27 Nov 2026: the text said notes are reviewed "each patch"; the code shows one up to three patches after its review, labelled.
  it("says how long a reviewed note shows, as the code decides it (domain/matchup/notes noteFreshness), in every copy", () => {
    expect([FRESH_PATCHES, SHOWN_PATCHES]).toEqual([1, 3]);
    const clause = "short notes the team's administrators write and review, labelled as reviewed notes with the patch each was reviewed on, marked as not re-checked from the second patch after that review and hidden from the fourth, or at once when Riot's data for either champion changes.";
    expect(championIntel).toContain(clause);
    expect(proposed).not.toMatch(/review each patch/);
    // docs/MATCHUP_INTEL.md quotes the band's sentences, wrapped.
    const matchupDoc = read("docs/MATCHUP_INTEL.md");
    const quoted = matchupDoc.slice(matchupDoc.indexOf("> In Compare, for a lane chosen by hand")).split("\n").filter((l, i, all) => all.slice(0, i + 1).every((x) => x.startsWith(">"))).map((l) => l.slice(2)).join(" ");
    expect(quoted).toContain(clause);
    expect(championIntel).toContain(quoted);
  });
});
