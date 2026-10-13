import type { Db } from "@/server/db/types";
import { startJobRun, type JobKey, type JobOutcome } from "@/server/ops/refresh-status";

export interface JobContext {
  db: Db;
  trigger: string;
  log: (message: string) => void;
  /** Soft time budget in ms; long jobs should stop and resume on the next run. */
  budgetMs: number;
  startedAt: number;
}

export interface JobDefinition {
  key: JobKey;
  description: string;
  /** Default interval between runs, used by the scheduler tick. Null = only on demand/patch events. */
  defaultIntervalMinutes: number | null;
  run: (ctx: JobContext) => Promise<JobOutcome>;
}

const registry = new Map<JobKey, JobDefinition>();

export function defineJob(def: JobDefinition): JobDefinition {
  registry.set(def.key, def);
  return def;
}

export function listJobs(): JobDefinition[] {
  return [...registry.values()];
}

export function getJob(key: string): JobDefinition | undefined {
  return registry.get(key as JobKey);
}

export interface RunJobResult extends JobOutcome {
  key: JobKey;
  durationMs: number;
}

/** Runs a job with status tracking. Never throws: failures are recorded and returned. */
export async function runJob(db: Db, key: JobKey, trigger: string, options: { budgetMs?: number } = {}): Promise<RunJobResult> {
  const def = registry.get(key);
  if (!def) return { key, ok: false, error: `Unknown job "${key}"`, durationMs: 0 };
  const finish = await startJobRun(db, key, trigger);
  const startedAt = Date.now();
  const logs: string[] = [];
  const ctx: JobContext = {
    db,
    trigger,
    log: (m) => {
      logs.push(m);
      if (process.env.UNIIVERSE_JOB_LOGS !== "silent") console.log(`[job:${key}] ${m}`);
    },
    budgetMs: options.budgetMs ?? Number(process.env.UNIIVERSE_JOB_BUDGET_MS ?? 50_000),
    startedAt,
  };
  let outcome: JobOutcome;
  try {
    outcome = await def.run(ctx);
  } catch (err) {
    outcome = { ok: false, error: (err as Error).message ?? String(err) };
  }
  // The last log lines travel with the outcome: they are stored for Settings → Data jobs and
  // returned to HTTP callers, so a scheduler's log shows why a run was degraded.
  const summary = { ...(outcome.summary ?? {}), logs: logs.slice(-20) };
  const { durationMs } = await finish({ ...outcome, summary });
  return { ...outcome, summary, key, durationMs };
}
