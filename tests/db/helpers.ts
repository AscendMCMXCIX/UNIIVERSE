import { randomBytes } from "node:crypto";
import { createDb, type DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import { patches } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";

/**
 * Fresh database with all migrations applied.
 *
 * Default: in-memory PGlite (fast, no setup). With `TEST_DATABASE_URL` pointing at a real
 * Postgres server (a superuser or a role allowed to CREATE DATABASE), every call creates its own
 * throw-away database so the same suite exercises the production driver, the transaction-scoped
 * migration lock and real Postgres SQL. The database is dropped on close.
 */
export async function testDb(): Promise<DbHandle> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) return createDb({ mode: "pglite-memory" });

  const { default: postgres } = await import("postgres");
  const name = `uniiverse_test_${randomBytes(6).toString("hex")}`;
  const admin = postgres(adminUrl, { max: 1, prepare: false, ssl: adminUrl.includes("localhost") || adminUrl.includes("127.0.0.1") ? false : "require" });
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const handle = await createDb({ mode: "postgres", databaseUrl: url.toString() });
  return {
    ...handle,
    description: `${handle.description} (throw-away test database ${name})`,
    close: async () => {
      await handle.close();
      await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.end({ timeout: 5 });
    },
  };
}

/**
 * Makes a Season 2026 patch (16.20) the current one, for a test whose games are Season 2026's.
 * The current season is the current patch's (accounts/sync `currentSeason`), as in production. The
 * offline fixture's patch has no season, so on fixture data alone it would be the calendar year's,
 * and from 1 January 2027 those games would no longer be in the current season.
 */
export async function makeSeason2026Current(db: Db): Promise<void> {
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values({ id: "16.20", ddragonVersion: "16.20.1", isCurrent: true, sortKey: patchSortKey("16.20") }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: true } });
}
