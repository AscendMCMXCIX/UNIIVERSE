import { createDb, type DbHandle } from "@/server/db/create";

/** Fresh in-memory PGlite database with all migrations applied. */
export async function testDb(): Promise<DbHandle> {
  return createDb({ mode: "pglite-memory" });
}
