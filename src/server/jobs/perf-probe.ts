import { defineJob } from "./registry";
import { runPerfProbe } from "@/server/observability/perf-probe";

/** Read-only timing of the service calls behind every important page and action, in production. */
defineJob({
  key: "perf-probe",
  description: "Read-only timing of the service calls behind the pages (database, auth, statistics). Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const { steps, context } = await runPerfProbe(ctx.db);
    for (const s of steps) ctx.log(`${s.name}: ${s.ms} ms${s.warmMs !== undefined ? ` (warm ${s.warmMs} ms)` : ""}${s.kb !== undefined ? ` · ${s.kb} KB${s.warmKb !== undefined ? ` (warm ${s.warmKb} KB)` : ""}` : ""}${s.note ? ` · ${s.note}` : ""}${s.error ? ` · ERROR ${s.error}` : ""}`);
    const slowest = [...steps].sort((a, b) => b.ms - a.ms).slice(0, 5).map((s) => `${s.name} ${s.ms} ms`);
    // The database egress of each step: what the same loader costs every time a page needs it.
    const heaviest = [...steps].sort((a, b) => (b.kb ?? 0) - (a.kb ?? 0)).slice(0, 5).map((s) => `${s.name} ${s.kb ?? 0} KB${s.warmKb !== undefined ? ` (warm ${s.warmKb} KB)` : ""}`);
    return { ok: true, degraded: steps.some((s) => s.error), error: steps.filter((s) => s.error).map((s) => `${s.name}: ${s.error}`).join("; ") || undefined, summary: { ...context, slowest, heaviest, steps } };
  },
});
