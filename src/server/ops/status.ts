import type { Db } from "@/server/db/types";
import { getRefreshStatuses } from "./refresh-status";
import { getCurrentPatch } from "@/server/repositories/champions";
import { describeStatsCheap } from "@/server/stats/describe";
import { coverageWarnings, getGlobalCoverage, type GlobalCoverage } from "./coverage";
import { riotAccounts } from "@/server/db/schema";
import { sql } from "drizzle-orm";
import { getRiotCredentialStatus, type RiotCredentialStatus } from "@/server/riot/credential";
import type { PatchEvidence } from "@/domain/engine/types";

export interface DataHealth {
  patch: { id: string; ddragonVersion: string; isFixture: boolean } | null;
  jobs: Array<{
    key: string;
    status: string;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    lastError: string | null;
    lastDurationMs: number | null;
    consecutiveFailures: number;
    details: Record<string, unknown>;
  }>;
  warnings: string[];
  stats: { patch: string | null; sources: string[]; totalGames: number; isDemo: boolean; regions: string[]; tierPopulation: string | null; lastGameAt: Date | null; proGames: number; patches: PatchEvidence[]; tierBands: Record<string, number> };
  coverage: GlobalCoverage;
  /** Freshness per dataset, for labels. */
  datasets: Array<{ key: "champions" | "ranked" | "pro" | "accounts"; title: string; source: string; updatedAt: Date | null; detail: string }>;
  riotConfigured: boolean;
  /** Riot credential health (never the key itself) plus how many linked accounts wait for Riot. */
  riot: RiotCredentialStatus & { pendingAccounts: number };
}

const STALE_HOURS: Record<string, number> = {
  "version-check": 26,
  "ranked-ingest": 12,
  aggregate: 12,
  "pro-sync": 72,
};

/** Operational health used by Settings and the shell banner. */
export async function getDataHealth(db: Db): Promise<DataHealth> {
  const [patch, statuses, description] = await Promise.all([getCurrentPatch(db), getRefreshStatuses(db), describeStatsCheap(db)]);
  const warnings: string[] = [];
  const now = Date.now();
  const riotConfigured = !!process.env.RIOT_API_KEY;
  const coverage = await getGlobalCoverage(db, { platformSpec: process.env.RIOT_PLATFORMS, tierSpec: process.env.RIOT_TIERS, currentPatch: patch?.patch ?? null, riotConfigured });
  for (const s of statuses) {
    if (s.status === "failed" && s.consecutiveFailures >= 3) warnings.push(`${s.key} has failed ${s.consecutiveFailures} times in a row`);
    // A degraded run finished but got nothing useful from its provider (key rejected, query
    // refused…). It is the only place such a problem surfaces, so it must be visible here.
    // Runs that merely skipped because a provider is not configured stay quiet.
    if (s.status === "degraded" && s.lastError && !(s.details as Record<string, unknown> | null)?.skipped) warnings.push(`${s.key}: ${s.lastError}`);
    const staleAfter = STALE_HOURS[s.key];
    if (staleAfter && s.lastSuccessAt && now - s.lastSuccessAt.getTime() > staleAfter * 3600_000) {
      if (s.key === "ranked-ingest" && !riotConfigured) continue;
      warnings.push(`${s.key} last succeeded ${Math.round((now - s.lastSuccessAt.getTime()) / 3600_000)}h ago`);
    }
  }
  if (patch?.isFixture) warnings.push("Champion data comes from the offline fixture; Data Dragon has not been reached yet");
  // Coverage notices are prefixed so the shell banner can leave them to Settings → Data health.
  warnings.push(...coverageWarnings(coverage, riotConfigured).map((w) => `Coverage: ${w}`));
  const job = (key: string) => statuses.find((s) => s.key === key);
  const [[accountsAgg], credential] = await Promise.all([
    db.select({ last: sql<Date | null>`max(${riotAccounts.lastSyncAt})`, n: sql<number>`count(*)`, ok: sql<number>`count(*) filter (where ${riotAccounts.syncStatus} = 'ok')` }).from(riotAccounts).where(sql`${riotAccounts.label} <> 'demo'`),
    getRiotCredentialStatus(db),
  ]);
  if (credential.state === "rejected") warnings.push("Riot: the configured Riot API key is rejected; linked accounts and ranked collection are paused until it is replaced (Settings → Data health).");
  const datasets: DataHealth["datasets"] = [
    { key: "champions", title: "Champions & patch", source: "Riot Data Dragon", updatedAt: job("version-check")?.lastSuccessAt ?? job("static-sync")?.lastSuccessAt ?? null, detail: patch ? `Patch ${patch.patch}${patch.isFixture ? " (offline fixture)" : ""}` : "No patch synced" },
    { key: "ranked", title: "Ranked matches", source: `Riot match data · ${description.provenance?.tierPopulation ?? "MASTER+"} ladders · ${coverage.configured.length} region${coverage.configured.length === 1 ? "" : "s"} configured`, updatedAt: coverage.lastSyncAt ?? job("ranked-ingest")?.lastSuccessAt ?? null, detail: `${coverage.totalGames.toLocaleString()} matches stored · ${coverage.withCurrentData} of ${coverage.configured.length} configured regions have current-patch games` },
    { key: "pro", title: "Professional games", source: "Leaguepedia", updatedAt: job("pro-sync")?.lastSuccessAt ?? null, detail: `${description.provenance?.proGames ?? 0} games in the blended window` },
    { key: "accounts", title: "Linked Riot accounts", source: "Riot account, league, mastery and match data", updatedAt: accountsAgg?.last ? new Date(accountsAgg.last) : null, detail: `${Number(accountsAgg?.ok ?? 0)} of ${Number(accountsAgg?.n ?? 0)} accounts synced` },
  ];
  return {
    patch: patch ? { id: patch.patch, ddragonVersion: patch.ddragonVersion, isFixture: patch.isFixture } : null,
    jobs: statuses.map((s) => ({
      key: s.key,
      status: s.status,
      lastSuccessAt: s.lastSuccessAt,
      lastFailureAt: s.lastFailureAt,
      lastError: s.lastError,
      lastDurationMs: s.lastDurationMs,
      consecutiveFailures: s.consecutiveFailures,
      details: s.details,
    })),
    warnings,
    stats: { patch: description.patch, sources: description.sources, totalGames: Math.round(description.totalGames), isDemo: description.isDemo, regions: description.provenance?.regions ?? [], tierPopulation: description.provenance?.tierPopulation ?? null, lastGameAt: description.provenance?.lastGameAt ?? null, proGames: description.provenance?.proGames ?? 0, patches: description.provenance?.patches ?? [], tierBands: description.provenance?.tierBands ?? {} },
    coverage,
    datasets,
    riotConfigured,
    riot: { ...credential, pendingAccounts: Number(accountsAgg?.n ?? 0) - Number(accountsAgg?.ok ?? 0) },
  };
}
