import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { registerLocalCache } from "@/server/observability/cache";
import { seasonGames } from "@/domain/leaderboard-records";
import { buildMultikillBaseline, type BaselineRow, type MultikillBaseline } from "@/domain/multikill-score";
import { loadCountingReading } from "@/server/accounts/multikill-counting";
import type { LeaderboardData } from "./service";

/*
  The multikill score's comparison (domain/multikill-score, docs/TEAM_LEADERBOARDS.md "The multikill
  score"): every other player in the members' stored games of the season (allies and opponents; never
  a team member, never a removed player), as aggregates only. One statement over the season's stored
  games, the very games the season records count (seasonGames), answered as about one row per
  position and champion (each a short array: position, champion, games, and the multikills under
  both readings of Riot's counters). How Riot counts is read once for every page that shows
  multikills (server/accounts/multikill-counting), so the board and the profiles agree. No PUUID,
  name or game leaves the database; nothing about any one player is kept.

  Cost: the statement reads `match_multikills`, the players' counters the database copies from each
  stored record (migration 0070), about 150 bytes a player, instead of opening every record's
  players from TOAST storage, which took about 3 s on production's disk for a season of ~2,800
  records (26 Nov 2026; docs/PERFORMANCE.md, 27 Nov 2026: 14 ms warm and 25–33 ms cold locally for
  22,000 players, against 182–520 ms). The answer is a few KB. A comparison of thousands of games
  moves little with a few more, so it is cached per team and season for up to 30 minutes, the most
  PRIVACY.md lets another instance keep what an erasure removed, and recomputed after 10 minutes
  when the team's stored history has changed (the games cache's fingerprint).
*/

const MAX_AGE_MS = 30 * 60_000;
const REFRESH_AFTER_MS = 10 * 60_000;

interface Cached {
  key: string;
  at: number;
  baseline: MultikillBaseline;
}
const cache = new Map<string, Cached>();

/** Forget cached comparisons (tests, or after a change the fingerprint cannot see). */
export function invalidateMultikillBaselineCache() {
  cache.clear();
}
registerLocalCache(invalidateMultikillBaselineCache);

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const parse = <T,>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

type Row = [string | null, string | null, number, number, number, number, number, number, number, number, number];

/**
 * The comparison for one season of the team's games: the other players in the same stored records,
 * read with the counting rule those records show. `data` is the team's load (its season games and
 * the members' accounts); `now` for tests.
 */
export async function loadMultikillBaseline(db: Db, teamId: string, data: Pick<LeaderboardData, "games" | "memberPuuids" | "historyKey">, season: number, now = Date.now()): Promise<MultikillBaseline> {
  const matchIds = [...new Set(seasonGames(data.games, season).map((g) => g.matchId))].sort();
  const key = `${data.historyKey ?? ""}|${matchIds.length}`;
  const id = `${teamId}|${season}`;
  const hit = cache.get(id);
  if (hit && now - hit.at < MAX_AGE_MS && (hit.key === key || now - hit.at < REFRESH_AFTER_MS)) return hit.baseline;
  const reading = await loadCountingReading(db);
  const baseline = buildMultikillBaseline(matchIds.length ? await readBaseline(db, matchIds, data.memberPuuids ?? []) : [], reading.evidence);
  cache.set(id, { key, at: now, baseline });
  return baseline;
}

/**
 * The comparison's one statement for these games and members (the probe also explains it). Each
 * list goes in as one text parameter, split in the statement, so Postgres plans for the real number
 * of games (a JSON array always reads as 100 to the planner, which on a larger table turns the read
 * into one index probe per game: 1,496 random page reads against 3,525 sequential at four times
 * production's size, docs/PERFORMANCE.md 27 Nov 2026). Riot's match ids and PUUIDs hold no comma; a
 * value that did could be no stored game or player, so leaving it out changes nothing.
 */
function baselineStatement(matchIds: readonly string[], memberPuuids: readonly string[]): SQL {
  const ids = [...new Set(matchIds)].filter((m) => m && !m.includes(",")).join(",");
  const members = [...new Set(memberPuuids)].filter((p) => p && !p.includes(",")).join(",");
  return sql`
    SELECT coalesce(json_agg(json_build_array(position, champion_id, games, n2, n3, n4, n5, s2, s3, s4, s5)), '[]') AS rows FROM (
      SELECT position, champion_id, count(*)::int AS games,
        sum(greatest(doubles - triples, 0))::int AS n2, sum(greatest(triples - quadras, 0))::int AS n3,
        sum(greatest(quadras - pentas, 0))::int AS n4, sum(pentas)::int AS n5,
        sum(doubles)::int AS s2, sum(triples)::int AS s3, sum(quadras)::int AS s4, sum(pentas)::int AS s5
      FROM match_multikills
      WHERE match_id = ANY (string_to_array(${ids}, ',')) AND puuid <> ALL (string_to_array(${members}, ','))
      GROUP BY position, champion_id) groups`;
}

/** The comparison's rows for these games, leaving the members out (exported for the equivalence test). */
export async function readBaseline(db: Db, matchIds: readonly string[], memberPuuids: readonly string[]): Promise<BaselineRow[]> {
  const result = await db.execute(baselineStatement(matchIds, memberPuuids));
  const [answer] = rowsOf<{ rows: unknown }>(result);
  const rows: BaselineRow[] = parse<Row[]>(answer?.rows ?? []).map(([position, championId, games, n2, n3, n4, n5, s2, s3, s4, s5]) => ({
    position,
    championId,
    games: Number(games),
    nested: { double: Number(n2), triple: Number(n3), quadra: Number(n4), penta: Number(n5) },
    separate: { double: Number(s2), triple: Number(s3), quadra: Number(s4), penta: Number(s5) },
  }));
  return rows;
}

/** What Postgres did for one computation of the comparison (the production probe's counts; no value of any row). */
export interface BaselinePlan {
  /** Postgres's own execution time, ms. */
  executionMs: number;
  /** Pages found in Postgres's cache, read from disk (or the OS cache), and written to or read from temporary files. */
  hit: number;
  read: number;
  temp: number;
  /** The tables the plan reads, by name (the comparison reads match_multikills only). */
  relations: string[];
}

/**
 * The season's comparison statement run under EXPLAIN (ANALYZE, BUFFERS): how many pages it read and
 * from where, and which tables, so the probe shows on production that the comparison reads the
 * players' counters and never the records (docs/PERFORMANCE.md, 27 Nov 2026). The plan's filter text
 * names match ids; only numbers and table names are taken from it.
 */
export async function explainMultikillBaseline(db: Db, data: Pick<LeaderboardData, "games" | "memberPuuids">, season: number): Promise<BaselinePlan> {
  const matchIds = [...new Set(seasonGames(data.games, season).map((g) => g.matchId))];
  const result = await db.execute(sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${baselineStatement(matchIds, data.memberPuuids ?? [])}`);
  const [row] = rowsOf<Record<string, unknown>>(result);
  const value = parse<unknown>(row ? Object.values(row)[0] : null);
  const top = (Array.isArray(value) ? value[0] : value) as { Plan?: PlanNode; "Execution Time"?: number } | undefined;
  const relations = new Set<string>();
  const walk = (node: PlanNode | undefined) => {
    if (!node) return;
    if (typeof node["Relation Name"] === "string") relations.add(node["Relation Name"]);
    for (const child of node.Plans ?? []) walk(child);
  };
  walk(top?.Plan);
  const n = (k: keyof PlanNode) => Number(top?.Plan?.[k] ?? 0) || 0;
  return { executionMs: Math.round((top?.["Execution Time"] ?? 0) * 10) / 10, hit: n("Shared Hit Blocks"), read: n("Shared Read Blocks"), temp: n("Temp Read Blocks") + n("Temp Written Blocks"), relations: [...relations].sort() };
}

interface PlanNode {
  "Relation Name"?: string;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  "Temp Read Blocks"?: number;
  "Temp Written Blocks"?: number;
  Plans?: PlanNode[];
}
