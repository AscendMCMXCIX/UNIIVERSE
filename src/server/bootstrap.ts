import type { Db } from "@/server/db/types";
import { getDbHandle, type DbHandle } from "@/server/db/client";
import { getCurrentPatch } from "@/server/repositories/champions";
import { runJob } from "@/server/jobs";
import { seedDemoRoster, seedDemoStats } from "@/server/demo/seed";

declare global {
  var __uniiverseBootstrapped: Promise<void> | undefined;
}

/**
 * First-run bootstrap: make sure champions exist (sync from Data Dragon, or the offline fixture
 * when unreachable) and, in local/demo mode, seed the demo roster and demo statistics.
 * Runs once per process and never blocks subsequent requests.
 */
export async function ensureBootstrapped(): Promise<DbHandle> {
  const handle = await getDbHandle();
  if (!globalThis.__uniiverseBootstrapped) {
    globalThis.__uniiverseBootstrapped = bootstrap(handle).catch((err) => {
      console.error("[bootstrap] failed:", err);
      globalThis.__uniiverseBootstrapped = undefined;
    });
  }
  await globalThis.__uniiverseBootstrapped;
  return handle;
}

async function bootstrap(handle: DbHandle): Promise<void> {
  const db: Db = handle.db;
  const current = await getCurrentPatch(db);
  if (!current) {
    await runJob(db, "static-sync", "bootstrap");
  }
  const demoWanted = process.env.UNIIVERSE_SEED_DEMO === "true" || (process.env.UNIIVERSE_SEED_DEMO !== "false" && handle.mode !== "postgres");
  if (demoWanted) {
    await seedDemoRoster(db);
    await seedDemoStats(db);
  }
}

export async function getAppDb(): Promise<Db> {
  return (await ensureBootstrapped()).db;
}
