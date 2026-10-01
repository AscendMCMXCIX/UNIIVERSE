/** Applies pending migrations to the configured database (DATABASE_URL, or the local PGlite file). */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { createDb } = await import("@/server/db/create");
  const handle = await createDb(); // migrations run on connect
  console.log(`Database ready: ${handle.description}`);
  await handle.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
