import type { Db } from "@/server/db/types";
import { getAuthState } from "@/server/auth/session";
import { getDbHandle } from "@/server/db/client";
import { getDataHealth, type DataHealth } from "@/server/ops/status";
import { failuresInARow } from "@/server/ops/refresh-status";
import { deploymentInfo } from "@/server/ops/deployment";
import { systemStatus } from "@/domain/system-health";
import { sql } from "drizzle-orm";

/**
 * The five plain statuses of System Health (website, database, Riot API, player syncing,
 * background jobs), for that page and the Admin dashboard alike. A test query times the database.
 */
export async function loadSystemStatus(db: Db): Promise<{ items: ReturnType<typeof systemStatus>; health: DataHealth }> {
  const started = performance.now();
  const pingMs = await db
    .execute(sql`select 1`)
    .then(() => Math.round((performance.now() - started) * 10) / 10)
    .catch(() => null);
  const [auth, health, handle] = await Promise.all([getAuthState(db), getDataHealth(db), getDbHandle()]);
  const deployment = deploymentInfo();
  const times = health.jobs.flatMap((j) => [j.lastSuccessAt, j.lastFailureAt]).filter((d): d is Date => d instanceof Date);
  const items = systemStatus({
    now: new Date(),
    website: { commit: deployment.commit, region: deployment.region, authMode: auth.mode },
    database: { mode: handle.mode, pingMs },
    answers: health.answers,
    jobs: { lastRunAt: times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null, failing: health.jobs.filter((j) => failuresInARow(j) >= 3).map((j) => j.key), everRan: times.length > 0 },
  });
  return { items, health };
}
