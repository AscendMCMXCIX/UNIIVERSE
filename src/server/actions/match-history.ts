"use server";

import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { canManageRiotAccounts, hasPermission, isTeamMember } from "@/server/auth/permissions";
import { getMatchDetail, getMatchRanks, type MatchDetailResult, type MatchRanksResult } from "@/server/players/match-history";
import { getMatchTimeline, type MatchTimelineResult } from "@/server/accounts/match-timeline";
import { getMatchGroups, type MatchGroupsResult } from "@/server/matches/possible-groups";
import { loadMatchMeetings, type MatchMeeting } from "@/server/players/encounters";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { currentSeason } from "@/server/accounts/sync";
import { isOfferedSeason } from "@/domain/season";
import { isSeasonMode } from "@/domain/season-stats";
import { CATCH_UP_BUDGET_MS, REFRESH_BUDGET_MS, catchUpPlayerFigures, refreshPlayerMatches, type CatchUpOutcome, type RefreshOutcome } from "@/server/accounts/refresh";
import { pendingFiguresForPlayer } from "@/server/accounts/figures-backfill";
import { createRiotClient } from "@/server/riot/api/client";
import { browserTestRiotClient } from "@/server/riot/browser-test";
import { invalidateProficiencyCache } from "@/server/proficiency/service";

/**
 * Riot for a profile's Refresh: quick answers, no retries, and no wait for Riot's rate limits past
 * the step's budget (the button must answer within a minute); the stand-in in browser tests.
 */
const refreshClient = (budgetMs: number) => createRiotClient({ maxRetries: 0, timeoutMs: 10_000, deadline: Date.now() + budgetMs }) ?? browserTestRiotClient();

/** A Riot match id ("OC1_123…"), or a synthetic demo id ("DEMO_1a2b3c4d_7", demo data only). The match must still belong to the player. */
const MATCH_ID = /^(?:[A-Z0-9]+_\d+|DEMO_[0-9a-f]{8}_\d+)$/;

/**
 * The full record of one match from a player's history, loaded when the match is opened. Your
 * own history, or a teammate's when your access includes teammates' statistics (the same rule as
 * the profile's Overview). The match must belong to that player's stored games.
 */
export async function getMatchDetailAction(playerId: string, matchId: string): Promise<MatchDetailResult> {
  const session = await getSession();
  if (!session) return { status: "not-found", message: "Sign in to see match details." };
  const self = session.playerId === playerId;
  if (!self && !hasPermission(session, "view-teammate-stats")) return { status: "not-found", message: "Teammates' match details are not part of your access." };
  if (!/^[0-9a-f-]{36}$/i.test(playerId) || !MATCH_ID.test(matchId)) return { status: "not-found", message: "This match is not in this player's history." };
  const db = await getAppDb();
  return getMatchDetail(db, playerId, matchId, { viewerIsOwner: self, fetchMissing: true, canShare: self && isTeamMember(session) });
}

/**
 * What one match's breakdown reads from its timeline (build and skill order, the lane at 10:00
 * and 15:00, the gold difference over the game), loaded when one of those sections first opens
 * (same access rule). Riot's timeline is fetched at most once per match, the first time anyone
 * opens it, and kept.
 */
export async function getMatchTimelineAction(playerId: string, matchId: string): Promise<MatchTimelineResult> {
  const session = await getSession();
  if (!session) return { status: "not-found", message: "Sign in to see match details." };
  const self = session.playerId === playerId;
  if (!self && !hasPermission(session, "view-teammate-stats")) return { status: "not-found", message: "Teammates' match details are not part of your access." };
  if (!/^[0-9a-f-]{36}$/i.test(playerId) || !MATCH_ID.test(matchId)) return { status: "not-found", message: "This match is not in this player's history." };
  const db = await getAppDb();
  return getMatchTimeline(db, playerId, matchId, { fetch: true });
}

/**
 * Possible groups in one match (players who were on one team in several earlier stored games),
 * loaded after its details open (same access rule). Stored matches only: no Riot request.
 */
export async function getMatchGroupsAction(playerId: string, matchId: string): Promise<MatchGroupsResult> {
  const session = await getSession();
  if (!session) return { status: "not-found", message: "Sign in to see match details." };
  const self = session.playerId === playerId;
  if (!self && !hasPermission(session, "view-teammate-stats")) return { status: "not-found", message: "Teammates' match details are not part of your access." };
  if (!/^[0-9a-f-]{36}$/i.test(playerId) || !MATCH_ID.test(matchId)) return { status: "not-found", message: "This match is not in this player's history." };
  const db = await getAppDb();
  return getMatchGroups(db, playerId, matchId);
}

export type MatchMeetingsResult = { status: "ok"; players: MatchMeeting[] } | { status: "not-found"; message: string };

/**
 * The players of one match whom the player also met in other games of the list's season, game mode
 * and account (Match History → Encounters counts them the same way), loaded after its details open
 * (same access rule). Stored games only: no Riot request. Each comes with their Encounters key, never
 * their account.
 */
export async function getMatchMeetingsAction(playerId: string, matchId: string, filters: { season: number; mode: string; accountId: string | null }): Promise<MatchMeetingsResult> {
  const session = await getSession();
  if (!session) return { status: "not-found", message: "Sign in to see match details." };
  const self = session.playerId === playerId;
  if (!self && !hasPermission(session, "view-teammate-stats")) return { status: "not-found", message: "Teammates' match details are not part of your access." };
  const mode = filters?.mode;
  if (!/^[0-9a-f-]{36}$/i.test(playerId) || !MATCH_ID.test(matchId) || !isSeasonMode(mode)) return { status: "not-found", message: "This match is not in this player's history." };
  const db = await getAppDb();
  const [accounts, seasonNow] = await Promise.all([listAccountsForPlayer(db, playerId), currentSeason(db)]);
  // Only offered seasons (Season 2026 to the current one) and the player's own accounts, as Encounters.
  if (!isOfferedSeason(filters.season, seasonNow) || (filters.accountId && !accounts.some((a) => a.id === filters.accountId))) return { status: "not-found", message: "This match is not in this player's history." };
  const players = await loadMatchMeetings(db, { accountIds: filters.accountId ? [filters.accountId] : accounts.map((a) => a.id), season: filters.season, mode }, matchId);
  return players ? { status: "ok", players } : { status: "not-found", message: "This match is not in this player's history." };
}

/**
 * The current ranks of one match's players, asked for by an open match window (same access rule)
 * when some are missing or stale: stored ones first, then a LEAGUE-V4 check of those, within the
 * limits in server/players/participant-ranks.ts. Nothing is checked for a match not in the
 * player's stored games.
 */
export async function getMatchRanksAction(playerId: string, matchId: string): Promise<MatchRanksResult> {
  const session = await getSession();
  if (!session) return { status: "not-found", message: "Sign in to see match details." };
  const self = session.playerId === playerId;
  if (!self && !hasPermission(session, "view-teammate-stats")) return { status: "not-found", message: "Teammates' match details are not part of your access." };
  if (!/^[0-9a-f-]{36}$/i.test(playerId) || !MATCH_ID.test(matchId)) return { status: "not-found", message: "This match is not in this player's history." };
  const db = await getAppDb();
  return getMatchRanks(db, playerId, matchId, { lookup: true });
}

/**
 * A profile's Refresh, first step: checks the player's linked Riot accounts for new games now (see
 * server/accounts/refresh.ts for the lease, cooldown and limits), on every tab of the profile.
 * Your own profile, or any profile for those who manage Riot accounts. Riot's key stays on the
 * server; the browser only learns what happened, and how many older games still lack their
 * multikill counts (the second step fetches a batch of them while there are any).
 */
export async function refreshMatchesAction(playerId: string): Promise<RefreshOutcome & { pendingFigures?: number }> {
  const session = await getSession();
  if (!session) return { status: "unavailable", message: "Sign in to refresh." };
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) return { status: "unavailable", message: "This profile cannot be refreshed." };
  if (session.playerId !== playerId && !canManageRiotAccounts(session, playerId)) return { status: "unavailable", message: "Only the player (or an admin) can refresh this profile." };
  const client = refreshClient(REFRESH_BUDGET_MS);
  if (!client) return { status: "unavailable", message: "Refresh is not available right now; games keep arriving through the regular sync." };
  const db = await getAppDb();
  try {
    const outcome = await refreshPlayerMatches(db, client, playerId);
    if (outcome.status === "updated") invalidateProficiencyCache();
    if (outcome.status === "failed" || outcome.status === "unavailable") return outcome;
    return { ...outcome, pendingFigures: await pendingFiguresForPlayer(db, playerId) };
  } catch {
    return { status: "failed", message: "Couldn't refresh right now; please try again in a few minutes." };
  }
}

/**
 * The second step of a profile's Refresh: fetches the multikill counts (and other extra figures)
 * of up to 40 of the player's older games that still lack them (server/accounts/refresh.ts,
 * catchUpPlayerFigures, for the limits). The same people as Refresh, under the same rules.
 */
export async function catchUpFiguresAction(playerId: string): Promise<CatchUpOutcome | { status: "unavailable"; message: string }> {
  const session = await getSession();
  if (!session) return { status: "unavailable", message: "Sign in to refresh." };
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) return { status: "unavailable", message: "This profile cannot be refreshed." };
  if (session.playerId !== playerId && !canManageRiotAccounts(session, playerId)) return { status: "unavailable", message: "Only the player (or an admin) can refresh this profile." };
  const client = refreshClient(CATCH_UP_BUDGET_MS);
  if (!client) return { status: "unavailable", message: "Refresh is not available right now; the counts keep arriving through the regular sync." };
  const db = await getAppDb();
  try {
    const outcome = await catchUpPlayerFigures(db, client, playerId);
    if ((outcome.status === "fetched" || outcome.status === "complete") && outcome.fetched > 0) invalidateProficiencyCache();
    return outcome;
  } catch {
    return { status: "unavailable", message: "Couldn't fetch the counts right now; please try again in a few minutes." };
  }
}
