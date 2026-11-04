import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDbHandle } from "@/server/db/client";
import { deploymentInfo } from "@/server/ops/deployment";
import { requiresAccounts, missingProductionSetup } from "@/server/auth/mode";
import { patches, dataRefreshStatus, riotAccounts } from "@/server/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { RETIRED_JOB_KEYS } from "@/server/ops/refresh-status";

export const dynamic = "force-dynamic";

/**
 * Cheap health check for uptime monitors: the app answers, the database answers (and how fast),
 * which auth mode is active, which patch and build are live, and when each pipeline last
 * succeeded. Reads only the tiny status tables; never touches statistics or external providers,
 * so it stays fast and never reports a provider outage as an app outage. No secrets, no
 * personal data.
 */
export async function GET() {
  const started = performance.now();
  const missing = missingProductionSetup();
  const base = { ok: true, deployment: deploymentInfo(), auth: { mode: missing.length ? "locked" : requiresAccounts() ? "accounts" : "open", missing }, now: new Date().toISOString() };
  try {
    const handle = await getDbHandle();
    const t = performance.now();
    await handle.db.execute(sql`select 1`);
    const dbMs = Math.round((performance.now() - t) * 10) / 10;
    const [patch] = await handle.db.select({ id: patches.id, ddragonVersion: patches.ddragonVersion }).from(patches).where(eq(patches.isCurrent, true)).limit(1);
    const jobs = (await handle.db.select({ key: dataRefreshStatus.key, status: dataRefreshStatus.status, lastSuccessAt: dataRefreshStatus.lastSuccessAt, lastError: dataRefreshStatus.lastError }).from(dataRefreshStatus)).filter((j) => !RETIRED_JOB_KEYS.has(j.key));
    const failing = jobs.filter((j) => j.status === "failed").map((j) => j.key);
    // When a linked account was last read from Riot in full (sync_cursor is written on success
    // only), from the accounts themselves: the account-sync job records a run as a success when
    // it had nothing to do, no key, or every account failed, so its time says nothing about data.
    const [read] = await handle.db
      .select({ cursor: sql<number | null>`max(${riotAccounts.syncCursor})` })
      .from(riotAccounts)
      .where(and(eq(riotAccounts.ownerType, "player"), ne(riotAccounts.label, "demo"), ne(riotAccounts.syncStatus, "demo")));
    const accountsReadAt = read?.cursor ? new Date(Number(read.cursor) * 1000) : null;
    return NextResponse.json({
      ...base,
      db: { ok: true, mode: handle.mode, ms: dbMs },
      patch: patch?.id ?? null,
      data: { champions: jobs.find((j) => j.key === "version-check")?.lastSuccessAt ?? jobs.find((j) => j.key === "static-sync")?.lastSuccessAt ?? null, accounts: accountsReadAt },
      jobs: jobs.map((j) => ({ key: j.key, status: j.status, lastSuccessAt: j.lastSuccessAt })),
      failingJobs: failing,
      ms: Math.round((performance.now() - started) * 10) / 10,
    });
  } catch (err) {
    return NextResponse.json({ ...base, ok: false, db: { ok: false, error: (err as Error).message.replace(/postgres(ql)?:\/\/\S+/gi, "[redacted]") }, ms: Math.round((performance.now() - started) * 10) / 10 }, { status: 503 });
  }
}
