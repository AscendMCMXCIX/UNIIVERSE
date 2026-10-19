"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission } from "@/server/auth/session";
import { runJob, setScheduleOverrides } from "@/server/jobs";
import type { JobKey } from "@/server/ops/refresh-status";
import { deleteChangePoint, setChangePointConfirmed } from "@/server/repositories/champions";
import { clearDemoStats, seedDemoRoster, seedDemoStats } from "@/server/demo/seed";
import { bumpStatsVersion, invalidateStatsCache } from "@/server/stats/loader";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

function touch() {
  revalidatePath("/settings");
  revalidatePath("/trends");
  revalidatePath("/team");
}

export async function runJobAction(key: string): Promise<Result<{ ok: boolean; error?: string; summary?: Record<string, unknown>; durationMs: number }>> {
  try {
    await requirePermission("manage-data");
    const db = await getAppDb();
    const result = await runJob(db, key as JobKey, "settings", { budgetMs: 50_000 });
    invalidateStatsCache();
    touch();
    return { ok: true, data: { ok: result.ok, error: result.error, summary: result.summary, durationMs: result.durationMs } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function saveScheduleAction(intervals: Record<string, number>): Promise<Result> {
  try {
    await requirePermission("manage-data");
    const db = await getAppDb();
    const clean: Partial<Record<JobKey, number>> = {};
    for (const [k, v] of Object.entries(intervals)) clean[k as JobKey] = Math.max(0, Math.round(Number(v) || 0));
    await setScheduleOverrides(db, { intervals: clean });
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function setChangePointAction(id: number, action: "confirm" | "dismiss" | "delete", discount?: number): Promise<Result> {
  try {
    await requirePermission("manage-data");
    const db = await getAppDb();
    if (action === "delete") await deleteChangePoint(db, id);
    else await setChangePointConfirmed(db, id, action === "confirm", discount);
    // Every server instance rebuilds what it caches from the statistics (Meta & Trends alerts).
    await bumpStatsVersion(db);
    invalidateStatsCache();
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function demoDataAction(action: "seed-roster" | "seed-stats" | "clear-stats"): Promise<Result<string>> {
  try {
    await requirePermission("manage-data");
    const db = await getAppDb();
    if (action === "seed-roster") {
      const r = await seedDemoRoster(db);
      touch();
      return { ok: true, data: r.created ? `Created ${r.created} demo players.` : "Players already exist; nothing created." };
    }
    if (action === "seed-stats") {
      const r = await seedDemoStats(db);
      invalidateStatsCache();
      touch();
      return { ok: true, data: r.seeded ? "Demo statistics seeded." : `Not seeded: ${r.reason}` };
    }
    await clearDemoStats(db);
    invalidateStatsCache();
    touch();
    return { ok: true, data: "Demo statistics removed." };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
