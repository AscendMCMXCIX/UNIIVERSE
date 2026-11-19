"use server";

import { publicErrorMessage } from "@/server/errors";
import { revalidatePath } from "next/cache";
import { recordAudit } from "@/server/audit/log";
import { getAppDb } from "@/server/bootstrap";
import { isOwner, requireOwner, requirePermission } from "@/server/auth/session";
import { getJob, getScheduleOverrides, listJobs, runJob, setScheduleOverrides } from "@/server/jobs";
import type { JobKey } from "@/server/ops/refresh-status";
import { seedDemoRoster } from "@/server/demo/seed";
import { invalidateCache } from "@/server/observability/cache";
import { turnOffPhrase, typedMatches } from "@/domain/typed-confirmation";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

function touch() {
  revalidatePath("/settings");
  revalidatePath("/team");
  revalidatePath("/admin/data");
}

/**
 * Admin Mode → Data & Integrations' buttons (the jobs endpoint, /api/jobs/<name> with CRON_SECRET,
 * is separate and unchanged). Checks and refreshes: any administrator who manages data. Setup and
 * repair jobs (JobDefinition.kind "setup": the LP schedule on or off, a full history rescan, every
 * erasure re-applied, the Production check's account): the Owner only, and only with the job's
 * phrase typed (`confirmation`), checked here as well as on the page.
 */
export async function runJobAction(key: string, confirmation?: string): Promise<Result<{ ok: boolean; error?: string; summary?: Record<string, unknown>; durationMs: number }>> {
  try {
    const session = await requirePermission("manage-data");
    const def = typeof key === "string" ? getJob(key) : undefined;
    if (!def) return { ok: false, error: "There is no such job." };
    if (def.kind === "setup") {
      if (!isOwner(session)) return { ok: false, error: "Only the Owner runs setup and repair jobs. Nothing was run." };
      if (!def.confirm || !typedMatches(confirmation, def.confirm.phrase)) return { ok: false, error: `Type ${def.confirm?.phrase ?? "the phrase"} to confirm. Nothing was run.` };
    }
    const db = await getAppDb();
    const result = await runJob(db, def.key, "settings", { budgetMs: 50_000 });
    await recordAudit(db, session, { action: "jobs.run", target: { type: "job", name: def.key }, details: { ok: result.ok, kind: def.kind } });
    invalidateCache("shell-facts");
    touch();
    return { ok: true, data: { ok: result.ok, error: result.error, summary: result.summary, durationMs: result.durationMs } };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}

/** The longest interval the editor takes: a year, in minutes. */
const MAX_INTERVAL_MINUTES = 525_600;

/**
 * The scheduler's intervals (Advanced, the Owner only): minutes between runs of each job the tick
 * runs; 0 turns that job off, which needs its phrase typed (`confirmations[job]`, "TURN OFF
 * <job>"). Jobs not sent keep their interval; jobs that run only on demand have none. Each changed
 * job is recorded with its interval before and after. Values equal to a job's default are not kept
 * as overrides, so a later change of the default reaches them.
 */
export async function saveScheduleAction(intervals: Record<string, unknown>, confirmations: Record<string, string> = {}): Promise<Result<{ changed: number }>> {
  try {
    const session = await requireOwner();
    if (!intervals || typeof intervals !== "object") return { ok: false, error: "Nothing to save." };
    const db = await getAppDb();
    const saved = (await getScheduleOverrides(db)).intervals;
    const next: Partial<Record<JobKey, number>> = {};
    const changes: Array<{ key: JobKey; from: number; to: number }> = [];
    for (const def of listJobs()) {
      if (def.defaultIntervalMinutes === null) continue;
      const from = saved[def.key] ?? def.defaultIntervalMinutes;
      const sent = Object.hasOwn(intervals, def.key) ? intervals[def.key] : from;
      const value = typeof sent === "number" ? sent : typeof sent === "string" && sent.trim() !== "" ? Number(sent) : Number.NaN;
      if (!Number.isFinite(value) || value < 0 || value > MAX_INTERVAL_MINUTES) return { ok: false, error: `${def.key}: enter whole minutes from 0 to ${MAX_INTERVAL_MINUTES}. Nothing was saved.` };
      const to = Math.round(value);
      if (to === 0 && from !== 0 && !typedMatches(confirmations?.[def.key], turnOffPhrase(def.key))) return { ok: false, error: `Type ${turnOffPhrase(def.key)} to turn it off. Nothing was saved.` };
      if (to !== def.defaultIntervalMinutes) next[def.key] = to;
      if (to !== from) changes.push({ key: def.key, from, to });
    }
    if (changes.length === 0) return { ok: true, data: { changed: 0 } };
    await setScheduleOverrides(db, { intervals: next });
    for (const c of changes) await recordAudit(db, session, { action: "jobs.schedule", target: { type: "job", name: c.key }, details: { fromMinutes: c.from, toMinutes: c.to } });
    touch();
    return { ok: true, data: { changed: changes.length } };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}

/** Seeds the demo roster (only when there are no players yet). */
export async function demoDataAction(): Promise<Result<string>> {
  try {
    const session = await requirePermission("manage-data");
    const db = await getAppDb();
    await recordAudit(db, session, { action: "demo.data", details: { change: "seed-roster" } });
    const r = await seedDemoRoster(db);
    touch();
    return { ok: true, data: r.created ? `Created ${r.created} demo players.` : "Players already exist; nothing created." };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}
