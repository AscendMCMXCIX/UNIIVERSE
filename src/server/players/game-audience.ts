import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players } from "@/server/db/schema";
import { teamMembersByPuuid } from "@/server/matches/compositions";

/*
  What one viewer receives about the players of a game on a player's Match History (the cards,
  the match window's scoreboard and its rank check), from what UNIIVERSE holds about them:

  - The profile's own accounts: everything, as before.
  - Current team members (on the team, not archived, a team member: matches/compositions
    teamMembersByPuuid), in a team member's games only: named and linked to their profile, and to
    OP.GG by their linked Riot ID. Their rank is one of their statistics (owner decision, 4 Nov
    2026): read from their linked account (sync and rank history) only when the viewer may see
    their statistics (canViewPlayerStats, passed in as `statsFor`); otherwise it is left out, never
    read, checked with Riot or sent, and never shown as "Unranked".
  - Everyone else, a personal-use or archived profile's linked account included, and the team's
    players in a personal-use player's own games: as any other player of the game. Their rank is
    what the checks of a game's players found (last_known_ranks), their OP.GG link the Riot ID the
    stored games recorded; nothing their linked account holds. A personal-use account is private
    to its player, and a personal-use player is not part of the team's workspace.
*/

/** Whose statistics, rank included, the viewer may see (auth/permissions canViewPlayerStats). */
export type StatsFor = (playerId: string) => boolean;

/** Nobody's but the profile's own: what a caller that does not say gets. */
export const OWN_STATS_ONLY: StatsFor = () => false;

export interface GameAudience {
  /** The team members named and linked in these games: PUUID → their profile id and display name. */
  members: ReadonlyMap<string, { id: string; name: string }>;
  /** Players whose linked account's Riot ID may be used: the profile's own and the named members. */
  riotIds: ReadonlySet<string>;
  /** Players whose linked account's ranks (sync, rank history) may be read: the profile's own, and the members whose statistics the viewer may see. */
  ranks: ReadonlySet<string>;
  /** Named members whose rank is left out for this viewer. */
  hidden: ReadonlySet<string>;
}

/**
 * The audience of one profile's games for one viewer (see above). One query for the profile's
 * team membership (none when `owner` is given) and one for the members among `puuids`.
 */
export async function gameAudience(
  db: Db,
  profile: { playerId: string; ownPuuids: Iterable<string | null>; owner?: { teamId: string; teamMember: boolean } | null },
  puuids: readonly string[],
  statsFor: StatsFor = OWN_STATS_ONLY,
): Promise<GameAudience> {
  const own = new Set([...profile.ownPuuids].filter((p): p is string => !!p));
  const owner = profile.owner !== undefined ? profile.owner : ((await db.select({ teamId: players.teamId, teamMember: players.teamMember }).from(players).where(eq(players.id, profile.playerId)))[0] ?? null);
  const members = owner?.teamMember ? await teamMembersByPuuid(db, owner.teamId, puuids) : new Map<string, { id: string; name: string }>();
  const riotIds = new Set(own);
  const ranks = new Set(own);
  const hidden = new Set<string>();
  for (const [puuid, m] of members) {
    if (own.has(puuid)) continue;
    riotIds.add(puuid);
    if (m.id === profile.playerId || statsFor(m.id)) ranks.add(puuid);
    else hidden.add(puuid);
  }
  return { members, riotIds, ranks, hidden };
}
