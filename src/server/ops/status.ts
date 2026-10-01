import type { Db } from "@/server/db/types";
import { getRefreshStatuses } from "./refresh-status";
import { getCurrentPatch } from "@/server/repositories/champions";
import { loadStatsProvider } from "@/server/stats/loader";
import type { ShellStatus } from "@/components/app-shell";
import { canEdit, type AuthState } from "@/server/auth/session";
import { getDbHandle } from "@/server/db/client";

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
  stats: { patch: string | null; sources: string[]; totalGames: number; isDemo: boolean };
}

const STALE_HOURS: Record<string, number> = {
  "version-check": 26,
  "ranked-ingest": 12,
  aggregate: 12,
  "pro-sync": 72,
};

/** Operational health used by Settings and the shell banner. */
export async function getDataHealth(db: Db): Promise<DataHealth> {
  const [patch, statuses, stats] = await Promise.all([getCurrentPatch(db), getRefreshStatuses(db), loadStatsProvider(db)]);
  const warnings: string[] = [];
  const now = Date.now();
  const riotConfigured = !!process.env.RIOT_API_KEY;
  for (const s of statuses) {
    if (s.status === "failed" && s.consecutiveFailures >= 3) warnings.push(`${s.key} has failed ${s.consecutiveFailures} times in a row`);
    const staleAfter = STALE_HOURS[s.key];
    if (staleAfter && s.lastSuccessAt && now - s.lastSuccessAt.getTime() > staleAfter * 3600_000) {
      if (s.key === "ranked-ingest" && !riotConfigured) continue;
      warnings.push(`${s.key} last succeeded ${Math.round((now - s.lastSuccessAt.getTime()) / 3600_000)}h ago`);
    }
  }
  if (patch?.isFixture) warnings.push("Champion data comes from the offline fixture; Data Dragon has not been reached yet");
  const description = stats.describe();
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
    stats: { patch: description.patch, sources: description.sources, totalGames: Math.round(description.totalGames), isDemo: description.isDemo },
  };
}

export async function getShellStatus(db: Db, auth: AuthState): Promise<ShellStatus> {
  const [health, handle] = await Promise.all([getDataHealth(db), getDbHandle()]);
  const session = auth.session;
  const job = (key: string) => health.jobs.find((j) => j.key === key);
  return {
    patch: health.patch?.id ?? null,
    isFixture: health.patch?.isFixture ?? false,
    isDemoStats: health.stats.isDemo,
    rankedUpdatedAt: job("ranked-ingest")?.lastSuccessAt ?? null,
    proUpdatedAt: job("pro-sync")?.lastSuccessAt ?? null,
    staticUpdatedAt: job("version-check")?.lastSuccessAt ?? job("static-sync")?.lastSuccessAt ?? null,
    warnings: health.warnings.filter((w) => !w.startsWith("Champion data comes from")),
    dbDescription: handle.description,
    sessionLabel: session?.label ?? "Not signed in",
    canEdit: canEdit(session),
    authMode: auth.mode,
    role: session?.role ?? null,
    playerId: session?.playerId ?? null,
  };
}
