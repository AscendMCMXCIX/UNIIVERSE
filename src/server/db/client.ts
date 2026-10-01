// Server-side only. Never import from client components.
import { createDb, type DbHandle } from "./create";

/**
 * Process-wide lazy database handle. Serverless platforms may create several instances; each
 * one connects once and runs pending migrations once.
 */
declare global {
  var __uniiverseDb: Promise<DbHandle> | undefined;
}

export function getDbHandle(): Promise<DbHandle> {
  if (!globalThis.__uniiverseDb) {
    globalThis.__uniiverseDb = createDb().catch((err) => {
      globalThis.__uniiverseDb = undefined;
      throw err;
    });
  }
  return globalThis.__uniiverseDb;
}

export async function getDb() {
  return (await getDbHandle()).db;
}

export type { DbHandle } from "./create";
