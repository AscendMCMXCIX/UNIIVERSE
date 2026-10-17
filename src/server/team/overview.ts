import type { Db } from "@/server/db/types";
import { ROLES, type Role } from "@/domain/roles";
import { hasPrimaryRole, legalRolesFor, poolFor, roleFit, type PlayerProfile, type RoleFit } from "@/domain/roster";
import { summarise, type GameRecord } from "@/domain/player-stats";
import { TIER_LABELS, type ProficiencyTier } from "@/domain/proficiency";
import { getCurrentLineup, listPlayers, type PlayerRecord } from "@/server/repositories/team";
import { getProficiencyLookup } from "@/server/proficiency/service";
import { loadHistoryBuckets } from "@/server/players/history";

export interface PoolChampionContext {
  championId: string;
  /** Ranked games (Solo/Duo + Flex) on the current and previous two patches. */
  recent: GameRecord;
  tier: ProficiencyTier;
  tierLabel: string;
}

export interface LineupRow {
  role: Role;
  /** Always a member with a chosen role: the lineup only takes those. */
  player: (PlayerRecord & PlayerProfile) | null;
  /** The player's profile role differs from the slot (playing their secondary role, or out of role). */
  profileRole: RoleFit | null;
  /** Assigned from the Other players group (a substitute). */
  substitute: boolean;
  pool: PoolChampionContext[];
}

export interface TeamOverview {
  rows: LineupRow[];
  complete: boolean;
  /**
   * Main players, for the swap dropdown: every member, setup finished or not. Members without a
   * chosen role are listed too (they can be seen, not assigned: they have no legal role).
   */
  main: PlayerRecord[];
  /** Other players, only offered in the substitution flow (same rule). */
  other: PlayerRecord[];
}

/**
 * The Team page: the five lineup slots with the assigned player, their champions for that role
 * and a little labelled Riot context per champion, from stored history and proficiency only.
 */
export async function getTeamOverview(db: Db, teamId: string): Promise<TeamOverview> {
  const lineup = await getCurrentLineup(db, teamId);
  // Every member, setup finished or not; someone already in the lineup stays on their card.
  const players = await listPlayers(db, teamId, { keep: Object.values(lineup.slots).filter((id): id is string => !!id) });
  const byId = new Map(players.filter(hasPrimaryRole).map((p) => [p.id, p]));
  const assigned = ROLES.map((r) => lineup.slots[r]).filter((id): id is string => !!id);
  const [buckets, lookup] = await Promise.all([loadHistoryBuckets(db, assigned), getProficiencyLookup(db, assigned)]);
  const rows: LineupRow[] = ROLES.map((role) => {
    const player = lineup.slots[role] ? byId.get(lineup.slots[role]!) ?? null : null;
    if (!player) return { role, player: null, profileRole: null, substitute: false, pool: [] };
    const history = buckets.get(player.id) ?? [];
    const pool = poolFor(player, role).map((championId) => {
      const est = lookup(player.id, championId, role);
      const tier: ProficiencyTier = est?.tier ?? "unknown";
      return { championId, recent: summarise(history, { queues: ["solo", "flex"], window: 2, championId }), tier, tierLabel: TIER_LABELS[tier] };
    });
    const profileRole = roleFit(player, role);
    return { role, player, profileRole, substitute: player.group === "other", pool };
  });
  return { rows, complete: rows.every((r) => r.player), main: players.filter((p) => p.group === "main"), other: players.filter((p) => p.group === "other") };
}

/** Players who may take a slot: main players by default, everyone when substituting. */
export function candidatesFor(role: Role, overview: TeamOverview, includeOthers: boolean): PlayerRecord[] {
  const pool = includeOthers ? [...overview.main, ...overview.other] : overview.main;
  return pool.filter((p) => legalRolesFor(p).includes(role));
}
