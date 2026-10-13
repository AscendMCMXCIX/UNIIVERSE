import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountChampionHistory, accountMastery, accountMatches, riotAccounts } from "@/server/db/schema";
import { describeAccountSync, summariseAccounts, type AccountSyncView } from "@/domain/account-status";
import { confidenceWord, TIER_LABELS, type ProficiencyEstimate, type ProficiencyTier } from "@/domain/proficiency";
import { legalRolesFor, poolFor } from "@/domain/roster";
import type { PlayerProfile } from "@/domain/roster";
import type { Role } from "@/domain/roles";
import { platformLabel } from "@/domain/riot-platforms";
import { listAccountsForPlayer, type RiotAccountRecord } from "@/server/accounts/repository";
import { getCurrentPatch } from "@/server/repositories/champions";
import { getProficiencyLookup } from "./service";

export interface AccountDataView {
  id: string;
  riotId: string;
  platform: string;
  platformLabel: string;
  platformSource: "user" | "riot";
  label: string;
  rank: string | null;
  sync: AccountSyncView;
  /** Admin diagnostics only. */
  matchesFolded: number;
  historyRows: number;
  masteryRows: number;
  resolveAttempts: number;
  resolvedAt: Date | null;
  rawStatus: string;
  rawError: string | null;
}

export interface ChampionProficiencyRow {
  championId: string;
  /** Role the estimate is for (the player's role for this champion in their pools, else their main role). */
  role: Role;
  inPool: "primary" | "secondary" | null;
  tier: ProficiencyTier;
  tierLabel: string;
  score: number;
  confidence: number;
  confidenceWord: ReturnType<typeof confidenceWord>;
  games: number;
  recentGames: number;
  patchGames: number;
  roleShare: number;
  lastPlayedAt: Date | null;
  mastery: { points: number; level: number } | null;
  notes: string[];
}

export interface PlayerDataReport {
  playerId: string;
  accounts: AccountDataView[];
  summary: ReturnType<typeof summariseAccounts>;
  /** Games folded into champion history across all accounts (deduplicated by match id per account; accounts are distinct PUUIDs). */
  gamesAnalysed: number;
  currentPatch: string | null;
  currentPatchGames: number;
  championsWithData: number;
  lastSyncAt: Date | null;
  champions: ChampionProficiencyRow[];
  hasData: boolean;
}

function rankText(a: RiotAccountRecord): string | null {
  if (!a.tier) return null;
  const lp = a.leaguePoints ?? 0;
  const wl = a.rankedWins !== null && a.rankedLosses !== null ? ` · ${a.rankedWins}W ${a.rankedLosses}L` : "";
  return `${a.tier}${a.division ? ` ${a.division}` : ""} ${lp} LP${wl}`;
}

/**
 * Everything a player (or an admin) should see about the Riot data behind their proficiency:
 * per-account status with "last updated", how many games were analysed, how many on the current
 * patch, and a per-champion table. Never exposes PUUIDs.
 */
export async function getPlayerDataReport(db: Db, player: PlayerProfile, options: { riotConfigured: boolean; now?: Date; limit?: number }): Promise<PlayerDataReport> {
  const now = options.now ?? new Date();
  const [accounts, current] = await Promise.all([listAccountsForPlayer(db, player.id), getCurrentPatch(db)]);
  const ids = accounts.map((a) => a.id);
  const [folded, historyRows, masteryRows, patchRows] = ids.length
    ? await Promise.all([
        db.select({ accountId: accountMatches.accountId, n: sql<number>`count(*)` }).from(accountMatches).where(inArray(accountMatches.accountId, ids)).groupBy(accountMatches.accountId),
        db.select({ accountId: accountChampionHistory.accountId, rows: sql<number>`count(*)`, games: sql<number>`coalesce(sum(${accountChampionHistory.games}), 0)` }).from(accountChampionHistory).where(inArray(accountChampionHistory.accountId, ids)).groupBy(accountChampionHistory.accountId),
        db.select({ accountId: accountMastery.accountId, n: sql<number>`count(*)` }).from(accountMastery).where(inArray(accountMastery.accountId, ids)).groupBy(accountMastery.accountId),
        current ? db.select({ games: sql<number>`coalesce(sum(${accountChampionHistory.games}), 0)` }).from(accountChampionHistory).where(and(inArray(accountChampionHistory.accountId, ids), eq(accountChampionHistory.patch, current.patch))) : Promise.resolve([{ games: 0 }]),
      ])
    : [[], [], [], [{ games: 0 }]];
  const foldedBy = new Map(folded.map((f) => [f.accountId, Number(f.n)]));
  const historyBy = new Map(historyRows.map((h) => [h.accountId, { rows: Number(h.rows), games: Number(h.games) }]));
  const masteryBy = new Map(masteryRows.map((m) => [m.accountId, Number(m.n)]));
  const views: AccountDataView[] = accounts.map((a) => ({
    id: a.id,
    riotId: a.riotId,
    platform: a.platform,
    platformLabel: platformLabel(a.platform),
    platformSource: a.platformSource,
    label: a.label,
    rank: rankText(a),
    sync: describeAccountSync({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, resolveAttempts: a.resolveAttempts, riotConfigured: options.riotConfigured }, now),
    matchesFolded: foldedBy.get(a.id) ?? 0,
    historyRows: historyBy.get(a.id)?.rows ?? 0,
    masteryRows: masteryBy.get(a.id) ?? 0,
    resolveAttempts: a.resolveAttempts,
    resolvedAt: a.puuidResolvedAt,
    rawStatus: a.syncStatus,
    rawError: a.syncError,
  }));
  const gamesAnalysed = [...historyBy.values()].reduce((s, h) => s + h.games, 0);

  // Per-champion estimates: pool champions first, then the most played others.
  const lookup = await getProficiencyLookup(db, [player.id]);
  const rows = new Map<string, ChampionProficiencyRow>();
  const add = (championId: string, role: Role, inPool: ChampionProficiencyRow["inPool"]) => {
    if (rows.has(championId)) return;
    const est: ProficiencyEstimate | null = lookup(player.id, championId, role);
    if (!est) return;
    rows.set(championId, {
      championId,
      role,
      inPool,
      tier: est.tier,
      tierLabel: TIER_LABELS[est.tier],
      score: est.score,
      confidence: est.confidence,
      confidenceWord: confidenceWord(est.confidence),
      games: est.games,
      recentGames: est.recentGames,
      patchGames: est.patchGames,
      roleShare: est.roleShare,
      lastPlayedAt: est.lastPlayedAt,
      mastery: est.mastery,
      notes: est.notes,
    });
  };
  for (const role of legalRolesFor(player)) for (const c of poolFor(player, role)) add(c, role, role === player.primaryRole ? "primary" : "secondary");
  if (ids.length) {
    const played = await db
      .select({ championId: accountChampionHistory.championId, games: sql<number>`sum(${accountChampionHistory.games})` })
      .from(accountChampionHistory)
      .where(inArray(accountChampionHistory.accountId, ids))
      .groupBy(accountChampionHistory.championId)
      .orderBy(sql`sum(${accountChampionHistory.games}) desc`)
      .limit(options.limit ?? 40);
    for (const p of played) add(p.championId, player.primaryRole, null);
    const mastered = await db.select({ championId: accountMastery.championId, points: sql<number>`max(${accountMastery.points})` }).from(accountMastery).where(inArray(accountMastery.accountId, ids)).groupBy(accountMastery.championId).orderBy(sql`max(${accountMastery.points}) desc`).limit(15);
    for (const m of mastered) add(m.championId, player.primaryRole, null);
  }
  const champions = [...rows.values()].sort((a, b) => (a.inPool ? 0 : 1) - (b.inPool ? 0 : 1) || b.games - a.games || (b.mastery?.points ?? 0) - (a.mastery?.points ?? 0));
  const lastSyncAt = accounts.map((a) => a.lastSyncAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    playerId: player.id,
    accounts: views,
    summary: summariseAccounts(views.map((v) => v.sync)),
    gamesAnalysed,
    currentPatch: current?.patch ?? null,
    currentPatchGames: Number(patchRows[0]?.games ?? 0),
    championsWithData: champions.filter((c) => c.tier !== "unknown").length,
    lastSyncAt,
    champions,
    hasData: lookup.hasData(player.id),
  };
}

/** Player ids whose linked accounts have at least one synced account; for Team-page badges. */
export async function accountStatesForPlayers(db: Db, playerIds: string[], riotConfigured: boolean, now = new Date()): Promise<Record<string, ReturnType<typeof summariseAccounts>>> {
  if (playerIds.length === 0) return {};
  const rows = await db.select().from(riotAccounts).where(inArray(riotAccounts.playerId, playerIds));
  const by = new Map<string, AccountSyncView[]>();
  for (const r of rows) {
    if (!r.playerId) continue;
    by.set(r.playerId, [...(by.get(r.playerId) ?? []), describeAccountSync({ syncStatus: r.syncStatus, syncError: r.syncError, lastSyncAt: r.lastSyncAt, puuid: r.puuid, resolveAttempts: r.resolveAttempts, riotConfigured }, now)]);
  }
  const out: Record<string, ReturnType<typeof summariseAccounts>> = {};
  for (const id of playerIds) out[id] = summariseAccounts(by.get(id) ?? []);
  return out;
}
