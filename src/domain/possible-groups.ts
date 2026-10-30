/*
  Possible groups in a completed match: players on one team who were also on one team, all of them
  together, in several earlier stored games. Only completed matches UNIIVERSE already stores are read
  (no Riot request), so the result is a historical inference, never confirmed party membership:
  - every player of a group was on the same team in each counted game (a trio needs games with all
    three, not three separate pairs);
  - the analysed match itself and anything played after it never count;
  - a group needs at least MIN_GAMES_TOGETHER such games, and must have been teammates at least three
    times as often as opponents (players who simply meet often in a small ladder are opponents in
    about half of their shared games; a party never is);
  - the queue's party sizes apply (Solo/Duo: duos only; Flex: 2, 3 or 5);
  - a player is in at most one group: larger groups first, then the most games (an exact tie
    between overlapping groups shows neither).
  Players are matched by their Riot account (never by name or champion). Only players outside
  UNIIVERSE are assessed: anyone whose Riot account is linked to a UNIIVERSE profile is never
  labelled (their games together are Played Together, a fact, not an inference), and a player
  without a recorded Riot ID is left out.
*/

export const GROUP_WINDOW_DAYS = 180;
export const MIN_GAMES_TOGETHER = 3;
/** Teammates at least this many times as often as opponents. */
export const TEAMMATE_RATIO = 3;
/** Evidence games listed per group (the count always covers every game). */
export const EVIDENCE_LISTED = 10;

const SOLO_DUO = 420;
const FLEX = 440;
const CLASH = 700;
const OPEN_PARTY_QUEUES = new Set([400, 430, 450, 480, 490]);

/** The party sizes a queue allows (above 1), or "clash" when each team is a registered team of five. */
export function partySizesFor(queueId: number | null): readonly number[] | "clash" {
  if (queueId === SOLO_DUO) return [2];
  if (queueId === FLEX) return [2, 3, 5];
  if (queueId === CLASH) return "clash";
  if (queueId !== null && OPEN_PARTY_QUEUES.has(queueId)) return [2, 3, 4, 5];
  return [];
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const countWord = (n: number) => COUNT_WORDS[n] ?? n.toLocaleString("en");

/** The evidence in plain words: "These three players appeared on the same team in four previous recorded games." */
export function groupEvidenceText(size: number, games: number, opposed = 0): string {
  const who = size === 2 ? "These two players" : `These ${countWord(size)} players`;
  const base = `${who} appeared on the same team in ${countWord(games)} previous recorded ${games === 1 ? "game" : "games"}.`;
  return opposed ? `${base} They were on opposite teams in ${countWord(opposed)}.` : base;
}

/**
 * What the note under a scoreboard can say about a match's sides, as one statement:
 * - "inferred": a side has a possible group, so there is an inference to describe (then the sides it
 *   could not cover);
 * - "insufficient": no side has one and some side had players to assess: not enough recorded
 *   history to say anything (never "an inference from 0 games", never "no premades");
 * - "nobody": no side had two players to assess.
 * `thin` are the sides with players to assess and no group; `nobody` the sides with fewer than two
 * (team members, or a single other player).
 */
export function groupsNoteState(teams: ReadonlyArray<{ teamId: number; groups: readonly unknown[]; assessed: number }>): { kind: "inferred" | "insufficient" | "nobody"; thin: number[]; nobody: number[] } {
  const open = teams.filter((t) => t.groups.length === 0);
  const thin = open.filter((t) => t.assessed >= 2).map((t) => t.teamId);
  const nobody = open.filter((t) => t.assessed < 2).map((t) => t.teamId);
  return { kind: open.length < teams.length ? "inferred" : thin.length ? "insufficient" : "nobody", thin, nobody };
}

export function groupLabel(size: number): string {
  return size === 2 ? "Possible duo" : size === 3 ? "Possible trio" : size === 4 ? "Possible four-player group" : "Possible five-player group";
}

/** A player of the analysed match: `key` is internal (the account id), `slot` what the page shows. */
export interface MatchPlayer {
  slot: number;
  key: string;
  teamId: number;
  /** Only players with a recorded Riot ID are assessed. */
  named: boolean;
  /** Linked to a UNIIVERSE profile: never assessed or labelled. */
  registered?: boolean;
}

/** One stored appearance of one of those players in another match. */
export interface Appearance {
  matchId: string;
  gameCreation: number;
  queueId: number | null;
  key: string;
  teamId: number;
  win: boolean;
}

export interface EvidenceGame {
  matchId: string;
  playedAt: number;
  queueId: number | null;
  win: boolean;
}

export interface PossibleGroup {
  teamId: number;
  slots: number[];
  label: string;
  /** Earlier stored games with the whole group on one team. */
  games: number;
  /** Earlier stored games with the whole group present but split across the two teams. */
  opposed: number;
  /** The most recent of those games, newest first (at most EVIDENCE_LISTED). */
  evidence: EvidenceGame[];
}

export interface TeamGroups {
  teamId: number;
  groups: PossibleGroup[];
  /** "clash": both teams are registered Clash teams (a fact of the queue, nothing inferred). "not-assessed": the queue's party rules are unknown. */
  note: "clash" | "not-assessed" | null;
  /** Players on this side who could be assessed (outside UNIIVERSE, with a recorded Riot ID). */
  assessed: number;
}

export interface GroupAnalysis {
  teams: TeamGroups[];
  /** Earlier stored games (inside the window) that include at least one player of this match. */
  gamesSearched: number;
  windowDays: number;
}

function subsetsOf<T>(items: readonly T[], sizes: readonly number[]): T[][] {
  const out: T[][] = [];
  const walk = (start: number, acc: T[]) => {
    if (acc.length >= 2 && sizes.includes(acc.length)) out.push(acc.slice());
    if (acc.length === 5) return;
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]!);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

export function analysePossibleGroups(match: { matchId: string; gameCreation: number; queueId: number | null }, players: readonly MatchPlayer[], appearances: readonly Appearance[], options: { windowDays?: number; minGames?: number } = {}): GroupAnalysis {
  const windowDays = options.windowDays ?? GROUP_WINDOW_DAYS;
  const minGames = options.minGames ?? MIN_GAMES_TOGETHER;
  const from = match.gameCreation - windowDays * 86_400_000;
  // Each earlier game: which of this match's players were in it, and on which side.
  const games = new Map<string, { playedAt: number; queueId: number | null; side: Map<string, { teamId: number; win: boolean }> }>();
  for (const a of appearances) {
    if (a.matchId === match.matchId || a.gameCreation >= match.gameCreation || a.gameCreation < from) continue;
    let g = games.get(a.matchId);
    if (!g) games.set(a.matchId, (g = { playedAt: a.gameCreation, queueId: a.queueId, side: new Map() }));
    g.side.set(a.key, { teamId: a.teamId, win: a.win });
  }
  const sizes = partySizesFor(match.queueId);
  const teamIds = [...new Set(players.map((p) => p.teamId))].sort((a, b) => a - b);
  const teams: TeamGroups[] = teamIds.map((teamId) => {
    const team = players.filter((p) => p.teamId === teamId && p.named && !p.registered);
    if (sizes === "clash") return { teamId, groups: [], note: "clash", assessed: team.length };
    if (sizes.length === 0) return { teamId, groups: [], note: "not-assessed", assessed: team.length };
    const candidates: PossibleGroup[] = [];
    for (const set of subsetsOf(team, sizes)) {
      const keys = set.map((p) => p.key);
      let opposed = 0;
      const together: EvidenceGame[] = [];
      for (const [matchId, g] of games) {
        const sides = keys.map((k) => g.side.get(k));
        if (sides.some((s) => !s)) continue;
        if (sides.every((s) => s!.teamId === sides[0]!.teamId)) together.push({ matchId, playedAt: g.playedAt, queueId: g.queueId, win: sides[0]!.win });
        else opposed++;
      }
      if (together.length < minGames || together.length < TEAMMATE_RATIO * opposed) continue;
      together.sort((a, b) => b.playedAt - a.playedAt || a.matchId.localeCompare(b.matchId));
      candidates.push({ teamId, slots: set.map((p) => p.slot).sort((a, b) => a - b), label: groupLabel(set.length), games: together.length, opposed, evidence: together.slice(0, EVIDENCE_LISTED) });
    }
    // A player belongs to one party: larger groups first, then the most games. Two overlapping
    // groups with the same size and count cannot both be right and nothing says which is: neither
    // is shown, and their players stay ungrouped.
    candidates.sort((a, b) => b.slots.length - a.slots.length || b.games - a.games || a.slots.join().localeCompare(b.slots.join()));
    const used = new Set<number>();
    const groups: PossibleGroup[] = [];
    const overlaps = (a: PossibleGroup, b: PossibleGroup) => a.slots.some((s) => b.slots.includes(s));
    for (let i = 0; i < candidates.length; ) {
      // One tier at a time (same size and count), among the groups whose players are still free.
      const tier: PossibleGroup[] = [];
      const head = candidates[i]!;
      for (; i < candidates.length && candidates[i]!.slots.length === head.slots.length && candidates[i]!.games === head.games; i++) tier.push(candidates[i]!);
      const open = tier.filter((c) => !c.slots.some((s) => used.has(s)));
      const clear = open.filter((c) => !open.some((d) => d !== c && overlaps(c, d)));
      for (const c of open) c.slots.forEach((s) => used.add(s));
      groups.push(...clear);
    }
    return { teamId, groups, note: null, assessed: team.length };
  });
  return { teams, gamesSearched: games.size, windowDays };
}
