import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { currentSeason } from "@/server/accounts/sync";
import { LANE_NAMES } from "@/domain/match-analysis";
import { MIN_VALID_DURATION_S } from "@/domain/season-stats";
import { offeredCurrentSeason } from "@/domain/season";
import { LANE_QUEUE_IDS, LANE_QUEUE_KEYS, type LaneQueueKey } from "@/domain/matchup/queues";
import { MIN_LANE_GAMES } from "@/domain/matchup/lane-evidence";
import { notesCounts } from "./notes-store";

/*
  Matchup Intel's coverage, counted for the data-audit job (docs/MATCHUP_INTEL.md, "Coverage"):
  how many lane pairings the team's stored games hold this season, and how many reach the figures'
  threshold (MIN_LANE_GAMES games with a timeline), so the threshold and window rules can be checked
  against production's real counts. Counts only: no champion's name, no player, no match id (the
  data-audit job's output is printed in public Actions logs).

  - members: the members' own lanes (account_matches, the lane opponent the rule stored), distinct
    pairings (role, champion, opponent), by queue and over the four draft queues.
  - everyLane: every lane of the members' draft records (both teams), by Riot's team position, else
    the merged position, one holder on each side and no erased seat (the lane rule's common case),
    unordered pairs with a timeline, by queue.
  - notes: the reviewed notes by state now.
*/

const rowsOf = (result: unknown): Array<Record<string, unknown>> => ((result as { rows?: Array<Record<string, unknown>> }).rows ?? (result as Array<Record<string, unknown>>)) as Array<Record<string, unknown>>;
const num = (v: unknown) => Number(v ?? 0);

export interface CoverageBuckets {
  pairings: number;
  atLeast1: number;
  atLeast5: number;
  atLeast10: number;
  atLeast20: number;
  laneGames: number;
  /** The share of the lane games in pairings with MIN_LANE_GAMES games or more (0–1, three decimals). */
  shareInPairingsOf10: number;
}

function buckets(ns: number[]): CoverageBuckets {
  const games = ns.reduce((s, n) => s + n, 0);
  const inTen = ns.filter((n) => n >= MIN_LANE_GAMES).reduce((s, n) => s + n, 0);
  return { pairings: ns.length, atLeast1: ns.filter((n) => n >= 1).length, atLeast5: ns.filter((n) => n >= 5).length, atLeast10: ns.filter((n) => n >= 10).length, atLeast20: ns.filter((n) => n >= 20).length, laneGames: games, shareInPairingsOf10: games ? Math.round((inTen / games) * 1000) / 1000 : 0 };
}

export async function matchupCoverage(db: Db): Promise<{ season: number; members: Record<LaneQueueKey | "allDraft", CoverageBuckets>; everyLane: Record<LaneQueueKey, CoverageBuckets>; notes: Awaited<ReturnType<typeof notesCounts>> | null }> {
  const season = offeredCurrentSeason(await currentSeason(db));
  const prefix = `${season}.%`;
  const queues = sql.raw(LANE_QUEUE_KEYS.map((k) => String(LANE_QUEUE_IDS[k])).join(", "));
  const own = rowsOf(
    await db.execute(sql`
      SELECT am.queue_id, am.role::text AS role, am.champion_id AS c, am.enemy_champion_id AS e, json_agg(DISTINCT am.match_id) AS ids
      FROM account_matches am
      JOIN riot_accounts ra ON ra.id = am.account_id AND ra.owner_type = 'player'
      JOIN players p ON p.id = ra.player_id AND p.team_member AND p.archived_at IS NULL
      WHERE am.win IS NOT NULL AND am.game_duration >= ${MIN_VALID_DURATION_S} AND am.enemy_champion_id IS NOT NULL AND am.champion_id IS NOT NULL AND am.role IS NOT NULL
        AND am.queue_id IN (${queues}) AND am.patch LIKE ${prefix}
      GROUP BY am.queue_id, am.role, am.champion_id, am.enemy_champion_id`),
  );
  const whens = Object.entries(LANE_NAMES).map(([name, lane]) => `WHEN '${name}' THEN '${lane}'`).join(" ");
  const lane = sql.raw(`(CASE coalesce(nullif(p->>'teamPosition', ''), p->>'position') ${whens} END)`);
  const every = rowsOf(
    await db.execute(sql`
      WITH rec AS (
        SELECT d.match_id, d.queue_id, d.participants FROM match_details d
        WHERE d.queue_id IN (${queues}) AND d.game_version LIKE ${prefix} AND d.game_duration >= 600
          AND EXISTS (SELECT 1 FROM account_matches am JOIN riot_accounts ra ON ra.id = am.account_id AND ra.owner_type = 'player' JOIN players pl ON pl.id = ra.player_id AND pl.team_member AND pl.archived_at IS NULL WHERE am.match_id = d.match_id)
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.participants) AS x WHERE (x->>'removed') IS NOT NULL)
      ),
      seat AS (
        SELECT r.match_id, r.queue_id, p->>'teamId' AS team, p->>'championId' AS champ, ${lane} AS lane
        FROM rec r CROSS JOIN LATERAL jsonb_array_elements(r.participants) AS p
      ),
      held AS (
        SELECT match_id, queue_id, lane, count(*) FILTER (WHERE team = '100') AS nb, count(*) FILTER (WHERE team = '200') AS nr, min(champ) FILTER (WHERE team = '100') AS cb, min(champ) FILTER (WHERE team = '200') AS cr
        FROM seat WHERE lane IS NOT NULL GROUP BY match_id, queue_id, lane
      ),
      pairs AS (
        SELECT h.queue_id, h.lane, least(h.cb, h.cr) AS a, greatest(h.cb, h.cr) AS b, h.match_id FROM held h WHERE h.nb = 1 AND h.nr = 1 AND h.cb IS NOT NULL AND h.cr IS NOT NULL AND h.cb <> h.cr
      )
      SELECT p.queue_id, count(DISTINCT p.match_id) FILTER (WHERE t.frames IS NOT NULL) AS n
      FROM pairs p LEFT JOIN match_timelines t ON t.match_id = p.match_id
      GROUP BY p.queue_id, p.lane, p.a, p.b`),
  );
  const byQueue = (list: Array<Record<string, unknown>>, key: LaneQueueKey) => list.filter((r) => num(r.queue_id) === LANE_QUEUE_IDS[key]).map((r) => num(r.n));
  // The champions' ids stay here: only the counts are returned.
  const idsOf = (v: unknown): string[] => (typeof v === "string" ? (JSON.parse(v) as string[]) : Array.isArray(v) ? (v as string[]) : []);
  const ownRows = own.map((r) => ({ queue_id: r.queue_id, n: idsOf(r.ids).length, key: `${r.role}|${r.c}|${r.e}`, ids: idsOf(r.ids) }));
  const merged = new Map<string, Set<string>>();
  for (const r of ownRows) {
    const set = merged.get(r.key) ?? new Set<string>();
    for (const id of r.ids) set.add(id);
    merged.set(r.key, set);
  }
  const members = Object.fromEntries([...LANE_QUEUE_KEYS.map((k) => [k, buckets(byQueue(ownRows, k))]), ["allDraft", buckets([...merged.values()].map((s) => s.size))]]) as Record<LaneQueueKey | "allDraft", CoverageBuckets>;
  const everyLane = Object.fromEntries(LANE_QUEUE_KEYS.map((k) => [k, buckets(byQueue(every, k).filter((n) => n > 0))])) as Record<LaneQueueKey, CoverageBuckets>;
  return { season, members, everyLane, notes: await notesCounts(db).catch(() => null) };
}
