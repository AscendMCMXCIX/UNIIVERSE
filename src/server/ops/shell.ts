import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { dataRefreshStatus, patches } from "@/server/db/schema";
import { RETIRED_JOB_KEYS, STATUS_COLUMNS } from "@/server/ops/refresh-status";
import type { ShellStatus } from "@/components/app-shell";
import { type AuthState } from "@/server/auth/session";
import { canUseAdminArea, describeAccess } from "@/server/auth/permissions";
import { ADMIN_LINKS, NAV_LINKS, canOpen, type NavLink } from "@/lib/nav";
import { clashScoutEnabled } from "@/server/clash/access";
import { avatarUrl } from "@/server/repositories/users";
import { getBranding } from "@/server/repositories/branding";
import { getDbHandle } from "@/server/db/client";
import { FIXTURE_VERSION } from "@/server/riot/static/fixture";
import { cachedFor } from "@/server/observability/cache";
import { listOtherAccounts } from "@/server/auth/browser-accounts";
import { identityMarker, MAX_REMEMBERED } from "@/server/auth/account-jar";

/** Clash Scout's tab is offered only while Clash Scout is switched on. */
const shown = (l: NavLink) => l.href !== "/clash" || clashScoutEnabled();

interface ShellFacts {
  patch: { id: string; isFixture: boolean } | null;
  staticUpdatedAt: Date | null;
  warnings: string[];
}

/**
 * The few facts every page's shell needs (patch, data freshness, failing jobs), read from two
 * tiny tables and cached per process for 30 s. Deliberately never loads
 * statistics, coverage or anything else: the app layout runs on every request.
 */
async function loadShellFacts(db: Db): Promise<ShellFacts> {
  const [patchRows, statuses] = await Promise.all([
    db.select({ id: patches.id, ddragonVersion: patches.ddragonVersion }).from(patches).where(eq(patches.isCurrent, true)).limit(1),
    db.select({ key: dataRefreshStatus.key, status: dataRefreshStatus.status, lastSuccessAt: dataRefreshStatus.lastSuccessAt, lastError: dataRefreshStatus.lastError, consecutiveFailures: dataRefreshStatus.consecutiveFailures, skipped: STATUS_COLUMNS.skipped }).from(dataRefreshStatus),
  ]);
  const patch = patchRows[0] ? { id: patchRows[0].id, isFixture: patchRows[0].ddragonVersion === FIXTURE_VERSION } : null;
  const job = (key: string) => statuses.find((s) => s.key === key);
  const warnings: string[] = [];
  const now = Date.now();
  for (const s of statuses) {
    if (RETIRED_JOB_KEYS.has(s.key)) continue;
    if (s.status === "failed" && s.consecutiveFailures >= 3) warnings.push(`${s.key} has failed ${s.consecutiveFailures} times in a row`);
    if (s.status === "degraded" && s.lastError && !s.skipped && s.key !== "auth-audit" && s.key !== "access-audit" && s.key !== "perf-probe" && s.key !== "data-audit" && s.key !== "db-usage" && s.key !== "skin-audit" && s.key !== "proficiency-audit") warnings.push(`${s.key}: ${s.lastError}`);
    const stale = s.key === "version-check" ? 26 : 0;
    if (stale && s.lastSuccessAt && now - s.lastSuccessAt.getTime() > stale * 3600_000) {
      warnings.push(`${s.key} last succeeded ${Math.round((now - s.lastSuccessAt.getTime()) / 3600_000)}h ago`);
    }
  }
  return {
    patch,
    staticUpdatedAt: job("version-check")?.lastSuccessAt ?? job("static-sync")?.lastSuccessAt ?? null,
    warnings,
  };
}

/** The shell of a page in Player Mode or Admin Mode (the layout of each mode says which). */
export async function getShellStatus(db: Db, auth: AuthState, mode: "player" | "admin"): Promise<ShellStatus> {
  const [facts, handle, branding] = await Promise.all([cachedFor("shell-facts", 30_000, () => loadShellFacts(db), db), getDbHandle(), getBranding(db)]);
  const session = auth.session;
  const otherAccounts = session ? await listOtherAccounts(db, session.userId) : [];
  return {
    isAdmin: canUseAdminArea(session),
    allowedPlayerLinks: NAV_LINKS.filter((l) => shown(l) && canOpen(session, l)).map((l) => l.href),
    allowedAdminLinks: ADMIN_LINKS.filter((l) => shown(l) && canOpen(session, l)).map((l) => l.href),
    otherAccounts,
    canAddAccount: !!session?.userId && (auth.mode === "accounts" || auth.mode === "open") && otherAccounts.length < MAX_REMEMBERED,
    identity: session?.userId ? identityMarker(session.userId) : null,
    user: session ? { name: (session.localDev ? session.username : session.label) || session.username || session.label, username: session.username ?? null, avatarUrl: session.userId ? avatarUrl(session.userId, session.avatarVersion ?? null) : null, roleLabel: describeAccess({ role: session.role, isAdmin: session.admin }) } : null,
    adminMode: mode === "admin" && canUseAdminArea(session),
    patch: facts.patch?.id ?? null,
    isFixture: facts.patch?.isFixture ?? false,
    staticUpdatedAt: facts.staticUpdatedAt,
    warnings: facts.warnings,
    dbDescription: handle.description,
    sessionLabel: session?.label ?? "Not signed in",
    authMode: auth.mode,
    role: session?.role ?? null,
    playerId: session?.playerId ?? null,
    // Admin accounts may be admin-only (no player profile); only a player without one is nudged.
    needsProfile: auth.mode === "accounts" && !!session?.userId && session.role !== "owner" && !session.playerId,
    needsPassword: auth.mode === "accounts" && !!session?.userId && !session.hasPassword,
    needsSetup: auth.mode === "accounts" && !!session?.userId && !session.setupComplete,
    branding,
  };
}
