"use server";

import { getAppDb } from "@/server/bootstrap";
import { isOfferedSeason } from "@/domain/season";
import { currentSeason } from "@/server/accounts/sync";
import { getSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/permissions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { loadEncounters } from "@/server/matches/encounters";
import { encounterGames, filterEncounterRows, summariseEncounters, type EncounterGame, type EncounterSummary } from "@/domain/encounters";
import { opggProfileUrl, platformOfMatchId } from "@/domain/opgg";
import { queueLabel } from "@/server/players/match-history";

export type EncounterDetailResult = { status: "ok"; summary: EncounterSummary; opgg: string | null; games: Array<EncounterGame & { queue: string }>; more: number } | { status: "not-found"; message: string };

const GAMES_SHOWN = 100;

/**
 * One recurring player in the Encounters window: their record with and against the members and
 * the recorded games, within the filters the list was showing. The same right as Played together
 * (teammates' Riot games); the player is named by the list's opaque key, never by account.
 */
export async function getEncounterDetailAction(key: string, filters: { season: number | null; queues: number[] | null; playerId: string | null; accountId: string | null }): Promise<EncounterDetailResult> {
  const session = await getSession();
  if (!session || !hasPermission(session, "view-matches") || !hasPermission(session, "view-teammate-stats")) return { status: "not-found", message: "Encounters are not part of your access." };
  if (!/^[A-Za-z0-9_-]{16}$/.test(key)) return { status: "not-found", message: "This player is not in the team's recorded games." };
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const data = await loadEncounters(db, team.id);
  const safe = {
    season: typeof filters.season === "number" && Number.isInteger(filters.season) ? filters.season : null,
    queues: Array.isArray(filters.queues) ? filters.queues.filter((q) => Number.isInteger(q)).slice(0, 10) : null,
    playerId: filters.playerId && data.members[filters.playerId] ? filters.playerId : null,
    accountId: filters.accountId && filters.playerId && data.members[filters.playerId]?.accounts.some((a) => a.id === filters.accountId) ? filters.accountId : null,
  };
  // Never before the first offered season or after the current one, whatever the request says.
  const seasonNow = await currentSeason(db);
  const rows = filterEncounterRows(data.rows.filter((r) => isOfferedSeason(r.season, seasonNow)), safe).filter((r) => r.key === key);
  const [summary] = summariseEncounters(rows);
  if (!summary) return { status: "not-found", message: "No recorded games with this player in this view." };
  const games = encounterGames(rows, key);
  return { status: "ok", summary, opgg: opggProfileUrl(summary.name, platformOfMatchId(summary.lastMatchId)), games: games.slice(0, GAMES_SHOWN).map((g) => ({ ...g, queue: queueLabel(g.queueId) })), more: Math.max(0, games.length - GAMES_SHOWN) };
}
