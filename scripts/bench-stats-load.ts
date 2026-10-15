/**
 * Development only: how long a cold statistics load takes against DATABASE_URL, and how much of
 * it is the three large queries (role, matchup and pair tables) as opposed to building the
 * provider. Usage: DATABASE_URL=postgres://... pnpm exec tsx scripts/bench-stats-load.ts
 */
import "dotenv/config";
async function main() {
  const { createDb } = await import("@/server/db/create");
  const { loadStatsProvider, invalidateStatsCache } = await import("@/server/stats/loader");
  const { championMatchups, championSynergies, championRoleStats } = await import("@/server/db/schema");
  const { and, gte, inArray } = await import("drizzle-orm");
  const h = await createDb();
  const db = h.db;
  const times: number[] = [];
  for (let i = 0; i < 6; i++) {
    invalidateStatsCache();
    const t = performance.now();
    await loadStatsProvider(db);
    times.push(performance.now() - t);
  }
  const q: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await Promise.all([
      db.select().from(championRoleStats).where(inArray(championRoleStats.patch, ["16.20", "16.19"])),
      db.select().from(championMatchups).where(and(inArray(championMatchups.patch, ["16.20", "16.19"]), gte(championMatchups.games, 2))),
      db.select().from(championSynergies).where(and(inArray(championSynergies.patch, ["16.20", "16.19"]), gte(championSynergies.games, 2))),
    ]);
    q.push(performance.now() - t);
  }
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!.toFixed(0);
  console.log(`cold loads (ms): ${times.map((x) => x.toFixed(0)).join(", ")} · median ${med(times.slice(1))}`);
  console.log(`the three big queries alone (ms): ${q.map((x) => x.toFixed(0)).join(", ")} · median ${med(q)}`);
  await h.close();
}
void main();
