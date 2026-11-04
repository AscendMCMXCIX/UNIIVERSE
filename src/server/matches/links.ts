import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, riotAccounts, teamBookmarks } from "@/server/db/schema";

/*
  The team's bookmarked Riot games (Team → Matches). Everything reads stored data: no Riot
  request is made here.
*/

export interface TeamBookmark {
  riotMatchId: string;
  playerId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
}

export async function listTeamBookmarks(db: Db, teamId: string): Promise<TeamBookmark[]> {
  return db
    .select({ riotMatchId: teamBookmarks.riotMatchId, playerId: teamBookmarks.playerId, createdByUserId: teamBookmarks.createdByUserId, createdAt: teamBookmarks.createdAt })
    .from(teamBookmarks)
    .where(eq(teamBookmarks.teamId, teamId))
    .orderBy(desc(teamBookmarks.createdAt));
}

export async function getTeamBookmark(db: Db, teamId: string, riotMatchId: string): Promise<TeamBookmark | null> {
  const [row] = await db
    .select({ riotMatchId: teamBookmarks.riotMatchId, playerId: teamBookmarks.playerId, createdByUserId: teamBookmarks.createdByUserId, createdAt: teamBookmarks.createdAt })
    .from(teamBookmarks)
    .where(and(eq(teamBookmarks.teamId, teamId), eq(teamBookmarks.riotMatchId, riotMatchId)));
  return row ?? null;
}

export async function addTeamBookmark(db: Db, input: { teamId: string; riotMatchId: string; playerId: string | null; createdByUserId: string | null }): Promise<void> {
  await db.insert(teamBookmarks).values(input).onConflictDoNothing();
}

export async function removeTeamBookmark(db: Db, teamId: string, riotMatchId: string): Promise<void> {
  await db.delete(teamBookmarks).where(and(eq(teamBookmarks.teamId, teamId), eq(teamBookmarks.riotMatchId, riotMatchId)));
}

/** Whether one of this player's own accounts has this game stored (the only games they may share). */
export async function playerHasGame(db: Db, playerId: string, riotMatchId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: accountMatches.matchId })
    .from(accountMatches)
    .innerJoin(riotAccounts, eq(riotAccounts.id, accountMatches.accountId))
    .where(and(eq(riotAccounts.playerId, playerId), eq(riotAccounts.ownerType, "player"), eq(accountMatches.matchId, riotMatchId)))
    .limit(1);
  return !!row;
}

/** A shared game of one member: their row for that game, shown in the Bookmarked list. */
export async function sharedGameRows(db: Db, shares: ReadonlyArray<{ riotMatchId: string; playerId: string }>) {
  if (shares.length === 0) return [];
  const players = [...new Set(shares.map((s) => s.playerId))];
  const rows = await db
    .select({ playerId: riotAccounts.playerId, matchId: accountMatches.matchId, teamId: accountMatches.teamId, queueId: accountMatches.queueId, gameCreation: accountMatches.gameCreation, patch: accountMatches.patch, durationS: accountMatches.gameDuration, win: accountMatches.win, championId: accountMatches.championId, role: accountMatches.role, kills: accountMatches.kills, deaths: accountMatches.deaths, assists: accountMatches.assists, cs: accountMatches.cs, damage: accountMatches.damage, vision: accountMatches.visionScore })
    .from(accountMatches)
    .innerJoin(riotAccounts, eq(riotAccounts.id, accountMatches.accountId))
    .where(and(inArray(riotAccounts.playerId, players), eq(riotAccounts.ownerType, "player"), inArray(accountMatches.matchId, shares.map((s) => s.riotMatchId))));
  const wanted = new Set(shares.map((s) => `${s.playerId}|${s.riotMatchId}`));
  const seen = new Set<string>();
  return rows
    .filter((r) => {
      const key = `${r.playerId}|${r.matchId}`;
      if (!wanted.has(key) || seen.has(key) || !r.championId) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      ...r,
      // kills = -1 marks a game whose details Riot no longer serves (accounts/sync, DETAILS_UNAVAILABLE):
      // no kill count is known, so none is shown. Played Together reads it the same way.
      kills: r.kills !== null && r.kills < 0 ? null : r.kills,
    }));
}
