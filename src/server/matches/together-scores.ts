import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import type { MatchParticipantDetail } from "@/server/db/schema";
import { togetherEntry } from "@/domain/played-together";
import { scoreReadsTimeline } from "@/domain/performance-inputs";
import { loadScoreTimelines, type StoredScoreTimeline } from "@/server/accounts/match-timeline";
import { gameScores, performanceOf, scoreRecordOf, type CardPerformance, type PlacedScores } from "@/server/players/match-history";
import { normaliseRiotKey } from "@/server/riot/api/client";
import { isRemoved } from "@/server/privacy/redact";
import { registerLocalCache } from "@/server/observability/cache";
import { teamMembersByPuuid } from "./compositions";

/*
  Each member's performance score and place on Team → Matches (the owner's requirements of 25 Nov
  2026, §1: one look for places across the site), the same score and place their own Match History
  card and the opened game show: each shown game is scored once, through Match History's own
  functions (server/players/match-history gameScores: the record by recordTeamsOf and
  scoreFiguresOf, the lane from the stored timeline by scoreTimelineOf), and every member's place is
  read from that one answer. Only the figures the score reads are sent by the database (no names,
  items, runes or challenges; the timeline's gold and experience only for Summoner's Rift games with
  a lane opponent): docs/HOSTING_USAGE.md has the measured bytes. No Riot request.

  A finished game's scores change only when its stored record or timeline does, so each instance
  keeps the scores it worked out (KEEP_MS, at most KEEP_GAMES games, the oldest dropped first): the
  page's "Show more", which renders it again with 20 more games, reads only the games not kept. Not
  kept: a game without a stored record (its record may come with a member's next sync). A game whose
  score waits for its timeline ("pending") keeps its trimmed record, and only its timeline is asked
  for again. A personal-data erasure clears every kept score on its instance at once
  (registerLocalCache), other instances within KEEP_MS, as Played together's own list does.
*/

/** A stored record reduced to what the score reads. */
export interface ScoreSource {
  queueId: number | null;
  gameDuration: number;
  teams: Array<{ teamId: number; win?: boolean; objectives: Record<string, number> }>;
  /** The record's players in their places, each with the score's figures only (the other fields empty). */
  participants: MatchParticipantDetail[];
}

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const json = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

/** Each player's fields the score and the member's place read, in the order the query sends them. */
const PART_FIELDS = ["puuid", "teamId", "win", "championId", "removed", "position", "teamPosition", "individualPosition", "kills", "deaths", "assists", "cs", "gold", "damage", "damageTaken", "vision", "wardsPlaced"] as const;
/** The extra figures the score reads (domain/performance-inputs ScoreParticipant.stats). */
const SCORE_STATS = ["damageMitigated", "wardsKilled", "objectiveDamage", "turretTakedowns", "ccSeconds", "teamHealing", "teamShielding"] as const;

/**
 * These games' records, trimmed in the database to what the score reads: the queue, the length, each
 * team's result and kills, and each player's side, positions, champion and figures (one query, by
 * primary key). A key Riot did not send stays absent, as in the stored record.
 */
export async function loadScoreSources(db: Db, matchIds: readonly string[]): Promise<Map<string, ScoreSource>> {
  const ids = [...new Set(matchIds)];
  const out = new Map<string, ScoreSource>();
  if (!ids.length) return out;
  // Arrays, not objects: the keys would cost more than the figures. A key Riot did not send is null.
  const fields = sql.raw([...PART_FIELDS.map((k) => `p->'${k}'`), ...SCORE_STATS.map((k) => `p->'stats'->'${k}'`)].join(", "));
  const result = await db.execute(sql`
    SELECT md.match_id, md.queue_id, md.game_duration,
           (SELECT json_agg(json_build_array(t->'teamId', t->'win', t->'objectives'->'champion')) FROM jsonb_array_elements(md.teams) t) AS teams,
           (SELECT json_agg(json_build_array(${fields}) ORDER BY s.ord) FROM jsonb_array_elements(md.participants) WITH ORDINALITY AS s(p, ord)) AS participants
    FROM match_details md
    WHERE md.match_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  for (const r of rowsOf<{ match_id: string; queue_id: number | null; game_duration: number; teams: unknown; participants: unknown }>(result)) {
    const teams = json<Array<[number, boolean | null, number | null]> | null>(r.teams) ?? [];
    const parts = json<unknown[][] | null>(r.participants) ?? [];
    out.set(r.match_id, {
      queueId: r.queue_id === null ? null : Number(r.queue_id),
      gameDuration: Number(r.game_duration),
      teams: teams.map(([teamId, win, champion]) => ({ teamId: Number(teamId), win: typeof win === "boolean" ? win : undefined, objectives: (typeof champion === "number" ? { champion } : {}) as Record<string, number> })),
      participants: parts.map((row): MatchParticipantDetail => {
        const v = Object.fromEntries(PART_FIELDS.map((k, i) => [k, row[i]])) as Record<(typeof PART_FIELDS)[number], unknown>;
        const stats = Object.fromEntries(SCORE_STATS.flatMap((k, i) => (typeof row[PART_FIELDS.length + i] === "number" ? [[k, row[PART_FIELDS.length + i]]] : [])));
        return {
          puuid: str(v.puuid) ?? "",
          name: null,
          teamId: Number(v.teamId),
          championId: str(v.championId),
          championKey: 0,
          champLevel: null,
          position: str(v.position),
          ...(typeof v.teamPosition === "string" ? { teamPosition: v.teamPosition } : {}),
          ...(typeof v.individualPosition === "string" ? { individualPosition: v.individualPosition } : {}),
          win: v.win === true,
          kills: num(v.kills) ?? 0,
          deaths: num(v.deaths) ?? 0,
          assists: num(v.assists) ?? 0,
          cs: num(v.cs),
          gold: num(v.gold),
          damage: num(v.damage),
          damageTaken: num(v.damageTaken),
          vision: num(v.vision),
          wardsPlaced: num(v.wardsPlaced),
          items: null,
          spells: null,
          runes: null,
          ...(Object.keys(stats).length ? { stats } : {}),
          ...(v.removed === true ? { removed: true as const } : {}),
        };
      }),
    });
  }
  return out;
}

/** The members of a listed game: which player, on which side, on which champion. */
export interface TogetherScoreGame {
  matchId: string;
  teamId: number | null;
  members: ReadonlyArray<{ playerId: string; championId: string }>;
}

/** A record's players as a member is found among them: by their PUUID or by side and champion. */
type Seat = { puuid: string; teamId: number; championId: string | null; removed: boolean };

/** A scored game as an instance keeps it: its seats, and each player's score and place (nothing else of the record). */
type KeptGame = { seats: Seat[]; scores: PlacedScores | null } | { seats: Seat[]; scores: "pending"; source: { d: ScoreSource; record: ReturnType<typeof scoreRecordOf> } };

const KEEP_MS = 15 * 60_000;
const KEEP_GAMES = 1_000;
const kept = new Map<string, { at: number; game: KeptGame }>();
registerLocalCache(() => kept.clear());

/** Drops every kept score on this instance (tests; an erasure does it through registerLocalCache). */
export function invalidateTogetherScores(): void {
  kept.clear();
}

/** Each database handle its own keys, so tests (and tools) that open several databases in one process never share a game's scores. */
const scopes = new WeakMap<object, number>();
let scopeCount = 0;
function keyOf(db: Db, riotConfigured: boolean, matchId: string): string {
  let scope = scopes.get(db);
  if (scope === undefined) {
    scope = ++scopeCount;
    scopes.set(db, scope);
  }
  return `${scope}/${riotConfigured ? 1 : 0}/${matchId}`;
}

function keep(key: string, game: KeptGame): void {
  kept.delete(key);
  kept.set(key, { at: Date.now(), game });
  for (const oldest of kept.keys()) {
    if (kept.size <= KEEP_GAMES) break;
    kept.delete(oldest);
  }
}

/**
 * A game's scores, once for the game whichever of its sides is listed. The timeline's gold check
 * (does the timeline tell the same game as the record?) reads the gold from one side and is
 * symmetric, so it is read from every player's side at once (every PUUID in the record): the same
 * answer the opened game gets from its own player's, whichever side is listed first.
 */
function scoreGame(source: { d: ScoreSource; record: ReturnType<typeof scoreRecordOf> }, stored: StoredScoreTimeline | undefined, riotConfigured: boolean): KeptGame {
  const { d, record } = source;
  const seats = d.participants.map((p) => ({ puuid: p.puuid, teamId: p.teamId, championId: p.championId, removed: isRemoved(p) }));
  const own = new Set(seats.filter((p) => !p.removed && p.puuid).map((p) => p.puuid));
  const scores = gameScores(d, record, stored, own, riotConfigured);
  if (scores === "pending") return { seats, scores, source };
  return { seats, scores: scores && { scored: scores.scored, version: scores.version, players: scores.players.map(({ slot, score, rank, mvp, ace }) => ({ slot, score, rank, mvp, ace })) } };
}

/**
 * The members' scores on a Team → Matches page, by the listed entry (togetherEntry) and member:
 * each game scored once, whichever of its sides is listed. A member is found in the record by
 * their linked accounts' PUUIDs on the listed side, else (an account being verified again) by side
 * and champion when one player matches: never guessed. A game without a stored record (or one
 * stored without players, Riot no longer serving it), or a member not found in it, has no score; a
 * game whose score waits for its timeline is "pending", as on the member's own card (Riot
 * configured).
 */
export async function togetherScores(db: Db, teamId: string, shown: readonly TogetherScoreGame[], site: { riotConfigured?: boolean } = {}): Promise<Record<string, Record<string, CardPerformance>>> {
  const out: Record<string, Record<string, CardPerformance>> = {};
  if (!shown.length) return out;
  const riotConfigured = site.riotConfigured ?? normaliseRiotKey(process.env.RIOT_API_KEY) !== null;
  const now = Date.now();
  const games = new Map<string, KeptGame>();
  const waiting: string[] = [];
  const unread: string[] = [];
  for (const matchId of new Set(shown.map((g) => g.matchId))) {
    const hit = kept.get(keyOf(db, riotConfigured, matchId));
    if (!hit || now - hit.at >= KEEP_MS) unread.push(matchId);
    else if (hit.game.scores === "pending") waiting.push(matchId);
    else games.set(matchId, hit.game);
  }
  // The games not kept: their trimmed records, and every one still waiting for its timeline.
  const sources = unread.length ? await loadScoreSources(db, unread) : new Map<string, ScoreSource>();
  // A record Riot no longer serves is stored without players (storeMatchUnavailable): nothing to score it by.
  const records = new Map([...sources].filter(([, d]) => d.participants.length > 0).map(([matchId, d]) => [matchId, { d, record: scoreRecordOf(d, d.participants[0]!) }] as const));
  for (const matchId of waiting) {
    const hit = kept.get(keyOf(db, riotConfigured, matchId))!.game;
    if (hit.scores === "pending") records.set(matchId, hit.source);
  }
  const laneGames = [...records].flatMap(([matchId, r]) => (scoreReadsTimeline(r.record) ? [matchId] : []));
  const timelines = laneGames.length ? await loadScoreTimelines(db, laneGames) : new Map<string, StoredScoreTimeline>();
  for (const [matchId, r] of records) {
    const game = scoreGame(r, timelines.get(matchId), riotConfigured);
    games.set(matchId, game);
    keep(keyOf(db, riotConfigured, matchId), game);
  }
  const members = await teamMembersByPuuid(db, teamId, [...games.values()].flatMap((g) => g.seats.map((s) => s.puuid)));
  for (const g of shown) {
    const game = games.get(g.matchId);
    const entry: Record<string, CardPerformance> = {};
    out[togetherEntry(g.matchId, g.teamId)] = entry;
    if (!game) {
      for (const m of g.members) entry[m.playerId] = { state: "none" };
      continue;
    }
    const seats = game.seats;
    const slotOf = (m: { playerId: string; championId: string }): number => {
      const byAccount = seats.findIndex((p) => !p.removed && p.teamId === g.teamId && members.get(p.puuid)?.id === m.playerId);
      if (byAccount >= 0) return byAccount;
      const byChampion = seats.flatMap((p, i) => (!p.removed && p.teamId === g.teamId && p.championId === m.championId ? [i] : []));
      return byChampion.length === 1 ? byChampion[0]! : -1;
    };
    for (const m of g.members) {
      const slot = slotOf(m);
      entry[m.playerId] = slot >= 0 ? performanceOf(game.scores, slot) : { state: "none" };
    }
  }
  return out;
}
