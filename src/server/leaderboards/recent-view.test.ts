import { describe, expect, it } from "vitest";
import { cardLookFor } from "@/domain/card-style";
import type { LeaderboardGame, LeaderboardMastery } from "@/domain/leaderboards";
import { formatCompactCount, formatCount } from "@/lib/format";
import { buildMultikillBaseline, MULTIKILL_CUSHION } from "@/domain/multikill-score";
import { buildFormView, buildLeaderboardsView, buildRecordsView, expectedPointsText, leaderboardsHref, parseLeaderboardsQuery, RECORD_QUALIFIERS, RECORD_SHORT, type RecordsView } from "./recent-view";
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
  so the dates read the same in any year. Every member is active at NOW (a game within 30 days and
  an account read the day before).
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
  const player = (id: string, name: string) => ({ id, name, avatarUrl: null, look: cardLookFor({ id }), art: null, rank: null, primaryRole: null, lastSyncedAt: T0 + 29 * DAY });
  return { players: [player("ash", "Ash"), player("bo", "Bo"), player("cy", "Cy")], games, mastery, lineupIds: ["ash", "bo", "cy"], currentSeason: 16, seasons: [16], lastUpdated: null, extraSince: null, rawGames: 0 };
}
const NOW = new Date(T0 + 30 * DAY);
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
};
/**
 * The view without what later changes add: each record's qualifier and short label, the multikills' short note, the
 * multikill board, which the multikill score replaced (Release 15: its own tests below; it was a tally of triple, quadra and
 * pentakills, rarest first), and the milestones, one list since 25 Nov 2026 (their own test below).
 */
const withoutAdditions = ({ multikillShort: _m, multikills: _b, milestones: _ms, ...r }: RecordsView) => ({
  ...r,
  records: r.records.map(({ qualifier: _q, short: _s, ...rest }) => rest),
});

describe("one page from one load", () => {
  it("builds Recent form and the season's records together, each the same as built alone", () => {
    const data = fixture();
    const page = buildLeaderboardsView(data, {}, "bo", { now: NOW });
    expect(page.form).toEqual(buildFormView(data, "bo", { now: NOW }));
    expect(page.records).toEqual(buildRecordsView(data, {}, "bo", { now: NOW }));
    expect(page.playerCount).toBe(3);
    expect(page.memberCount).toBe(3);
    expect(page.viewer).toBe("bo");
    expect(Object.keys(page.players)).toEqual(["ash", "bo", "cy"]);
    // Only a full window is listed on Recent form: Ash's 26 recent games; Bo and Cy, with 3 each, are not (no "not enough" group).
    expect(page.form.rows.map((r) => [r.playerId, r.place, r.status])).toEqual([["ash", 1, "established"]]);
    expect(page.form.window).toEqual({ games: 20, days: 60 });
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
    expect(current.records.milestones.items.filter((m) => m.kind === "games")).toEqual([]);
    expect(earlier.records.milestones.items.filter((m) => m.kind === "games").map((m) => m.playerId)).toEqual(["ash"]);
    expect(earlier.records.milestones.items.filter((m) => m.kind === "mastery")).toEqual(current.records.milestones.items.filter((m) => m.kind === "mastery"));
    expect(current.records.milestones.items.length).toBeGreaterThan(0);
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

  it("give each record a short label for the desktop's two-line cells, its full label kept", () => {
    expect(records("bo").records.map((r) => [r.label, r.short])).toEqual([
      ["Most kills in a game", "Most kills"],
      ["Most assists in a game", "Most assists"],
      ["Most damage per minute", "Damage per min"],
      ["Most CS per minute", "CS per min"],
      ["Most vision per minute", "Vision per min"],
      ["Best KDA in a game", "Best KDA"],
      ["Longest win streak", "Win streak"],
    ]);
    expect(Object.keys(RECORD_SHORT)).toHaveLength(7);
  });

  it("list the milestones most meaningful first, each player's best before anyone's second, the figures through format.ts", () => {
    const { items, more } = records("bo").milestones;
    // 1M mastery (the highest step) first; then each other player's best (500K steps, the further past it first); then Ash's next
    // ones by step, this season's games before all-time mastery within a step, then how far past it.
    expect(items.map((m) => [m.playerId, m.kind, m.championId, m.short, m.unit, m.milestone, m.tier])).toEqual([
      ["ash", "mastery", "Riven", "1.2M", "mastery", "1M+", 3],
      ["bo", "mastery", "Thresh", "512K", "mastery", "500K+", 2],
      ["cy", "mastery", "Jinx", "510K", "mastery", "500K+", 2],
      ["ash", "games", "Riven", "25", "games", "25+ games", 1],
      ["ash", "mastery", "Zed", "486K", "mastery", "100K+", 1],
      ["ash", "mastery", "Yasuo", "333K", "mastery", "100K+", 1],
      ["ash", "mastery", "Yone", "288K", "mastery", "100K+", 1],
      ["ash", "mastery", "Akali", "150K", "mastery", "100K+", 1],
    ]);
    expect(more).toBe(0);
    expect(items[0]!.value).toBe("1.2M mastery points");
    expect(items[3]!.value).toBe("25 games this season");
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
    Bo and Cy, with 3 games each, have no place: they are not listed (the team's comparison still
    counts their games).
  */
  it("lists Ash alone (26 games: score 92), each multikill once; Bo and Cy, under 20 games with counts, not at all", () => {
    const m = records("bo").multikills;
    expect(m.source).toBe("team");
    expect(m.rows.map((r) => [r.playerId, r.status, r.place, r.score, r.gamesText, r.gamesSpoken])).toEqual([["ash", "ranked", 1, "92", "26", "26 games with multikill counts"]]);
    const ash = m.rows[0]!;
    // Shown: each multikill once (the pentakill is not also a double, a triple and a quadra); Riot's counters kept for the record.
    expect(ash.counts).toEqual({ double: 27, triple: 0, quadra: 0, penta: 1 });
    expect(ash.riot).toEqual({ double: 28, triple: 1, quadra: 1, penta: 1 });
    expect(ash.you).toBe(false);
  });

  it("gives the Score breakdown every number from the score itself: points per kind, earned, typical, +40, the final line that gives the score", () => {
    const ash = records("bo").multikills.rows[0]!;
    const b = ash.breakdown;
    expect(b.score).toBe("92");
    expect(b.place).toBe("1st of 1");
    expect(b.games).toBe("26 games with multikill counts");
    expect(b.coverage).toBeNull();
    expect(b.kinds).toEqual([
      { key: "double", label: "Double kills", made: "27", weight: "2", points: "54" },
      { key: "triple", label: "Triple kills", made: "0", weight: "3", points: "0" },
      { key: "quadra", label: "Quadra kills", made: "0", weight: "4", points: "0" },
      { key: "penta", label: "Pentakills", made: "1", weight: "5", points: "5" },
    ]);
    expect(b.calculation).toEqual({ earned: "59", expected: "67.9", cushion: "40", score: "92" });
    // The final line, worked out from its own terms as shown, gives the score shown.
    const { earned, expected, cushion, score } = b.calculation;
    expect(Math.round((100 * (Number(earned) + Number(cushion))) / (Number(expected) + Number(cushion)))).toBe(Number(score));
    // Most played over the score's games: 25 Riven games on top, the Zed game in mid.
    expect(b.role).toEqual({
      kind: "role",
      roles: ["TOP"],
      label: "Most played: Top, 96% of 26 games",
      rows: [
        { role: "TOP", label: "Top", share: "96%", games: "25 games", text: "Top — 96% (25 games)" },
        { role: "MID", label: "Mid", share: "4%", games: "1 game", text: "Mid — 4% (1 game)" },
      ],
    });
    expect(b.champions).toEqual([
      { championId: "Riven", role: "TOP", games: "25 games" },
      { championId: "Zed", role: "MID", games: "1 game" },
    ]);
    // The team's own games: said plainly not to be champion- or role-adjusted.
    expect(b.comparison).toEqual([{ basis: "team", label: "The team's own games", games: "26 games" }]);
    expect(b.notAdjusted).toBe(true);
    expect(b.chance).toBe("±12");
    expect(ash.role).toEqual(b.role);
  });

  it("says what the score is ranked by, what earns points (the team's games: not by champion or role), and where typical comes from", () => {
    const m = records(null).multikills;
    expect(m.basis).toBe("Ranked by multikill performance relative to the team's own games.");
    expect(m.explain).toBe("Multikills earn 2–5 points. The score compares a player's points with the team's typical results, accounting for games played.");
    expect(m.sourceText).toBe("Typical results come from the team's own 31 games with multikill counts, every position together: too few other players' games are stored for a champion and role comparison.");
    expect(m.rule).toBe("nested");
    expect(m.ruleShown).toBe(false);
    expect(m.ruleText).toBe("Each multikill counts once, at its largest. Riot's counters are read as nested, the reading that can never count one twice.");
    expect(m.rankedFrom).toBe(20);
    // Never a raw percentage improvement.
    expect(JSON.stringify(m)).not.toMatch(/% more|30%/);
  });

  it("compares with the other players in the same games once they hold 1,000 games, saying how many, and how each game was compared", () => {
    const row = (position: string, games: number, d: number) => ({ position, championId: "Other", games, nested: { double: d, triple: d / 10, quadra: d / 50, penta: d / 250 }, separate: { double: d, triple: d / 10, quadra: d / 50, penta: d / 250 } });
    const multikillBaseline = buildMultikillBaseline([row("TOP", 3000, 1200), row("MIDDLE", 3000, 1650), row("UTILITY", 3000, 450), row("BOTTOM", 3000, 1800)], { withTriple: 900, outOfOrder: 0 });
    const m = buildLeaderboardsView(fixture(), {}, null, { now: NOW, multikillBaseline }).records.multikills;
    expect(m.source).toBe("same-games");
    expect(m.basis).toBe("Ranked by multikill performance relative to the champions and roles played.");
    expect(m.explain).toBe("Multikills earn 2–5 points. The score compares a player's points with typical results for their champions and roles, accounting for games played.");
    expect(m.sourceText).toBe("Typical results come from 12,000 games of other players in the team's stored season matches, excluding team members — not every League player.");
    expect(m.ruleShown).toBe(true);
    expect(m.ruleText).toBe("Each multikill counts once, at its largest: a pentakill is not also counted as a double, triple and quadra.");
    // Ash's 25 Riven games are top games, the Zed game a mid game: every game compared within its role; neither champion is in the comparison's games.
    const b = m.rows[0]!.breakdown;
    expect(b.comparison).toEqual([{ basis: "role", label: "By role (champion under 50 games)", games: "26 games" }]);
    expect(b.notAdjusted).toBe(false);
    const { earned, expected, cushion, score } = b.calculation;
    expect(Math.round((100 * (Number(earned) + Number(cushion))) / (Number(expected.replace(/,/g, "")) + Number(cushion)))).toBe(Number(score));
  });
});

describe("the expected points as the breakdown writes them", () => {
  it("take one decimal, or as many as it takes (at most three) for the final line to give the score shown", () => {
    // 100 × (59 + 40) ÷ (67.94 + 40) = 91.71…: one decimal (67.9) gives 92 too.
    expect(expectedPointsText(59, 67.94, 92)).toBe("67.9");
    // A score near a half: 100 × (60 + 40) ÷ (40.79 + 40) = 123.778; at 40.8 it is 123.762, at 40.0 … one decimal reproduces 124.
    expect(expectedPointsText(60, 40.79, 124)).toBe("40.8");
    // Where one decimal rounds the score the other way: 100 × 140 ÷ (X + 40) = 150.5 at X = 53.0233; X = 53.04 shows 53.0 (150.54 → 151) but the score is 150.
    const x = (100 * 140) / 150.49 - MULTIKILL_CUSHION;
    expect(Math.round((100 * 140) / (x + MULTIKILL_CUSHION))).toBe(150);
    const shown = expectedPointsText(100, x, 150);
    expect(Math.round((100 * 140) / (Number(shown) + MULTIKILL_CUSHION))).toBe(150);
    expect(shown.split(".")[1]!.length).toBeGreaterThanOrEqual(1);
  });

  it("reproduce the score for many members (random points, typical points and games)", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const earned = Math.floor(rand() * 400);
      const expected = rand() * 400;
      const score = (100 * (earned + MULTIKILL_CUSHION)) / (expected + MULTIKILL_CUSHION);
      const text = expectedPointsText(earned, expected, Math.round(score));
      expect(Math.round((100 * (earned + MULTIKILL_CUSHION)) / (Number(text.replace(/,/g, "")) + MULTIKILL_CUSHION))).toBe(Math.round(score));
    }
  });
});

describe("who the boards show: active players only (a counted game and a successful data update within 30 days)", () => {
  const at = (days: number) => T0 + days * DAY;
  /** A team of three: Ash (26 games to day 14), Bo and Cy (3 each); each player's last successful read given. */
  const withSync = (sync: Record<string, number | null>, extra: LeaderboardGame[] = []): LeaderboardData => {
    const data = fixture();
    return { ...data, games: [...data.games, ...extra], players: data.players.map((p) => ({ ...p, lastSyncedAt: sync[p.id] === undefined ? at(29) : sync[p.id]! })) };
  };

  it("hides a player whose account has not been read successfully in 30 days, though they have games: on every board, the count too", () => {
    const page = buildLeaderboardsView(withSync({ ash: at(-1) }), {}, null, { now: NOW });
    expect(page.playerCount).toBe(2);
    expect(page.memberCount).toBe(3);
    expect(Object.keys(page.players)).toEqual(["bo", "cy"]);
    expect(page.form.rows).toEqual([]);
    expect(page.records.multikills.rows).toEqual([]);
    // Records and milestones among the active players: Ash's kills record (18) moves to the best active player's game.
    expect(page.records.records.every((r) => r.holder === null || r.holder.playerId !== "ash")).toBe(true);
    expect(page.records.records.find((r) => r.id === "kills")!.holder!.playerId).not.toBe("ash");
    expect(page.records.milestones.items.map((m) => m.playerId)).toEqual(["bo", "cy"]);
    // Nothing of Ash reaches the page.
    expect(JSON.stringify(page)).not.toContain('"ash"');
  });

  it("hides a player whose account was read but who has played no counted game in 30 days (a sync alone is not activity)", () => {
    // At day 45 Bo's last game (day 5), Cy's (day 8) and Ash's (day 14) are over 30 days old: read on day 44, nobody is active.
    const later = new Date(at(45));
    const page = buildLeaderboardsView(withSync({ ash: at(44), bo: at(44), cy: at(44) }), {}, null, { now: later });
    expect(page.playerCount).toBe(0);
    expect(page.players).toEqual({});
    // A remake or an unsupported queue does not count as a game.
    const remake = { ...fixture().games[0]!, matchId: "OC1_R", playerId: "bo", gameCreation: at(43), durationS: 200 };
    const aram = { ...fixture().games[0]!, matchId: "OC1_A", playerId: "bo", gameCreation: at(43), queueId: 450 };
    expect(buildLeaderboardsView(withSync({ ash: at(44), bo: at(44), cy: at(44) }, [remake, aram]), {}, null, { now: later }).playerCount).toBe(0);
  });

  it("shows a returning player again with their next game and its sync, ranked again among the others with no place skipped", () => {
    const later = new Date(at(45));
    const back = { ...fixture().games[0]!, matchId: "OC1_BACK", playerId: "bo", gameCreation: at(44), patch: "16.18" };
    // Before the game is synced, Bo is away like the others; with it, Bo is back.
    expect(buildLeaderboardsView(withSync({ ash: at(10), bo: at(44), cy: at(44) }), {}, null, { now: later }).playerCount).toBe(0);
    const page = buildLeaderboardsView(withSync({ ash: at(10), bo: at(44), cy: at(44) }, [back]), {}, null, { now: later });
    expect(Object.keys(page.players)).toEqual(["bo"]);
    expect(page.playerCount).toBe(1);
  });

  it("ranks again among the players shown: an inactive leader leaves no gap on Recent form or the multikills", () => {
    // Di, the best of all (20 wins of 20 and many multikills), is away: read 40 days ago. Ash is then first, place 1.
    const di = Array.from({ length: 30 }, (_, i): LeaderboardGame => ({ ...fixture().games[0]!, matchId: `OC1_D${i}`, playerId: "di", gameCreation: at(2 + i * 0.3), win: true, extra: { doubleKills: 4, tripleKills: 2, quadraKills: 1, pentaKills: 1 } }));
    const base = withSync({}, di);
    const data = { ...base, players: [...base.players, { ...base.players[0]!, id: "di", name: "Di", lastSyncedAt: at(-10) }] };
    const page = buildLeaderboardsView(data, {}, null, { now: NOW });
    expect(page.form.rows.map((r) => [r.playerId, r.place])).toEqual([["ash", 1]]);
    expect(page.records.multikills.rows.map((r) => [r.playerId, r.place])).toEqual([["ash", 1]]);
    expect(page.records.multikills.rows[0]!.breakdown.place).toBe("1st of 1");
    // The same team with Di read yesterday: Di first on both, Ash second.
    const active = { ...data, players: data.players.map((p) => (p.id === "di" ? { ...p, lastSyncedAt: at(29) } : p)) };
    const all = buildLeaderboardsView(active, {}, null, { now: NOW });
    expect(all.form.rows.map((r) => [r.playerId, r.place])).toEqual([["di", 1], ["ash", 2]]);
    expect(all.records.multikills.rows.map((r) => r.playerId)).toEqual(["di", "ash"]);
    // The team's own comparison reads every member's games whoever is shown: Ash's typical points are the same either way.
    expect(page.records.multikills.rows[0]!.breakdown.calculation.expected).toBe(all.records.multikills.rows[1]!.breakdown.calculation.expected);
  });

  it("never sends a sync time, or anything of the rule's facts, to the page", () => {
    const page = buildLeaderboardsView(fixture(), {}, "bo", { now: NOW });
    expect(JSON.stringify(page)).not.toMatch(/lastSyncedAt|lastGameAt|syncCursor/);
  });
});
