"use server";

import { getAppDb } from "@/server/bootstrap";
import { getSession, needsSetup } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/permissions";
import { mayOpenProfile } from "@/server/auth/profile-access";
import { isGameRole, isSeasonMode } from "@/domain/season-stats";
import { getChampionPreview, getPairingGames, type ChampionPreviewData, type PairingGamesData, type PreviewScope } from "@/server/players/champion-preview";

/*
  All Champions' preview: a public endpoint like every action, with the profile pages' own checks
  (ProfileChampionsTab): your own profile, or a teammate's with "view teammates' statistics"; a
  personal-use profile is its player's and the administrators' only (mayOpenProfile), answered as
  one that does not exist. Only the player's own stored games are read, and only champions leave.
*/

export type PreviewResult<T> = { status: "ok"; data: T } | { status: "not-found"; message: string };

const NOT_AVAILABLE = "This champion's games are not available.";
const PLAYER_ID = /^[0-9a-f-]{36}$/i;
/** A champion's Data Dragon id ("MonkeyKing", "KSante"). */
const CHAMPION_ID = /^[A-Za-z][A-Za-z0-9]{0,31}$/;

/** The scope as the browser sent it, or null when any part is not one the list can have. */
function readScope(raw: unknown): PreviewScope | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const season = s.season === "all" ? "all" : typeof s.season === "number" && Number.isInteger(s.season) && s.season > 0 && s.season < 1000 ? s.season : null;
  if (season === null || !isSeasonMode(s.mode) || !isGameRole(s.role)) return null;
  if (typeof s.champion !== "string" || !CHAMPION_ID.test(s.champion)) return null;
  if (typeof s.account !== "string" || !(s.account === "all" || PLAYER_ID.test(s.account))) return null;
  return { season, mode: s.mode, account: s.account, champion: s.champion, role: s.role };
}

/** The champion's lane opponents in the list's scope (no match record is read). */
export async function getChampionPreviewAction(playerId: string, scope: PreviewScope): Promise<PreviewResult<ChampionPreviewData>> {
  const session = await getSession();
  if (!session || needsSetup(session)) return { status: "not-found", message: session ? "Finish your first-time setup first." : "Sign in to see champion statistics." };
  const self = session.playerId === playerId;
  if (!self && !hasPermission(session, "view-teammate-stats")) return { status: "not-found", message: "Teammates' champion statistics are not part of your access." };
  const s = readScope(scope);
  if (typeof playerId !== "string" || !PLAYER_ID.test(playerId) || !s) return { status: "not-found", message: NOT_AVAILABLE };
  const db = await getAppDb();
  if (!(await mayOpenProfile(db, session, playerId))) return { status: "not-found", message: NOT_AVAILABLE };
  return { status: "ok", data: await getChampionPreview(db, playerId, s) };
}

/** One opponent's games against the champion, with the lane at 10:00 where a timeline has it. */
export async function getPairingGamesAction(playerId: string, scope: PreviewScope, vs: string): Promise<PreviewResult<PairingGamesData>> {
  const session = await getSession();
  if (!session || needsSetup(session)) return { status: "not-found", message: session ? "Finish your first-time setup first." : "Sign in to see champion statistics." };
  const self = session.playerId === playerId;
  if (!self && !hasPermission(session, "view-teammate-stats")) return { status: "not-found", message: "Teammates' champion statistics are not part of your access." };
  const s = readScope(scope);
  if (typeof playerId !== "string" || !PLAYER_ID.test(playerId) || !s || typeof vs !== "string" || !CHAMPION_ID.test(vs)) return { status: "not-found", message: NOT_AVAILABLE };
  const db = await getAppDb();
  if (!(await mayOpenProfile(db, session, playerId))) return { status: "not-found", message: NOT_AVAILABLE };
  return { status: "ok", data: await getPairingGames(db, playerId, s, vs) };
}
