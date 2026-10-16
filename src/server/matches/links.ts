import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, matches, riotAccounts, teamBookmarks } from "@/server/db/schema";
import { summariseMatches } from "@/server/accounts/match-summary";
import { suggestRiotMatches, LINK_WINDOW_MS, type LinkCandidateRow, type LinkSuggestion } from "@/domain/match-link-suggestions";
import type { Role } from "@/domain/roles";

/*
  Drafted match ↔ Riot game links (suggestions only; a person confirms every link) and the team's
  bookmarked Riot games. Everything reads stored data: no Riot request is made here.
*/

type MatchForLink = Pick<typeof matches.$inferSelect, "id" | "teamId" | "playedAt" | "side" | "mode" | "finalAssignments" | "ourPicks" | "riotMatchId" | "dismissedRiotMatchIds">;

/** The stored games of the lineup's accounts around the draft's time, ranked by how well they fit. */
export async function loadLinkSuggestions(db: Db, match: MatchForLink): Promise<LinkSuggestion[]> {
  if (match.riotMatchId) return [];
  const lineup = Object.values(match.finalAssignments ?? {}).filter((id): id is string => !!id);
  if (lineup.length < 2) return [];
  const accounts = await db.select({ id: riotAccounts.id, playerId: riotAccounts.playerId }).from(riotAccounts).where(and(inArray(riotAccounts.playerId, lineup), eq(riotAccounts.ownerType, "player")));
  if (accounts.length === 0) return [];
  const playerOf = new Map(accounts.map((a) => [a.id, a.playerId!]));
  // Sides come from the stored match details (copied once per game; normally already done).
  await summariseMatches(db, { accountIds: [...playerOf.keys()] });
  const at = match.playedAt.getTime();
  const rows = await db
    .select({ accountId: accountMatches.accountId, matchId: accountMatches.matchId, teamId: accountMatches.teamId, queueId: accountMatches.queueId, gameCreation: accountMatches.gameCreation, durationS: accountMatches.gameDuration, win: accountMatches.win, championId: accountMatches.championId, role: accountMatches.role })
    .from(accountMatches)
    .where(and(inArray(accountMatches.accountId, [...playerOf.keys()]), sql`${accountMatches.gameCreation} BETWEEN ${at - LINK_WINDOW_MS} AND ${at + LINK_WINDOW_MS}`, isNotNull(accountMatches.championId)));
  if (rows.length === 0) return [];
  // Riot games already linked to another record of this team are not suggested again.
  const ids = [...new Set(rows.map((r) => r.matchId.toUpperCase()))];
  const linked = await db
    .select({ id: matches.riotMatchId })
    .from(matches)
    .where(and(eq(matches.teamId, match.teamId), ne(matches.id, match.id), isNotNull(matches.riotMatchId), sql`upper(trim(${matches.riotMatchId})) IN (${sql.join(ids.map((m) => sql`${m}`), sql`, `)})`));
  const excluded = new Set([...linked.map((l) => l.id!.trim().toUpperCase()), ...(match.dismissedRiotMatchIds ?? []).map((m) => m.toUpperCase())]);
  const candidates: LinkCandidateRow[] = rows.map((r) => ({ matchId: r.matchId, playerId: playerOf.get(r.accountId)!, teamId: r.teamId, queueId: r.queueId, gameCreation: Number(r.gameCreation), durationS: r.durationS, win: r.win, championId: r.championId!, role: r.role }));
  return suggestRiotMatches(
    { playedAt: at, side: match.side, mode: match.mode, assignments: match.finalAssignments as Partial<Record<Role, string>>, ourPicks: match.ourPicks },
    candidates,
    excluded,
  );
}

/** Remembers that a suggested Riot game is not this match (idempotent). */
export async function dismissLinkSuggestion(db: Db, matchId: string, riotMatchId: string): Promise<void> {
  const [row] = await db.select({ dismissed: matches.dismissedRiotMatchIds }).from(matches).where(eq(matches.id, matchId));
  if (!row) return;
  const id = riotMatchId.trim().toUpperCase();
  if ((row.dismissed ?? []).some((m) => m.toUpperCase() === id)) return;
  await db.update(matches).set({ dismissedRiotMatchIds: [...(row.dismissed ?? []), id], updatedAt: new Date() }).where(eq(matches.id, matchId));
}

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
  return rows.filter((r) => {
    const key = `${r.playerId}|${r.matchId}`;
    if (!wanted.has(key) || seen.has(key) || !r.championId) return false;
    seen.add(key);
    return true;
  });
}
