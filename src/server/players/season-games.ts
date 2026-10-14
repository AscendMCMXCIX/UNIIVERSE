import { and, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches } from "@/server/db/schema";
import { dedupeGames, type SeasonGame } from "@/domain/season-stats";

/**
 * Every stored game of the given accounts, one row per game (duplicates across the accounts
 * removed). Remakes and unsupported queues were never stored with a champion, so they are not
 * here. One indexed query; a full season for a busy player is a few thousand small rows.
 */
export async function loadSeasonGames(db: Db, accountIds: string[]): Promise<SeasonGame[]> {
  if (accountIds.length === 0) return [];
  const rows = await db
    .select({ matchId: accountMatches.matchId, accountId: accountMatches.accountId, queueId: accountMatches.queueId, championId: accountMatches.championId, role: accountMatches.role, win: accountMatches.win, patch: accountMatches.patch, gameCreation: accountMatches.gameCreation, kills: accountMatches.kills, deaths: accountMatches.deaths, assists: accountMatches.assists, cs: accountMatches.cs, damage: accountMatches.damage, visionScore: accountMatches.visionScore, gameDuration: accountMatches.gameDuration })
    .from(accountMatches)
    .where(and(inArray(accountMatches.accountId, accountIds), isNotNull(accountMatches.championId)));
  return dedupeGames(rows.map((r) => ({ ...r, championId: r.championId! })));
}
