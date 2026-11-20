"use server";

import { getAppDb } from "@/server/bootstrap";
import { getSession, needsSetup } from "@/server/auth/session";
import { canViewPlayerStats, hasPermission } from "@/server/auth/permissions";
import { mayOpenProfile } from "@/server/auth/profile-access";
import { getPlayerPeek, type PlayerPeekData } from "@/server/team/player-peek";

/*
  The player Peek on Players and Leaderboards rows: a public endpoint like every action, with the
  profile's own checks. Signed in and set up; the Players directory's right (view-players), since
  the Peek is a look at a profile from it; a personal-use profile is its player's and the
  administrators' only (mayOpenProfile), answered as one that does not exist; and the season, its
  figures and the ranked change only with "view teammates' statistics" or on one's own
  (canViewPlayerStats, #207's levels): without it the Peek carries identity, role and pool only.
*/

export type PlayerPeekResult = { status: "ok"; data: PlayerPeekData } | { status: "not-found"; message: string };

const NOT_AVAILABLE = "This player is not available.";
const PLAYER_ID = /^[0-9a-f-]{36}$/i;

export async function getPlayerPeekAction(playerId: string): Promise<PlayerPeekResult> {
  const session = await getSession();
  if (!session || needsSetup(session)) return { status: "not-found", message: session ? "Finish your first-time setup first." : "Sign in to see players." };
  if (typeof playerId !== "string" || !PLAYER_ID.test(playerId)) return { status: "not-found", message: NOT_AVAILABLE };
  if (session.playerId !== playerId && !hasPermission(session, "view-players")) return { status: "not-found", message: NOT_AVAILABLE };
  const db = await getAppDb();
  if (!(await mayOpenProfile(db, session, playerId))) return { status: "not-found", message: NOT_AVAILABLE };
  const data = await getPlayerPeek(db, playerId, canViewPlayerStats(session, playerId));
  return data ? { status: "ok", data } : { status: "not-found", message: NOT_AVAILABLE };
}
