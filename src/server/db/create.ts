import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { gateConcurrency } from "./gate";
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
  /** Tests only: open the database without applying migrations (to replay an upgrade by hand). */
  migrate?: boolean;
}

/**
 * Picks the database driver from the environment:
 *   - DATABASE_URL set   → Postgres (Supabase, Neon, Railway, local Postgres…)
 *   - otherwise          → embedded PGlite persisted under ./.data (local/demo mode)
 * Migrations are applied automatically in every mode so the schema is always current.
 */
export async function createDb(
  options: CreateDbOptions = {},
): Promise<DbHandle> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const mode: DbMode =
    options.mode ??
    (databaseUrl
      ? "postgres"
      : process.env.UNIIVERSE_DB_MODE === "memory"
        ? "pglite-memory"
        : "pglite-file");

  if (mode === "postgres") {
    if (!databaseUrl)
      throw new Error("DATABASE_URL is required for postgres mode");
    // prepare:false keeps us compatible with transaction-mode poolers (Supabase port 6543).
    const poolMax = Number(process.env.DATABASE_POOL_MAX ?? 5);
    const raw = postgres(databaseUrl, {
      prepare: false,
      max: poolMax,
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: sslOption(databaseUrl),
      // postgres-js otherwise reads the array types (about 430 rows) on every new connection, and
      // serverless instances open many: about 8 million rows in a week of production, more than
      // most pages. Nothing here sends or reads Postgres arrays (lists go as IN (...) and JSON).
      fetch_types: false,
      // Postgres NOTICEs (e.g. "identifier will be truncated" during migrations) are not errors;
      // keep production logs clean unless explicitly asked for them.
      onnotice:
        process.env.UNIIVERSE_DB_NOTICES === "true" ? undefined : () => {},
    });
    // Never more queries in flight than connections: with the pool busy, postgres-js pipelines
    // extra queries onto busy connections, and through the transaction pooler those never
    // answered (every burst larger than the pool hung in production; see src/server/db/gate.ts
    // and docs/PERFORMANCE.md). The gate queues them for a free connection instead.
    const client = gateConcurrency(raw, poolMax);
    const db = drizzlePg(client, { schema }) as unknown as Db;
    if (options.migrate !== false)
      await runMigrations(db, { useAdvisoryLock: true });
    return {
      db,
      mode,
      description: describePostgres(databaseUrl),
      close: () => raw.end({ timeout: 5 }),
    };
  }

  // Loaded only here: a Postgres deployment leaves PGlite out of its functions (next.config.ts), and
  // drizzle's PGlite driver imports PGlite as soon as it loads.
  const [{ PGlite }, { drizzle: drizzlePglite }] = await Promise.all([import("@electric-sql/pglite"), import("drizzle-orm/pglite")]);
  let client: InstanceType<typeof PGlite>;
  if (mode === "pglite-memory") {
    client = new PGlite();
  } else {
    // Serverless hosts have a read-only project directory; only /tmp is writable (and ephemeral).
    const defaultDir = process.env.VERCEL
      ? join("/tmp", "uniiverse-pglite")
      : join(process.cwd(), ".data", "uniiverse-pglite");
    const dir = options.dataDir ?? process.env.UNIIVERSE_DATA_DIR ?? defaultDir;
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  if (options.migrate !== false)
    await runMigrations(db, { useAdvisoryLock: false });
  return {
    db,
    mode,
    description:
      mode === "pglite-memory"
        ? "Embedded in-memory database (tests)"
        : "Embedded local database (PGlite) — demo/local mode, not for production",
    close: () => client.close(),
  };
}

/**
 * TLS for the Postgres connection. An explicit `sslmode=` in the URL or `DATABASE_SSL` wins;
 * otherwise hosted providers (Supabase, Neon, Railway…) get `require` and local Postgres none.
 */
export function sslOption(
  url: string,
): "require" | "prefer" | "verify-full" | boolean | undefined {
  const env = (process.env.DATABASE_SSL ?? "").trim().toLowerCase();
  if (env === "disable" || env === "false" || env === "off") return false;
  if (env === "require" || env === "prefer" || env === "verify-full")
    return env;
  try {
    const u = new URL(url);
    if (u.searchParams.has("sslmode")) return undefined; // postgres-js reads it from the URL
    const host = u.hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local")
    )
      return undefined;
    return "require";
  } catch {
    return undefined;
  }
}

function describePostgres(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const supabase =
      host.endsWith("supabase.co") ||
      host.endsWith("supabase.com") ||
      host.includes("pooler.supabase");
    return `${supabase ? "Supabase Postgres" : "PostgreSQL"} at ${host}`;
  } catch {
    return "PostgreSQL";
  }
}
