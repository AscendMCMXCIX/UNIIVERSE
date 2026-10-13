/**
 * Development only: runs the same read-only performance probe as the `perf-probe` job against
 * DATABASE_URL and prints one line per step. Usage: DATABASE_URL=... pnpm exec tsx scripts/perf-probe-local.ts
 */
import "dotenv/config";

async function main() {
  const { createDb } = await import("@/server/db/create");
  const { runPerfProbe } = await import("@/server/observability/perf-probe");
  const t0 = performance.now();
  const handle = await createDb();
  console.log(`createDb (connect + migration check): ${Math.round(performance.now() - t0)} ms`);
  const { steps } = await runPerfProbe(handle.db);
  for (const s of steps) console.log(`${s.name.padEnd(28)} ${String(s.ms).padStart(8)} ms${s.warmMs !== undefined ? ` (warm ${s.warmMs} ms)` : ""}${s.note ? ` · ${s.note}` : ""}${s.error ? ` · ERROR ${s.error}` : ""}`);
  await handle.close();
}
void main();
