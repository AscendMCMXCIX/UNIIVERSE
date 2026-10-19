/**
 * Seeds a realistic data volume into the local PostgreSQL database for performance measurement:
 * owner account, 8 players with pools and a lineup, demo accounts with champion history.
 * Development only. Usage: DATABASE_URL=postgres://... pnpm exec tsx scripts/perf-seed.ts
 */
import "dotenv/config";

async function main() {
  const { createDb } = await import("@/server/db/create");
  const { syncStaticData } = await import("@/server/riot/static/sync");
  const { FixtureStaticProvider } = await import("@/server/riot/static/fixture");
  const { seedDemoRoster, seedDemoAccounts } = await import("@/server/demo/seed");
  const { createUser } = await import("@/server/repositories/users");
  const handle = await createDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  await createUser(db, { username: "Ascend", password: "owner-pass-123", role: "owner" }).catch(() => null);
  await seedDemoRoster(db);
  await seedDemoAccounts(db);
  await handle.close();
}
void main();
