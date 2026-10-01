import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import * as schema from "./schema";
import { runMigrations } from "./migrator";
import type { Db, DbMode } from "./types";

export interface DbHandle {
  db: Db;
  mode: DbMode;
  /** Human-readable description for the Settings page. */
  description: string;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  /** Force a mode (tests use "pglite-memory"). */
  mode?: DbMode;
  databaseUrl?: string;
  dataDir?: string;
}

/**
 * Picks the database driver from the environment:
 *   - DATABASE_URL set   → Postgres (Supabase, Neon, Railway, local Postgres…)
 *   - otherwise          → embedded PGlite persisted under ./.data (local/demo mode)
 * Migrations are applied automatically in every mode so the schema is always current.
 */
export async function createDb(options: CreateDbOptions = {}): Promise<DbHandle> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const mode: DbMode = options.mode ?? (databaseUrl ? "postgres" : process.env.UNIIVERSE_DB_MODE === "memory" ? "pglite-memory" : "pglite-file");

  if (mode === "postgres") {
    if (!databaseUrl) throw new Error("DATABASE_URL is required for postgres mode");
    // prepare:false keeps us compatible with transaction-mode poolers (Supabase port 6543).
    const client = postgres(databaseUrl, { prepare: false, max: Number(process.env.DATABASE_POOL_MAX ?? 5), idle_timeout: 20, connect_timeout: 15 });
    const db = drizzlePg(client, { schema }) as unknown as Db;
    await runMigrations(db, { useAdvisoryLock: true });
    return {
      db,
      mode,
      description: describePostgres(databaseUrl),
      close: () => client.end({ timeout: 5 }),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  let client: InstanceType<typeof PGlite>;
  if (mode === "pglite-memory") {
    client = new PGlite();
  } else {
    // Serverless hosts have a read-only project directory; only /tmp is writable (and ephemeral).
    const defaultDir = process.env.VERCEL ? join("/tmp", "uniiverse-pglite") : join(process.cwd(), ".data", "uniiverse-pglite");
    const dir = options.dataDir ?? process.env.UNIIVERSE_DATA_DIR ?? defaultDir;
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  await runMigrations(db, { useAdvisoryLock: false });
  return {
    db,
    mode,
    description: mode === "pglite-memory" ? "Embedded in-memory database (tests)" : "Embedded local database (PGlite) — demo/local mode, not for production",
    close: () => client.close(),
  };
}

function describePostgres(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const supabase = host.endsWith("supabase.co") || host.endsWith("supabase.com") || host.includes("pooler.supabase");
    return `${supabase ? "Supabase Postgres" : "PostgreSQL"} at ${host}`;
  } catch {
    return "PostgreSQL";
  }
}
