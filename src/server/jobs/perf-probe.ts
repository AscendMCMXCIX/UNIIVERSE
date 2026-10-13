import { defineJob } from "./registry";
import { runPerfProbe } from "@/server/observability/perf-probe";

/** Read-only timing of the service calls behind every important page and action, in production. */
defineJob({
  key: "perf-probe",
  description: "Read-only timing of the service calls behind the pages and draft actions (database, auth, statistics, engine). Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const { steps, context } = await runPerfProbe(ctx.db);
    for (const s of steps) ctx.log(`${s.name}: ${s.ms} ms${s.warmMs !== undefined ? ` (warm ${s.warmMs} ms)` : ""}${s.note ? ` · ${s.note}` : ""}${s.error ? ` · ERROR ${s.error}` : ""}`);
    const slowest = [...steps].sort((a, b) => b.ms - a.ms).slice(0, 5).map((s) => `${s.name} ${s.ms} ms`);
    return { ok: true, degraded: steps.some((s) => s.error), error: steps.filter((s) => s.error).map((s) => `${s.name}: ${s.error}`).join("; ") || undefined, summary: { ...context, slowest, steps } };
  },
});
