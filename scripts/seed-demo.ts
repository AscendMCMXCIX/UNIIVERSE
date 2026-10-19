/** Seeds the demo roster (never overwrites real data). */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { createDb } = await import("@/server/db/create");
  const { runJob } = await import("@/server/jobs");
  const { seedDemoRoster } = await import("@/server/demo/seed");
  const handle = await createDb();
  try {
    await runJob(handle.db, "static-sync", "cli");
    console.log("roster:", await seedDemoRoster(handle.db));
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
