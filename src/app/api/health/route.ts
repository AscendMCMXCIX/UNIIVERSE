import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDbHandle } from "@/server/db/client";
import { deploymentInfo } from "@/server/ops/deployment";
import { requiresAccounts, missingProductionSetup } from "@/server/auth/mode";
import { patches, dataRefreshStatus } from "@/server/db/schema";
import { eq } from "drizzle-orm";

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
    const jobs = await handle.db.select({ key: dataRefreshStatus.key, status: dataRefreshStatus.status, lastSuccessAt: dataRefreshStatus.lastSuccessAt, lastError: dataRefreshStatus.lastError }).from(dataRefreshStatus);
    const failing = jobs.filter((j) => j.status === "failed").map((j) => j.key);
    return NextResponse.json({
      ...base,
      db: { ok: true, mode: handle.mode, ms: dbMs },
      patch: patch?.id ?? null,
      data: { ranked: jobs.find((j) => j.key === "ranked-ingest")?.lastSuccessAt ?? null, pro: jobs.find((j) => j.key === "pro-sync")?.lastSuccessAt ?? null, champions: jobs.find((j) => j.key === "version-check")?.lastSuccessAt ?? jobs.find((j) => j.key === "static-sync")?.lastSuccessAt ?? null, accounts: jobs.find((j) => j.key === "account-sync")?.lastSuccessAt ?? null },
      jobs: jobs.map((j) => ({ key: j.key, status: j.status, lastSuccessAt: j.lastSuccessAt })),
      failingJobs: failing,
      ms: Math.round((performance.now() - started) * 10) / 10,
    });
  } catch (err) {
    return NextResponse.json({ ...base, ok: false, db: { ok: false, error: (err as Error).message.replace(/postgres(ql)?:\/\/\S+/gi, "[redacted]") }, ms: Math.round((performance.now() - started) * 10) / 10 }, { status: 503 });
  }
}
