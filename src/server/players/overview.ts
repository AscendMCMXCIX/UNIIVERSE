import type { Db } from "@/server/db/types";
import type { Role } from "@/domain/roles";
import { legalRolesFor, poolFor } from "@/domain/roster";
import { championCards, otherChampionsPlayed, summarise, type ChampionCard, type GameMode, type GameRecord, type HistoryBucket, type PatchWindow } from "@/domain/player-stats";
import { TIER_LABELS, type ProficiencyTier } from "@/domain/proficiency";
import { describeAccountSync, summariseAccounts, type AccountSyncView } from "@/domain/account-status";
import { platformLabel } from "@/domain/riot-platforms";
import { listAccountsForPlayer, type RiotAccountRecord } from "@/server/accounts/repository";
import { getCurrentPatch } from "@/server/repositories/champions";
import { getProficiencyLookup } from "@/server/proficiency/service";
import { loadHistoryBuckets } from "@/server/players/history";
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

export interface OverviewCard extends ChampionCard {
  role: Role;
  inPool: "primary" | "secondary" | null;
  tier: ProficiencyTier;
  tierLabel: string;
}

export interface PlayerOverviewData {
  playerId: string;
  mode: GameMode;
  window: PatchWindow;
  currentPatch: string | null;
  accounts: AccountOverview[];
  accountsSummary: ReturnType<typeof summariseAccounts>;
  /** Rank of the main linked account (first account with a rank otherwise). */
  rank: RankView | null;
  /** Ranked Solo/Duo and Flex records inside the selected patch window, every champion. */
  solo: GameRecord;
  flex: GameRecord;
  /** Solo/Duo + Flex games on the current patch. */
  currentPatchGames: number;
  lastSyncAt: Date | null;
  /** Configured pool champions in pool order, primary pool first. */
  cards: OverviewCard[];
  /** Champions with games in the window that are in no pool; filled only when requested. */
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
  mode: GameMode;
  window: PatchWindow;
  riotConfigured: boolean;
  /** Also list champions outside the pools that have games in the window. */
  includeOthers?: boolean;
  now?: Date;
}

/**
 * The Player Overview: quick reference (roles, rank, recent ranked records, current-patch games,
 * last sync) and one card per configured pool champion, all from stored history and the
 * proficiency estimate. No Riot request is made while rendering; nothing is modelled, so every
 * number is a count of games the sync already stored.
 */
export async function getPlayerOverview(db: Db, player: PlayerRecord, options: PlayerOverviewOptions): Promise<PlayerOverviewData> {
  const now = options.now ?? new Date();
  const [accounts, current, buckets, lookup] = await Promise.all([listAccountsForPlayer(db, player.id), getCurrentPatch(db), loadHistoryBuckets(db, [player.id]), getProficiencyLookup(db, [player.id])]);
  const history: HistoryBucket[] = buckets.get(player.id) ?? [];
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

  const card = (c: ChampionCard, role: Role, inPool: OverviewCard["inPool"]): OverviewCard => {
    const tier: ProficiencyTier = lookup(player.id, c.championId, role)?.tier ?? "unknown";
    return { ...c, role, inPool, tier, tierLabel: TIER_LABELS[tier] };
  };
  const seen = new Set<string>();
  const cards: OverviewCard[] = [];
  for (const role of legalRolesFor(player)) {
    const pool = poolFor(player, role).filter((id) => !seen.has(id));
    for (const id of pool) seen.add(id);
    for (const c of championCards(history, pool, { mode: options.mode, window: options.window })) cards.push(card(c, role, role === player.primaryRole ? "primary" : "secondary"));
  }
  const others = options.includeOthers ? championCards(history, otherChampionsPlayed(history, [...seen], { mode: options.mode, window: options.window }), { mode: options.mode, window: options.window }).map((c) => card(c, player.primaryRole, null)) : [];
  const lastSyncAt = accounts.map((a) => a.lastSyncAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    playerId: player.id,
    mode: options.mode,
    window: options.window,
    currentPatch: current?.patch ?? null,
    accounts: views,
    accountsSummary: summariseAccounts(views.map((v) => v.sync)),
    rank,
    solo: summarise(history, { queues: ["solo"], window: options.window }),
    flex: summarise(history, { queues: ["flex"], window: options.window }),
    currentPatchGames: summarise(history, { queues: ["solo", "flex"], window: 0 }).games,
    lastSyncAt,
    cards,
    others,
    othersRequested: !!options.includeOthers,
    hasHistory: history.length > 0,
  };
}
