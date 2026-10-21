import type { Db } from "@/server/db/types";
import { getRefreshStatuses } from "./refresh-status";
import { getCurrentPatch } from "@/server/repositories/champions";
import { riotAccounts } from "@/server/db/schema";
import { sql } from "drizzle-orm";
import { getRiotCredentialStatus, type RiotCredentialStatus } from "@/server/riot/credential";
import { describeAccountSync } from "@/domain/account-status";
import { answerHealthQuestions, type HealthAnswer } from "@/domain/data-health";

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
  }>;
  warnings: string[];
  /** Freshness per dataset, for labels. */
  datasets: Array<{ key: "champions" | "accounts"; title: string; source: string; updatedAt: Date | null; detail: string }>;
  riotConfigured: boolean;
  /** Riot credential health (never the key itself) plus how many linked accounts wait for Riot. */
  riot: RiotCredentialStatus & { pendingAccounts: number };
  /** The plain-language answers at the top of Admin Mode → Data & Integrations. */
  answers: HealthAnswer[];
}

const STALE_HOURS: Record<string, number> = {
  "version-check": 26,
};

/** Operational health used by Settings and the shell banner. */
export async function getDataHealth(db: Db): Promise<DataHealth> {
  const [patch, statuses] = await Promise.all([getCurrentPatch(db), getRefreshStatuses(db)]);
  const warnings: string[] = [];
  const now = Date.now();
  const riotConfigured = !!process.env.RIOT_API_KEY;
  for (const s of statuses) {
    if (s.status === "failed" && s.consecutiveFailures >= 3) warnings.push(`${s.key} has failed ${s.consecutiveFailures} times in a row`);
    // A degraded run finished but got nothing useful from its provider (key rejected, query
    // refused…). It is the only place such a problem surfaces, so it must be visible here.
    // Runs that merely skipped because a provider is not configured stay quiet.
    if (s.status === "degraded" && s.lastError && !s.skipped) warnings.push(`${s.key}: ${s.lastError}`);
    const staleAfter = STALE_HOURS[s.key];
    if (staleAfter && s.lastSuccessAt && now - s.lastSuccessAt.getTime() > staleAfter * 3600_000) {
      warnings.push(`${s.key} last succeeded ${Math.round((now - s.lastSuccessAt.getTime()) / 3600_000)}h ago`);
    }
  }
  if (patch?.isFixture) warnings.push("Champion data comes from the offline fixture; Data Dragon has not been reached yet");
  const job = (key: string) => statuses.find((s) => s.key === key);
  const [[accountsAgg], credential] = await Promise.all([
    db.select({ last: sql<Date | null>`max(${riotAccounts.lastSyncAt})`, n: sql<number>`count(*)`, ok: sql<number>`count(*) filter (where ${riotAccounts.syncStatus} = 'ok')` }).from(riotAccounts).where(sql`${riotAccounts.label} <> 'demo'`),
    getRiotCredentialStatus(db),
  ]);
  // One more small read for the plain-language answers: every linked player account's state.
  const accountRows = await db
    .select({ syncStatus: riotAccounts.syncStatus, syncError: riotAccounts.syncError, lastSyncAt: riotAccounts.lastSyncAt, puuid: riotAccounts.puuid, history: riotAccounts.historyBackfill })
    .from(riotAccounts)
    .where(sql`${riotAccounts.ownerType} = 'player' and ${riotAccounts.label} <> 'demo'`);
  const states = accountRows.map((r) => describeAccountSync({ ...r, riotConfigured }, new Date(now)).state);
  const count = (s: string) => states.filter((x) => x === s).length;
  const answers = answerHealthQuestions({
    now: new Date(now),
    riot: { configured: riotConfigured, state: credential.state, lastOkAt: credential.lastOkAt, lastError: credential.lastError },
    accounts: { total: states.length, synced: count("synced"), syncing: count("syncing"), pending: count("pending") + count("verified"), delayed: count("stale"), failed: count("error") },
    failingJobs: statuses.filter((s) => s.status === "failed" && s.consecutiveFailures >= 3).map((s) => s.key),
  });
  if (credential.state === "rejected") warnings.push("Riot: the configured Riot API key is rejected; linked accounts are paused until it is replaced (Settings → Data health).");
  const datasets: DataHealth["datasets"] = [
    { key: "champions", title: "Champions & patch", source: "Riot Data Dragon", updatedAt: job("version-check")?.lastSuccessAt ?? job("static-sync")?.lastSuccessAt ?? null, detail: patch ? `Patch ${patch.patch}${patch.isFixture ? " (offline fixture)" : ""}` : "No patch synced" },
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
    })),
    warnings,
    datasets,
    riotConfigured,
    riot: { ...credential, pendingAccounts: Number(accountsAgg?.n ?? 0) - Number(accountsAgg?.ok ?? 0) },
    answers,
  };
}
