import type { Db } from "@/server/db/types";
import type { Role } from "@/domain/roles";
import { legalRolesFor, poolFor } from "@/domain/roster";
import type { GameRecord } from "@/domain/player-stats";
import { combineMastery, gamesFor, otherSeasonChampions, recordOf, seasonChampionStats, seasonsInGames, type CombinedMastery, type MasteryEntry, type SeasonChampionStats, type SeasonMode } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { TIER_LABELS, type ProficiencyTier } from "@/domain/proficiency";
import { describeAccountSync, summariseAccounts, type AccountSyncView } from "@/domain/account-status";
import { platformLabel } from "@/domain/riot-platforms";
import { listAccountsForPlayer, loadMasteryForAccounts, type RiotAccountRecord } from "@/server/accounts/repository";
import { currentSeason } from "@/server/accounts/sync";
import { loadSeasonGames } from "@/server/players/season-games";
import { getCurrentPatch } from "@/server/repositories/champions";
import { getProficiencyLookup } from "@/server/proficiency/service";
import type { PlayerRecord } from "@/server/repositories/team";

export interface RankView {
  tier: string;
  division: string | null;
  leaguePoints: number;
  wins: number | null;
  losses: number | null;
  /** "Emerald II · 45 LP · 120W 100L" */
  text: string;
}

/** A linked Riot account as every member may see it: identity, server, rank and sync state. Never a PUUID or an error payload. */
export interface AccountOverview {
  id: string;
  riotId: string;
  platformLabel: string;
  platformSource: "user" | "riot";
  label: string;
  rank: RankView | null;
  sync: AccountSyncView;
}

export interface OverviewCard extends SeasonChampionStats {
  role: Role;
  inPool: "primary" | "secondary" | null;
  tier: ProficiencyTier;
  tierLabel: string;
  /** Champion mastery summed over the player's linked accounts, with the per-account breakdown. */
  mastery: CombinedMastery | null;
}

export interface SeasonCompleteness {
  complete: boolean;
  /** "Complete season" · "Partial season" · "No games yet" */
  label: string;
  /** One sentence on what the figures cover. */
  detail: string;
}

export interface PlayerOverviewData {
  playerId: string;
  season: number;
  /** Seasons that can be chosen: the current one plus any with stored games. */
  seasons: number[];
  currentSeason: number;
  mode: SeasonMode;
  currentPatch: string | null;
  accounts: AccountOverview[];
  accountsSummary: ReturnType<typeof summariseAccounts>;
  /** Rank of the main linked account (first account with a rank otherwise). */
  rank: RankView | null;
  /** Every champion, the selected season and mode. */
  record: GameRecord;
  /** Every champion, the selected season, by mode. */
  byMode: { solo: GameRecord; flex: GameRecord; normal: GameRecord };
  completeness: SeasonCompleteness;
  lastSyncAt: Date | null;
  /** Configured pool champions in pool order, primary pool first. */
  cards: OverviewCard[];
  /** Champions with games in the season and mode that are in no pool; filled only when requested. */
  others: OverviewCard[];
  othersRequested: boolean;
  /** Any stored game at all (so an empty card means "no games", not "no data yet"). */
  hasHistory: boolean;
}

export function rankView(a: Pick<RiotAccountRecord, "tier" | "division" | "leaguePoints" | "rankedWins" | "rankedLosses">): RankView | null {
  if (!a.tier) return null;
  const lp = a.leaguePoints ?? 0;
  const tierName = a.tier.charAt(0).toUpperCase() + a.tier.slice(1).toLowerCase();
  const wl = a.rankedWins !== null && a.rankedLosses !== null ? ` · ${a.rankedWins}W ${a.rankedLosses}L` : "";
  return { tier: a.tier, division: a.division, leaguePoints: lp, wins: a.rankedWins, losses: a.rankedLosses, text: `${tierName}${a.division ? ` ${a.division}` : ""} · ${lp} LP${wl}` };
}

export interface PlayerOverviewOptions {
  /** Season to show (game-version major); defaults to the current season. */
  season?: number | null;
  mode: SeasonMode;
  riotConfigured: boolean;
  /** Also list champions outside the pools that have games in the season. */
  includeOthers?: boolean;
  now?: Date;
}

/** What the season figures cover, in one honest sentence. */
export function seasonCompleteness(accounts: Pick<RiotAccountRecord, "historyBackfill" | "syncStatus">[], season: number, currentSeason: number, games: number): SeasonCompleteness {
  if (accounts.length === 0) return { complete: false, label: "No Riot account", detail: "No Riot account is linked, so there are no games to count." };
  if (season !== currentSeason) return { complete: false, label: "Partial season", detail: `${seasonLabel(season)}: only the games UNIIVERSE stored while it was tracking these accounts; earlier seasons are not collected again.` };
  const collecting = accounts.filter((a) => a.syncStatus !== "demo" && !(a.historyBackfill?.season === season && a.historyBackfill.completedAt));
  if (collecting.length === 0) return { complete: true, label: "Complete season", detail: `Every supported game this season from ${accounts.length === 1 ? "the linked account" : `all ${accounts.length} linked accounts`}.` };
  if (games === 0) return { complete: false, label: "No games yet", detail: "This season's games are still being collected from Riot; figures appear as they arrive." };
  return { complete: false, label: "Partial season", detail: `Still collecting older games from ${collecting.length} of ${accounts.length} linked account${accounts.length === 1 ? "" : "s"}; the numbers grow over the next few syncs.` };
}

/**
 * The season overview behind My Overview and every teammate profile: quick reference (roles, rank,
 * season record by mode, completeness, last sync) and one card per configured pool champion with
 * combined mastery, season games and the proficiency estimate. Everything is read from stored data;
 * no Riot request is made while rendering, and nothing is shown that was not counted.
 */
export async function getPlayerOverview(db: Db, player: PlayerRecord, options: PlayerOverviewOptions): Promise<PlayerOverviewData> {
  const now = options.now ?? new Date();
  const [accounts, current, lookup, currentSeasonNumber] = await Promise.all([listAccountsForPlayer(db, player.id), getCurrentPatch(db), getProficiencyLookup(db, [player.id]), currentSeason(db, now)]);
  const ids = accounts.map((a) => a.id);
  const [games, masteryRows] = await Promise.all([loadSeasonGames(db, ids), loadMasteryForAccounts(db, ids)]);
  const seasons = [...new Set([currentSeasonNumber, ...seasonsInGames(games)])].sort((a, b) => b - a);
  const season = options.season && seasons.includes(options.season) ? options.season : currentSeasonNumber;
  const views: AccountOverview[] = accounts.map((a) => ({
    id: a.id,
    riotId: a.riotId,
    platformLabel: platformLabel(a.platform),
    platformSource: a.platformSource,
    label: a.label,
    rank: rankView(a),
    sync: describeAccountSync({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, resolveAttempts: a.resolveAttempts, history: a.historyBackfill, riotConfigured: options.riotConfigured }, now),
  }));
  const ranked = views.filter((v) => v.rank);
  const rank = (ranked.find((v) => v.label === "main") ?? ranked[0])?.rank ?? null;
  const accountName = new Map(accounts.map((a) => [a.id, `${a.riotId} · ${platformLabel(a.platform)}`]));
  const masteryByChampion = new Map<string, MasteryEntry[]>();
  for (const m of masteryRows) masteryByChampion.set(m.championId, [...(masteryByChampion.get(m.championId) ?? []), { accountId: m.accountId, account: accountName.get(m.accountId) ?? "Linked account", points: m.points, level: m.level, lastPlayedAt: m.lastPlayedAt }]);

  const card = (c: SeasonChampionStats, role: Role, inPool: OverviewCard["inPool"]): OverviewCard => {
    const tier: ProficiencyTier = lookup(player.id, c.championId, role)?.tier ?? "unknown";
    return { ...c, role, inPool, tier, tierLabel: TIER_LABELS[tier], mastery: combineMastery(masteryByChampion.get(c.championId) ?? []) };
  };
  const seen = new Set<string>();
  const cards: OverviewCard[] = [];
  for (const role of legalRolesFor(player)) {
    const pool = poolFor(player, role).filter((id) => !seen.has(id));
    for (const id of pool) seen.add(id);
    for (const c of seasonChampionStats(games, pool, { season, mode: options.mode })) cards.push(card(c, role, role === player.primaryRole ? "primary" : "secondary"));
  }
  const others = options.includeOthers ? seasonChampionStats(games, otherSeasonChampions(games, [...seen], { season, mode: options.mode }), { season, mode: options.mode }).map((c) => card(c, player.primaryRole, null)) : [];
  const lastSyncAt = accounts.map((a) => a.lastSyncAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const seasonGames = gamesFor(games, { season, mode: "all" });
  return {
    playerId: player.id,
    season,
    seasons,
    currentSeason: currentSeasonNumber,
    mode: options.mode,
    currentPatch: current?.patch ?? null,
    accounts: views,
    accountsSummary: summariseAccounts(views.map((v) => v.sync)),
    rank,
    record: recordOf(gamesFor(games, { season, mode: options.mode })),
    byMode: { solo: recordOf(gamesFor(games, { season, mode: "solo" })), flex: recordOf(gamesFor(games, { season, mode: "flex" })), normal: recordOf(gamesFor(games, { season, mode: "normal" })) },
    completeness: seasonCompleteness(accounts, season, currentSeasonNumber, seasonGames.length),
    lastSyncAt,
    cards,
    others,
    othersRequested: !!options.includeOthers,
    hasHistory: games.length > 0,
  };
}
