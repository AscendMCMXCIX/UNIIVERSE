"use server";

import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/permissions";
import { getMatchDetail, type MatchDetailResult } from "@/server/players/match-history";

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
  if (!/^[0-9a-f-]{36}$/i.test(playerId) || !/^[A-Z0-9]+_\d+$/.test(matchId)) return { status: "not-found", message: "This match is not in this player's history." };
  const db = await getAppDb();
  return getMatchDetail(db, playerId, matchId, { viewerIsOwner: self, fetchMissing: true });
}
