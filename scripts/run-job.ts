/**
 * CLI job runner, e.g. `pnpm job account-sync` or `pnpm jobs:tick`.
 * Used by GitHub Actions and for manual runs. Loads .env.local / .env automatically.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const [, , name = "tick", ...rest] = process.argv;
  const { createDb } = await import("@/server/db/create");
  const jobs = await import("@/server/jobs");
  const handle = await createDb();
  const budgetMs = Number(process.env.UNIIVERSE_JOB_BUDGET_MS ?? 240_000);
  try {
    if (name === "tick") {
      const force = rest.includes("--force") ? jobs.listJobs().map((j) => j.key) : undefined;
      const result = await jobs.runTick(handle.db, "cli", { budgetMs, force });
      for (const r of result.ran) console.log(`${r.ok ? "ok " : "FAIL"} ${r.key} ${(r.durationMs / 1000).toFixed(1)}s ${r.error ?? ""} ${JSON.stringify(r.summary ?? {}).slice(0, 300)}`);
      for (const s of result.skipped) console.log(`skip ${s}`);
    } else if (name === "list") {
      for (const j of jobs.listJobs()) console.log(`${j.key.padEnd(16)} every ${j.defaultIntervalMinutes ?? "—"} min  ${j.description}`);
    } else {
      const result = await jobs.runJob(handle.db, name as Parameters<typeof jobs.runJob>[1], "cli", { budgetMs });
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    }
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
