import type { Db } from "@/server/db/types";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { loadSeasonGames } from "./season-games";
import { personalPatterns, type Patterns } from "@/domain/patterns";

/** The queues patterns are read from: ranked games, where the figures mean the most. */
export const PATTERN_QUEUES = [420, 440];

/**
 * A player's own patterns (domain/patterns) from their stored Ranked Solo/Duo and Flex games.
 * Private: callers pass the signed-in player's own id only (the profile when it is your own, and
 * Solo Queue Blocks, whose owner comes from the session); nothing here is sent to anyone else, and
 * nothing feeds drafting, leaderboards or the team pages. No Riot request.
 */
export async function loadOwnPatterns(db: Db, ownPlayerId: string): Promise<Patterns> {
  const accounts = await listAccountsForPlayer(db, ownPlayerId);
  const games = await loadSeasonGames(db, accounts.map((a) => a.id), { dedupe: false });
  return personalPatterns(games.filter((g) => g.queueId !== null && PATTERN_QUEUES.includes(g.queueId)));
}
