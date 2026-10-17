/*
  Team → Matches → Encounters: players UNIIVERSE members keep meeting in their recorded games, as
  allies (same team) or opponents. Historical encounters only: never a claim that anyone queued
  together, knows each other or "counters" anyone.

  Counting rules:
  - An encounter row is one member in one recorded game with one other player. A member's game is
    counted once however many of their linked accounts stored it.
  - Member-level figures count that member's games (with or against the player).
  - Game-level figures count distinct games: one game with two members against the player is one
    game, not two. The result is the side the members were on in that relation (all members who
    were the player's allies in a game were on one team, as were all who faced them), so a game in
    which members were on both sides counts once as an ally game and once as an opponent game, each
    with its own result: never one blended "team" win rate.
  - A player is identified by their account (an opaque key), never by name; the name shown is the
    most recent one recorded.
*/

export type Relation = "ally" | "opponent";
export type EncounterView = "allies" | "opponents" | "shared";
export type EncounterSort = "games" | "best" | "worst";

/** Below this many games a record is a small sample (shown, never highlighted). */
export const ESTABLISHED_GAMES = 5;
/** Insights need at least this many games behind them. */
export const INSIGHT_MIN_GAMES = { frequent: 3, record: 5 } as const;

export interface EncounterRow {
  matchId: string;
  /** The UNIIVERSE member (profile), not the Riot account. */
  playerId: string;
  accountId: string;
  gameCreation: number;
  queueId: number | null;
  season: number;
  /** The member's result; null when not recorded. */
  win: boolean | null;
  memberChampion: string | null;
  /** The other player: an opaque key for their account, and their most recently recorded Riot ID. */
  key: string;
  name: string;
  relation: Relation;
  otherChampion: string | null;
}

export interface EncounterFilter {
  season: number | null;
  queues: readonly number[] | null;
  playerId: string | null;
  accountId: string | null;
}

export interface WinLoss {
  games: number;
  wins: number;
  losses: number;
}

export interface MemberEncounter {
  playerId: string;
  ally: WinLoss;
  opponent: WinLoss;
}

export interface EncounterSummary {
  key: string;
  /** The most recently recorded Riot ID. */
  name: string;
  /** Distinct games with the player (either relation). */
  games: number;
  ally: WinLoss;
  opponent: WinLoss;
  members: MemberEncounter[];
  lastPlayedAt: number;
  /** The match of the most recent encounter (for the server it was on). */
  lastMatchId: string;
}

const empty = (): WinLoss => ({ games: 0, wins: 0, losses: 0 });

export function filterEncounterRows(rows: readonly EncounterRow[], f: EncounterFilter): EncounterRow[] {
  return rows.filter((r) => (f.season === null || r.season === f.season) && (!f.queues || (r.queueId !== null && f.queues.includes(r.queueId))) && (!f.playerId || r.playerId === f.playerId) && (!f.accountId || r.accountId === f.accountId));
}

/** Every player in the rows, with game-level and member-level records. One pass over the rows. */
export function summariseEncounters(rows: readonly EncounterRow[]): EncounterSummary[] {
  interface Acc {
    latest: EncounterRow;
    /** member → match → seen (one member-game once; defensive, the loader already removes duplicates). */
    seen: Map<string, Set<string>>;
    games: Set<string>;
    /** Game level, per relation: match → the members' result on that side (the first known one). */
    ally: Map<string, boolean | null>;
    opponent: Map<string, boolean | null>;
    members: Map<string, MemberEncounter>;
  }
  const byKey = new Map<string, Acc>();
  for (const r of rows) {
    let a = byKey.get(r.key);
    if (!a) byKey.set(r.key, (a = { latest: r, seen: new Map(), games: new Set(), ally: new Map(), opponent: new Map(), members: new Map() }));
    let seen = a.seen.get(r.playerId);
    if (!seen) a.seen.set(r.playerId, (seen = new Set()));
    if (seen.has(r.matchId)) continue;
    seen.add(r.matchId);
    if (r.gameCreation > a.latest.gameCreation) a.latest = r;
    a.games.add(r.matchId);
    const level = r.relation === "ally" ? a.ally : a.opponent;
    if (level.get(r.matchId) == null) level.set(r.matchId, r.win);
    let m = a.members.get(r.playerId);
    if (!m) a.members.set(r.playerId, (m = { playerId: r.playerId, ally: empty(), opponent: empty() }));
    const wl = r.relation === "ally" ? m.ally : m.opponent;
    wl.games++;
    if (r.win === true) wl.wins++;
    if (r.win === false) wl.losses++;
  }
  const tally = (byGame: Map<string, boolean | null>): WinLoss => {
    let wins = 0;
    let losses = 0;
    for (const w of byGame.values()) {
      if (w === true) wins++;
      else if (w === false) losses++;
    }
    return { games: byGame.size, wins, losses };
  };
  const out: EncounterSummary[] = [];
  for (const [key, a] of byKey) {
    out.push({
      key,
      name: a.latest.name,
      games: a.games.size,
      ally: tally(a.ally),
      opponent: tally(a.opponent),
      members: [...a.members.values()].sort((x, y) => y.ally.games + y.opponent.games - (x.ally.games + x.opponent.games) || x.playerId.localeCompare(y.playerId)),
      lastPlayedAt: a.latest.gameCreation,
      lastMatchId: a.latest.matchId,
    });
  }
  return out;
}

const rate = (wl: WinLoss) => (wl.wins + wl.losses > 0 ? wl.wins / (wl.wins + wl.losses) : null);

/** The record a view is about: as allies, as opponents, or (shared) every game. */
export function recordFor(s: EncounterSummary, view: EncounterView): WinLoss {
  if (view === "allies") return s.ally;
  if (view === "opponents") return s.opponent;
  return { games: s.games, wins: s.ally.wins + s.opponent.wins, losses: s.ally.losses + s.opponent.losses };
}

/**
 * One list: allies or opponents met at least `min` times in that relation, or (shared) players
 * met by two or more members, at least `min` games in all. Sorted by games, or by the best or
 * worst record (records need at least `min` decided games), then the most recent.
 */
export function listEncounters(all: readonly EncounterSummary[], o: { view: EncounterView; min: number; sort: EncounterSort; query?: string }): EncounterSummary[] {
  const q = (o.query ?? "").trim().toLocaleLowerCase();
  const list = all.filter((s) => {
    if (q && !s.name.toLocaleLowerCase().includes(q)) return false;
    if (o.view === "shared") return s.members.length >= 2 && s.games >= o.min;
    return recordFor(s, o.view).games >= o.min;
  });
  const byGames = (a: EncounterSummary, b: EncounterSummary) => recordFor(b, o.view).games - recordFor(a, o.view).games || b.lastPlayedAt - a.lastPlayedAt || a.key.localeCompare(b.key);
  if (o.sort === "games") return list.sort(byGames);
  const sign = o.sort === "best" ? -1 : 1;
  return list
    .filter((s) => {
      const r = recordFor(s, o.view);
      return r.wins + r.losses >= o.min;
    })
    .sort((a, b) => sign * (rate(recordFor(a, o.view))! - rate(recordFor(b, o.view))!) || byGames(a, b));
}

export interface EncounterInsight {
  kind: "frequent-opponent" | "frequent-ally" | "best-ally" | "toughest-opponent";
  label: string;
  summary: EncounterSummary;
  record: WinLoss;
}

/** At most one of each, and only when enough games stand behind it. Neutral wording only. */
export function encounterInsights(all: readonly EncounterSummary[]): { insights: EncounterInsight[]; sharedPlayers: number } {
  const pick = (score: (s: EncounterSummary) => number | null) => {
    let best: EncounterSummary | null = null;
    let bestScore = -Infinity;
    for (const s of all) {
      const v = score(s);
      if (v === null) continue;
      if (v > bestScore || (v === bestScore && best && (s.games > best.games || (s.games === best.games && s.lastPlayedAt > best.lastPlayedAt)))) {
        best = s;
        bestScore = v;
      }
    }
    return best;
  };
  const insights: EncounterInsight[] = [];
  const add = (kind: EncounterInsight["kind"], label: string, s: EncounterSummary | null, record: (s: EncounterSummary) => WinLoss) => {
    if (s) insights.push({ kind, label, summary: s, record: record(s) });
  };
  add("frequent-opponent", "Most faced opponent", pick((s) => (s.opponent.games >= INSIGHT_MIN_GAMES.frequent ? s.opponent.games : null)), (s) => s.opponent);
  add("frequent-ally", "Most frequent ally", pick((s) => (s.ally.games >= INSIGHT_MIN_GAMES.frequent ? s.ally.games : null)), (s) => s.ally);
  add("best-ally", "Best record alongside", pick((s) => (s.ally.wins + s.ally.losses >= INSIGHT_MIN_GAMES.record ? rate(s.ally) : null)), (s) => s.ally);
  add("toughest-opponent", "Toughest record against", pick((s) => (s.opponent.wins + s.opponent.losses >= INSIGHT_MIN_GAMES.record ? -rate(s.opponent)! : null)), (s) => s.opponent);
  return { insights, sharedPlayers: all.filter((s) => s.members.length >= 2 && s.games >= 2).length };
}

export interface EncounterGame {
  matchId: string;
  playedAt: number;
  queueId: number | null;
  playerId: string;
  memberChampion: string | null;
  otherChampion: string | null;
  relation: Relation;
  win: boolean | null;
}

/** One player's recorded games with the members (one line per member and game), newest first. */
export function encounterGames(rows: readonly EncounterRow[], key: string): EncounterGame[] {
  const seen = new Set<string>();
  return rows
    .filter((r) => r.key === key)
    .sort((a, b) => b.gameCreation - a.gameCreation || a.playerId.localeCompare(b.playerId))
    .filter((r) => {
      const id = `${r.playerId}|${r.matchId}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((r) => ({ matchId: r.matchId, playedAt: r.gameCreation, queueId: r.queueId, playerId: r.playerId, memberChampion: r.memberChampion, otherChampion: r.otherChampion, relation: r.relation, win: r.win }));
}
