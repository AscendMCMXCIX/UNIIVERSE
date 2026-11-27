import { describe, expect, it } from "vitest";
import { MATCHUP_READ, matchupVerdicts, type MatchupRead } from "../../../scripts/matchup-facts.mjs";
import { refusedSources } from "@/domain/matchup/refused-words-list.mjs";
import { textProblems, validateNote, type NoteInput } from "@/domain/matchup/notes";
import { LONGEST_POINTS } from "@/server/matchup/longest-notes";

/*
  The Production check's Matchup Intel facts (scripts/matchup-facts.mjs): the reading below is the
  demo's Ahri against Zed in Mid as the live check's own reader sees it (27 Nov 2026: three blocks,
  14 Solo/Duo games, a fresh opponent note). The facts pass on it, on the honest lines of a pair with
  few games or none, and fail the regressions they exist for.
*/

const AT: MatchupRead = {
  size: "1440x900",
  innerHeight: 900,
  url: "/lookup?champion=Ahri&champion2=Zed&lane=MID",
  band: true,
  bandLane: "MID",
  a: "Ahri",
  b: "Zed",
  champion: "Ahri",
  secondChampion: "Zed",
  sides: ["Playing", "Against"],
  lanePressed: "MID",
  headings: ["Reviewed notes", "In the team's matches", "From Riot's data"],
  ranges: ["550", "125"],
  kit: [
    { key: "attackrange", values: "550,125", more: "Ahri", words: "425 more for Ahri" },
    { key: "movespeed", values: "330,345", more: "Zed", words: "15 more for Zed" },
    { key: "hp", values: "590,654", more: "Zed", words: "64 more for Zed" },
    { key: "armor", values: "21,32", more: "Zed", words: "11 more for Zed" },
    { key: "spellblock", values: "30,29", more: "Ahri", words: "1 more for Ahri" },
  ],
  team: { state: "shown", games: 14, queue: "solo", ahead: { n: 10, of: 14, low: 0.4535, high: 0.8828, words: "10 of 14 · 71% (45–88%)" }, won: { n: 4, of: 14, low: 0.1172, high: 0.5465, words: "4 of 14 · 29% (12–55%)" }, percents: 4, line: "" },
  notes: { state: "shown", shown: [{ freshness: "fresh", reviewed: "26.22" }], hidden: [], meta: "Patch 26.22" },
  verdictWords: false,
  verdictWord: null,
  identity: false,
  bandBottom: 300,
  lastBottom: 840,
  scrollers: 0,
};
const SWAPPED: MatchupRead = {
  ...AT,
  url: "/lookup?champion=Zed&champion2=Ahri&lane=MID",
  a: "Zed",
  b: "Ahri",
  champion: "Zed",
  secondChampion: "Ahri",
  ranges: ["125", "550"],
  kit: AT.kit.map((l) => ({ ...l, values: l.values!.split(",").reverse().join(",") })),
};
const failed = (over: Partial<Parameters<typeof matchupVerdicts>[0]>) => matchupVerdicts({ at: AT, swapped: SWAPPED, healthPatch: "16.22", ...over }).filter((v) => v.status !== "PASS");

describe("Matchup Intel's facts in the Production check", () => {
  it("pass on the demo's pair and its swap", () => {
    expect(failed({})).toEqual([]);
  });

  it("pass on the honest lines: a pair with few games or none, no notes, a viewer without teammates' statistics", () => {
    expect(failed({ at: { ...AT, team: { state: "few", games: 4, queue: "solo", ahead: null, won: null, percents: 0, line: "4 games in the team's matches (Ranked Solo/Duo, Season 2026). Figures show from 10." } } })).toEqual([]);
    expect(failed({ at: { ...AT, team: { state: "none", games: 0, queue: "solo", ahead: null, won: null, percents: 0, line: "No Ranked Solo/Duo games of Ahri vs Zed in Mid in the team's matches yet." }, notes: { state: "none", shown: [], hidden: [], meta: "" } } })).toEqual([]);
    expect(failed({ at: { ...AT, headings: ["Reviewed notes", "From Riot's data"], team: null }, mayStats: false })).toEqual([]);
    expect(failed({ at: { ...AT, notes: { state: "none", shown: [{ freshness: "stale", reviewed: "26.20" }], hidden: [{ freshness: "hidden-changed", words: "A reviewed note is hidden: Riot's data for Zed changed after its review on 26.21." }], meta: "Reviewed on 26.20 · not re-checked for 26.22" } } })).toEqual([]);
  });

  it("fail a percentage from fewer than 10 games, a share without its range, a pooled queue", () => {
    expect(failed({ at: { ...AT, team: { ...AT.team!, state: "few", games: 6, percents: 2 } } })).toHaveLength(1);
    expect(failed({ at: { ...AT, team: { ...AT.team!, ahead: { ...AT.team!.ahead!, words: "10 of 14 · 71%" } } } })).toHaveLength(1);
    expect(failed({ at: { ...AT, team: { ...AT.team!, games: 9 } } })).not.toEqual([]);
    // A share read without its range (no data-low/data-high on the page: the result's line until 27 Nov 2026) is not passed.
    expect(failed({ at: { ...AT, team: { ...AT.team!, won: { ...AT.team!.won!, low: Number.NaN, high: Number.NaN } } } })).toHaveLength(1);
    expect(failed({ at: { ...AT, team: { ...AT.team!, queue: "flex" } } })).toHaveLength(1);
  });

  it("fail a difference that is not the columns' own, a verdict word, a player named, a missing block or label", () => {
    expect(failed({ at: { ...AT, kit: [{ ...AT.kit[0]!, words: "425 more for Zed", more: "Zed" }, ...AT.kit.slice(1)] } }).length).toBeGreaterThanOrEqual(1);
    expect(failed({ at: { ...AT, ranges: ["525", "125"] } }).length).toBeGreaterThanOrEqual(1);
    expect(failed({ at: { ...AT, kit: [{ ...AT.kit[1]!, values: "345,345", words: "faster for Zed", more: "Zed" }] } }).length).toBeGreaterThanOrEqual(1);
    expect(failed({ at: { ...AT, verdictWords: true, verdictWord: "faster" } })).toHaveLength(1);
    // The words not handed to the page reader: not read, so not passed.
    expect(failed({ at: { ...AT, verdictWords: null } })).toHaveLength(1);
    expect(failed({ swapped: { ...SWAPPED, verdictWords: null } })).toHaveLength(1);
    expect(failed({ at: { ...AT, identity: true } })).toHaveLength(1);
    expect(failed({ at: { ...AT, headings: ["From Riot's data"] } })).toHaveLength(1);
    expect(failed({ at: { ...AT, sides: ["", ""] } })).toHaveLength(1);
    expect(failed({ at: { ...AT, notes: { state: "shown", shown: [{ freshness: "stale", reviewed: "26.20" }], hidden: [], meta: "Patch 26.20" } } })).toHaveLength(1);
  });

  it("fail the one screen when an ability is below the fold or something scrolls inside, and a Swap that loses the lane or the direction", () => {
    expect(failed({ at: { ...AT, lastBottom: 920 } })).toHaveLength(1);
    expect(failed({ at: { ...AT, scrollers: 1 } })).toHaveLength(1);
    expect(failed({ swapped: { ...SWAPPED, url: "/lookup?champion=Zed&champion2=Ahri" } })).toHaveLength(1);
    expect(failed({ swapped: { ...SWAPPED, kit: AT.kit } })).toHaveLength(1);
    expect(failed({ swapped: undefined, stopped: "swap" })).toHaveLength(1);
  });
});

/** Whether the Production check's reader refuses a text: the patterns it is handed (MATCHUP_READ). */
const checkRefuses = (text: string) => MATCHUP_READ.refused.some((r) => new RegExp(r.source, MATCHUP_READ.flags).test(text));

describe("the verdict-words fact and the notes' save hold one list", () => {
  // 27 Nov 2026: the save's list and the check's pattern differed, so a note the editor accepted could fail the check.
  it("hands the page reader exactly the notes' refused words", () => {
    expect(MATCHUP_READ.refused).toEqual(refusedSources().map(({ word, source }) => ({ word, source })));
    expect(MATCHUP_READ.flags).toBe("iu");
  });

  it("refuses on save every word the check refuses, in a point and in a source's title", () => {
    for (const { word } of MATCHUP_READ.refused) {
      const form = word.replace(/\*$/, "ed").replace(/^(.)/, (c) => c.toUpperCase());
      const text = `${form} at level 2.`;
      expect(checkRefuses(text), word).toBe(true);
      expect(textProblems(text, []).length, word).toBeGreaterThan(0);
    }
    const ctx = { kits: { Zed: ["P", "Q", "W", "E", "R"], Ahri: ["P", "Q", "W", "E", "R"] }, roster: new Set(["Zed", "Ahri"]), names: [] };
    const note = (text: string, title = "Zed's abilities"): NoteInput => ({ scope: "opponent", role: "MID", opponentId: "Zed", championId: null, points: [{ text, refs: ["Zed.Q"], levels: null }], sources: [{ kind: "wiki", title, url: "", patch: "26.23" }] });
    for (const text of ["Zed's Q travels faster than Ahri's Q.", "Zed's W shadow is worse at range.", "Zed is outplayed when W is down.", "Riot recommends E first.", "Zed's R has a counter-attack window."]) {
      expect(checkRefuses(text), text).toBe(true);
      expect(validateNote(note(text), ctx).some((p) => p.field === "points.0"), text).toBe(true);
    }
    for (const title of ["How to counter Zed", "Best Zed guide"]) {
      expect(checkRefuses(title), title).toBe(true);
      expect(validateNote(note("Zed's Q is a skillshot.", title), ctx).some((p) => p.field === "sources.0.title"), title).toBe(true);
    }
  });

  it("passes what the save accepts: the demo's notes and the longest notes a note may hold", () => {
    const accepted = ["Zed's W leaves a shadow that repeats his Q and E, so those skillshots can come from two places at once.", "Zed's abilities cost energy, which refills over time rather than from mana items.", "Zed's R makes him untargetable as he moves behind his target and marks it.", ...LONGEST_POINTS.map((p) => p.text)];
    for (const text of accepted) {
      expect(textProblems(text, []), text).toEqual([]);
      expect(checkRefuses(text), text).toBe(false);
    }
    // The band's own words beside them.
    for (const text of ["Riven's side won", "Reviewed on 26.21 · not re-checked for 26.23", "A reviewed note is hidden: its review patch is no longer listed.", "15 more for Zed", "the same"]) expect(checkRefuses(text), text).toBe(false);
  });
});
