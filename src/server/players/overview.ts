import type { Db } from "@/server/db/types";
import { recentForm, type RecentForm } from "@/domain/recent-form";
import type { Role } from "@/domain/roles";
import { legalRolesFor, poolFor } from "@/domain/roster";
import type { GameRecord } from "@/domain/player-stats";
import { championsByGames, combineMastery, modeBreakdown, dedupeGames, filterGames, gameRole, gamesFor, isGameRole, otherSeasonChampions, performanceOfGames, recordOf, seasonChampionStats, seasonsInGames, type CombinedMastery, type GameRole, type MasteryEntry, type PerformanceSummary, type SeasonChampionStats, type SeasonMode, type StatsFilter, type StatsScope } from "@/domain/season-stats";
import { chooseSeason, offeredSeasons, seasonLabel } from "@/domain/season";
import { multikillsOfGames, type MultikillSummary } from "@/domain/multikills";
import { TIER_DESCRIPTIONS, TIER_LABELS, confidenceWord, type ProficiencyTier } from "@/domain/proficiency";
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
  /** Which ranked queue: solo (Solo/Duo) or flex; null when the stored snapshot predates recording it. */
  queue: "solo" | "flex" | null;
  /** When this rank was read from Riot (it is the last known rank, not live). */
  asOf: string | null;
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
  inPool: "primary" | "secondary" | "additional" | null;
  tier: ProficiencyTier;
  tierLabel: string;
  /** One short sentence on why this tier (the evidence behind it). */
  tierWhy: string;
  /** How much the data behind the rating can be trusted. */
  evidence: "high" | "medium" | "low" | "none";
  /** Champion mastery summed over the player's linked accounts, with the per-account breakdown. */
  mastery: CombinedMastery | null;
  /** Pool cards: games on this champion in every role (the card's own figures are this role only). */
  allRoles?: number;
  /**
   * The champion's multikills in the same games as its other figures (All Champions and the
   * champion window), with how many of those games have counts: a game without them is left out,
   * never counted as zero.
   */
  multikills?: MultikillSummary;
}

export interface SeasonCompleteness {
  complete: boolean;
  /** "Complete season" · "Partial Data" · "No games yet" */
  label: string;
  /** One sentence on what the figures cover. */
  detail: string;
}

export interface PlayerOverviewData {
  playerId: string;
  /** The statistics filter in effect (defaults: everything, current season). */
  filter: StatsFilter;
  /** The main figures for the filter: record plus KDA / CS / damage / vision averages, and multikills (per champion: topChampions). */
  summary: { record: GameRecord; performance: PerformanceSummary; unknownRole: number; multikills: MultikillSummary };
  /** The same figures in each role asked for with `roleSummaries` (everything else in the filter unchanged). */
  roleSummaries: Partial<Record<Role, { record: GameRecord; performance: PerformanceSummary }>>;
  /** Champions within the filter, most played first, with their figures. */
  topChampions: OverviewCard[];
  /** Choices for the champion filter: champions played this season/mode, then pool champions. */
  championOptions: Array<{ id: string; games: number }>;
  accountOptions: Array<{ id: string; riotId: string; label: string }>;
  season: number;
  /** Games per game mode in the chosen season, and other seasons holding the chosen mode (see modeBreakdown). */
  modes: ReturnType<typeof modeBreakdown>;
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
  /**
   * Games on configured champions in the role they are configured for (every configured role),
   * all linked accounts, selected season and mode. Team cards and strength tags use it.
   */
  pool: { record: GameRecord; performance: PerformanceSummary; champions: number };
  /** The same averages over every champion played (context only). */
  allPerformance: PerformanceSummary;
  /** Every champion, the selected season, by mode. */
  byMode: { solo: GameRecord; flex: GameRecord; normal: GameRecord };
  completeness: SeasonCompleteness;
  lastSyncAt: Date | null;
  /** One card per configured (role, champion), roles in preference order, figures for that role only. */
  cards: OverviewCard[];
  /** Champions with games in the season and mode that are in no pool; filled only when requested. */
  others: OverviewCard[];
  othersRequested: boolean;
  /** Any stored game at all (so an empty card means "no games", not "no data yet"). */
  hasHistory: boolean;
  /** The newest results of the filter and the recent win rate beside the filter's whole sample. */
  form: RecentForm;
}

export function rankView(a: Pick<RiotAccountRecord, "tier" | "division" | "leaguePoints" | "rankedWins" | "rankedLosses"> & Partial<Pick<RiotAccountRecord, "rankQueue" | "rankUpdatedAt">>): RankView | null {
  if (!a.tier) return null;
  const lp = a.leaguePoints ?? 0;
  const tierName = a.tier.charAt(0).toUpperCase() + a.tier.slice(1).toLowerCase();
  const wl = a.rankedWins !== null && a.rankedLosses !== null ? ` · ${a.rankedWins}W ${a.rankedLosses}L` : "";
  return { tier: a.tier, division: a.division, leaguePoints: lp, wins: a.rankedWins, losses: a.rankedLosses, text: `${tierName}${a.division ? ` ${a.division}` : ""} · ${lp} LP${wl}`, queue: a.rankQueue ?? null, asOf: a.rankUpdatedAt ? a.rankUpdatedAt.toISOString() : null };
}

export interface PlayerOverviewOptions {
  /** Season to show (game-version major); defaults to the current season. */
  season?: number | null;
  mode: SeasonMode;
  /** Narrowing of the main figures (role played, scope, champion, account); everything by default. */
  role?: string | null;
  scope?: string | null;
  championId?: string | null;
  accountId?: string | null;
  riotConfigured: boolean;
  /** Also list champions outside the pools that have games in the season. */
  includeOthers?: boolean;
  /** Also sum up these roles one by one from the same games (a Team substitute's card in every role they cover). */
  roleSummaries?: readonly Role[];
  now?: Date;
}

/** "41 games on record, 6 in the last 30 days. Strong personal results (56% win rate)." */
export function tierExplanation(est: { tier: ProficiencyTier; games: number; recentGames: number; roleGames?: number; confidence?: number; notes: string[] } | null | undefined): string {
  if (!est || est.tier === "unknown") return TIER_DESCRIPTIONS.unknown;
  const parts = [est.games ? `${est.games} game${est.games === 1 ? "" : "s"} on record${est.roleGames !== undefined && est.roleGames !== est.games ? ` (${est.roleGames} in this role)` : ""}, ${est.recentGames} in the last 30 days.` : "No games on record; mastery only."];
  const note = est.notes.find((n) => !/^\d+ games in the last|^Played a lot/.test(n));
  if (note) parts.push(`${note}.`);
  if (est.confidence !== undefined) parts.push(`Evidence: ${EVIDENCE_WORDS[confidenceWord(est.confidence)]}.`);
  return `${TIER_DESCRIPTIONS[est.tier]} ${parts.join(" ")}`;
}

/** How much the data behind a rating can be trusted, in words (separate from the rating itself). */
export const EVIDENCE_WORDS = { high: "solid (plenty of recent games)", medium: "reasonable", low: "thin (few games so far)", none: "none" } as const;

/** What the season figures cover, in one honest sentence. */
export function seasonCompleteness(accounts: Pick<RiotAccountRecord, "historyBackfill" | "syncStatus">[], season: number, currentSeason: number, games: number): SeasonCompleteness {
  if (accounts.length === 0) return { complete: false, label: "No Riot account", detail: "No Riot account is linked, so there are no games to count." };
  if (season === currentSeason - 1) {
    // The previous season is collected after the current one is complete (lowest priority).
    const pending = accounts.filter((a) => a.syncStatus !== "demo" && !(a.historyBackfill?.previous?.season === season && a.historyBackfill.previous.completedAt));
    if (pending.length === 0) return games === 0 ? { complete: true, label: "No games that season", detail: `The linked accounts have no supported games in ${seasonLabel(season)}.` } : { complete: true, label: "Complete season", detail: `Every supported ${seasonLabel(season)} game from ${accounts.length === 1 ? "the linked account" : `all ${accounts.length} linked accounts`}.` };
    return { complete: false, label: "Partial Data", detail: `${seasonLabel(season)} games are still being collected from ${pending.length} of ${accounts.length} linked account${accounts.length === 1 ? "" : "s"}, after this season's; the numbers grow by themselves.` };
  }
  if (season !== currentSeason) return { complete: false, label: "Partial Data", detail: `${seasonLabel(season)}: only the games stored while these accounts were tracked; seasons before last are not collected.` };
  const collecting = accounts.filter((a) => a.syncStatus !== "demo" && !(a.historyBackfill?.season === season && a.historyBackfill.completedAt));
  if (collecting.length === 0 && games === 0) return { complete: true, label: "No games this season", detail: "The linked accounts have no supported games stored for this season." };
  if (collecting.length === 0) return { complete: true, label: "Complete season", detail: `Every supported game this season from ${accounts.length === 1 ? "the linked account" : `all ${accounts.length} linked accounts`}.` };
  if (games === 0) return { complete: false, label: "No games yet", detail: "This season's games are still being collected from Riot; figures appear as they arrive." };
  return { complete: false, label: "Partial Data", detail: `Still collecting older games from ${collecting.length} of ${accounts.length} linked account${accounts.length === 1 ? "" : "s"}; the numbers grow by themselves.` };
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
  const [rawGames, masteryRows] = await Promise.all([loadSeasonGames(db, ids, { dedupe: false }), loadMasteryForAccounts(db, ids)]);
  const games = dedupeGames(rawGames);
  // The offered seasons (domain/season): Season 2026 on, the current one always.
  const seasons = offeredSeasons(currentSeasonNumber, seasonsInGames(games));
  const season = chooseSeason(options.season, seasons, currentSeasonNumber);
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
    const est = lookup(player.id, c.championId, role);
    const tier: ProficiencyTier = est?.tier ?? "unknown";
    return { ...c, role, inPool, tier, tierLabel: TIER_LABELS[tier], tierWhy: tierExplanation(est), evidence: est ? confidenceWord(est.confidence) : "none", mastery: combineMastery(masteryByChampion.get(c.championId) ?? []) };
  };
  const roles = legalRolesFor(player);
  const poolOf = (r: GameRole) => (roles.includes(r) ? poolFor(player, r) : []);
  const fitOf = (role: Role): OverviewCard["inPool"] => (role === player.primaryRole ? "primary" : role === player.secondaryRole ? "secondary" : roles.includes(role) ? "additional" : null);

  // Pool cards: every configured (role, champion), the same champion in several roles included,
  // each with the games actually played in that role.
  const seen = new Set<string>();
  const cards: OverviewCard[] = [];
  const allRoleRecord = new Map(seasonChampionStats(games, [...new Set(roles.flatMap((r) => poolFor(player, r)))], { season, mode: options.mode }).map((c) => [c.championId, c.selected.games]));
  for (const role of roles) {
    const pool = poolFor(player, role);
    for (const id of pool) seen.add(id);
    const inRole = games.filter((g) => gameRole(g) === role);
    for (const c of seasonChampionStats(inRole, pool, { season, mode: options.mode })) cards.push({ ...card(c, role, fitOf(role)), allRoles: allRoleRecord.get(c.championId) ?? 0 });
  }

  // The main figures: the filter (everything by default).
  const scope: StatsScope = options.scope === "pool" || options.scope === "champion" ? options.scope : "all";
  const accountId = options.accountId && accounts.some((a) => a.id === options.accountId) ? options.accountId : null;
  const filter: StatsFilter = { season, mode: options.mode, role: isGameRole(options.role) ? options.role : null, scope: scope === "champion" && !options.championId ? "all" : scope, championId: scope === "champion" ? (options.championId ?? null) : null, accountId };
  const filtered = filterGames(rawGames, filter, poolOf);
  // A champion's row needs a role: the role it was played in most, else the primary role. A member
  // without a chosen role whose games carry no role has no row for it (never an invented role);
  // those games still count in the summary.
  const topChampions = championsByGames(filtered.games).flatMap(({ championId }) => {
    const mine = filtered.games.filter((g) => g.championId === championId);
    const roleCounts = new Map<GameRole, number>();
    for (const g of mine) {
      const r = gameRole(g);
      if (r) roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
    }
    const role = filter.role ?? [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? player.primaryRole;
    if (!role) return [];
    const [stats] = seasonChampionStats(mine, [championId], { season, mode: options.mode });
    return [{ ...card(stats!, role, poolFor(player, role).includes(championId) ? fitOf(role) : null), multikills: multikillsOfGames(mine) }];
  });
  const selectedGames = gamesFor(games, { season, mode: options.mode });
  const poolGames = filterGames(rawGames, { season, mode: options.mode, role: null, scope: "pool", championId: null, accountId: null }, poolOf).games;
  const playedOptions = championsByGames(selectedGames).map((c) => ({ id: c.championId, games: c.games }));
  const championOptions = [...playedOptions, ...[...seen].filter((id) => !playedOptions.some((o) => o.id === id)).map((id) => ({ id, games: 0 }))];
  const primary = player.primaryRole;
  const others = options.includeOthers && primary ? seasonChampionStats(games, otherSeasonChampions(games, [...seen], { season, mode: options.mode }), { season, mode: options.mode }).map((c) => card(c, primary, null)) : [];
  const lastSyncAt = accounts.map((a) => a.lastSyncAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const seasonGames = gamesFor(games, { season, mode: "all" });
  return {
    playerId: player.id,
    filter,
    summary: { record: recordOf(filtered.games), performance: performanceOfGames(filtered.games), unknownRole: filtered.unknownRole, multikills: multikillsOfGames(filtered.games) },
    roleSummaries: Object.fromEntries(
      (options.roleSummaries ?? []).map((role) => {
        const inRole = filterGames(rawGames, { ...filter, role }, poolOf).games;
        return [role, { record: recordOf(inRole), performance: performanceOfGames(inRole) }];
      }),
    ),
    form: recentForm(filtered.games),
    topChampions,
    championOptions,
    accountOptions: accounts.map((a) => ({ id: a.id, riotId: a.riotId, label: a.label })),
    season,
    modes: modeBreakdown(rawGames, filter),
    seasons,
    currentSeason: currentSeasonNumber,
    mode: options.mode,
    currentPatch: current?.patch ?? null,
    accounts: views,
    accountsSummary: summariseAccounts(views.map((v) => v.sync)),
    rank,
    record: recordOf(selectedGames),
    pool: { record: recordOf(poolGames), performance: performanceOfGames(poolGames), champions: seen.size },
    allPerformance: performanceOfGames(selectedGames),
    byMode: { solo: recordOf(gamesFor(games, { season, mode: "solo" })), flex: recordOf(gamesFor(games, { season, mode: "flex" })), normal: recordOf(gamesFor(games, { season, mode: "normal" })) },
    completeness: seasonCompleteness(accounts, season, currentSeasonNumber, seasonGames.length),
    lastSyncAt,
    cards,
    others,
    othersRequested: !!options.includeOthers,
    hasHistory: games.length > 0,
  };
}
