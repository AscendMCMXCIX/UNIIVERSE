import { describe, expect, it } from "vitest";
import { briefingState, matchupIntelVerdicts, publicPatch, type MatchupIntelRead } from "../../../scripts/matchup-intel-facts.mjs";

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
  roles: "Top* Jungle Mid ADC Support",
  slotCount: "2",
  tipsLabel: "Riot's tip (may predate later changes)",
  highElo: "Runes, items and skill order: No high-elo evidence (not collected)",
  fallbacks: "Power spikes: Not measured yet · No wave guidance for this matchup",
  evidenceTiers: "In your games: no player profile · In the team's games (n = 12)",
  briefingTier: "Checked notes (AI reviewers)",
  kitTier: "Riot's data",
  means: ["Mordekaiser's R cooldown 120 / 110 / 100\u00a0s at 0 haste (base, ability haste only)", "Mordekaiser's E cooldown 16 / 14 / 12 / 10 / 8\u00a0s at 0 haste (whether haste shortens it isn't known)", "Mordekaiser's Q cooldown 8 / 7 / 6 / 5 / 4\u00a0s at 0 haste (base); Mordekaiser's W cooldown 12 / 11 / 10 / 9 / 8\u00a0s at 0 haste (base)"],
};
/** The same page made 1920 x 1080: no page scroll. */
const WIDE = { ...NOW, size: "1920x1080", innerHeight: 1080, scrollHeight: 1080 };

const PARTS_HIDDEN: MatchupIntelRead = { ...NOW, hiddenParts: 1, barWarning: "Changed since the check: one part hidden", tilesBottom: 914, summaryBottom: 1041, summaryShown: false, scrollHeight: 1080 };
const WHOLE_HIDDEN: MatchupIntelRead = { ...NOW, layer: "assembled", label: "Assembled reference", threat: 0, opportunity: 0, hiddenWhole: true, hiddenParts: 1, assembledWhy: "The curated briefing for Riven vs Mordekaiser is hidden, above.", barWarning: "Changed since the check: the briefing is hidden", tilesBottom: 953, summaryBottom: 1362, summaryShown: false, scrollHeight: 1401 };
const EXPIRED: MatchupIntelRead = { ...NOW, layer: "assembled", label: "Assembled reference", threat: 0, opportunity: 0, checked: "Checked on patch 26.22", expired: true, assembledWhy: "The curated briefing for Riven vs Mordekaiser is hidden, above.", notRechecked: false, tilesBottom: 685, summaryBottom: 974, summaryShown: false, scrollHeight: 1013 };

const judge = (at: MatchupIntelRead, wide: MatchupIntelRead = WIDE, wiki: string[] = []) => matchupIntelVerdicts({ kind: "desktop", pair: "Riven vs Mordekaiser", enemy: "Mordekaiser", at, wide, wiki });
const failed = (verdicts: ReturnType<typeof judge>) => verdicts.filter((v) => v.status === "FAIL").map((v) => v.name);

describe("the Production check's Matchup Intel facts", () => {
  it("fail when a briefing row's 'what it means' line is missing, claims a timer or a verdict, or is not numbers", () => {
    const means = /says what it means/;
    expect(failed(judge(NOW)).filter((n) => means.test(n))).toEqual([]);
    expect(failed(judge({ ...NOW, means: ["Mordekaiser's Q cooldown 6.67 / 5.83\u00a0s at 20 haste (Riot's general rule)"] })).filter((n) => means.test(n))).toEqual([]);
    for (const over of [{ means: [] }, { means: ["Mordekaiser's Q is ready at 3:20"] }, { means: ["Mordekaiser's Q cooldown 8\u00a0s at 0 haste (base); you win"] }, { means: ["Mordekaiser's Q cooldown 8\u00a0s at 0 haste (estimated)"] }]) expect(failed(judge({ ...NOW, ...over })).filter((n) => means.test(n)), JSON.stringify(over)).toHaveLength(1);
    // While the briefing is hidden, no line is asked for.
    expect(failed(judge({ ...EXPIRED, means: [] })).filter((n) => means.test(n))).toEqual([]);
  });

  it("fail when the lane selector, Riot's tips' label or the evidence line is missing or claims more", () => {
    const lanes = /lane selector/;
    expect(failed(judge(NOW)).filter((n) => lanes.test(n))).toEqual([]);
    for (const over of [{ roles: "Top Jungle Mid" }, { roles: "Top Jungle Mid ADC Support" }, { tipsLabel: "" }, { highElo: "Runes: Conqueror" }, { fallbacks: "Power spikes: level 6 · No wave guidance for this matchup" }, { fallbacks: "" }, { slotCount: null }]) expect(failed(judge({ ...NOW, ...over })).filter((n) => lanes.test(n)), JSON.stringify(over)).toHaveLength(1);
  });

  it("fail when a row does not state its tier, or the evidence fold's tiers are missing", () => {
    const tiers = /evidence tier/;
    expect(failed(judge(NOW)).filter((n) => tiers.test(n))).toEqual([]);
    expect(failed(judge({ ...NOW, evidenceTiers: "In your games (n = 4) · In the team's games: not part of this access" })).filter((n) => tiers.test(n))).toEqual([]);
    for (const over of [{ evidenceTiers: "" }, { evidenceTiers: "Recommended build" }, { briefingTier: "" }, { kitTier: "" }]) expect(failed(judge({ ...NOW, ...over })).filter((n) => tiers.test(n)), JSON.stringify(over)).toHaveLength(1);
  });

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

  it("fail Release 6's page on production's 26.23 as its Production check read it, and pass the page that fixed it, read on the demo given Riot's 16.23.1", () => {
    // Production check 44758125888 (20 Nov 2026): the lane selector, the haste choice and Riot's tips
    // had made the page taller, and "Not re-checked for 26.23" put the sources' summary 8px under the fold.
    const release6 = { ...NOW, tilesBottom: 727, summaryBottom: 908, summaryShown: false, scrollHeight: 947 };
    expect(failed(judge(release6))).toEqual(["desktop: 1440 × 900: the essentials are on the screen: the enemy's five ability tiles and the sources' summary"]);
    // The fix (fix/mi-fit-recheck, over Release 7's tiers and evidence line), on the demo with Riot's
    // real 16.23.1 records: no page scroll at 1440 x 900 either; production draws Mordekaiser's W
    // cooldown line a line taller (16px), which the summary's room under the fold still holds.
    const fixed = { ...NOW, tilesBottom: 683, summaryBottom: 859, scrollHeight: 900 };
    expect(failed(judge(fixed))).toEqual([]);
    expect(failed(judge({ ...fixed, tilesBottom: fixed.tilesBottom + 16, summaryBottom: fixed.summaryBottom + 16, scrollHeight: 916 }))).toEqual([]);
  });

  it("fail a hidden briefing said as missing, a hidden state the bar does not warn of, and everything that holds in every state; warn of abilities not on the page", () => {
    expect(failed(judge({ ...EXPIRED, assembledWhy: "No curated briefing for Riven vs Mordekaiser yet." }))).toEqual(["desktop: the curated briefing is hidden as too old to show, and says so, above the assembled reference too"]);
    expect(failed(judge({ ...WHOLE_HIDDEN, barWarning: "" }, { ...WIDE, scrollHeight: 1270 }))).toHaveLength(1);
    expect(failed(judge({ ...PARTS_HIDDEN, barWarning: "" }))).toHaveLength(1);
    expect(failed(judge({ ...NOW, heading: "Resources" }))).toEqual(["desktop: Matchup Intel opens Riven vs Mordekaiser under its own heading"]);
    expect(failed(judge({ ...NOW, slots: "PQWE", named: 4 }))).toContain("desktop: Mordekaiser's five ability tiles, P to R, each with its name and cooldown line");
    expect(failed(judge({ ...NOW, summary: "Sources and notices" }))).toContain("desktop: the sources' summary: a static reference with no live tracking, Riot's data, not endorsed by Riot Games");
    expect(failed(judge(NOW, WIDE, ["https://wiki.leagueoflegends.com/en-us/Riven"]))).toEqual(["desktop: nothing requested from the League of Legends Wiki"]);
    expect(failed(judge({ ...NOW, riotTextChips: 3 }))).toEqual(["desktop: checked notes win over the facts from Riot's text: none of those on a pair whose champions both have checked notes, nor Riot's text in the sources' summary"]);
    // No abilities on the page (none stored yet, or a stored copy that cannot be read) is a warning, as the
    // page says so, and no second failure: at 1440 x 900 only the sources' summary is asked for then.
    const missing = { ...NOW, missing: true, slots: "", named: 0, tilesBottom: 0, summaryBottom: 807 };
    expect(judge(missing).filter((x) => x.status === "WARN").map((x) => x.name)).toEqual(["desktop: Mordekaiser's abilities are not on the page (not stored yet, or not readable): the page says so"]);
    expect(failed(judge(missing))).toEqual([]);
    expect(failed(judge({ ...missing, summaryShown: false, summaryBottom: 912 }))).toEqual(["desktop: 1440 × 900: with no ability tiles (the warning above), the sources' summary is on the screen"]);
  });
});

describe("the Production check's patch fact: the page's patch is /api/health's", () => {
  const patchFact = (at: MatchupIntelRead, healthPatch: string | null) => matchupIntelVerdicts({ kind: "desktop", pair: "Riven vs Mordekaiser", enemy: "Mordekaiser", at, wide: WIDE, wiki: [], healthPatch }).find((v) => /\/api\/health's/.test(v.name))!;
  const ON = { ...NOW, patch: "Patch 26.23", patchState: "Patch 26.23 · Riot's data · Curated briefing" };

  it("passes when the bar and the sources name health's patch (stored as the client version)", () => {
    expect(patchFact(ON, "16.23").status).toBe("PASS");
    expect(publicPatch("16.23")).toBe("26.23");
  });

  it("fails when the bar names another patch, or Riot's data is older without the bar saying so", () => {
    expect(patchFact({ ...ON, patch: "Patch 26.22" }, "16.23").status).toBe("FAIL");
    expect(patchFact({ ...ON, ddragon: "Ability names, icons and base cooldowns: Riot Data Dragon 16.22.1 (patch 26.22)." }, "16.23").status).toBe("FAIL");
    expect(patchFact({ ...ON, ddragon: "Ability names, icons and base cooldowns: Riot Data Dragon 16.22.1 (patch 26.22).", patchState: `${ON.patchState} Ability data from patch 26.22` }, "16.23").status).toBe("PASS");
  });

  it("expects 'Game patch not known' when health names no patch", () => {
    expect(patchFact({ ...ON, patch: "Game patch not known" }, null).status).toBe("PASS");
    expect(patchFact(ON, null).status).toBe("FAIL");
    // The offline fixture's patch ("0.0"), which the page never names: as none.
    expect(patchFact({ ...ON, patch: "Game patch not known" }, "0.0").status).toBe("PASS");
  });

  it("is not asserted by a caller that gives no health patch", () => {
    expect(judge(ON).some((v) => /\/api\/health's/.test(v.name))).toBe(false);
  });
});
