import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { hasPermission, type Session } from "@/server/auth/permissions";
import { cachedFor } from "@/server/observability/cache";
import { getPlayer } from "@/server/repositories/team";
import { poolFor } from "@/domain/roster";
import { ROLES as GAME_ROLES, type Role as GameRole } from "@/domain/roles";
import type { Role } from "@/domain/matchup-intel/types";

/*
  What Matchup Intel's champion picker offers beyond the roster (docs/MATCHUP_INTEL.md, "The picker"):

  - **Your pool:** the viewer's own champion pool for the page's lane, from their own player
    profile. Never anyone else's: an account with no player profile has none, and nothing is said
    about whose pools hold what.
  - **The role filter:** the champions Riot recorded in each position in the team's stored games
    (account_champion_history, the rows All Champions shows by role), never a guess at a champion's
    roles; the team's members now only, as the evidence's "team's games" (never a personal-use
    profile, an archived player or a scouting account). It counts teammates' games, so it is offered only to a viewer who may see teammates'
    statistics ("view-teammate-stats"); it names champions only, never who played them or how often.
*/

export const PICKER_ROLE_OF: Record<Role, GameRole> = { top: "TOP", jungle: "JUNGLE", mid: "MID", adc: "ADC", support: "SUPPORT" };

/** The viewer's own pool for a lane, in its own order, kept to the champions on the roster; [] without a player profile. */
export async function viewerPool(db: Db, session: Session | null, role: Role, roster: ReadonlySet<string>): Promise<string[]> {
  if (!session?.playerId) return [];
  const player = await getPlayer(db, session.playerId).catch(() => null);
  if (!player) return [];
  return poolFor(player, PICKER_ROLE_OF[role]).filter((id) => roster.has(id));
}

/** Champion ids by the position Riot recorded them in, in the team's stored Summoner's Rift games; null when the viewer may not see teammates' statistics. */
export async function recordedRoles(db: Db, session: Session | null): Promise<Partial<Record<GameRole, string[]>> | null> {
  if (!session || !hasPermission(session, "view-teammate-stats")) return null;
  return cachedFor("matchup:picker-roles", 10 * 60_000, async () => {
    // The team's own accounts only, as the evidence counts "the team's games" (evidence.ts, playersOf):
    // members now, never a personal-use profile (its player's and the administrators' only), an
    // archived player or a scouting account.
    const result = await db.execute(sql`SELECT h.role, h.champion_id FROM account_champion_history h
      JOIN riot_accounts ra ON ra.id = h.account_id AND ra.owner_type = 'player'
      WHERE ra.player_id IN (SELECT id FROM players WHERE team_member AND archived_at IS NULL)
        AND h.games > 0 AND h.role IN ('TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT') AND h.queue_group IN ('solo', 'flex', 'normal')
      GROUP BY h.role, h.champion_id ORDER BY h.role, h.champion_id`);
    const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as Array<{ role: string; champion_id: string }>;
    const out: Partial<Record<GameRole, string[]>> = {};
    for (const r of rows) {
      if (!(GAME_ROLES as readonly string[]).includes(r.role)) continue;
      (out[r.role as GameRole] ??= []).push(r.champion_id);
    }
    return out;
  }, db);
}
