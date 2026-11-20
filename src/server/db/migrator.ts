import { sql } from "drizzle-orm";
import type { Db } from "./types";
import { EMBEDDED_MIGRATIONS, type EmbeddedMigration } from "./migrations.generated";

const LOCK_KEY = 7245017;

/**
 * Applies embedded migrations that have not been applied yet. Idempotent and safe to call from
 * every cold start.
 *
 * On Postgres the whole run happens inside ONE transaction that first takes a transaction-scoped
 * advisory lock (`pg_advisory_xact_lock`). That matters behind transaction-mode poolers such as
 * Supabase's port 6543: a session-level lock could be acquired on one pooled connection and
 * "released" on another, leaving the lock stuck forever. A transaction-scoped lock is always
 * released with the transaction, and DDL is transactional in Postgres, so a crash mid-way leaves
 * nothing half-applied.
 */
const CREATE_LEDGER = sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (
    tag text PRIMARY KEY,
    hash text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

/**
 * Which migrations to apply is decided by tag alone: every embedded migration whose tag the ledger
 * lacks is applied, in the embedded (journal) order, wherever it sits. So a migration that lands
 * after a later-numbered one was applied (a held 0066 merged after 0067) is still applied, never
 * skipped; drizzle's journal `when` is not read (tests/db/migrate.test.ts, "out of order").
 * `migrations` is for that test; the app always applies the embedded list.
 */
export async function runMigrations(db: Db, options: { useAdvisoryLock: boolean }, migrations: readonly EmbeddedMigration[] = EMBEDDED_MIGRATIONS): Promise<{ applied: string[] }> {
  const applied: string[] = [];
  const apply = async (executor: Pick<Db, "execute">) => {
    const rows = await executor.execute(sql`SELECT tag FROM uniiverse_migrations`);
    const done = new Set((rows as unknown as { rows?: Array<{ tag: string }> }).rows?.map((r) => r.tag) ?? (rows as unknown as Array<{ tag: string }>).map?.((r) => r.tag) ?? []);
    for (const m of migrations) {
      if (done.has(m.tag)) continue;
      for (const statement of m.statements) await executor.execute(sql.raw(statement));
      await executor.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      applied.push(m.tag);
    }
  };

  if (options.useAdvisoryLock) {
    // Fast path for every ordinary cold start: when the ledger already lists every embedded
    // migration there is nothing to apply, so no transaction and no lock are taken (two
    // instances starting together would otherwise queue behind each other for nothing).
    try {
      const rows = await db.execute(sql`SELECT tag FROM uniiverse_migrations`);
      const done = new Set((rows as unknown as { rows?: Array<{ tag: string }> }).rows?.map((r) => r.tag) ?? (rows as unknown as Array<{ tag: string }>).map?.((r) => r.tag) ?? []);
      if (migrations.every((m) => done.has(m.tag))) return { applied };
    } catch {
      // No ledger yet (first ever start): fall through to the locked path, which creates it.
    }
    // The lock comes first: even CREATE TABLE IF NOT EXISTS races between simultaneous cold
    // starts (a catalog unique-index error), so nothing touches the ledger before holding it.
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
      await tx.execute(CREATE_LEDGER);
      await apply(tx);
    });
  } else {
    // Embedded PGlite: single connection, no concurrency; one transaction per migration.
    await db.execute(CREATE_LEDGER);
    const rows = await db.execute(sql`SELECT tag FROM uniiverse_migrations`);
    const done = new Set((rows as unknown as { rows?: Array<{ tag: string }> }).rows?.map((r) => r.tag) ?? (rows as unknown as Array<{ tag: string }>).map?.((r) => r.tag) ?? []);
    for (const m of migrations) {
      if (done.has(m.tag)) continue;
      await db.transaction(async (tx) => {
        for (const statement of m.statements) await tx.execute(sql.raw(statement));
        await tx.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      });
      applied.push(m.tag);
    }
  }
  return { applied };
}
