"use server";

import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { canManageRiotAccounts, hasPermission, isTeamMember } from "@/server/auth/permissions";
import { getMatchDetail, type MatchDetailResult } from "@/server/players/match-history";
import { getMatchBuild, type MatchBuildResult } from "@/server/accounts/match-timeline";
import { refreshPlayerMatches, type RefreshOutcome } from "@/server/accounts/refresh";
import { createRiotClient } from "@/server/riot/api/client";
import { invalidateProficiencyCache } from "@/server/proficiency/service";

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
 * The build and skill order of one match, loaded after its details open (same access rule). Riot's
 * timeline is fetched at most once per match, the first time anyone opens it, and kept.
 */
export async function getMatchBuildAction(playerId: string, matchId: string): Promise<MatchBuildResult> {
  const session = await getSession();
  if (!session) return { status: "not-found", message: "Sign in to see match details." };
  const self = session.playerId === playerId;
  if (!self && !hasPermission(session, "view-teammate-stats")) return { status: "not-found", message: "Teammates' match details are not part of your access." };
  if (!/^[0-9a-f-]{36}$/i.test(playerId) || !MATCH_ID.test(matchId)) return { status: "not-found", message: "This match is not in this player's history." };
  const db = await getAppDb();
  return getMatchBuild(db, playerId, matchId, { fetch: true });
}

/**
 * "Refresh matches": checks the player's linked Riot accounts for new games now (see
 * server/accounts/refresh.ts for the lease, cooldown and limits). Your own profile, or any profile
 * for those who manage Riot accounts. Riot's key stays on the server; the browser only learns
 * what happened.
 */
export async function refreshMatchesAction(playerId: string): Promise<RefreshOutcome> {
  const session = await getSession();
  if (!session) return { status: "unavailable", message: "Sign in to refresh matches." };
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) return { status: "unavailable", message: "This profile cannot be refreshed." };
  if (session.playerId !== playerId && !canManageRiotAccounts(session, playerId)) return { status: "unavailable", message: "Only the player (or an admin) can refresh this match history." };
  const client = createRiotClient({ maxRetries: 0, timeoutMs: 10_000 });
  if (!client) return { status: "unavailable", message: "Match refresh is not available right now; games keep arriving through the regular sync." };
  const db = await getAppDb();
  try {
    const outcome = await refreshPlayerMatches(db, client, playerId);
    if (outcome.status === "updated") invalidateProficiencyCache();
    return outcome;
  } catch {
    return { status: "failed", message: "Couldn't refresh right now; please try again in a few minutes." };
  }
}
