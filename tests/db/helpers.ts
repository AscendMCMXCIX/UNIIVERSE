import { randomBytes } from "node:crypto";
import { createDb, type DbHandle } from "@/server/db/create";

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
