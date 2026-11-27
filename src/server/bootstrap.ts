import type { Db } from "@/server/db/types";
import { getDbHandle, type DbHandle } from "@/server/db/client";
import { getCurrentPatch } from "@/server/repositories/champions";
import { runJob } from "@/server/jobs";
import { applyFullRosterFixture, applyScreenshotFixture, seedDemoAccounts, seedDemoRoster, seedDemoVerificationAccount } from "@/server/demo/seed";
import { applyDemoEncounters } from "@/server/demo/encounters-fixture";
import { applyDemoBuilds } from "@/server/demo/builds-fixture";
import { seedDemoHighElo } from "@/server/demo/high-elo";
import { applyDemoMatchups } from "@/server/demo/matchup-fixture";
import { seedChampionAbilitiesFromFixture } from "@/server/riot/static/abilities";

declare global {
  var __uniiverseBootstrapped: Promise<void> | undefined;
}

/**
 * First-run bootstrap: make sure champions exist (sync from Data Dragon, or the offline fixture
 * when unreachable) and, in local/demo mode, seed the demo roster, its linked accounts and their
 * games.
 * Runs once per process and never blocks subsequent requests.
 */
export async function ensureBootstrapped(): Promise<DbHandle> {
  const handle = await getDbHandle();
  if (!globalThis.__uniiverseBootstrapped) {
    globalThis.__uniiverseBootstrapped = bootstrap(handle).catch((err) => {
      console.error("[bootstrap] failed:", err);
      globalThis.__uniiverseBootstrapped = undefined;
    });
  }
  await globalThis.__uniiverseBootstrapped;
  return handle;
}

/**
 * The full-roster layout check (UNIIVERSE_DEMO_FULL_ROSTER=1, Release 19): on the in-memory demo only,
 * decided once here for both of its halves (the substitutes' multikill counts in seedDemoAccounts, the
 * members in setup in applyFullRosterFixture). On a file (`pnpm dev`'s ./.data) or Postgres demo the
 * flag does nothing: half of it, written once, outlived the flag there.
 */
export function demoFullRoster(mode: DbHandle["mode"], env: Record<string, string | undefined> = process.env): boolean {
  return env.UNIIVERSE_DEMO_FULL_ROSTER === "1" && mode === "pglite-memory";
}

async function bootstrap(handle: DbHandle): Promise<void> {
  const db: Db = handle.db;
  const current = await getCurrentPatch(db);
  if (!current) {
    await runJob(db, "static-sync", "bootstrap");
  }
  const demoWanted = process.env.UNIIVERSE_SEED_DEMO === "true" || (process.env.UNIIVERSE_SEED_DEMO !== "false" && handle.mode !== "postgres");
  if (demoWanted) {
    // Champion Intel: a demo with no champion abilities stored (its champions came from the offline
    // fixture, or Data Dragon's files could not be read) gets the committed offline copy, labelled
    // as such. Never over abilities read from Data Dragon.
    await seedChampionAbilitiesFromFixture(db).catch((err) => console.error("[bootstrap] champion abilities not stored:", err));
    await seedDemoRoster(db);
    // Layout checks of a full roster: the substitutes' games all carry their counts and the two members in setup play too, so
    // nine are active (in-memory demo only: demoFullRoster).
    const fullRoster = demoFullRoster(handle.mode);
    await seedDemoAccounts(db, { fullRoster });
    if (fullRoster) await applyFullRosterFixture(db);
    // Distinct other players per demo game, with a few recurring ones (synthetic DEMO_ games only).
    if (handle.mode !== "postgres") await applyDemoEncounters(db);
    // Champion Intel's builds: a few champions' games on the current patch, one with two builds (synthetic DEMO_ games only).
    if (handle.mode !== "postgres") await applyDemoBuilds(db).catch((err) => console.error("[bootstrap] demo builds not applied:", err));
    // Champion Intel's Master+ source: synthetic counts made by the sampler's own code, shown only with the browser tests' cookie (in-memory demo only).
    if (handle.mode === "pglite-memory") await seedDemoHighElo(db).catch((err) => console.error("[bootstrap] demo high-elo counts not seeded:", err));
    // Matchup Intel: two pairs met often enough in one lane, and two reviewed notes (synthetic DEMO_ games and demo notes only).
    if (handle.mode !== "postgres") await applyDemoMatchups(db).catch((err) => console.error("[bootstrap] demo matchups not applied:", err));
    // Production's verification account, as Admin's People page shows it (no password; local only).
    if (handle.mode !== "postgres") await seedDemoVerificationAccount(db);
    // Screenshots and layout checks: real-length names, the local owner as a player (in-memory demo only).
    if (process.env.UNIIVERSE_DEMO_SCREENSHOT === "1" && handle.mode === "pglite-memory") await applyScreenshotFixture(db);
  }
}

export async function getAppDb(): Promise<Db> {
  return (await ensureBootstrapped()).db;
}
