import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { curatedEnemiesFor, getChampionNotes } from "./curated";
import { MIN_GAME_SECONDS } from "./evidence";

/*
  Matchup Intel's curation priorities, for Admin only (Data & Integrations; PLAN S11, OD6): the
  team's pool cells (a role and a champion from a member's champion pools), per role, ranked by the
  members' stored games on that champion in that role, and whether the champion already has checked
  notes or a curated pair. Champion names and counts only: never whose pool a cell came from. With a
  handful of profiles a role's cells can point at one person, so the figures stay on Admin's page:
  never in a log, a job's output, /api/health, the Production check or the repository's docs.
  Team members only, as the evidence rules count them: no personal-use or archived profile; and games
  as the evidence counts them: a result known, no remake.
*/

/** The roles in the order the panel lists them: the lanes without checked notes first, top lane last. */
export const CURATION_ROLE_ORDER = ["JUNGLE", "MID", "ADC", "SUPPORT", "TOP"] as const;

export type CurationCell = { championId: string; name: string; games: number; checkedNotes: boolean; curatedPairs: number };
export type CurationRole = { role: (typeof CURATION_ROLE_ORDER)[number]; cells: CurationCell[] };

const MEMBER = sql`p.team_member AND p.archived_at IS NULL`;

/** The pool cells by role, each ranked by the members' games on it (most first, then by name). */
export async function curationPriorities(db: Db): Promise<CurationRole[]> {
  const res = (await db.execute(sql`
    WITH cells AS (
      SELECT p.primary_role::text AS role, cp.champion_id FROM player_champion_pools cp JOIN players p ON p.id = cp.player_id WHERE cp.slot = 'primary' AND p.primary_role IS NOT NULL AND ${MEMBER}
      UNION SELECT p.secondary_role::text, cp.champion_id FROM player_champion_pools cp JOIN players p ON p.id = cp.player_id WHERE cp.slot = 'secondary' AND p.secondary_role IS NOT NULL AND ${MEMBER}
      UNION SELECT rp.role::text, rp.champion_id FROM player_role_pools rp JOIN players p ON p.id = rp.player_id WHERE ${MEMBER}
    ),
    games AS (
      SELECT am.role, am.champion_id, count(*) AS n FROM account_matches am
      JOIN riot_accounts ra ON ra.id = am.account_id AND ra.owner_type = 'player'
      JOIN players p ON p.id = ra.player_id AND ${MEMBER}
      -- A game counts as the evidence counts one (evidence.ts): a result known, and not a remake.
      WHERE am.win IS NOT NULL AND am.game_duration >= ${MIN_GAME_SECONDS}
      GROUP BY am.role, am.champion_id
    )
    SELECT c.role, c.champion_id, coalesce(ch.name, c.champion_id) AS name, coalesce(g.n, 0) AS games
    FROM cells c LEFT JOIN games g ON g.role = c.role AND g.champion_id = c.champion_id
    LEFT JOIN champions ch ON ch.id = c.champion_id`)) as unknown as { rows?: Array<{ role: string; champion_id: string; name: string; games: string | number }> };
  const list = res.rows ?? (res as unknown as Array<{ role: string; champion_id: string; name: string; games: string | number }>);
  return CURATION_ROLE_ORDER.map((role) => ({
    role,
    cells: list
      .filter((r) => r.role === role)
      .map((r) => ({ championId: r.champion_id, name: r.name, games: Number(r.games), checkedNotes: getChampionNotes(r.champion_id) !== null, curatedPairs: curatedEnemiesFor(r.champion_id).length }))
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)),
  }));
}
