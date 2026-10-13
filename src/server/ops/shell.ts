import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { dataRefreshStatus, patches, statPeriods } from "@/server/db/schema";
import type { ShellStatus } from "@/components/app-shell";
import { hasPermission, type AuthState } from "@/server/auth/session";
import { getBranding } from "@/server/repositories/branding";
import { getDbHandle } from "@/server/db/client";
import { FIXTURE_VERSION } from "@/server/riot/static/fixture";
import { cachedFor } from "@/server/observability/cache";
import { getViewMode } from "@/server/auth/view-mode";

interface ShellFacts {
  patch: { id: string; isFixture: boolean } | null;
  isDemoStats: boolean;
  rankedUpdatedAt: Date | null;
  proUpdatedAt: Date | null;
  staticUpdatedAt: Date | null;
  warnings: string[];
}

/**
 * The few facts every page's shell needs (patch, data freshness, demo flag, failing jobs),
 * read from three tiny tables and cached per process for 30 s. Deliberately never loads
 * statistics, coverage or anything else: the app layout runs on every request.
 */
async function loadShellFacts(db: Db): Promise<ShellFacts> {
  const [patchRows, statuses, demo, real] = await Promise.all([
    db.select({ id: patches.id, ddragonVersion: patches.ddragonVersion }).from(patches).where(eq(patches.isCurrent, true)).limit(1),
    db.select({ key: dataRefreshStatus.key, status: dataRefreshStatus.status, lastSuccessAt: dataRefreshStatus.lastSuccessAt, lastError: dataRefreshStatus.lastError, consecutiveFailures: dataRefreshStatus.consecutiveFailures, details: dataRefreshStatus.details }).from(dataRefreshStatus),
    db.select({ n: sql<number>`count(*)` }).from(statPeriods).where(and(eq(statPeriods.source, "demo"), gt(statPeriods.games, 0))),
    db.select({ n: sql<number>`count(*)` }).from(statPeriods).where(and(sql`${statPeriods.source} <> 'demo'`, gt(statPeriods.games, 0))),
  ]);
  const patch = patchRows[0] ? { id: patchRows[0].id, isFixture: patchRows[0].ddragonVersion === FIXTURE_VERSION } : null;
  const job = (key: string) => statuses.find((s) => s.key === key);
  const warnings: string[] = [];
  const riotConfigured = !!process.env.RIOT_API_KEY;
  const now = Date.now();
  for (const s of statuses) {
    if (s.status === "failed" && s.consecutiveFailures >= 3) warnings.push(`${s.key} has failed ${s.consecutiveFailures} times in a row`);
    if (s.status === "degraded" && s.lastError && !(s.details as Record<string, unknown> | null)?.skipped && s.key !== "auth-audit" && s.key !== "perf-probe") warnings.push(`${s.key}: ${s.lastError}`);
    const stale = s.key === "ranked-ingest" ? 12 : s.key === "version-check" ? 26 : s.key === "aggregate" ? 12 : s.key === "pro-sync" ? 72 : 0;
    if (stale && s.lastSuccessAt && now - s.lastSuccessAt.getTime() > stale * 3600_000) {
      if (s.key === "ranked-ingest" && !riotConfigured) continue;
      warnings.push(`${s.key} last succeeded ${Math.round((now - s.lastSuccessAt.getTime()) / 3600_000)}h ago`);
    }
  }
  return {
    patch,
    isDemoStats: Number(real[0]?.n ?? 0) === 0 && Number(demo[0]?.n ?? 0) > 0,
    rankedUpdatedAt: job("ranked-ingest")?.lastSuccessAt ?? null,
    proUpdatedAt: job("pro-sync")?.lastSuccessAt ?? null,
    staticUpdatedAt: job("version-check")?.lastSuccessAt ?? job("static-sync")?.lastSuccessAt ?? null,
    warnings,
  };
}

export async function getShellStatus(db: Db, auth: AuthState): Promise<ShellStatus> {
  const [facts, handle, branding] = await Promise.all([cachedFor("shell-facts", 30_000, () => loadShellFacts(db), db), getDbHandle(), getBranding(db)]);
  const session = auth.session;
  const viewMode = await getViewMode(session);
  return {
    isAdmin: session?.role === "owner",
    adminMode: viewMode === "admin",
    patch: facts.patch?.id ?? null,
    isFixture: facts.patch?.isFixture ?? false,
    isDemoStats: facts.isDemoStats,
    rankedUpdatedAt: facts.rankedUpdatedAt,
    proUpdatedAt: facts.proUpdatedAt,
    staticUpdatedAt: facts.staticUpdatedAt,
    warnings: facts.warnings,
    dbDescription: handle.description,
    sessionLabel: session?.label ?? "Not signed in",
    canEdit: hasPermission(session, "create-draft"),
    authMode: auth.mode,
    role: session?.role ?? null,
    playerId: session?.playerId ?? null,
    needsProfile: auth.mode === "accounts" && !!session?.userId && !session.playerId,
    needsPassword: auth.mode === "accounts" && !!session?.userId && !session.hasPassword,
    needsSetup: auth.mode === "accounts" && !!session?.userId && !session.setupComplete,
    branding,
  };
}
