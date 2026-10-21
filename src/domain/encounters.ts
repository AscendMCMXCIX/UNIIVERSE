/*
  Encounters: the players someone keeps meeting in their recorded games, as allies (same team) or
  opponents. Shown in each profile (Match History → Players met). Historical encounters only:
  never a claim that anyone queued together, knows each other or "counters" anyone.

  Counting rules (the database computes them for a page, server/players/encounters.ts; these
  functions state the same rules and are what that query is tested against):
  - An encounter row is the player in one recorded game with one other player. A game is counted
    once however many of the player's linked accounts stored it.
  - The result is the player's own (they won or lost the game), whichever side the other player was on.
  - A game in which duplicated records put the other player on both sides counts once in each relation.
  - A player is identified by their account (an opaque key), never by name; the name shown is the
    most recent one recorded.
*/

export type Relation = "ally" | "opponent";
/** Which encounters a list is about. */
export type EncounterRelation = "opponents" | "allies" | "everyone";
export type EncounterSort = "games" | "best" | "worst";

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
const RELATIONS: readonly EncounterRelation[] = ["opponents", "allies", "everyone"];
const SORTS: readonly EncounterSort[] = ["games", "best", "worst"];

/** Met twice or more by default; once or more while searching for someone. */
export const defaultMinimum = (q: string) => (q ? 1 : 2);

/** The choices an address names; anything missing or unknown is the default (opponents, most games first). */
export function encounterListChoice(sp: { rel?: string; min?: string; sort?: string; q?: string; limit?: string }): EncounterListChoice {
  const q = (sp.q ?? "").trim().slice(0, 32);
  const min = Number(sp.min);
  const limit = Math.round(Number(sp.limit));
  return {
    relation: RELATIONS.find((r) => r === sp.rel) ?? "opponents",
    min: (ENCOUNTER_MINIMUMS as readonly number[]).includes(min) ? min : defaultMinimum(q),
    sort: SORTS.find((x) => x === sp.sort) ?? "games",
    q,
    limit: limit > ENCOUNTER_PAGE ? Math.min(MAX_SHOWN, limit) : ENCOUNTER_PAGE,
  };
}

/** The address parameters of a choice, defaults left out (the reverse of encounterListChoice). */
export function encounterListParams(c: EncounterListChoice): Record<string, string> {
  const out: Record<string, string> = {};
  if (c.relation !== "opponents") out.rel = c.relation;
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

export interface EncounterSummary {
  key: string;
  /** The most recently recorded Riot ID. */
  name: string;
  /** Distinct games with the player (either relation). */
  games: number;
  ally: WinLoss;
  opponent: WinLoss;
  lastPlayedAt: number;
  /** The match of the most recent encounter (for the server it was on). */
  lastMatchId: string;
}

const empty = (): WinLoss => ({ games: 0, wins: 0, losses: 0 });

/** Newest first; among games of the same moment, the later match id first. */
const newer = (a: { gameCreation: number; matchId: string }, b: { gameCreation: number; matchId: string }) => b.gameCreation - a.gameCreation || (a.matchId < b.matchId ? 1 : a.matchId > b.matchId ? -1 : 0);

/** Every player in the rows, with their records. */
export function summariseEncounters(rows: readonly EncounterRow[]): EncounterSummary[] {
  const byKey = new Map<string, { latest: EncounterRow; games: Map<string, { ally: boolean; opponent: boolean; win: boolean | null }> }>();
  for (const r of rows) {
    let a = byKey.get(r.key);
    if (!a) byKey.set(r.key, (a = { latest: r, games: new Map() }));
    if (newer(r, a.latest) < 0) a.latest = r;
    const g = a.games.get(r.matchId) ?? { ally: false, opponent: false, win: r.win };
    if (r.relation === "ally") g.ally = true;
    else g.opponent = true;
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
      }
    }
    out.push({ key, name: a.latest.name, games: a.games.size, ally, opponent, lastPlayedAt: a.latest.gameCreation, lastMatchId: a.latest.matchId });
  }
  return out;
}

const rate = (wl: WinLoss) => (wl.wins + wl.losses > 0 ? wl.wins / (wl.wins + wl.losses) : null);

/** The record a list is about: as opponents, as allies, or every game. */
export function recordFor(s: EncounterSummary, relation: EncounterRelation): WinLoss {
  if (relation === "allies") return s.ally;
  if (relation === "opponents") return s.opponent;
  return { games: s.games, wins: s.ally.wins + s.opponent.wins, losses: s.ally.losses + s.opponent.losses };
}

const byKey = (a: EncounterSummary, b: EncounterSummary) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * One list: players met at least `min` times in the relation. Sorted by games, or by the best or
 * worst record (records need at least `min` decided games), then the most games and the most recent.
 */
export function listEncounters(all: readonly EncounterSummary[], o: { relation: EncounterRelation; min: number; sort: EncounterSort; query?: string }): EncounterSummary[] {
  const q = (o.query ?? "").trim().toLowerCase();
  const list = all.filter((s) => (!q || s.name.toLowerCase().includes(q)) && recordFor(s, o.relation).games >= o.min);
  const byGames = (a: EncounterSummary, b: EncounterSummary) => recordFor(b, o.relation).games - recordFor(a, o.relation).games || b.lastPlayedAt - a.lastPlayedAt || byKey(a, b);
  if (o.sort === "games") return list.sort(byGames);
  const sign = o.sort === "best" ? -1 : 1;
  return list
    .filter((s) => {
      const r = recordFor(s, o.relation);
      return r.wins + r.losses >= o.min;
    })
    .sort((a, b) => sign * (rate(recordFor(a, o.relation))! - rate(recordFor(b, o.relation))!) || byGames(a, b));
}

export interface EncounterInsight {
  kind: "frequent-opponent" | "frequent-ally" | "best-ally" | "toughest-opponent";
  summary: EncounterSummary;
  record: WinLoss;
}

export const INSIGHT_LABELS: Record<EncounterInsight["kind"], string> = {
  "frequent-opponent": "Most faced opponent",
  "frequent-ally": "Most frequent ally",
  "best-ally": "Best record alongside",
  "toughest-opponent": "Toughest record against",
};

/** At most one of each, and only when enough games stand behind it. Neutral wording only. */
export function encounterInsights(all: readonly EncounterSummary[]): EncounterInsight[] {
  const pick = (score: (s: EncounterSummary) => number | null) => {
    let best: EncounterSummary | null = null;
    let bestScore = -Infinity;
    for (const s of all) {
      const v = score(s);
      if (v === null) continue;
      if (!best || v > bestScore || (v === bestScore && (s.games > best.games || (s.games === best.games && (s.lastPlayedAt > best.lastPlayedAt || (s.lastPlayedAt === best.lastPlayedAt && byKey(s, best) < 0)))))) {
        best = s;
        bestScore = v;
      }
    }
    return best;
  };
  const insights: EncounterInsight[] = [];
  const add = (kind: EncounterInsight["kind"], s: EncounterSummary | null, record: (s: EncounterSummary) => WinLoss) => {
    if (s) insights.push({ kind, summary: s, record: record(s) });
  };
  add("frequent-opponent", pick((s) => (s.opponent.games >= INSIGHT_MIN_GAMES.frequent ? s.opponent.games : null)), (s) => s.opponent);
  add("frequent-ally", pick((s) => (s.ally.games >= INSIGHT_MIN_GAMES.frequent ? s.ally.games : null)), (s) => s.ally);
  add("best-ally", pick((s) => (s.ally.wins + s.ally.losses >= INSIGHT_MIN_GAMES.record ? rate(s.ally) : null)), (s) => s.ally);
  add("toughest-opponent", pick((s) => (s.opponent.wins + s.opponent.losses >= INSIGHT_MIN_GAMES.record ? -rate(s.opponent)! : null)), (s) => s.opponent);
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
