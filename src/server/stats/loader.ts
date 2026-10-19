import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";
import { invalidateCache } from "@/server/observability/cache";

/** Bumped by the aggregation job (and static syncs, change-point edits) whenever statistics change, so caches keyed on it are rebuilt. */
export async function getStatsVersion(db: Db): Promise<string> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "stats_version"));
  return typeof row?.value === "string" ? row.value : "0";
}

export async function bumpStatsVersion(db: Db): Promise<void> {
  const value = new Date().toISOString();
  await db.insert(appSettings).values({ key: "stats_version", value, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

/** Drops the caches built from the aggregate statistics (their descriptions and the pro patterns). */
export function invalidateStatsCache() {
  invalidateCache("stats-description");
  invalidateCache("pro-patterns");
  invalidateCache("shell-facts");
}
