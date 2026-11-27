import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { LEADERBOARD_QUEUES } from "@/domain/leaderboards";
import type { AuditMember } from "@/domain/leaderboard-audit";

/*
  The leaderboard audit's own reading of who is active (domain/leaderboard-audit), one statement,
  written independently of the page's loader (server/leaderboards/service.ts): the same rule in SQL,
  so a fault in the page's code shows as a difference. About one row per member, under 1 KB.

  - Members: the team's players with a profile, not archived, team members (listPlayers' default),
    in the team's own order (sort order, then creation).
  - The newest counted game: the members' own accounts' stored games with a champion, in a queue
    the boards count, not a remake (under five minutes), started at or before `now`.
  - The newest successful update: a syncable account's cursor (written on success only), a demo
    account's seeded time.
  - A return: the newest counted game that followed a gap of more than 30 days (lag over the
    member's counted games inside the database; one value out per member).
*/

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const ms = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function readAuditMembers(db: Db, teamId: string, now: number): Promise<AuditMember[]> {
  const queues = sql.join(LEADERBOARD_QUEUES.all.queues.map((q) => sql`${q}`), sql`, `);
  const gap = 30 * 86_400_000;
  const rows = rowsOf<{ id: string; accounts: number | string; last_game: unknown; last_sync: unknown; returned_at: unknown; future_games: number | string }>(
    await db.execute(sql`
      WITH members AS (
        SELECT id, sort_order, created_at FROM players
        WHERE team_id = ${teamId} AND archived_at IS NULL AND team_member
      ),
      accounts AS (
        SELECT a.id, a.player_id, a.label, a.sync_status, a.sync_cursor, a.last_sync_at
        FROM riot_accounts a JOIN members m ON m.id = a.player_id
        WHERE a.owner_type = 'player'
      ),
      counted AS (
        SELECT DISTINCT a.player_id, g.match_id, g.game_creation
        FROM account_matches g JOIN accounts a ON a.id = g.account_id
        WHERE g.champion_id IS NOT NULL AND g.queue_id IN (${queues}) AND (g.game_duration IS NULL OR g.game_duration >= 300)
      ),
      gaps AS (
        SELECT player_id, game_creation, game_creation - lag(game_creation) OVER (PARTITION BY player_id ORDER BY game_creation) AS since_previous
        FROM counted WHERE game_creation <= ${now}
      )
      SELECT m.id,
        (SELECT count(*) FROM accounts a WHERE a.player_id = m.id) AS accounts,
        (SELECT max(game_creation) FROM counted c WHERE c.player_id = m.id AND c.game_creation <= ${now}) AS last_game,
        (SELECT count(*) FROM counted c WHERE c.player_id = m.id AND c.game_creation > ${now}) AS future_games,
        (SELECT max(CASE WHEN a.label = 'demo' OR a.sync_status = 'demo'
                    THEN floor(extract(epoch FROM a.last_sync_at) * 1000)
                    ELSE nullif(a.sync_cursor, 0) * 1000 END)
           FROM accounts a WHERE a.player_id = m.id) AS last_sync,
        (SELECT max(game_creation) FROM gaps g WHERE g.player_id = m.id AND g.since_previous > ${gap}) AS returned_at
      FROM members m
      ORDER BY m.sort_order, m.created_at`),
  );
  return rows.map((r) => ({ id: r.id, accounts: Number(r.accounts), lastGameAt: ms(r.last_game), lastSyncedAt: ms(r.last_sync), returnedAt: ms(r.returned_at), futureGames: Number(r.future_games) }));
}
