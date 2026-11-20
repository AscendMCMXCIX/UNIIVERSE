import { describe, expect, it } from "vitest";
import { cardLookFor } from "@/domain/card-style";
import type { LeaderboardGame, LeaderboardMastery } from "@/domain/leaderboards";
import { formatCompactCount, formatCount } from "@/lib/format";
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
    {"id": "kills", "label": "Most kills in a game", "definition": "", "holder": {"playerId": "ash", "value": "18", "unit": "kills", "championId": "Zed", "role": "MID", "kda": "18/2/7", "when": "2 Sep 2026", "href": "/players/ash/matches?match=OC1_001"}, "yours": {"playerId": "bo", "value": "4", "unit": "kills", "championId": "Leona", "role": "SUPPORT", "kda": "4/4/6", "when": "6 Sep 2026", "href": "/players/bo/matches?match=OC1_029"}},
    {"id": "assists", "label": "Most assists in a game", "definition": "", "holder": {"playerId": "bo", "value": "24", "unit": "assists", "championId": "Thresh", "role": "SUPPORT", "kda": "1/3/24", "when": "4 Sep 2026", "href": "/players/bo/matches?match=OC1_027"}, "yours": null},
    {"id": "damage-per-minute", "label": "Most damage per minute", "definition": "Damage to champions, in a game of 15 minutes or more.", "holder": {"playerId": "cy", "value": "1,640", "unit": "damage/min", "championId": "Jinx", "role": "ADC", "kda": "9/1/4", "when": "7 Sep 2026", "href": "/players/cy/matches?match=OC1_030"}, "yours": {"playerId": "bo", "value": "667", "unit": "damage/min", "championId": "Thresh", "role": "SUPPORT", "kda": "2/0/10", "when": "5 Sep 2026", "href": "/players/bo/matches?match=OC1_028"}},
    {"id": "cs-per-minute", "label": "Most CS per minute", "definition": "Lane minions and monsters, in a game of 15 minutes or more.", "holder": {"playerId": "cy", "value": "9.8", "unit": "CS/min", "championId": "Jinx", "role": "ADC", "kda": "9/1/4", "when": "7 Sep 2026", "href": "/players/cy/matches?match=OC1_030"}, "yours": {"playerId": "bo", "value": "6.7", "unit": "CS/min", "championId": "Thresh", "role": "SUPPORT", "kda": "2/0/10", "when": "5 Sep 2026", "href": "/players/bo/matches?match=OC1_028"}},
    {"id": "vision-per-minute", "label": "Most vision per minute", "definition": "Vision score, in a game of 15 minutes or more.", "holder": {"playerId": "bo", "value": "3.20", "unit": "vision/min", "championId": "Thresh", "role": "SUPPORT", "kda": "1/3/24", "when": "4 Sep 2026", "href": "/players/bo/matches?match=OC1_027"}, "yours": null},
    {"id": "kda", "label": "Best KDA in a game", "definition": "(Kills + assists) ÷ deaths, in a game with 10 or more takedowns; no deaths counts as one.", "holder": {"playerId": "cy", "value": "13.0", "unit": "KDA", "championId": "Jinx", "role": "ADC", "kda": "9/1/4", "when": "7 Sep 2026", "href": "/players/cy/matches?match=OC1_030"}, "yours": {"playerId": "bo", "value": "12.0", "unit": "KDA", "championId": "Thresh", "role": "SUPPORT", "kda": "2/0/10", "when": "5 Sep 2026", "href": "/players/bo/matches?match=OC1_028"}},
    {"id": "win-streak", "label": "Longest win streak", "definition": "In the order the games were played.", "holder": {"playerId": "ash", "value": "5", "unit": "wins in a row", "championId": null, "role": null, "kda": null, "when": "5 Sep 2026", "href": null}, "yours": {"playerId": "bo", "value": "2", "unit": "wins in a row", "championId": null, "role": null, "kda": null, "when": "5 Sep 2026", "href": null}},
  ],
  multikills: [{"playerId": "ash", "penta": 1, "quadra": 1, "triple": 1}, {"playerId": "bo", "penta": 0, "quadra": 1, "triple": 2}, {"playerId": "cy", "penta": 0, "quadra": 0, "triple": 3}],
  multikillNote: "From the 31 of 32 games this season that carry Riot's multikill figures; the others are left out, not counted as zero.",
  championGames: [{"playerId": "ash", "items": [{"championId": "Riven", "value": "25 games", "milestone": "25+ games", "tier": 1}], "more": 0}],
  mastery: [{"playerId": "ash", "items": [{"championId": "Riven", "value": "1.2M points", "milestone": "1M+", "tier": 3}, {"championId": "Zed", "value": "486K points", "milestone": "100K+", "tier": 1}, {"championId": "Yasuo", "value": "333K points", "milestone": "100K+", "tier": 1}], "more": 2}, {"playerId": "bo", "items": [{"championId": "Thresh", "value": "512K points", "milestone": "500K+", "tier": 2}], "more": 0}, {"playerId": "cy", "items": [{"championId": "Jinx", "value": "510K points", "milestone": "500K+", "tier": 2}], "more": 0}],
};
/** The view without what later changes add: each record's qualifier, each milestone's short figure, the multikills' short note. */
const withoutAdditions = ({ multikillShort: _m, ...r }: RecordsView) => ({
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
    expect(current.records.multikills).toEqual([]);
    expect(earlier.records.multikills.length).toBeGreaterThan(0);
    expect(current.records.championGames).toEqual([]);
    expect(earlier.records.championGames.map((g) => g.playerId)).toEqual(["ash"]);
    expect(earlier.records.mastery).toEqual(current.records.mastery);
    expect(current.records.mastery.length).toBeGreaterThan(0);
    // Each season's address names it, but for the current one.
    expect(current.records.seasons.map((x) => x.href)).toEqual(["/leaderboards?season=16", "/leaderboards"]);
  });
});

describe("Records & achievements' display fields", () => {
  it("leave every figure, holder, game, date, link, multikill and milestone exactly as before", () => {
    expect(withoutAdditions(records("bo"))).toEqual(BEFORE);
    // The same team for a viewer off the board: no best of their own, nothing else changes.
    const off = withoutAdditions(records(null));
    expect(off).toEqual({ ...BEFORE, records: BEFORE.records.map((r) => ({ ...r, yours: null })) });
    // The public boards: the same figures, opening no game.
    const open = withoutAdditions(records(null, false));
    expect(open).toEqual({ ...BEFORE, seasons: [{ ...BEFORE.seasons[0]!, href: "/public/leaderboards" }], records: BEFORE.records.map((r) => ({ ...r, yours: null, holder: r.holder ? { ...r.holder, href: null } : null })) });
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
