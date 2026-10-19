"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission } from "@/server/auth/session";
import { runJob, setScheduleOverrides } from "@/server/jobs";
import type { JobKey } from "@/server/ops/refresh-status";
import { seedDemoRoster } from "@/server/demo/seed";
import { invalidateCache } from "@/server/observability/cache";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

function touch() {
  revalidatePath("/settings");
  revalidatePath("/team");
}

export async function runJobAction(key: string): Promise<Result<{ ok: boolean; error?: string; summary?: Record<string, unknown>; durationMs: number }>> {
  try {
    await requirePermission("manage-data");
    const db = await getAppDb();
    const result = await runJob(db, key as JobKey, "settings", { budgetMs: 50_000 });
    invalidateCache("shell-facts");
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

/** Seeds the demo roster (only when there are no players yet). */
export async function demoDataAction(): Promise<Result<string>> {
  try {
    await requirePermission("manage-data");
    const db = await getAppDb();
    const r = await seedDemoRoster(db);
    touch();
    return { ok: true, data: r.created ? `Created ${r.created} demo players.` : "Players already exist; nothing created." };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
