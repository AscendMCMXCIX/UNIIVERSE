import { sql } from "drizzle-orm";
import { defineJob } from "./registry";
import { getCurrentPatch } from "@/server/repositories/champions";
import { MIN_LANE_GAME_SECONDS, timelineCoverage } from "@/server/accounts/timeline-backfill";
import { SYNC_QUEUE_IDS, currentSeason } from "@/server/accounts/sync";
import { loadSeasonGames } from "@/server/players/season-games";
import { gameRole, gamesFor, seasonsInGames } from "@/domain/season-stats";
import { getOrCreateTeam } from "@/server/repositories/team";
import { loadPlayedTogether } from "@/server/matches/played-together";
import { filterTogether } from "@/domain/played-together";
import { rankCoverage } from "@/server/players/participant-ranks";
import { opggCoverage } from "@/server/players/riot-names";
import { matchViewConsistency } from "@/server/players/match-consistency";
import { riotIdFamily } from "@/server/riot/id-family";

type Row = Record<string, unknown>;
function rows(result: unknown): Row[] {
  return ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[];
}

/**
 * Read-only data audit: what Riot data the database actually holds for the team. Linked
 * accounts are listed anonymously (a1, a2…, grouped by player p1, p2…) with counts only: no
 * Riot IDs, PUUIDs or names leave the server. Changes nothing.
 */
defineJob({
  key: "data-audit",
  description: "Read-only check of the data actually stored: linked-account sync, matches per queue, Solo/Duo vs Flex classification, mastery, Matchups timeline coverage, multikill counts, the ranks shown in match windows (coverage and lookups per day), OP.GG link coverage and why links are missing, whether each stored game's record and timeline agree (gold, CS, kills, objectives), patches. Changes nothing.",
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
          (SELECT count(*) FROM account_matches m WHERE m.account_id = a.id AND m.champion_id IS NOT NULL AND m.extra_stats->>'doubleKills' IS NOT NULL) AS with_multikills,
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
        gamesWithMultikillCounts: Number(a.with_multikills),
        historyGames: Number(a.history_games),
        gamesByQueue: a.by_queue ?? {},
        oldestGame: iso(a.oldest),
        newestGame: iso(a.newest),
        masteryChampions: Number(a.mastery_rows),
        masteryPoints: Number(a.mastery_points),
      };
    });
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
    // Queue classification: Ranked Solo/Duo (420) and Ranked Flex (440) are separate Riot queues.
    // These counts show how stored games are classified, and that no Flex game is counted as Solo/Duo (or the reverse).
    const num = (v: unknown) => Number(v ?? 0);
    const ledgerByQueue = rows(
      await db.execute(sql`
        SELECT am.queue_id, count(*) AS account_rows, count(DISTINCT am.match_id) AS games
        FROM account_matches am JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player'
        WHERE am.champion_id IS NOT NULL GROUP BY 1 ORDER BY 1`),
    ).map((r) => ({ queueId: r.queue_id === null ? null : num(r.queue_id), accountRows: num(r.account_rows), games: num(r.games) }));
    const [queueMismatch] = rows(
      await db.execute(sql`
        SELECT count(DISTINCT am.match_id) AS games, count(DISTINCT am.match_id) FILTER (WHERE am.queue_id IN (420, 440) AND d.queue_id IN (420, 440)) AS solo_flex_swapped
        FROM account_matches am JOIN match_details d ON d.match_id = am.match_id
        WHERE d.queue_id IS NOT NULL AND am.queue_id IS DISTINCT FROM d.queue_id`),
    );
    const historyByGroup = rows(await db.execute(sql`SELECT queue_group, count(*) AS rows, coalesce(sum(games), 0) AS games FROM account_champion_history GROUP BY 1 ORDER BY 1`)).map((r) => ({ group: r.queue_group, rows: num(r.rows), games: num(r.games) }));
    const rankSnapshotsByQueue = rows(await db.execute(sql`SELECT queue, count(*) AS n FROM rank_snapshots GROUP BY 1 ORDER BY 1`)).map((r) => ({ queue: r.queue, snapshots: num(r.n) }));
    const sharedByQueue = rows(
      await db.execute(sql`
        WITH side AS (
          SELECT am.match_id, min(am.queue_id) AS queue_id FROM account_matches am
          JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player'
          WHERE am.champion_id IS NOT NULL AND am.team_id IS NOT NULL
          GROUP BY am.match_id, am.team_id HAVING count(DISTINCT a.player_id) >= 2)
        SELECT queue_id, count(DISTINCT match_id) AS games FROM side GROUP BY 1 ORDER BY 1`),
    ).map((r) => ({ queueId: r.queue_id === null ? null : num(r.queue_id), games: num(r.games) }));
    // Ranked Flex (440) as the views count it: per player and season through the same loaders and
    // filters as Match History / Overview / All Champions (de-duplicated across a player's accounts),
    // the games of the current season without a recorded position (left out once a role is chosen),
    // and Team → Matches → Played together (current members on one side) with 2+, 3+ and all five.
    const flexVisibility = await (async () => {
      const seasonNow = await currentSeason(db);
      const byPlayer: Array<{ player: string | undefined; seasons: Record<string, number>; currentSeasonUnknownRole: number }> = [];
      for (const [pid, label] of playerIndex) {
        if (pid === "none") continue;
        const ids = accounts.filter((a) => String(a.player_id) === pid).map((a) => String(a.id));
        const games = await loadSeasonGames(db, ids);
        const seasons: Record<string, number> = {};
        for (const season of seasonsInGames(games)) {
          const n = gamesFor(games, { season, mode: "flex" }).length;
          if (n) seasons[String(season)] = n;
        }
        const unknownRole = gamesFor(games, { season: seasonNow, mode: "flex" }).filter((g) => !gameRole(g)).length;
        if (Object.keys(seasons).length) byPlayer.push({ player: label, seasons, currentSeasonUnknownRole: unknownRole });
      }
      const team = await getOrCreateTeam(db);
      const together = await loadPlayedTogether(db, team.id);
      const seasonsTogether = [...new Set(together.games.map((g) => g.season).filter((x): x is number => x !== null))].sort((a, b) => b - a);
      const playedTogether = seasonsTogether.map((season) => ({
        season,
        twoPlus: filterTogether(together.games, { season, queues: [440], minMembers: 2 }).length,
        threePlus: filterTogether(together.games, { season, queues: [440], minMembers: 3 }).length,
        allFive: filterTogether(together.games, { season, queues: [440], minMembers: 5 }).length,
      }));
      return { currentSeason: seasonNow, byPlayer, playedTogether, teamMembersInPlayedTogether: Object.keys(together.players).length };
    })();
    // Multikills: how many of the linked players' games carry Riot's multikill counts, and how
    // Riot counts them. If a larger multikill is also counted in the smaller ones, no game can have
    // more triples than doubles (or quadras than triples, pentas than quadras, or a largest
    // multikill of 3+ with no double); if each is counted once at its largest, such games are
    // common. Counts only.
    const [mk] = rows(
      await db.execute(sql`
        SELECT count(*) AS games,
          count(*) FILTER (WHERE am.extra_stats->>'doubleKills' IS NOT NULL) AS with_counts,
          count(*) FILTER (WHERE (am.extra_stats->>'tripleKills')::int > 0) AS with_triple,
          count(*) FILTER (WHERE (am.extra_stats->>'quadraKills')::int > 0) AS with_quadra,
          count(*) FILTER (WHERE (am.extra_stats->>'pentaKills')::int > 0) AS with_penta,
          count(*) FILTER (WHERE (am.extra_stats->>'tripleKills')::int > (am.extra_stats->>'doubleKills')::int) AS triples_over_doubles,
          count(*) FILTER (WHERE (am.extra_stats->>'quadraKills')::int > (am.extra_stats->>'tripleKills')::int) AS quadras_over_triples,
          count(*) FILTER (WHERE (am.extra_stats->>'pentaKills')::int > (am.extra_stats->>'quadraKills')::int) AS pentas_over_quadras,
          count(*) FILTER (WHERE (am.extra_stats->>'largestMultiKill')::int >= 3 AND (am.extra_stats->>'doubleKills')::int = 0) AS large_without_double
        FROM account_matches am JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player'
        WHERE am.champion_id IS NOT NULL`),
    );
    const outOfOrder = num(mk?.triples_over_doubles) + num(mk?.quadras_over_triples) + num(mk?.pentas_over_quadras) + num(mk?.large_without_double);
    const multikills = {
      games: num(mk?.games),
      withCounts: num(mk?.with_counts),
      withTriple: num(mk?.with_triple),
      withQuadra: num(mk?.with_quadra),
      withPenta: num(mk?.with_penta),
      outOfOrder: { triplesOverDoubles: num(mk?.triples_over_doubles), quadrasOverTriples: num(mk?.quadras_over_triples), pentasOverQuadras: num(mk?.pentas_over_quadras), largestWithoutDouble: num(mk?.large_without_double) },
      riotCounting: num(mk?.with_triple) < 20 ? "unclear: fewer than 20 games with a triple kill" : outOfOrder === 0 ? "nested: a larger multikill also counts as each smaller one" : "separate: each multikill counts once, at its largest",
    };
    const queueClassification = { flexVisibility, ledgerByQueue, accountVsDetailsQueueMismatch: { games: num(queueMismatch?.games), soloFlexSwapped: num(queueMismatch?.solo_flex_swapped) }, championHistoryByGroup: historyByGroup, rankSnapshotsByQueue, sharedGamesByQueue: sharedByQueue };
    return {
      ok: true,
      summary: {
        currentPatch: current?.patch ?? null,
        riotKeyConfigured: !!process.env.RIOT_API_KEY,
        linkedAccounts: linked,
        matchups,
        multikills,
        queueClassification,
        participantRanks: await rankCoverage(db),
        opggLinks: await opggCoverage(db),
        // Each stored game's record against its timeline (gold, CS, kills, objectives), counts only.
        matchViews: await matchViewConsistency(db),
        // Which stored games carry the members' current Riot ids, i.e. were stored under the key
        // family in use (ids are encrypted per Riot application), counts only.
        riotIdFamily: await riotIdFamily(db),
      },
    };
  },
});
