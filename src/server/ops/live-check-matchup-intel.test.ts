import { describe, expect, it } from "vitest";
import { briefingState, matchupIntelVerdicts, type MatchupIntelRead } from "../../../scripts/matchup-intel-facts.mjs";

/*
  The Production check's Matchup Intel facts (scripts/matchup-intel-facts.mjs, run by
  scripts/live-check.mjs on Riven vs Mordekaiser): they hold in every state production can be in with
  no deploy, so the check never fails because the game moved on, and they still fail what the owner
  asked for. Each state's reading is the live check's own reader run on the page as it would be (the
  body and the bar built by the app's own view from Riot's real Data Dragon 16.23.1 records, put into
  the demo page with its CSS, 19 Nov 2026), trimmed to what the verdicts read:
  - production now, patch 26.23 with nothing changed: "Not re-checked for 26.23" on the briefing,
    the notes panels and the bar; 23px over at 1440 x 900, the sources' summary at 884px;
  - Mordekaiser's Q changed: the parts resting on it hidden and said, the bar warning;
  - every ability changed: the briefing hidden whole, above the assembled reference too;
  - three patches after the check: the briefing hidden as too old.
*/

/** Production now (26.23, nothing changed), read at 1440 x 900. */
const NOW: MatchupIntelRead = {
  size: "1440x900",
  heading: "Matchup Intel",
  layer: "curated",
  label: "Curated briefing · checked on patch 26.22",
  threat: 291,
  opportunity: 149,
  checked: "Checked on patch 26.22Not re-checked for 26.23",
  expired: false,
  hiddenWhole: false,
  hiddenParts: 0,
  assembledWhy: "",
  barWarning: "",
  notRechecked: true,
  slots: "PQWER",
  named: 5,
  missing: false,
  tilesBottom: 701,
  summary: "A static reference: no live tracking · Riot Data Dragon 16.23.1 · League of Legends Wiki, CC BY-SA 3.0 · Not endorsed by Riot Games",
  summaryBottom: 884,
  summaryShown: true,
  ddragon: "Ability names, icons and base cooldowns: Riot Data Dragon 16.23.1 (patch 26.23).",
  notice: "UNIIVERSE isn't endorsed by Riot Games.",
  licence: "https://creativecommons.org/licenses/by-sa/3.0/",
  innerHeight: 900,
  scrollHeight: 923,
  riotTextChips: 0,
  riotTextLabel: false,
};
/** The same page made 1920 x 1080: no page scroll. */
const WIDE = { ...NOW, size: "1920x1080", innerHeight: 1080, scrollHeight: 1080 };

const PARTS_HIDDEN: MatchupIntelRead = { ...NOW, hiddenParts: 1, barWarning: "Changed since the check: one part hidden", tilesBottom: 914, summaryBottom: 1041, summaryShown: false, scrollHeight: 1080 };
const WHOLE_HIDDEN: MatchupIntelRead = { ...NOW, layer: "assembled", label: "Assembled reference", threat: 0, opportunity: 0, hiddenWhole: true, hiddenParts: 1, assembledWhy: "The curated briefing for Riven vs Mordekaiser is hidden, above.", barWarning: "Changed since the check: the briefing is hidden", tilesBottom: 953, summaryBottom: 1362, summaryShown: false, scrollHeight: 1401 };
const EXPIRED: MatchupIntelRead = { ...NOW, layer: "assembled", label: "Assembled reference", threat: 0, opportunity: 0, checked: "Checked on patch 26.22", expired: true, assembledWhy: "The curated briefing for Riven vs Mordekaiser is hidden, above.", notRechecked: false, tilesBottom: 685, summaryBottom: 974, summaryShown: false, scrollHeight: 1013 };

const judge = (at: MatchupIntelRead, wide: MatchupIntelRead = WIDE, wiki: string[] = []) => matchupIntelVerdicts({ kind: "desktop", pair: "Riven vs Mordekaiser", enemy: "Mordekaiser", at, wide, wiki });
const failed = (verdicts: ReturnType<typeof judge>) => verdicts.filter((v) => v.status === "FAIL").map((v) => v.name);

describe("the Production check's Matchup Intel facts", () => {
  it("pass on production as it is now (26.23, not re-checked): no page scroll at 1920 x 1080, the tiles and the sources' summary on screen at 1440 x 900, though it scrolls 23px there", () => {
    const v = judge(NOW);
    expect(failed(v)).toEqual([]);
    expect(v.map((x) => x.name)).toContain("desktop: 1920 × 1080: the whole overview fits the screen, no page scroll");
    expect(v.map((x) => x.name)).toContain("desktop: 1440 × 900: the essentials are on the screen: the enemy's five ability tiles and the sources' summary");
    // No fact asks for no page scroll at 1440 x 900, a size the overview is not promised to fit.
    expect(v.map((x) => x.name).join(" ")).not.toMatch(/1440.*no page scroll/);
  });

  it("pass while parts, or all, of the briefing are hidden for a change, or it is too old, saying what they found", () => {
    expect(briefingState(PARTS_HIDDEN)).toBe("parts hidden");
    expect(briefingState(WHOLE_HIDDEN)).toBe("hidden");
    expect(briefingState(EXPIRED)).toBe("expired");
    expect(briefingState(NOW)).toBe("shown");
    for (const [at, wide] of [
      [PARTS_HIDDEN, WIDE],
      [WHOLE_HIDDEN, { ...WIDE, scrollHeight: 1270 }],
      [EXPIRED, WIDE],
    ] as const) {
      const v = judge(at, wide);
      expect(failed(v), briefingState(at)).toEqual([]);
      const fit = v.filter((x) => /1920 × 1080|1440 × 900/.test(x.name));
      expect(fit.every((x) => x.status === "PASS" && x.name.includes("not judged in this state")), briefingState(at)).toBe(true);
    }
    // What they found, in the fact's own words.
    expect(judge(WHOLE_HIDDEN, { ...WIDE, scrollHeight: 1270 }).map((x) => x.name)).toContain("desktop: 1920 × 1080: with the briefing hidden, the overview runs 190px past the screen (not judged in this state)");
    expect(judge(EXPIRED).map((x) => x.name)).toContain("desktop: the curated briefing is hidden as too old to show, and says so, above the assembled reference too");
    expect(judge(PARTS_HIDDEN).map((x) => x.name)).toContain("desktop: the curated briefing shows, labelled with when it was checked, its parts resting on an ability Riot changed hidden and said (1), and the bar warns");
  });

  it("still fail what the owner asked for: a page scroll at 1920 x 1080, or the summary or a tile off the screen at 1440 x 900, with the briefing shown", () => {
    expect(failed(judge(NOW, { ...WIDE, scrollHeight: 1095 }))).toEqual(["desktop: 1920 × 1080: the whole overview fits the screen, no page scroll"]);
    expect(failed(judge({ ...NOW, summaryShown: false, summaryBottom: 912 }))).toEqual(["desktop: 1440 × 900: the essentials are on the screen: the enemy's five ability tiles and the sources' summary"]);
    expect(failed(judge({ ...NOW, tilesBottom: 905 }))).toEqual(["desktop: 1440 × 900: the essentials are on the screen: the enemy's five ability tiles and the sources' summary"]);
    // The window not made 1920 x 1080 is no proof of the fit.
    expect(failed(judge(NOW, { ...WIDE, size: "1440x900" }))).toContain("desktop: 1920 × 1080: the whole overview fits the screen, no page scroll");
  });

  it("fail a hidden briefing said as missing, a hidden state the bar does not warn of, and everything that holds in every state", () => {
    expect(failed(judge({ ...EXPIRED, assembledWhy: "No curated briefing for Riven vs Mordekaiser yet." }))).toEqual(["desktop: the curated briefing is hidden as too old to show, and says so, above the assembled reference too"]);
    expect(failed(judge({ ...WHOLE_HIDDEN, barWarning: "" }, { ...WIDE, scrollHeight: 1270 }))).toHaveLength(1);
    expect(failed(judge({ ...PARTS_HIDDEN, barWarning: "" }))).toHaveLength(1);
    expect(failed(judge({ ...NOW, heading: "Resources" }))).toEqual(["desktop: Matchup Intel opens Riven vs Mordekaiser under its own heading"]);
    expect(failed(judge({ ...NOW, slots: "PQWE", named: 4 }))).toContain("desktop: Mordekaiser's five ability tiles, P to R, each with its name and cooldown line");
    expect(failed(judge({ ...NOW, summary: "Sources and notices" }))).toContain("desktop: the sources' summary: a static reference with no live tracking, Riot's data, not endorsed by Riot Games");
    expect(failed(judge(NOW, WIDE, ["https://wiki.leagueoflegends.com/en-us/Riven"]))).toEqual(["desktop: nothing requested from the League of Legends Wiki"]);
    expect(failed(judge({ ...NOW, riotTextChips: 3 }))).toEqual(["desktop: checked notes win over the facts from Riot's text: none of those on a pair whose champions both have checked notes, nor Riot's text in the sources' summary"]);
    // No abilities stored is a warning, as the page says so.
    expect(judge({ ...NOW, missing: true, slots: "", named: 0 }).filter((x) => x.status === "WARN").map((x) => x.name)).toEqual(["desktop: Mordekaiser's abilities are not stored yet: the page says so"]);
  });
});
