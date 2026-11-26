import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import type { MatchParticipantDetail } from "@/server/db/schema";
import { togetherEntry } from "@/domain/played-together";
import { scoreReadsTimeline } from "@/domain/performance-inputs";
import { loadScoreTimelines, type StoredScoreTimeline } from "@/server/accounts/match-timeline";
import { gameScores, performanceOf, scoreRecordOf, type CardPerformance } from "@/server/players/match-history";
import { normaliseRiotKey } from "@/server/riot/api/client";
import { isRemoved } from "@/server/privacy/redact";
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

/**
 * The members' scores on a Team → Matches page, by the listed entry (togetherEntry) and member:
 * each game scored once, whichever of its sides is listed. A member is found in the record by
 * their linked accounts' PUUIDs on the listed side, else (an account being verified again) by side
 * and champion when one player matches: never guessed. A game without a stored record, or a member
 * not found in it, has no score; a game whose score waits for its timeline is "pending", as on the
 * member's own card (Riot configured).
 */
export async function togetherScores(db: Db, teamId: string, shown: readonly TogetherScoreGame[], site: { riotConfigured?: boolean } = {}): Promise<Record<string, Record<string, CardPerformance>>> {
  const out: Record<string, Record<string, CardPerformance>> = {};
  if (!shown.length) return out;
  const sources = await loadScoreSources(db, shown.map((g) => g.matchId));
  const records = new Map([...sources].map(([matchId, d]) => [matchId, { d, record: scoreRecordOf(d, d.participants[0]!) }] as const).filter(([, r]) => r.d.participants.length > 0));
  const laneGames = [...records].flatMap(([matchId, r]) => (scoreReadsTimeline(r.record) ? [matchId] : []));
  const [members, timelines] = await Promise.all([
    teamMembersByPuuid(db, teamId, [...records.values()].flatMap((r) => r.d.participants.map((p) => p.puuid))),
    laneGames.length ? loadScoreTimelines(db, laneGames) : Promise.resolve(new Map<string, StoredScoreTimeline>()),
  ]);
  const riotConfigured = site.riotConfigured ?? normaliseRiotKey(process.env.RIOT_API_KEY) !== null;
  const scored = new Map<string, ReturnType<typeof gameScores>>();
  for (const g of shown) {
    const r = records.get(g.matchId);
    const entry: Record<string, CardPerformance> = {};
    out[togetherEntry(g.matchId, g.teamId)] = entry;
    if (!r) {
      for (const m of g.members) entry[m.playerId] = { state: "none" };
      continue;
    }
    const parts = r.d.participants;
    const slotOf = (m: { playerId: string; championId: string }): number => {
      const byAccount = parts.findIndex((p) => !isRemoved(p) && p.teamId === g.teamId && members.get(p.puuid)?.id === m.playerId);
      if (byAccount >= 0) return byAccount;
      const byChampion = parts.flatMap((p, i) => (!isRemoved(p) && p.teamId === g.teamId && p.championId === m.championId ? [i] : []));
      return byChampion.length === 1 ? byChampion[0]! : -1;
    };
    const slots = g.members.map(slotOf);
    if (!scored.has(g.matchId)) {
      // The gold check's side: any member's PUUID in the game (a symmetric check).
      const own = new Set(slots.filter((s) => s >= 0).map((s) => parts[s]!.puuid).filter(Boolean));
      scored.set(g.matchId, gameScores(r.d, r.record, timelines.get(g.matchId), own, riotConfigured));
    }
    const scores = scored.get(g.matchId)!;
    g.members.forEach((m, i) => (entry[m.playerId] = slots[i]! >= 0 ? performanceOf(scores, slots[i]!) : { state: "none" }));
  }
  return out;
}
