import { sql } from "drizzle-orm";
import type { Db } from "./types";
import { EMBEDDED_MIGRATIONS } from "./migrations.generated";

/**
 * Applies embedded migrations that have not been applied yet. Idempotent and safe to call from
 * every cold start: a Postgres advisory lock serialises concurrent instances, and each migration
 * runs inside its own transaction so a crash never leaves a half-applied migration.
 */
export async function runMigrations(db: Db, options: { useAdvisoryLock: boolean }): Promise<{ applied: string[] }> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (
    tag text PRIMARY KEY,
    hash text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const applied: string[] = [];
  const run = async () => {
    const rows = await db.execute(sql`SELECT tag FROM uniiverse_migrations`);
    const done = new Set((rows as unknown as { rows?: Array<{ tag: string }> }).rows?.map((r) => r.tag) ?? (rows as unknown as Array<{ tag: string }>).map?.((r) => r.tag) ?? []);
    for (const m of EMBEDDED_MIGRATIONS) {
      if (done.has(m.tag)) continue;
      await db.transaction(async (tx) => {
        for (const statement of m.statements) {
          await tx.execute(sql.raw(statement));
        }
        await tx.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      });
      applied.push(m.tag);
    }
  };

  if (options.useAdvisoryLock) {
    await db.execute(sql`SELECT pg_advisory_lock(7245017)`);
    try {
      await run();
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(7245017)`);
    }
  } else {
    await run();
  }
  return { applied };
}
