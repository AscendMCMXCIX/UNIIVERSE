"use server";

import { getAppDb } from "@/server/bootstrap";
import { isOfferedSeason } from "@/domain/season";
import { isSeasonMode } from "@/domain/season-stats";
import { currentSeason } from "@/server/accounts/sync";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { getSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/permissions";
import { loadEncounterDetail } from "@/server/players/encounters";
import { queueLabel } from "@/server/players/match-history";
import type { EncounterGame, EncounterSummary } from "@/domain/encounters";
import { opggLinkFor, platformOfMatchId } from "@/domain/opgg";

export type EncounterDetailResult = { status: "ok"; summary: EncounterSummary; renamed: string | null; opgg: string | null; games: Array<EncounterGame & { queue: string }>; more: number } | { status: "not-found"; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_MET: EncounterDetailResult = { status: "not-found", message: "No recorded games with this player in this view." };

/**
 * One player in a profile's Players met: the record with and against them and the recorded games,
 * in the season, game mode and account the list was showing. The same right as the profile's Match
 * History (your own, or a teammate's with the teammate-statistics right), checked here again; the
 * player is named by the list's opaque key, never by account.
 */
export async function getEncounterDetailAction(playerId: string, key: string, filters: { season: number; mode: string; accountId: string | null }): Promise<EncounterDetailResult> {
  const session = await getSession();
  if (!session || typeof playerId !== "string" || (session.playerId !== playerId && !hasPermission(session, "view-teammate-stats"))) return { status: "not-found", message: "This player's games are not part of your access." };
  const mode = filters?.mode;
  if (!UUID.test(playerId) || typeof key !== "string" || !/^[A-Za-z0-9_-]{16}$/.test(key) || !isSeasonMode(mode)) return NOT_MET;
  const db = await getAppDb();
  const [accounts, seasonNow] = await Promise.all([listAccountsForPlayer(db, playerId), currentSeason(db)]);
  // Only offered seasons (Season 2026 to the current one) and the player's own accounts.
  if (!isOfferedSeason(filters.season, seasonNow)) return NOT_MET;
  if (filters.accountId && !accounts.some((a) => a.id === filters.accountId)) return NOT_MET;
  const detail = await loadEncounterDetail(db, { accountIds: filters.accountId ? [filters.accountId] : accounts.map((a) => a.id), season: filters.season, mode }, key);
  if (!detail) return NOT_MET;
  const { summary, games, newer } = detail;
  return {
    status: "ok",
    summary,
    renamed: newer && newer.riotId !== summary.name ? newer.riotId : null,
    opgg: opggLinkFor(summary.name, platformOfMatchId(summary.lastMatchId), newer ? { riotId: newer.riotId, platform: platformOfMatchId(newer.matchId) } : null),
    games: games.map((g) => ({ ...g, queue: queueLabel(g.queueId) })),
    more: Math.max(0, summary.games - games.length),
  };
}
