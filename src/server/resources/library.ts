import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";
import { libraryFrom, type ResourceLibrary } from "@/domain/resources";
import { cachedFor, invalidateCache } from "@/server/observability/cache";

/*
  Where the Resources library lives: one row of app_settings ("resources"), written only by the
  administrators' actions (server/actions/resources.ts). Until the first change nothing is stored
  and the library is the defaults (domain/resources.ts).

  Reads: the page reads it through a per-instance cache (five minutes; a change clears this
  instance's copy at once, other instances catch up within the five minutes), so members opening
  Resources cost the database one small query per instance and five minutes, not one per visit.
*/

const KEY = "resources";
const TTL_MS = 5 * 60_000;

/** The library as stored now, uncached: for the administrators' manager, which must not show another instance's older copy. */
export async function readResourceLibrary(db: Db): Promise<ResourceLibrary> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
  return libraryFrom(row?.value ?? null);
}

/** The library for the members' page, cached (see above). */
export async function getResourceLibrary(db: Db): Promise<ResourceLibrary> {
  return cachedFor(KEY, TTL_MS, () => readResourceLibrary(db), db);
}

/**
 * Applies one change to the stored library under a row lock, so two administrators changing it at
 * the same moment never undo each other's change: the second waits and changes the first one's
 * result. A change that throws (a ResourceInputError) stores nothing.
 */
export async function changeResourceLibrary(db: Db, change: (lib: ResourceLibrary) => ResourceLibrary): Promise<ResourceLibrary> {
  const next = await db.transaction(async (tx) => {
    // The row has to exist to be locked: the library as it is now (the defaults) if nothing was stored yet.
    await tx.insert(appSettings).values({ key: KEY, value: libraryFrom(null), updatedAt: new Date() }).onConflictDoNothing();
    const [row] = await tx.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY)).for("update");
    const updated = change(libraryFrom(row?.value ?? null));
    await tx.update(appSettings).set({ value: updated, updatedAt: new Date() }).where(eq(appSettings.key, KEY));
    return updated;
  });
  invalidateCache(KEY);
  return next;
}
