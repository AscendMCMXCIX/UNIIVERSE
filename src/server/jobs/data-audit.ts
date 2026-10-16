import { sql } from "drizzle-orm";
import { defineJob } from "./registry";
import { getCurrentPatch } from "@/server/repositories/champions";
import { getGlobalCoverage } from "@/server/ops/coverage";
import { MIN_LANE_GAME_SECONDS, timelineCoverage } from "@/server/accounts/timeline-backfill";
import { SYNC_QUEUE_IDS } from "@/server/accounts/sync";

type Row = Record<string, unknown>;
function rows(result: unknown): Row[] {
  return ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[];
}

/**
 * Read-only data audit: what Riot and professional data the database actually holds. Linked
 * accounts are listed anonymously (a1, a2…, grouped by player p1, p2…) with counts only: no
 * Riot IDs, PUUIDs or names leave the server. Changes nothing.
 */
defineJob({
  key: "data-audit",
  description: "Read-only check of the data actually stored: linked-account sync, matches per queue, mastery, Matchups timeline coverage, global ranked coverage per region and rank, patches, professional games. Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const db = ctx.db;
    const current = await getCurrentPatch(db);
    const accounts = rows(
      await db.execute(sql`
        SELECT a.id, a.player_id, a.platform, a.platform_source, (a.puuid IS NOT NULL) AS resolved, a.sync_status, a.last_sync_at, a.tier,
          (SELECT count(*) FROM account_matches m WHERE m.account_id = a.id) AS ledger,
          (SELECT count(*) FROM account_matches m WHERE m.account_id = a.id AND m.champion_id IS NOT NULL) AS games,
          (SELECT json_object_agg(q, n) FROM (SELECT coalesce(m.queue_id::text, 'unknown') q, count(*) n FROM account_matches m WHERE m.account_id = a.id AND m.champion_id IS NOT NULL GROUP BY 1) x) AS by_queue,
          (SELECT min(m.game_creation) FROM account_matches m WHERE m.account_id = a.id AND m.champion_id IS NOT NULL) AS oldest,
          (SELECT max(m.game_creation) FROM account_matches m WHERE m.account_id = a.id) AS newest,
          (SELECT count(*) FROM account_mastery s WHERE s.account_id = a.id) AS mastery_rows,
          (SELECT coalesce(sum(s.points), 0) FROM account_mastery s WHERE s.account_id = a.id) AS mastery_points,
          (SELECT coalesce(sum(h.games), 0) FROM account_champion_history h WHERE h.account_id = a.id) AS history_games
        FROM riot_accounts a WHERE a.owner_type = 'player' ORDER BY a.player_id, a.created_at`),
    );
    const playerIndex = new Map<string, string>();
    const linked = accounts.map((a, i) => {
      const pid = String(a.player_id ?? "none");
      if (!playerIndex.has(pid)) playerIndex.set(pid, `p${playerIndex.size + 1}`);
      const iso = (v: unknown) => (v == null ? null : new Date(Number(v)).toISOString().slice(0, 10));
      return {
        account: `a${i + 1}`,
        player: playerIndex.get(pid),
        platform: a.platform,
        platformFromRiot: a.platform_source === "riot",
        resolved: a.resolved,
        status: a.sync_status,
        lastSyncAt: a.last_sync_at ? new Date(String(a.last_sync_at)).toISOString() : null,
        tier: a.tier ?? null,
        matchLedger: Number(a.ledger),
        countedGames: Number(a.games),
        historyGames: Number(a.history_games),
        gamesByQueue: a.by_queue ?? {},
        oldestGame: iso(a.oldest),
        newestGame: iso(a.newest),
        masteryChampions: Number(a.mastery_rows),
        masteryPoints: Number(a.mastery_points),
      };
    });
    const periods = rows(await db.execute(sql`SELECT patch, source, games FROM stat_periods ORDER BY patch DESC, source LIMIT 30`));
    const bands = rows(await db.execute(sql`SELECT patch, source, tier_band, games FROM stat_rank_periods ORDER BY patch DESC, tier_band LIMIT 60`));
    const regionPeriods = rows(await db.execute(sql`SELECT patch, platform, queue_id, tier_population, games FROM stat_region_periods WHERE source = 'ranked' ORDER BY patch DESC, games DESC LIMIT 80`));
    const rankedByPatch = rows(await db.execute(sql`SELECT patch, count(*) n, max(game_creation) newest FROM ranked_matches GROUP BY patch ORDER BY patch DESC LIMIT 6`));
    const queue = rows(await db.execute(sql`SELECT status, count(*) n FROM match_fetch_queue GROUP BY status`));
    const tracked = rows(await db.execute(sql`SELECT tier, count(*) n FROM tracked_summoners GROUP BY tier ORDER BY 2 DESC`));
    const pro = rows(await db.execute(sql`SELECT provider, patch, count(*) n, max(played_at) newest FROM pro_games GROUP BY provider, patch ORDER BY patch DESC LIMIT 12`));
    const championStats = rows(await db.execute(sql`SELECT patch, source, count(*) rows, sum(games) games FROM champion_role_stats GROUP BY patch, source ORDER BY patch DESC LIMIT 12`));
    // Matchups: which of the linked players' rift games name a lane opponent, and how many have a
    // stored timeline with frames (by age, to show how far back Riot still provides them).
    const rift = sql`am.champion_id IS NOT NULL AND am.queue_id IN (${sql.join(SYNC_QUEUE_IDS.map((q) => sql`${q}`), sql`, `)}) AND coalesce(am.game_duration, 0) >= ${MIN_LANE_GAME_SECONDS}`;
    const lane = rows(
      await db.execute(sql`
        SELECT CASE WHEN am.game_creation >= ${Date.now() - 90 * 86_400_000} THEN 'last 90 days' WHEN am.game_creation >= ${Date.now() - 365 * 86_400_000} THEN '90-365 days' ELSE 'older' END AS age,
          count(*) AS games,
          count(*) FILTER (WHERE am.enemy_champion_id IS NOT NULL) AS with_opponent,
          count(*) FILTER (WHERE d.match_id IS NOT NULL AND jsonb_array_length(d.participants) > 0) AS with_details,
          count(*) FILTER (WHERE jsonb_array_length(t.frames->'t') > 0) AS with_frames,
          count(*) FILTER (WHERE t.frames IS NOT NULL AND jsonb_array_length(t.frames->'t') = 0) AS timeline_unavailable
        FROM account_matches am
        JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player'
        LEFT JOIN match_details d ON d.match_id = am.match_id
        LEFT JOIN match_timelines t ON t.match_id = am.match_id
        WHERE ${rift} GROUP BY 1 ORDER BY 1`),
    ).map((r) => ({ age: r.age, games: Number(r.games), withOpponent: Number(r.with_opponent), withDetails: Number(r.with_details), withFrames: Number(r.with_frames), timelineUnavailable: Number(r.timeline_unavailable) }));
    const [storage] = rows(await db.execute(sql`SELECT pg_total_relation_size('match_timelines') AS bytes, count(*) FILTER (WHERE frames IS NOT NULL) AS rows_with_frames, avg(pg_column_size(frames)) FILTER (WHERE jsonb_array_length(frames->'t') > 0) AS avg_frame_bytes FROM match_timelines`));
    const [database] = rows(await db.execute(sql`SELECT pg_database_size(current_database()) AS bytes`).catch(() => [] as never));
    const matchups = { timelines: await timelineCoverage(db), riftGamesByAge: lane, timelineTableBytes: Number(storage?.bytes ?? 0), rowsWithFrames: Number(storage?.rows_with_frames ?? 0), avgFramesBytes: storage?.avg_frame_bytes ? Math.round(Number(storage.avg_frame_bytes)) : null, databaseBytes: database?.bytes ? Number(database.bytes) : null };
    const coverage = await getGlobalCoverage(db, { platformSpec: process.env.RIOT_PLATFORMS, tierSpec: process.env.RIOT_TIERS, currentPatch: current?.patch ?? null, riotConfigured: !!process.env.RIOT_API_KEY });
    return {
      ok: true,
      summary: {
        currentPatch: current?.patch ?? null,
        riotKeyConfigured: !!process.env.RIOT_API_KEY,
        platformsConfigured: coverage.configured.length,
        tierPopulation: coverage.tierPopulation,
        linkedAccounts: linked,
        matchups,
        statPeriods: periods,
        rankBands: bands,
        regionPeriods,
        rankedMatchesByPatch: rankedByPatch.map((r) => ({ patch: r.patch, games: Number(r.n), newest: r.newest ? new Date(Number(r.newest)).toISOString() : null })),
        fetchQueue: queue,
        trackedPlayersByTier: tracked,
        championStats,
        proGames: pro,
        regions: coverage.regions.filter((r) => r.configured || r.totalGames > 0).map((r) => ({ platform: r.platform, status: r.status, currentPatchGames: r.currentPatchGames, totalGames: r.totalGames, tracked: r.playersTracked, queued: r.queuePending, lastSyncAt: r.lastSyncAt?.toISOString() ?? null })),
        rankCoverage: coverage.ranks.map((r) => ({ band: r.band, status: r.status, weight: r.weight, tracked: r.playersTracked, currentPatchGames: r.currentPatchGames, totalGames: r.totalGames })),
      },
    };
  },
});
