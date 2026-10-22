/**
 * Personal-data erasure records outside the app (docs/BACKUPS.md, "Restoring after an erasure"):
 *   pnpm privacy:records export > erasures.json   the records of the database in DATABASE_URL
 *   pnpm privacy:records import erasures.json     adds them to a restored database, then applies them all
 * The file holds keyed tokens only (nothing that names anyone). Applying it needs the same
 * UNIIVERSE_AUTH_SECRET as the deployment that made the records. Loads .env.local / .env.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const [, , command, path] = process.argv;
  if (command !== "export" && command !== "import") {
    console.error("Usage: pnpm privacy:records export > erasures.json | pnpm privacy:records import erasures.json");
    process.exit(2);
  }
  const { createDb } = await import("@/server/db/create");
  const { exportErasures, importErasures } = await import("@/server/privacy/ledger");
  const { reconcileErasures } = await import("@/server/privacy/reconcile");
  const handle = await createDb();
  try {
    if (command === "export") {
      process.stdout.write(`${JSON.stringify(await exportErasures(handle.db), null, 2)}\n`);
      return;
    }
    if (!path) throw new Error("Name the records file to import.");
    const imported = await importErasures(handle.db, JSON.parse(readFileSync(path, "utf8")));
    const applied = await reconcileErasures(handle.db, { mode: "full" });
    console.error(`Imported: ${imported.added} new, ${imported.updated} updated. Applied: ${applied.records} record(s) usable, ${applied.unusable} made under another secret, ${applied.people} account(s) or profile(s) and ${applied.traces} set(s) of traces removed.`);
    if (applied.unusable) process.exitCode = 1;
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
