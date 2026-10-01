"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppDb } from "@/server/bootstrap";
import { requireOwner } from "@/server/auth/session";
import { runJob, setScheduleOverrides } from "@/server/jobs";
import type { JobKey } from "@/server/ops/refresh-status";
import { deleteChangePoint, setChangePointConfirmed } from "@/server/repositories/champions";
import { getOrCreateTeam, updateTeam } from "@/server/repositories/team";
import { clearDemoStats, seedDemoRoster, seedDemoStats } from "@/server/demo/seed";
import { invalidateStatsCache } from "@/server/stats/loader";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

function touch() {
  revalidatePath("/settings");
  revalidatePath("/trends");
  revalidatePath("/team");
}

export async function runJobAction(key: string): Promise<Result<{ ok: boolean; error?: string; summary?: Record<string, unknown>; durationMs: number }>> {
  try {
    await requireOwner();
    const db = await getAppDb();
    const result = await runJob(db, key as JobKey, "settings", { budgetMs: 50_000 });
    invalidateStatsCache();
    touch();
    return { ok: true, data: { ok: result.ok, error: result.error, summary: result.summary, durationMs: result.durationMs } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const engineSchema = z.object({
  philosophy: z.object({ synergy: z.number().min(0).max(1), enemy: z.number().min(0).max(1) }),
  weights: z.record(z.string(), z.number().min(0).max(5)),
  swapThreshold: z.number().min(0).max(0.2),
  severity: z.object({ slightlyUnfavourable: z.number(), significantlyUnfavourable: z.number(), nearUnplayable: z.number() }).optional(),
});

export async function saveEngineConfigAction(input: z.infer<typeof engineSchema>): Promise<Result> {
  try {
    await requireOwner();
    const parsed = engineSchema.parse(input);
    const db = await getAppDb();
    const team = await getOrCreateTeam(db);
    await updateTeam(db, team.id, { engineConfig: parsed });
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof z.ZodError ? err.issues.map((i) => i.message).join("; ") : (err as Error).message };
  }
}

export async function savePoolLimitsAction(input: { primary: number; secondary: number }): Promise<Result> {
  try {
    await requireOwner();
    const db = await getAppDb();
    const team = await getOrCreateTeam(db);
    const primary = Math.max(1, Math.min(20, Math.round(input.primary)));
    const secondary = Math.max(0, Math.min(20, Math.round(input.secondary)));
    await updateTeam(db, team.id, { primaryPoolLimit: primary, secondaryPoolLimit: secondary });
    touch();
    revalidatePath("/players");
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function saveScheduleAction(intervals: Record<string, number>): Promise<Result> {
  try {
    await requireOwner();
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
    await requireOwner();
    const db = await getAppDb();
    if (action === "delete") await deleteChangePoint(db, id);
    else await setChangePointConfirmed(db, id, action === "confirm", discount);
    invalidateStatsCache();
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function saveCustomFormatAction(spec: { id: string; name: string; description?: string; ban1?: string | number; pick1: string; ban2?: string; pick2?: string }): Promise<Result> {
  try {
    await requireOwner();
    const { customFormat, BUILTIN_FORMATS } = await import("@/domain/draft");
    const { getCustomFormats, saveCustomFormats } = await import("@/server/repositories/formats");
    if (!/^[a-z0-9-]{2,40}$/.test(spec.id)) return { ok: false, error: "Format id: 2–40 lowercase letters, digits or dashes." };
    if (BUILTIN_FORMATS[spec.id]) return { ok: false, error: `"${spec.id}" is a built-in format.` };
    const format = customFormat(spec);
    const db = await getAppDb();
    const existing = (await getCustomFormats(db)).filter((f) => f.id !== format.id);
    await saveCustomFormats(db, [...existing, format]);
    revalidatePath("/settings");
    revalidatePath("/draft");
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteCustomFormatAction(id: string): Promise<Result> {
  try {
    await requireOwner();
    const { getCustomFormats, saveCustomFormats } = await import("@/server/repositories/formats");
    const db = await getAppDb();
    await saveCustomFormats(db, (await getCustomFormats(db)).filter((f) => f.id !== id));
    revalidatePath("/settings");
    revalidatePath("/draft");
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function demoDataAction(action: "seed-roster" | "seed-stats" | "clear-stats"): Promise<Result<string>> {
  try {
    await requireOwner();
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
