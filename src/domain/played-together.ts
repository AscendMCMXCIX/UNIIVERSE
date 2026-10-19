/*
  PLAYED TOGETHER: Riot games in which two or more team members were on the same team.

  Found in the members' own stored match histories (one row per linked account per game, with the
  side each account played on). Rules:
  - one person is one member: several linked accounts of the same player count once;
  - only the same side counts: members on opposite teams did not play together;
  - only games whose side is known (their match details are stored) can be checked; the others are
    counted separately and never guessed;
  - Riot's match data does not say who queued together, so a game here is "played together",
    never a confirmed premade party.
*/

/** One stored game of one member's account (the fields the list shows). */
export interface TogetherRow {
  matchId: string;
  playerId: string;
  /** 100 or 200; null when the match details are not stored (side unknown). */
  teamId: number | null;
  queueId: number | null;
  gameCreation: number;
  /** The game's season (from its patch); unknown in older fixtures. */
  season?: number | null;
  durationS: number | null;
  win: boolean | null;
  championId: string;
  role: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  damage: number | null;
  vision: number | null;
}

export interface TogetherGame {
  matchId: string;
  gameCreation: number;
  queueId: number | null;
  season: number | null;
  durationS: number | null;
  win: boolean | null;
  teamId: number;
  /** The members on this side, in a stable order (Top → Support, then by name). */
  members: TogetherRow[];
  /** Members who were in the same game on the other side (shown, never counted as teammates). */
  opponents: string[];
}

const ROLE_ORDER = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const roleRank = (r: string | null) => {
  const i = ROLE_ORDER.indexOf(r ?? "");
  return i === -1 ? 9 : i;
};

/** Ranked Solo/Duo allows a party of two at most. */
export const SOLO_DUO_QUEUE = 420;

/**
 * Groups the members' stored games into games played together (newest first), and counts the
 * shared games that could not be checked because their side is unknown.
 */
export function groupPlayedTogether(rows: readonly TogetherRow[], nameOf: (playerId: string) => string): { games: TogetherGame[]; unknownSide: number } {
  // One row per member per game (two accounts of one person in one game: keep the first).
  const byMatch = new Map<string, Map<string, TogetherRow>>();
  for (const r of rows) {
    const m = byMatch.get(r.matchId) ?? new Map<string, TogetherRow>();
    if (!m.has(r.playerId)) m.set(r.playerId, r);
    byMatch.set(r.matchId, m);
  }
  const games: TogetherGame[] = [];
  let unknownSide = 0;
  for (const [matchId, members] of byMatch) {
    if (members.size < 2) continue;
    const list = [...members.values()];
    if (list.some((r) => r.teamId === null)) {
      unknownSide += 1;
      continue;
    }
    const sides = new Map<number, TogetherRow[]>();
    for (const r of list) sides.set(r.teamId!, [...(sides.get(r.teamId!) ?? []), r]);
    for (const [teamId, side] of sides) {
      if (side.length < 2) continue;
      side.sort((x, y) => roleRank(x.role) - roleRank(y.role) || nameOf(x.playerId).localeCompare(nameOf(y.playerId)));
      const first = side[0]!;
      const opponents = list.filter((r) => r.teamId !== teamId).map((r) => nameOf(r.playerId));
      games.push({ matchId, gameCreation: first.gameCreation, queueId: first.queueId, season: first.season ?? null, durationS: first.durationS, win: first.win, teamId, members: side, opponents });
    }
  }
  games.sort((x, y) => y.gameCreation - x.gameCreation || x.matchId.localeCompare(y.matchId));
  return { games, unknownSide };
}

/**
 * Narrow the list: a queue group, a minimum number of members, and the members who must all be in
 * it (on the same side; "played with" means every chosen member).
 */
export function filterTogether<T extends TogetherGame>(games: readonly T[], f: { queues: readonly number[] | null; minMembers: number; playerIds?: readonly string[]; playerId?: string | null; season?: number | null }): T[] {
  const required = [...(f.playerIds ?? []), ...(f.playerId ? [f.playerId] : [])];
  return games.filter((g) => (f.season == null || g.season === f.season) && (!f.queues || (g.queueId !== null && f.queues.includes(g.queueId))) && g.members.length >= f.minMembers && required.every((id) => g.members.some((m) => m.playerId === id)));
}

/** One champion a member played in the filtered games. */
export interface TogetherChampionUse {
  championId: string;
  games: number;
  wins: number;
}

/** A combination of champions the chosen members played at the same time. */
export interface TogetherCombo {
  /** One champion per chosen member, in the order of `members`. */
  championIds: string[];
  games: number;
  wins: number;
}

export interface TogetherSummary {
  games: number;
  wins: number;
  losses: number;
  /** Wins ÷ games with a result; null when none has a result. */
  winRate: number | null;
  /** Average length in seconds of the games with a known duration. */
  avgDurationS: number | null;
  lastPlayedAt: number | null;
  /** Per chosen member: their most played champions in these games (at most three). */
  members: Array<{ playerId: string; champions: TogetherChampionUse[] }>;
  /** For two to five chosen members: the champion combinations they repeated (two or more games), most played first. */
  combos: TogetherCombo[];
}

/**
 * The record of a filtered list and, for the chosen members, what they played: the figures above
 * the list when the team asks "how do these players do together?". Only games already filtered
 * to contain every chosen member on the same side are passed in.
 */
export function summariseTogether(games: readonly TogetherGame[], chosen: readonly string[]): TogetherSummary {
  const decided = games.filter((g) => g.win !== null);
  const wins = decided.filter((g) => g.win).length;
  const timed = games.filter((g) => typeof g.durationS === "number" && g.durationS > 0);
  const members = chosen.map((playerId) => {
    const use = new Map<string, TogetherChampionUse>();
    for (const g of games) {
      const m = g.members.find((x) => x.playerId === playerId);
      if (!m) continue;
      const u = use.get(m.championId) ?? { championId: m.championId, games: 0, wins: 0 };
      u.games += 1;
      if (g.win) u.wins += 1;
      use.set(m.championId, u);
    }
    return { playerId, champions: [...use.values()].sort((a, b) => b.games - a.games || b.wins - a.wins || a.championId.localeCompare(b.championId)).slice(0, 3) };
  });
  const combos = new Map<string, TogetherCombo>();
  if (chosen.length >= 2) {
    for (const g of games) {
      const ids = chosen.map((id) => g.members.find((m) => m.playerId === id)?.championId ?? null);
      if (ids.some((x) => x === null)) continue;
      const key = ids.join("|");
      const c = combos.get(key) ?? { championIds: ids as string[], games: 0, wins: 0 };
      c.games += 1;
      if (g.win) c.wins += 1;
      combos.set(key, c);
    }
  }
  return {
    games: games.length,
    wins,
    losses: decided.length - wins,
    winRate: decided.length ? wins / decided.length : null,
    avgDurationS: timed.length ? timed.reduce((s, g) => s + g.durationS!, 0) / timed.length : null,
    lastPlayedAt: games.length ? Math.max(...games.map((g) => g.gameCreation)) : null,
    members,
    combos: [...combos.values()].filter((c) => c.games >= 2).sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 5),
  };
}
