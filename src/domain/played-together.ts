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
  durationS: number | null;
  win: boolean | null;
  teamId: number;
  /** The members on this side, in a stable order (Top → Support, then by name). */
  members: TogetherRow[];
  /** Members who were in the same game on the other side (shown, never counted as teammates). */
  opponents: string[];
}

export interface TogetherPair {
  a: string;
  b: string;
  games: number;
  wins: number;
}

const ROLE_ORDER = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const roleRank = (r: string | null) => {
  const i = ROLE_ORDER.indexOf(r ?? "");
  return i === -1 ? 9 : i;
};

/** Ranked Solo/Duo allows a party of two at most. */
export const SOLO_DUO_QUEUE = 420;

/**
 * Groups the members' stored games into games played together (newest first), the pairs who play
 * together most, and how many shared games could not be checked because their side is unknown.
 */
export function groupPlayedTogether(rows: readonly TogetherRow[], nameOf: (playerId: string) => string): { games: TogetherGame[]; pairs: TogetherPair[]; unknownSide: number } {
  // One row per member per game (two accounts of one person in one game: keep the first).
  const byMatch = new Map<string, Map<string, TogetherRow>>();
  for (const r of rows) {
    const m = byMatch.get(r.matchId) ?? new Map<string, TogetherRow>();
    if (!m.has(r.playerId)) m.set(r.playerId, r);
    byMatch.set(r.matchId, m);
  }
  const games: TogetherGame[] = [];
  const pairs = new Map<string, TogetherPair>();
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
      games.push({ matchId, gameCreation: first.gameCreation, queueId: first.queueId, durationS: first.durationS, win: first.win, teamId, members: side, opponents });
      for (let i = 0; i < side.length; i++) {
        for (let j = i + 1; j < side.length; j++) {
          const [a, b] = [side[i]!.playerId, side[j]!.playerId].sort();
          const key = `${a}|${b}`;
          const p = pairs.get(key) ?? { a: a!, b: b!, games: 0, wins: 0 };
          p.games += 1;
          if (first.win) p.wins += 1;
          pairs.set(key, p);
        }
      }
    }
  }
  games.sort((x, y) => y.gameCreation - x.gameCreation || x.matchId.localeCompare(y.matchId));
  return { games, pairs: [...pairs.values()].sort((x, y) => y.games - x.games || y.wins - x.wins), unknownSide };
}

/** Narrow the list: a queue group, a minimum number of members, a member who must be in it. */
export function filterTogether<T extends TogetherGame>(games: readonly T[], f: { queues: readonly number[] | null; minMembers: number; playerId: string | null }): T[] {
  return games.filter((g) => (!f.queues || (g.queueId !== null && f.queues.includes(g.queueId))) && g.members.length >= f.minMembers && (!f.playerId || g.members.some((m) => m.playerId === f.playerId)));
}
