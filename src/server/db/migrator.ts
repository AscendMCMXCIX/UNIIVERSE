import { sql } from "drizzle-orm";
import type { Db } from "./types";
import { EMBEDDED_MIGRATIONS } from "./migrations.generated";

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

export async function runMigrations(db: Db, options: { useAdvisoryLock: boolean }): Promise<{ applied: string[] }> {
  const applied: string[] = [];
  const apply = async (executor: Pick<Db, "execute">) => {
    const rows = await executor.execute(sql`SELECT tag FROM uniiverse_migrations`);
    const done = new Set((rows as unknown as { rows?: Array<{ tag: string }> }).rows?.map((r) => r.tag) ?? (rows as unknown as Array<{ tag: string }>).map?.((r) => r.tag) ?? []);
    for (const m of EMBEDDED_MIGRATIONS) {
      if (done.has(m.tag)) continue;
      for (const statement of m.statements) await executor.execute(sql.raw(statement));
      await executor.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      applied.push(m.tag);
    }
  };

  if (options.useAdvisoryLock) {
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
    for (const m of EMBEDDED_MIGRATIONS) {
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
