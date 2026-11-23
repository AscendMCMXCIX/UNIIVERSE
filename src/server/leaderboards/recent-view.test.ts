import { describe, expect, it } from "vitest";
import { cardLookFor } from "@/domain/card-style";
import type { LeaderboardGame, LeaderboardMastery } from "@/domain/leaderboards";
import { formatCompactCount, formatCount } from "@/lib/format";
import { buildMultikillBaseline } from "@/domain/multikill-score";
import { buildFormView, buildLeaderboardsView, buildRecordsView, leaderboardsHref, parseLeaderboardsQuery, RECORD_QUALIFIERS, type RecordsView } from "./recent-view";
import type { LeaderboardData } from "./service";

describe("the Leaderboards' addresses", () => {
  it("reads the records' season from the address, and nothing from a retired view", () => {
    expect(parseLeaderboardsQuery({})).toEqual({ season: null });
    expect(parseLeaderboardsQuery({ season: "15" })).toEqual({ season: "15" });
    expect(parseLeaderboardsQuery({ season: ["15", "16"] })).toEqual({ season: "15" });
    // Records & achievements' old address (?view=records) asks the server for nothing: one page either way.
    expect(parseLeaderboardsQuery({ view: "records", season: "15" })).toEqual({ season: "15" });
    expect(parseLeaderboardsQuery({ view: "anything" })).toEqual({ season: null });
  });

  it("writes the page's address, the season only when it is not the current one, and never a view", () => {
    expect(leaderboardsHref(null)).toBe("/leaderboards");
    expect(leaderboardsHref(15)).toBe("/leaderboards?season=15");
    expect(leaderboardsHref(15, { basePath: "/public/leaderboards" })).toBe("/public/leaderboards?season=15");
  });
});

/*
  Records & achievements as the page receives it, on a fixed team: three members whose Season 2026
  games (game version 16) set every record, with multikills, a champion on 25 games, mastery at each
  milestone, a game without Riot's multikill figures and one of the season before. Fixed instants,
  so the dates read the same in any year.
*/
const T0 = Date.UTC(2026, 8, 1, 10);
const DAY = 86_400_000;
function fixture(): LeaderboardData {
  let seq = 0;
  const game = (playerId: string, day: number, o: Partial<LeaderboardGame> = {}): LeaderboardGame => {
    seq += 1;
    return { matchId: `OC1_${String(seq).padStart(3, "0")}`, playerId, championId: "Ahri", role: "MID", queueId: 420, patch: "16.18", win: true, gameCreation: T0 + day * DAY + seq * 60_000, durationS: 1800, kills: 4, deaths: 4, assists: 6, cs: 200, damage: 20_000, vision: 30, gold: 11_000, wardsPlaced: 10, teamKills: 20, teamDamage: 80_000, extra: { doubleKills: 1, tripleKills: 0, quadraKills: 0, pentaKills: 0 }, ...o };
  };
  const games: LeaderboardGame[] = [];
  // Ash: the kills record on Zed, a pentakill, Riven on 25 games, five wins in a row.
  games.push(game("ash", 1, { championId: "Zed", kills: 18, deaths: 2, assists: 7, extra: { doubleKills: 3, tripleKills: 1, quadraKills: 1, pentaKills: 1 } }));
  for (let i = 0; i < 25; i++) games.push(game("ash", 2 + i * 0.5, { championId: "Riven", role: "TOP", win: i % 5 !== 4 }));
  // Bo: assists and vision on Thresh, a 12-takedown game without a death, a quadra kill.
  games.push(game("bo", 3, { championId: "Thresh", role: "SUPPORT", kills: 1, deaths: 3, assists: 24, vision: 96, damage: 9_000, cs: 40 }));
  games.push(game("bo", 4, { championId: "Thresh", role: "SUPPORT", kills: 2, deaths: 0, assists: 10, vision: 70, extra: { doubleKills: 2, tripleKills: 2, quadraKills: 1, pentaKills: 0 } }));
  games.push(game("bo", 5, { championId: "Leona", role: "SUPPORT", win: false }));
  // Cy: damage, CS and KDA on Jinx in 25 minutes; a 14-minute stomp sets nothing per minute.
  games.push(game("cy", 6, { championId: "Jinx", role: "ADC", durationS: 1500, damage: 41_000, cs: 245, kills: 9, deaths: 1, assists: 4, extra: { doubleKills: 2, tripleKills: 3, quadraKills: 0, pentaKills: 0 } }));
  games.push(game("cy", 7, { championId: "Jinx", role: "ADC", durationS: 840, damage: 30_000, cs: 160 }));
  games.push(game("cy", 8, { championId: "Kai'Sa", role: "ADC", extra: null, win: false }));
  games.push(game("cy", -400, { patch: "15.20", kills: 30 }));
  const mastery: LeaderboardMastery[] = [
    { playerId: "ash", championId: "Riven", points: 1_204_500 },
    { playerId: "ash", championId: "Zed", points: 486_400 },
    { playerId: "ash", championId: "Yasuo", points: 333_000 },
    { playerId: "ash", championId: "Yone", points: 288_100 },
    { playerId: "ash", championId: "Akali", points: 150_000 },
    { playerId: "bo", championId: "Thresh", points: 512_000 },
    { playerId: "bo", championId: "Leona", points: 99_999 },
    { playerId: "cy", championId: "Jinx", points: 260_000 },
    { playerId: "cy", championId: "Jinx", points: 250_000 },
  ];
  const player = (id: string, name: string) => ({ id, name, avatarUrl: null, look: cardLookFor({ id }), art: null, rank: null, primaryRole: null });
  return { players: [player("ash", "Ash"), player("bo", "Bo"), player("cy", "Cy")], games, mastery, lineupIds: ["ash", "bo", "cy"], currentSeason: 16, seasons: [16], lastUpdated: null, extraSince: null, rawGames: 0 };
}
const NOW = new Date(T0 + 60 * DAY);
const records = (viewer: string | null, profiles = true) => buildLeaderboardsView(fixture(), {}, viewer, { now: NOW, profiles, basePath: profiles ? "/leaderboards" : "/public/leaderboards" }).records;

/**
 * Records as main sent them before the qualifiers and the chips' short figures (b9528fbf), for Bo,
 * who holds two records and has a best on four others; the season's address is the page's own since
 * the records joined Recent form on one page (it was "/leaderboards?view=records").
 */
const BEFORE = {
  season: 16,
  seasonLabel: "Season 2026",
  seasons: [{"value": 16, "label": "Season 2026", "href": "/leaderboards"}],
  games: 32,
  records: [
    {"id": "kills", "label": "Most kills in a game", "definition": "", "holder": {"playerId": "ash", "value": "18", "unit": "kills", "championId": "Zed", "role": "MID", "kda": "18/2/7", "when": "2 Sep 2026", "href": "/leaderboards?match=OC1_001", "game": {"matchId": "OC1_001", "historyHref": "/players/ash/matches?match=OC1_001"}}, "yours": {"playerId": "bo", "value": "4", "unit": "kills", "championId": "Leona", "role": "SUPPORT", "kda": "4/4/6", "when": "6 Sep 2026", "href": "/leaderboards?match=OC1_029", "game": {"matchId": "OC1_029", "historyHref": "/players/bo/matches?match=OC1_029"}}},
    {"id": "assists", "label": "Most assists in a game", "definition": "", "holder": {"playerId": "bo", "value": "24", "unit": "assists", "championId": "Thresh", "role": "SUPPORT", "kda": "1/3/24", "when": "4 Sep 2026", "href": "/leaderboards?match=OC1_027", "game": {"matchId": "OC1_027", "historyHref": "/players/bo/matches?match=OC1_027"}}, "yours": null},
    {"id": "damage-per-minute", "label": "Most damage per minute", "definition": "Damage to champions, in a game of 15 minutes or more.", "holder": {"playerId": "cy", "value": "1,640", "unit": "damage/min", "championId": "Jinx", "role": "ADC", "kda": "9/1/4", "when": "7 Sep 2026", "href": "/leaderboards?match=OC1_030", "game": {"matchId": "OC1_030", "historyHref": "/players/cy/matches?match=OC1_030"}}, "yours": {"playerId": "bo", "value": "667", "unit": "damage/min", "championId": "Thresh", "role": "SUPPORT", "kda": "2/0/10", "when": "5 Sep 2026", "href": "/leaderboards?match=OC1_028", "game": {"matchId": "OC1_028", "historyHref": "/players/bo/matches?match=OC1_028"}}},
    {"id": "cs-per-minute", "label": "Most CS per minute", "definition": "Lane minions and monsters, in a game of 15 minutes or more.", "holder": {"playerId": "cy", "value": "9.8", "unit": "CS/min", "championId": "Jinx", "role": "ADC", "kda": "9/1/4", "when": "7 Sep 2026", "href": "/leaderboards?match=OC1_030", "game": {"matchId": "OC1_030", "historyHref": "/players/cy/matches?match=OC1_030"}}, "yours": {"playerId": "bo", "value": "6.7", "unit": "CS/min", "championId": "Thresh", "role": "SUPPORT", "kda": "2/0/10", "when": "5 Sep 2026", "href": "/leaderboards?match=OC1_028", "game": {"matchId": "OC1_028", "historyHref": "/players/bo/matches?match=OC1_028"}}},
    {"id": "vision-per-minute", "label": "Most vision per minute", "definition": "Vision score, in a game of 15 minutes or more.", "holder": {"playerId": "bo", "value": "3.20", "unit": "vision/min", "championId": "Thresh", "role": "SUPPORT", "kda": "1/3/24", "when": "4 Sep 2026", "href": "/leaderboards?match=OC1_027", "game": {"matchId": "OC1_027", "historyHref": "/players/bo/matches?match=OC1_027"}}, "yours": null},
    {"id": "kda", "label": "Best KDA in a game", "definition": "(Kills + assists) ÷ deaths, in a game with 10 or more takedowns; no deaths counts as one.", "holder": {"playerId": "cy", "value": "13.0", "unit": "KDA", "championId": "Jinx", "role": "ADC", "kda": "9/1/4", "when": "7 Sep 2026", "href": "/leaderboards?match=OC1_030", "game": {"matchId": "OC1_030", "historyHref": "/players/cy/matches?match=OC1_030"}}, "yours": {"playerId": "bo", "value": "12.0", "unit": "KDA", "championId": "Thresh", "role": "SUPPORT", "kda": "2/0/10", "when": "5 Sep 2026", "href": "/leaderboards?match=OC1_028", "game": {"matchId": "OC1_028", "historyHref": "/players/bo/matches?match=OC1_028"}}},
    {"id": "win-streak", "label": "Longest win streak", "definition": "In the order the games were played.", "holder": {"playerId": "ash", "value": "5", "unit": "wins in a row", "championId": null, "role": null, "kda": null, "when": "5 Sep 2026", "href": null, "game": null}, "yours": {"playerId": "bo", "value": "2", "unit": "wins in a row", "championId": null, "role": null, "kda": null, "when": "5 Sep 2026", "href": null, "game": null}},
  ],
  multikillNote: "Counted from 31 of 32 games this season; the rest are left out, never counted as zero.",
  championGames: [{"playerId": "ash", "items": [{"championId": "Riven", "value": "25 games", "milestone": "25+ games", "tier": 1}], "more": 0}],
  mastery: [{"playerId": "ash", "items": [{"championId": "Riven", "value": "1.2M points", "milestone": "1M+", "tier": 3}, {"championId": "Zed", "value": "486K points", "milestone": "100K+", "tier": 1}, {"championId": "Yasuo", "value": "333K points", "milestone": "100K+", "tier": 1}], "more": 2}, {"playerId": "bo", "items": [{"championId": "Thresh", "value": "512K points", "milestone": "500K+", "tier": 2}], "more": 0}, {"playerId": "cy", "items": [{"championId": "Jinx", "value": "510K points", "milestone": "500K+", "tier": 2}], "more": 0}],
};
/**
 * The view without what later changes add: each record's qualifier, each milestone's short figure, the multikills' short note,
 * and the multikill board, which the multikill score replaced (Release 15: its own tests below; it was a tally of triple,
 * quadra and pentakills, rarest first).
 */
const withoutAdditions = ({ multikillShort: _m, multikills: _b, ...r }: RecordsView) => ({
  ...r,
  records: r.records.map(({ qualifier: _q, ...rest }) => rest),
  championGames: r.championGames.map((g) => ({ ...g, items: g.items.map(({ short: _s, ...rest }) => rest) })),
  mastery: r.mastery.map((g) => ({ ...g, items: g.items.map(({ short: _s, ...rest }) => rest) })),
});

describe("one page from one load", () => {
  it("builds Recent form and the season's records together, each the same as built alone", () => {
    const data = fixture();
    const page = buildLeaderboardsView(data, {}, "bo", { now: NOW });
    expect(page.form).toEqual(buildFormView(data, "bo", { now: NOW }));
    expect(page.records).toEqual(buildRecordsView(data, {}, "bo", { now: NOW }));
    expect(page.playerCount).toBe(3);
    expect(page.viewer).toBe("bo");
    expect(Object.keys(page.players)).toEqual(["ash", "bo", "cy"]);
    // The fixture's members have games in the window: Recent form has rows, not only the empty state.
    expect(page.form.rows.length + page.form.notEnough.length).toBe(3);
  });

  it("gives the season to the records alone: Recent form counts the last 60 days whatever season the address names", () => {
    const data = { ...fixture(), seasons: [16, 17], currentSeason: 17 };
    const current = buildLeaderboardsView(data, {}, null, { now: NOW });
    const earlier = buildLeaderboardsView(data, { season: "16" }, null, { now: NOW });
    expect(current.records.season).toBe(17);
    expect(earlier.records.season).toBe(16);
    expect(earlier.records.games).toBeGreaterThan(current.records.games);
    expect(earlier.form).toEqual(current.form);
    // The multikills and the games on one champion follow the season the records name (the new season has no games yet);
    // mastery is all-time, the same in either. The season's choice stands in the records' title row only, and changes all three.
    expect(current.records.multikills.rows).toEqual([]);
    expect(earlier.records.multikills.rows.length).toBeGreaterThan(0);
    expect(current.records.championGames).toEqual([]);
    expect(earlier.records.championGames.map((g) => g.playerId)).toEqual(["ash"]);
    expect(earlier.records.mastery).toEqual(current.records.mastery);
    expect(current.records.mastery.length).toBeGreaterThan(0);
    // Each season's address names it, but for the current one.
    expect(current.records.seasons.map((x) => x.href)).toEqual(["/leaderboards?season=16", "/leaderboards"]);
  });
});

describe("Records & achievements' display fields", () => {
  it("leave every figure, holder, game, date, link and milestone exactly as before", () => {
    expect(withoutAdditions(records("bo"))).toEqual(BEFORE);
    // The same team for a viewer off the board: no best of their own, nothing else changes.
    const off = withoutAdditions(records(null));
    expect(off).toEqual({ ...BEFORE, records: BEFORE.records.map((r) => ({ ...r, yours: null })) });
    // The public boards: the same figures, opening no game.
    const open = withoutAdditions(records(null, false));
    expect(open).toEqual({ ...BEFORE, seasons: [{ ...BEFORE.seasons[0]!, href: "/public/leaderboards" }], records: BEFORE.records.map((r) => ({ ...r, yours: null, holder: r.holder ? { ...r.holder, href: null, game: null } : null })) });
  });

  it("give each record the qualifier its row shows, from the rules' own thresholds", () => {
    expect(records("bo").records.map((r) => [r.id, r.qualifier])).toEqual([
      ["kills", null],
      ["assists", null],
      ["damage-per-minute", "to champions · 15+ min games"],
      ["cs-per-minute", "15+ min games"],
      ["vision-per-minute", "15+ min games"],
      ["kda", "10+ takedowns"],
      ["win-streak", "in game order"],
    ]);
    expect(Object.keys(RECORD_QUALIFIERS)).toHaveLength(7);
  });

  it("shorten each milestone for its chip through format.ts: 486K, 1.2M, 25", () => {
    const r = records("bo");
    expect(r.mastery.map((g) => g.items.map((i) => i.short))).toEqual([["1.2M", "486K", "333K"], ["512K"], ["510K"]]);
    expect(r.mastery.flatMap((g) => g.items).every((i) => i.value === `${i.short} points`)).toBe(true);
    expect(r.championGames.flatMap((g) => g.items).map((i) => [i.short, i.value])).toEqual([["25", "25 games"]]);
    // The same functions the words come from.
    expect([formatCompactCount(486_400), formatCompactCount(1_204_500), formatCount(25)]).toEqual(["486K", "1.2M", "25"]);
  });
});

describe("the multikill board on the fixed team", () => {
  /*
    No comparison players stored (no baseline given), so the members are compared with the team's
    own 31 games with counts, every position together, and the board says so. The team's events,
    each multikill once at its largest (fewer than 20 games with a triple: nested assumed): 30
    doubles, 4 triples, 1 quadra, 1 penta. Ash's 26 games expect 25.2, 3.4, 0.8, 0.8 (67.9 kill
    points); Ash made 27 doubles and the pentakill (59 points: Riot's counters, nested, also hold
    that pentakill's double, triple and quadra) → 100 × (59 + 40) ÷ (67.9 + 40) = 92, ±12 by chance.
  */
  it("ranks Ash (26 games: score 92, each multikill once in words); Bo and Cy, under 10 games with counts, have no score", () => {
    const m = records("bo").multikills;
    expect(m.source).toBe("team");
    expect(m.rows.map((r) => [r.playerId, r.status, r.place, r.score, r.gamesText])).toEqual([
      ["ash", "ranked", 1, "92", "26 games"],
      ["bo", "not-enough", null, null, "3 games"],
      ["cy", "not-enough", null, null, "2/3 games"],
    ]);
    expect(m.rows[2]!.gamesSpoken).toBe("2 of 3 games with multikill counts");
    const ash = m.rows[0]!;
    // Shown: each multikill once (the pentakill is not also a double, a triple and a quadra); Riot's counters kept for the record.
    expect(ash.counts).toEqual({ double: 27, triple: 0, quadra: 0, penta: 1 });
    expect(ash.riot).toEqual({ double: 28, triple: 1, quadra: 1, penta: 1 });
    expect(ash.kinds.map((k) => k.text)).toEqual(["1 penta", "27 doubles"]);
    expect(ash.breakdown).toBe("Score 92 from 26 games, give or take about 12 by chance. Each multikill once, at its largest, with the number usual at the team's rate in brackets: 27 doubles (25), no triples (3.4), no quadras (0.8), 1 penta (0.8).");
    expect(ash.detail).toEqual({
      score: "92",
      status: "ranked",
      gamesText: "26 games",
      chance: "±12",
      kinds: [
        { key: "double", label: "Doubles", made: "27", usual: "25" },
        { key: "triple", label: "Triples", made: "0", usual: "3.4" },
        { key: "quadra", label: "Quadras", made: "0", usual: "0.8" },
        { key: "penta", label: "Pentas", made: "1", usual: "0.8" },
      ],
      note: null,
      usualIs: "usual at the team's rate",
    });
    expect(m.rows.find((r) => r.playerId === "bo")!.you).toBe(true);
    const cy = m.rows.find((r) => r.playerId === "cy")!;
    expect(cy.breakdown).toBe("2 games with multikill counts: a score needs 10.");
    expect(cy.detail).toMatchObject({ score: null, chance: null, note: "2 games with multikill counts: a score needs 10.", gamesText: "2 of 3 games with counts" });
    // Cy's nested reading of {2, 3, 0, 0} and {1, 0, 0, 0}: 3 triples and 1 double, never below zero.
    expect(cy.counts).toEqual({ double: 1, triple: 3, quadra: 0, penta: 0 });
  });

  it("names the most of each kind, each multikill once, every holder of a shared one", () => {
    expect(records(null).multikills.most).toEqual([
      { key: "double", label: "Most doubles", count: "27", holders: ["ash"] },
      { key: "triple", label: "Most triples", count: "3", holders: ["cy"] },
      // Ash's quadra counter was the pentakill's own: one quadra on the board, Bo's.
      { key: "quadra", label: "Most quadras", count: "1", holders: ["bo"] },
      { key: "penta", label: "Most pentas", count: "1", holders: ["ash"] },
    ]);
  });

  it("says what the score is in a few words, and how it works in three short plain points (the team's games: not by role)", () => {
    const m = records(null).multikills;
    expect(m.basis).toBe("Per game, against the team's own games · 100 is the team's usual");
    expect(m.explain).toHaveLength(3);
    expect(m.explain[0]).toContain("not adjusted for role or champion");
    expect(m.explain[1]).toBe("How it counts: each multikill once, at its largest, worth its kills (a double kill 2, a pentakill 5), so rarer kinds count for more. Riot's own counters may also count a big multikill's smaller ones; this board assumes they do, so none counts twice.");
    expect(m.explain[2]).toMatch(/^How sure it is: luck alone moves a score by about ±(\d+) over 50 games and ±\d+ over 300 \(more for roles that make fewer multikills, like support\), so two scores within about (\d+) of each other could swap by luck\. With few games a score leans toward 100, so a short record can't top the board on one lucky run\. A place needs 20 games with multikill counts; 10–19 are provisional\.$/);
    // The swap range is the spread of two scores' difference: about √2 × one score's.
    const [, one, two] = /about ±(\d+) over 50.*within about (\d+) of each other/.exec(m.explain[2]!)!;
    expect(Math.abs(Number(two) - Math.SQRT2 * Number(one))).toBeLessThanOrEqual(1.5);
  });

  it("compares with the other players in the same games once they hold 1,000 games, saying how many of their games", () => {
    const row = (position: string, games: number, d: number) => ({ position, championId: "Other", games, nested: { double: d, triple: d / 10, quadra: d / 50, penta: d / 250 }, separate: { double: d, triple: d / 10, quadra: d / 50, penta: d / 250 } });
    const multikillBaseline = buildMultikillBaseline([row("TOP", 3000, 1200), row("MIDDLE", 3000, 1650), row("UTILITY", 3000, 450), row("BOTTOM", 3000, 1800)], { withTriple: 900, outOfOrder: 0 });
    const m = buildLeaderboardsView(fixture(), {}, null, { now: NOW, multikillBaseline }).records.multikills;
    expect(m.source).toBe("same-games");
    expect(m.basis).toBe("Per game, against the same roles and champions · 100 is usual");
    expect(m.explain[0]).toBe("What it is: each member's multikills per game against what the other players in the same games made on the same roles and champions (allies and opponents, never a team member: 12,000 of their games). 100 is usual; 130 is about 30% more.");
    expect(m.explain[1]).toContain("Riot's own counters also count a pentakill's double, triple and quadra; this board counts and shows each multikill once.");
    // Ash's 25 Riven games are top games, the Zed game a mid game: every game compared within its role.
    expect(m.rows[0]!.breakdown).toMatch(/^Score \d+ from 26 games, give or take about \d+ by chance\. Each multikill once, at its largest, with the number usual for their roles and champions in brackets: /);
    expect(m.rows[0]!.breakdown).not.toContain("Compared by role in");
    expect(m.rows[0]!.detail.usualIs).toBe("usual for their roles and champions");
  });
});
