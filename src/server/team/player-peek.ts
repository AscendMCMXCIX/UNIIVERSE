import type { Db } from "@/server/db/types";
import { hasPrimaryRole } from "@/domain/roster";
import { ROLE_LABELS } from "@/domain/roles";
import { getPlayer } from "@/server/repositories/team";
import { avatarUrlsByPlayer, loadSocialLinks } from "@/server/repositories/profile";
import { getPlayerOverview } from "@/server/players/overview";
import { rankChangesFor } from "@/server/accounts/rank-history";
import { listChampions } from "@/server/repositories/champions";
import { rosterCard, type RosterSlot } from "./roster";

/*
  The player Peek on Players and Leaderboards rows (PLAN S8a, S4a's table): the same player content
  as the Team lineup's Peek (playerDetail), for the player's main role: their card opened up, this
  season in that role and their pool for it. Built as a Team card is (rosterCard), from the same
  reads: the player, their picture and social links, and only where `statsVisible` (the caller's
  view-teammate-stats rule) their season in the role and their ranked change. Who may ask at all
  is the action's (src/server/actions/player-peek.ts).
*/

export interface PlayerPeekData {
  /** The player as one Team slot in their main role (no lineup candidates, suggestions or substitute). */
  slot: RosterSlot;
  /** The pool's champions, for their portraits. */
  champions: Array<{ id: string; name: string; portraitUrl: string }>;
}

/** The Peek's content, or null for no such player, or one with no main role yet (their row opens the profile instead). */
export async function getPlayerPeek(db: Db, playerId: string, statsVisible: boolean): Promise<PlayerPeekData | null> {
  const player = await getPlayer(db, playerId);
  if (!player || !hasPrimaryRole(player)) return null;
  const role = player.primaryRole;
  const [avatars, social, season, champions] = await Promise.all([
    avatarUrlsByPlayer(db),
    loadSocialLinks(db, [player.id]),
    // Not read at all without the right: nothing numerical leaves the server then.
    statsVisible ? getPlayerOverview(db, player, { mode: "all", role, riotConfigured: !!process.env.RIOT_API_KEY }) : Promise.resolve(null),
    listChampions(db),
  ]);
  const rankChange = statsVisible ? ((await rankChangesFor(db, [{ id: player.id, queue: season?.rank?.queue ?? null }])).get(player.id) ?? null) : null;
  const card = rosterCard(player, role, { season, summary: season?.summary ?? null, avatarUrl: avatars[player.id] ?? null, rankChange, statsVisible, pool: [], social: social.get(player.id) ?? null });
  const wanted = new Set(card.champions.map((c) => c.championId));
  return {
    slot: { role, roleLabel: ROLE_LABELS[role], player: card.player, champions: card.champions, candidates: [], waiting: [], suggestions: [], substitute: null, substituteCandidates: [] },
    champions: champions.filter((c) => wanted.has(c.id)).map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl })),
  };
}
