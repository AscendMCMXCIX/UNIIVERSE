import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { confirmedOpponent, matchPrep, PREP_FORMAT, type MatchPrep, type PrepItemInfo, type PrepParticipant, type PrepTimeline } from "@/domain/matchup-intel/prep";
import { loadRiotBuildData } from "@/server/riot/static/assets";
import { invalidateCache } from "@/server/observability/cache";

/*
  MATCHUP INTEL's evidence rows (account_match_prep, docs/MATCHUP_INTEL.md, "In your games"): made
  from each member's stored game, its record and its timeline, by domain/matchup-intel/prep.ts.
  - prep-backfill (a setup job, by hand) inserts the rows still missing, at most `limit` games a
    run, newest first, and makes again the rows whose starting set still counts first-minute
    sales (STALE_START). Nothing else is replaced, so a second run writes nothing, and a run that
    stops leaves what it wrote.
  - Storing a timeline (match-timeline.ts, timeline-backfill.ts) makes its game's rows again
    (refreshMatchPrep), so a game stored before its timeline gains the timeline's fields.
  Only what preparation needs is read: the ten players' places, champions, spells and runes; the
  members' own purchases and skill points, the objectives, and the positions of the members and
  their lane opponents. No Riot request, and no name or PUUID ever leaves this module.
*/

/** The queues Matchup Intel counts: Summoner's Rift's (draft, ranked, blind, Swiftplay, Quickplay, Clash). */
export const RIFT_QUEUES = [400, 420, 430, 440, 480, 490, 700] as const;
/** The most games one backfill run reads (PLAN S7b: about 5 MB of egress a run, measured in docs/HOSTING_USAGE.md). */
export const PREP_BACKFILL_LIMIT = 1_000;
/** Games read from the database at once. */
const CHUNK = 100;
import { EVIDENCE_CACHE } from "./evidence-cache";
export { EVIDENCE_CACHE };

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const parse = <T,>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));
const queueList = sql.raw(RIFT_QUEUES.join(", "));

interface GameRow {
  account_id: string;
  match_id: string;
  puuid: string | null;
}

/** The members' rows of these games (rift queues, a champion stored), with each account's PUUID (never leaves this module). */
async function memberRows(db: Db, matchIds: readonly string[]): Promise<GameRow[]> {
  if (!matchIds.length) return [];
  return rowsOf<GameRow>(
    await db.execute(sql`
      SELECT am.account_id, am.match_id, ra.puuid
      FROM account_matches am JOIN riot_accounts ra ON ra.id = am.account_id
      WHERE am.match_id IN (${sql.join(matchIds.map((m) => sql`${m}`), sql`, `)})
        AND am.champion_id IS NOT NULL AND am.queue_id IN (${queueList})`),
  );
}

/** The records' players, trimmed to what preparation reads (about 2 KB a game). */
async function recordsOf(db: Db, matchIds: readonly string[]): Promise<Map<string, PrepParticipant[]>> {
  const rows = rowsOf<{ match_id: string; parts: unknown }>(
    await db.execute(sql`
      SELECT d.match_id, (
        SELECT jsonb_agg(jsonb_build_object(
          'puuid', p->'puuid', 'teamId', p->'teamId', 'championId', p->'championId', 'position', p->'position',
          'teamPosition', p->'teamPosition', 'individualPosition', p->'individualPosition', 'removed', p->'removed',
          'spells', p->'spells', 'runes', p->'runes') ORDER BY ord)
        FROM jsonb_array_elements(d.participants) WITH ORDINALITY AS x(p, ord)
      ) AS parts
      FROM match_details d WHERE d.match_id IN (${sql.join(matchIds.map((m) => sql`${m}`), sql`, `)})`),
  );
  return new Map(rows.map((r) => [r.match_id, (parse<PrepParticipant[] | null>(r.parts) ?? []).map((p) => ({ ...p, removed: p.removed === true }))]));
}

/**
 * The timelines, trimmed: the named players' purchases and skill points, the objectives, the frames'
 * times and the named players' positions (`wanted`: by game, the members and their lane opponents).
 */
async function timelinesOf(db: Db, wanted: ReadonlyMap<string, readonly string[]>): Promise<Map<string, PrepTimeline>> {
  if (!wanted.size) return new Map();
  const ask = JSON.stringify(Object.fromEntries(wanted));
  const rows = rowsOf<{ match_id: string; parts: unknown; objectives: unknown; sales_kept: unknown; t: unknown; pos: unknown }>(
    await db.execute(sql`
      WITH ask AS (SELECT ${ask}::jsonb AS m)
      SELECT tl.match_id,
        (SELECT jsonb_agg(jsonb_build_object('puuid', p->'puuid', 'purchases', p->'purchases', 'skills', p->'skills', 'sold', p->'sold'))
           FROM jsonb_array_elements(tl.participants) p
           WHERE (ask.m -> tl.match_id) ? (p->>'puuid')) AS parts,
        tl.events->'objectives' AS objectives,
        COALESCE(tl.events ? 'plates', false) AS sales_kept,
        tl.frames->'t' AS t,
        (SELECT jsonb_object_agg(k, jsonb_build_object('px', v->'px', 'py', v->'py'))
           FROM jsonb_each(COALESCE(tl.frames->'p', '{}'::jsonb)) AS e(k, v)
           WHERE (ask.m -> tl.match_id) ? k) AS pos
      FROM match_timelines tl, ask
      WHERE tl.match_id IN (SELECT jsonb_object_keys(ask.m)) AND jsonb_array_length(tl.participants) > 0`),
  );
  const out = new Map<string, PrepTimeline>();
  for (const r of rows) {
    const parts = parse<PrepTimeline["participants"] | null>(r.parts) ?? [];
    const objectives = parse<NonNullable<PrepTimeline["events"]>["objectives"] | null>(r.objectives);
    const t = parse<number[] | null>(r.t);
    const pos = parse<Record<string, { px?: number[] | null; py?: number[] | null }> | null>(r.pos) ?? {};
    const p = Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, { ...(v.px ? { px: v.px } : {}), ...(v.py ? { py: v.py } : {}) }]));
    // A timeline kept from 20 Nov 2026 on keeps the plates and the sales (completedTimeline's rule).
    out.set(r.match_id, { participants: parts, salesKept: r.sales_kept === true, events: objectives ? { objectives } : null, frames: t ? { t, p } : null });
  }
  return out;
}

/** The rows of these games, made from their records and timelines; a member the record does not name gets an empty row (lane null), so it is not read again. */
async function makeRows(db: Db, games: readonly GameRow[], items: Readonly<Record<string, PrepItemInfo>> | null): Promise<{ rows: Array<{ accountId: string; matchId: string; prep: MatchPrep }>; unnamed: number }> {
  const matchIds = [...new Set(games.map((g) => g.match_id))];
  const records = await recordsOf(db, matchIds);
  // Who each game's timeline is read for: its members and their lane opponents.
  const wanted = new Map<string, string[]>();
  const slots = new Map<string, number>();
  for (const g of games) {
    const parts = records.get(g.match_id);
    if (!parts) continue;
    const slot = g.puuid ? parts.findIndex((p) => !p.removed && p.puuid === g.puuid) : -1;
    slots.set(`${g.account_id}|${g.match_id}`, slot);
    if (slot < 0) continue;
    // The member's own purchases and skill points, and the positions of the member and their lane opponent (the lane's end).
    const opp = confirmedOpponent(parts, slot);
    const list = wanted.get(g.match_id) ?? [];
    list.push(g.puuid!, ...(opp ? [parts[opp.slot]!.puuid] : []));
    wanted.set(g.match_id, [...new Set(list.filter(Boolean))]);
  }
  const timelines = await timelinesOf(db, wanted);
  const out: Array<{ accountId: string; matchId: string; prep: MatchPrep }> = [];
  let unnamed = 0;
  for (const g of games) {
    const parts = records.get(g.match_id);
    if (!parts) continue;
    const slot = slots.get(`${g.account_id}|${g.match_id}`) ?? -1;
    const prep = slot >= 0 ? matchPrep(parts, slot, timelines.get(g.match_id) ?? null, items) : null;
    if (!prep) unnamed += 1;
    out.push({ accountId: g.account_id, matchId: g.match_id, prep: prep ?? { f: PREP_FORMAT, lane: null, rule: null, tl: false } });
  }
  return { rows: out, unnamed };
}

async function itemFacts(db: Db): Promise<Readonly<Record<string, PrepItemInfo>> | null> {
  try {
    return (await loadRiotBuildData(db))?.itemInfo ?? null;
  } catch {
    return null;
  }
}

async function write(db: Db, rows: ReadonlyArray<{ accountId: string; matchId: string; prep: MatchPrep }>, replace: boolean): Promise<number> {
  if (!rows.length) return 0;
  const values = sql.join(rows.map((r) => sql`(${r.accountId}::uuid, ${r.matchId}, ${PREP_FORMAT}, ${JSON.stringify(r.prep)}::jsonb)`), sql`, `);
  const result = await db.execute(
    replace
      ? sql`INSERT INTO account_match_prep (account_id, match_id, format, prep) VALUES ${values}
            ON CONFLICT (account_id, match_id) DO UPDATE SET format = EXCLUDED.format, prep = EXCLUDED.prep, made_at = now() RETURNING 1`
      : // A missing row is inserted; an existing one is replaced only when it is a stale start (STALE_START) and the new one is not.
        sql`INSERT INTO account_match_prep (account_id, match_id, format, prep) VALUES ${values}
            ON CONFLICT (account_id, match_id) DO UPDATE SET format = EXCLUDED.format, prep = EXCLUDED.prep, made_at = now()
            WHERE account_match_prep.prep->>'tl' = 'true' AND NOT (account_match_prep.prep ? 'sk') AND EXCLUDED.prep ? 'sk' RETURNING 1`,
  );
  return rowsOf(result).length;
}

/**
 * Makes the rows of these games again from what is stored now (a timeline was just stored). Never
 * throws: the evidence is derived, and the timeline it follows is already kept.
 */
export async function refreshMatchPrep(db: Db, matchIds: readonly string[], log?: (message: string) => void): Promise<number> {
  try {
    const games = await memberRows(db, matchIds);
    const n = await write(db, (await makeRows(db, games, await itemFacts(db))).rows, true);
    if (n) invalidateCache(EVIDENCE_CACHE);
    return n;
  } catch (err) {
    log?.(`match evidence not refreshed: ${(err as Error).message}`);
    return 0;
  }
}

/**
 * A row whose starting set still counts items sold in the first minute: made from a timeline that
 * keeps the sales (its events hold the plates: completedTimeline's rule, from 20 Nov 2026) before the
 * starting set took them out (MatchPrep.sk). prep-backfill makes these rows again, as it fills missing
 * ones; once made again they carry `sk` and are not read again.
 */
const STALE_START = sql`EXISTS (SELECT 1 FROM account_match_prep p WHERE p.account_id = am.account_id AND p.match_id = am.match_id
    AND p.prep->>'tl' = 'true' AND NOT (p.prep ? 'sk')
    AND EXISTS (SELECT 1 FROM match_timelines tl WHERE tl.match_id = am.match_id AND tl.events ? 'plates'))`;

export interface PrepBackfillResult {
  /** Games read this run (at most the limit). */
  read: number;
  inserted: number;
  /** Of those, games whose record does not name the member (an erased or changed account, or no champion): an empty row, never counted. */
  unnamed: number;
  /** With a timeline read. */
  withTimeline: number;
  /** Members' rift games with a record and no row yet, after the run. */
  remaining: number;
}

/** How many members' rift games with a stored record have no evidence row yet, or a stale start (STALE_START) (counted first, as every run is). */
export async function prepPending(db: Db): Promise<number> {
  const [row] = rowsOf<{ n: string | number }>(
    await db.execute(sql`
      SELECT count(*) AS n FROM account_matches am
      WHERE am.champion_id IS NOT NULL AND am.queue_id IN (${queueList})
        AND EXISTS (SELECT 1 FROM match_details d WHERE d.match_id = am.match_id)
        AND (NOT EXISTS (SELECT 1 FROM account_match_prep p WHERE p.account_id = am.account_id AND p.match_id = am.match_id) OR ${STALE_START})`),
  );
  return Number(row?.n ?? 0);
}

/**
 * The backfill: inserts the missing rows of at most `limit` members' games, newest first, and makes
 * again the rows with a stale start (STALE_START). Nothing else is replaced: idempotent, and
 * resumable from wherever a run stopped.
 */
export async function backfillMatchPrep(db: Db, options: { limit?: number; deadline?: number } = {}): Promise<PrepBackfillResult> {
  const limit = Math.max(0, Math.min(options.limit ?? PREP_BACKFILL_LIMIT, PREP_BACKFILL_LIMIT));
  const games = rowsOf<GameRow>(
    await db.execute(sql`
      SELECT am.account_id, am.match_id, ra.puuid
      FROM account_matches am JOIN riot_accounts ra ON ra.id = am.account_id
      WHERE am.champion_id IS NOT NULL AND am.queue_id IN (${queueList})
        AND EXISTS (SELECT 1 FROM match_details d WHERE d.match_id = am.match_id)
        AND (NOT EXISTS (SELECT 1 FROM account_match_prep p WHERE p.account_id = am.account_id AND p.match_id = am.match_id) OR ${STALE_START})
      ORDER BY am.game_creation DESC, am.match_id, am.account_id
      LIMIT ${limit}`),
  );
  const items = await itemFacts(db);
  const result: PrepBackfillResult = { read: 0, inserted: 0, unnamed: 0, withTimeline: 0, remaining: 0 };
  for (let i = 0; i < games.length; i += CHUNK) {
    if (options.deadline && Date.now() > options.deadline) break;
    const chunk = games.slice(i, i + CHUNK);
    const { rows, unnamed } = await makeRows(db, chunk, items);
    result.read += chunk.length;
    result.unnamed += unnamed;
    result.withTimeline += rows.filter((r) => r.prep.tl).length;
    result.inserted += await write(db, rows, false);
  }
  if (result.inserted) invalidateCache(EVIDENCE_CACHE);
  result.remaining = await prepPending(db);
  return result;
}
