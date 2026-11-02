/*
  Encounters: the players someone keeps meeting in their recorded games, as teammates (alongside:
  the same team) or opponents (against: the other team). Shown in each profile (Match History →
  Encounters). Historical encounters only: never a claim that anyone queued together, knows each
  other or "counters" anyone.

  Counting rules (the database computes them for a page, server/players/encounters.ts; these
  functions state the same rules and are what that query is tested against):
  - An encounter row is the player in one recorded game with one other player. A game is counted
    once however many of the player's linked accounts stored it.
  - The result is the player's own (they won or lost the game), whichever side the other player was on.
  - The two relations are kept apart: a player met on both sides has a record against and a record
    alongside, and is listed under both. A game in which duplicated records put the other player on
    both sides counts once in each relation.
  - A player is identified by their account (an opaque key), never by name; the name shown is the
    most recent one recorded.
*/

export type Relation = "ally" | "opponent";
/** Which encounters a list is about: games against them, games alongside them, or every game with them. */
export type EncounterRelation = "against" | "alongside" | "all";
export type EncounterSort = "games" | "recent" | "best" | "worst";

/** The list's choices: which relation, a minimum of games, the order, a Riot ID search, how many shown. */
export interface EncounterListChoice {
  relation: EncounterRelation;
  min: number;
  sort: EncounterSort;
  q: string;
  limit: number;
}

/** Players shown at first, and added by each "Show more". */
export const ENCOUNTER_PAGE = 25;
const MAX_SHOWN = 500;
/** The minimums a list offers. */
export const ENCOUNTER_MINIMUMS = [1, 2, 3, 5, 10] as const;
const RELATIONS: readonly EncounterRelation[] = ["against", "alongside", "all"];
/** The names an older address used (Opponents, Allies, Everyone): they still open the same list. */
const LEGACY_RELATIONS: Readonly<Record<string, EncounterRelation>> = { opponents: "against", allies: "alongside", everyone: "all" };
const SORTS: readonly EncounterSort[] = ["games", "recent", "best", "worst"];
/** Win rates are ranked within one relation only: every game with a player mixes two different records. */
export const sortsFor = (relation: EncounterRelation): readonly EncounterSort[] => (relation === "all" ? ["games", "recent"] : SORTS);

/** Met twice or more by default; once or more while searching for someone. */
export const defaultMinimum = (q: string) => (q ? 1 : 2);

/**
 * The choices an address names; anything missing or unknown is the default (against, most games
 * first). A win-rate order asked of every game with a player reads as most games.
 */
export function encounterListChoice(sp: { rel?: string; min?: string; sort?: string; q?: string; limit?: string }): EncounterListChoice {
  const q = (sp.q ?? "").trim().slice(0, 32);
  const min = Number(sp.min);
  const limit = Math.round(Number(sp.limit));
  const relation = RELATIONS.find((r) => r === sp.rel) ?? (sp.rel ? LEGACY_RELATIONS[sp.rel] : undefined) ?? "against";
  return {
    relation,
    min: (ENCOUNTER_MINIMUMS as readonly number[]).includes(min) ? min : defaultMinimum(q),
    sort: sortsFor(relation).find((x) => x === sp.sort) ?? "games",
    q,
    limit: limit > ENCOUNTER_PAGE ? Math.min(MAX_SHOWN, limit) : ENCOUNTER_PAGE,
  };
}

/** The address parameters of a choice, defaults left out (the reverse of encounterListChoice). */
export function encounterListParams(c: EncounterListChoice): Record<string, string> {
  const out: Record<string, string> = {};
  if (c.relation !== "against") out.rel = c.relation;
  if (c.min !== defaultMinimum(c.q)) out.min = String(c.min);
  if (c.sort !== "games") out.sort = c.sort;
  if (c.q) out.q = c.q;
  if (c.limit !== ENCOUNTER_PAGE) out.limit = String(c.limit);
  return out;
}

/** Below this many games a record is a small sample (shown, never highlighted). */
export const ESTABLISHED_GAMES = 5;
/** Highlights need at least this many games behind them. */
export const INSIGHT_MIN_GAMES = { frequent: 3, record: 5 } as const;

export interface EncounterRow {
  matchId: string;
  gameCreation: number;
  queueId: number | null;
  /** The player's result; null when not recorded. */
  win: boolean | null;
  memberChampion: string | null;
  /** The other player: an opaque key for their account, and their Riot ID in this game. */
  key: string;
  name: string;
  relation: Relation;
  otherChampion: string | null;
}

export interface WinLoss {
  games: number;
  wins: number;
  losses: number;
}

/** The player's record in one relation, and when that relation last happened (null: never). */
export interface RelationRecord extends WinLoss {
  lastPlayedAt: number | null;
}

export interface EncounterSummary {
  key: string;
  /** The most recently recorded Riot ID. */
  name: string;
  /** Distinct games with the player (either relation). */
  games: number;
  /** Games on the player's team. */
  ally: RelationRecord;
  /** Games on the other team. */
  opponent: RelationRecord;
  lastPlayedAt: number;
  /** The match of the most recent encounter (for the server it was on). */
  lastMatchId: string;
}

const empty = (): RelationRecord => ({ games: 0, wins: 0, losses: 0, lastPlayedAt: null });

/** Newest first; among games of the same moment, the later match id first. */
const newer = (a: { gameCreation: number; matchId: string }, b: { gameCreation: number; matchId: string }) => b.gameCreation - a.gameCreation || (a.matchId < b.matchId ? 1 : a.matchId > b.matchId ? -1 : 0);

/** Every player in the rows, with their records. */
export function summariseEncounters(rows: readonly EncounterRow[]): EncounterSummary[] {
  const byKey = new Map<string, { latest: EncounterRow; games: Map<string, { ally: boolean; opponent: boolean; win: boolean | null; at: number }> }>();
  for (const r of rows) {
    let a = byKey.get(r.key);
    if (!a) byKey.set(r.key, (a = { latest: r, games: new Map() }));
    if (newer(r, a.latest) < 0) a.latest = r;
    const g = a.games.get(r.matchId) ?? { ally: false, opponent: false, win: r.win, at: r.gameCreation };
    if (r.relation === "ally") g.ally = true;
    else g.opponent = true;
    g.at = Math.min(g.at, r.gameCreation);
    a.games.set(r.matchId, g);
  }
  const out: EncounterSummary[] = [];
  for (const [key, a] of byKey) {
    const ally = empty();
    const opponent = empty();
    for (const g of a.games.values()) {
      for (const [on, wl] of [
        [g.ally, ally],
        [g.opponent, opponent],
      ] as const) {
        if (!on) continue;
        wl.games++;
        if (g.win === true) wl.wins++;
        if (g.win === false) wl.losses++;
        wl.lastPlayedAt = Math.max(wl.lastPlayedAt ?? -Infinity, g.at);
      }
    }
    out.push({ key, name: a.latest.name, games: a.games.size, ally, opponent, lastPlayedAt: a.latest.gameCreation, lastMatchId: a.latest.matchId });
  }
  return out;
}

const rate = (wl: WinLoss) => (wl.wins + wl.losses > 0 ? wl.wins / (wl.wins + wl.losses) : null);

/**
 * The record a list is about: against them, alongside them, or (for counting and dates only) every
 * game with them. The "all" record's wins and losses add two different relations together, so
 * pages show the two records side by side rather than this sum.
 */
export function recordFor(s: EncounterSummary, relation: EncounterRelation): RelationRecord {
  if (relation === "alongside") return s.ally;
  if (relation === "against") return s.opponent;
  return { games: s.games, wins: s.ally.wins + s.opponent.wins, losses: s.ally.losses + s.opponent.losses, lastPlayedAt: s.lastPlayedAt };
}

const byKey = (a: EncounterSummary, b: EncounterSummary) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
/** A win rate rests on enough games to be ranked first (a smaller sample follows, marked as one). */
export const isEstablished = (wl: WinLoss) => wl.wins + wl.losses >= ESTABLISHED_GAMES;

/**
 * One list: players met at least `min` times in the relation (so a player met on both sides is in
 * both lists). Sorted by games in the relation, by the most recent game in it, or by the highest
 * or lowest win rate in it (against or alongside only; at least `min` decided games, and records
 * with ESTABLISHED_GAMES decided games ahead of smaller samples). Ties: more games, then the most
 * recent, then the key.
 */
export function listEncounters(all: readonly EncounterSummary[], o: { relation: EncounterRelation; min: number; sort: EncounterSort; query?: string }): EncounterSummary[] {
  const q = (o.query ?? "").trim().toLowerCase();
  const rec = (s: EncounterSummary) => recordFor(s, o.relation);
  const list = all.filter((s) => (!q || s.name.toLowerCase().includes(q)) && rec(s).games >= o.min);
  const last = (s: EncounterSummary) => rec(s).lastPlayedAt ?? -Infinity;
  const byGames = (a: EncounterSummary, b: EncounterSummary) => rec(b).games - rec(a).games || last(b) - last(a) || byKey(a, b);
  if (o.sort === "games" || (o.relation === "all" && o.sort !== "recent")) return list.sort(byGames);
  if (o.sort === "recent") return list.sort((a, b) => last(b) - last(a) || rec(b).games - rec(a).games || byKey(a, b));
  const sign = o.sort === "best" ? -1 : 1;
  return list
    .filter((s) => rec(s).wins + rec(s).losses >= o.min)
    .sort((a, b) => Number(isEstablished(rec(b))) - Number(isEstablished(rec(a))) || sign * (rate(rec(a))! - rate(rec(b))!) || byGames(a, b));
}

export interface EncounterInsight {
  kind: "frequent-opponent" | "frequent-ally" | "best-ally" | "toughest-opponent";
  summary: EncounterSummary;
  record: WinLoss;
}

export const INSIGHT_LABELS: Record<EncounterInsight["kind"], string> = {
  "frequent-opponent": "Most games against",
  "frequent-ally": "Most games alongside",
  "best-ally": "Best record alongside",
  "toughest-opponent": "Toughest record against",
};
/** Which relation each highlight is about. */
export const INSIGHT_RELATION: Record<EncounterInsight["kind"], Relation> = { "frequent-opponent": "opponent", "frequent-ally": "ally", "best-ally": "ally", "toughest-opponent": "opponent" };

/**
 * At most one of each, and only when enough games stand behind it. Neutral wording only. Each is the
 * first player of the list it sums up: the most games in that relation, or the best or worst
 * record there from at least INSIGHT_MIN_GAMES.record decided games; ties go to more games in that
 * relation (the larger sample), then the most recent. A record is only "best" when it is a winning
 * one and only "toughest" when it is a losing one: an opponent beaten 8–4 is nobody's toughest.
 */
export function encounterInsights(all: readonly EncounterSummary[]): EncounterInsight[] {
  const pick = (record: (s: EncounterSummary) => WinLoss, score: (s: EncounterSummary) => number | null) => {
    let best: EncounterSummary | null = null;
    let bestScore = -Infinity;
    for (const s of all) {
      const v = score(s);
      if (v === null) continue;
      const games = record(s).games;
      const bestGames = best ? record(best).games : 0;
      if (!best || v > bestScore || (v === bestScore && (games > bestGames || (games === bestGames && (s.lastPlayedAt > best.lastPlayedAt || (s.lastPlayedAt === best.lastPlayedAt && byKey(s, best) < 0)))))) {
        best = s;
        bestScore = v;
      }
    }
    return best;
  };
  const insights: EncounterInsight[] = [];
  const add = (kind: EncounterInsight["kind"], record: (s: EncounterSummary) => WinLoss, score: (s: EncounterSummary) => number | null) => {
    const s = pick(record, score);
    if (s) insights.push({ kind, summary: s, record: record(s) });
  };
  const decided = (wl: WinLoss) => wl.wins + wl.losses >= INSIGHT_MIN_GAMES.record;
  add("frequent-opponent", (s) => s.opponent, (s) => (s.opponent.games >= INSIGHT_MIN_GAMES.frequent ? s.opponent.games : null));
  add("frequent-ally", (s) => s.ally, (s) => (s.ally.games >= INSIGHT_MIN_GAMES.frequent ? s.ally.games : null));
  add("best-ally", (s) => s.ally, (s) => (decided(s.ally) && s.ally.wins > s.ally.losses ? rate(s.ally) : null));
  add("toughest-opponent", (s) => s.opponent, (s) => (decided(s.opponent) && s.opponent.losses > s.opponent.wins ? -rate(s.opponent)! : null));
  return insights;
}

export interface EncounterGame {
  matchId: string;
  playedAt: number;
  queueId: number | null;
  memberChampion: string | null;
  otherChampion: string | null;
  relation: Relation;
  win: boolean | null;
}

/** One player's games with the player, newest first, each once (its first record decides the side shown). */
export function encounterGames(rows: readonly EncounterRow[], key: string): EncounterGame[] {
  const seen = new Set<string>();
  return rows
    .filter((r) => r.key === key && !seen.has(r.matchId) && (seen.add(r.matchId), true))
    .sort(newer)
    .map((r) => ({ matchId: r.matchId, playedAt: r.gameCreation, queueId: r.queueId, memberChampion: r.memberChampion, otherChampion: r.otherChampion, relation: r.relation, win: r.win }));
}
