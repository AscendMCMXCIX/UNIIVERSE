import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDbHandle } from "@/server/db/client";
import { deploymentInfo } from "@/server/ops/deployment";
import { requiresAccounts, missingProductionSetup } from "@/server/auth/mode";
import { patches, dataRefreshStatus, riotAccounts } from "@/server/db/schema";
import { RETIRED_JOB_KEYS, failuresInARow } from "@/server/ops/refresh-status";
import { getRiotCredentialStatus } from "@/server/riot/credential";
import { log } from "@/server/observability/log";

export const dynamic = "force-dynamic";

/** What a failed database check tells the public; the driver's own message is logged instead. */
const PUBLIC_DB_ERROR = "The database did not answer (details in the server log).";

/**
 * Cheap health check for uptime monitors: the app answers, the database answers (and how fast),
 * which auth mode is active, which patch and build are live, when each pipeline last succeeded,
 * what is failing and whether Riot accepts the configured key. Reads only the tiny status tables
 * (the key's state is the outcome the jobs recorded, cached for 30 s); never touches statistics or
 * external providers, so it stays fast and never reports a provider outage as an app outage. No
 * secrets (of the key, only the state word), no personal data.
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
    const jobs = (await handle.db.select({ key: dataRefreshStatus.key, status: dataRefreshStatus.status, lastStartedAt: dataRefreshStatus.lastStartedAt, lastSuccessAt: dataRefreshStatus.lastSuccessAt, consecutiveFailures: dataRefreshStatus.consecutiveFailures }).from(dataRefreshStatus)).filter((j) => !RETIRED_JOB_KEYS.has(j.key));
    // Failing: the job's last run failed or died before it finished, and no run has succeeded
    // since (also while it is being run again, which is when a scheduled check reads this).
    const now = Date.now();
    const failing = jobs.filter((j) => failuresInARow(j, now) > 0).map((j) => j.key);
    // While Riot rejects the key (expired or revoked), every linked account waits, backing off
    // for hours, and the account sync finds nothing due and reports success. So the key itself
    // is listed as failing, which fails the scheduled Data jobs run (the owner's email).
    const credential = await getRiotCredentialStatus(handle.db);
    if (credential.state === "rejected") failing.push("riot-key");
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
      riot: { credential: credential.state },
      ms: Math.round((performance.now() - started) * 10) / 10,
    });
  } catch (err) {
    // The driver's message can name the database host, its region and the database user (for
    // example "password authentication failed for user …" or "getaddrinfo ENOTFOUND …"). This
    // endpoint is public and its answer is printed in the public Actions logs, so the detail goes
    // to the server log only (redacted there too) and visitors get a fixed message.
    log("error", "health.db_failed", { error: err });
    return NextResponse.json({ ...base, ok: false, db: { ok: false, error: PUBLIC_DB_ERROR }, ms: Math.round((performance.now() - started) * 10) / 10 }, { status: 503 });
  }
}
