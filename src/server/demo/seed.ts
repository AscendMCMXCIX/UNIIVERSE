import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountChampionHistory, accountMastery, appSettings, championBanStats, championMatchups, championRoleStats, championSynergies, champions, players, riotAccounts, statPeriods } from "@/server/db/schema";
import { listPlayers } from "@/server/repositories/team";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { ROLES } from "@/domain/roles";
import { getCurrentPatch } from "@/server/repositories/champions";
import { createPlayer, getOrCreateTeam, setLineup } from "@/server/repositories/team";
import { generateDemoStats } from "./demo-stats";
import { bumpStatsVersion } from "@/server/stats/loader";

/**
 * Demo roster: clearly labelled sample players so Team Setup, lineup and the draft room can be
 * explored before real players are entered. Names are obviously placeholders.
 */
const DEMO_PLAYERS = [
  { displayName: "Demo Top", primaryRole: "TOP", secondaryRole: "MID", primaryPool: ["Gwen", "KSante", "Jax", "Renekton", "Gnar", "Ornn"], secondaryPool: ["Galio", "Sylas"], group: "main" },
  { displayName: "Demo Jungle", primaryRole: "JUNGLE", secondaryRole: null, primaryPool: ["Viego", "Sejuani", "Vi", "LeeSin", "Nocturne", "Maokai"], secondaryPool: [], group: "main" },
  { displayName: "Demo Mid", primaryRole: "MID", secondaryRole: "TOP", primaryPool: ["Orianna", "Ahri", "Azir", "Taliyah", "Syndra", "Galio"], secondaryPool: ["Jax", "Rumble"], group: "main" },
  { displayName: "Demo ADC", primaryRole: "ADC", secondaryRole: "SUPPORT", primaryPool: ["Jinx", "Kaisa", "Ezreal", "Xayah", "Varus", "Sivir"], secondaryPool: ["Nautilus", "Rakan"], group: "main" },
  { displayName: "Demo Support", primaryRole: "SUPPORT", secondaryRole: "ADC", primaryPool: ["Nautilus", "Rakan", "Alistar", "Lulu", "Braum", "Rell"], secondaryPool: ["Jhin", "Varus"], group: "main" },
  { displayName: "Demo Sub (Top)", primaryRole: "TOP", secondaryRole: null, primaryPool: ["Sion", "Malphite", "Ornn", "Mordekaiser"], secondaryPool: [], group: "main" },
  { displayName: "Demo Sub (Support)", primaryRole: "SUPPORT", secondaryRole: "MID", primaryPool: ["Thresh", "Leona", "Milio", "Karma"], secondaryPool: ["Lux", "Hwei"], group: "main" },
] as const;

export async function seedDemoRoster(db: Db): Promise<{ created: number }> {
  const team = await getOrCreateTeam(db);
  const [existing] = await db.select({ n: sql<number>`count(*)` }).from(players).where(eq(players.teamId, team.id));
  if (Number(existing?.n ?? 0) > 0) return { created: 0 };
  const known = new Set((await db.select({ id: champions.id }).from(champions)).map((c) => c.id));
  const created: Record<string, string> = {};
  for (const p of DEMO_PLAYERS) {
    const record = await createPlayer(
      db,
      team.id,
      {
        displayName: p.displayName,
        primaryRole: p.primaryRole,
        secondaryRole: p.secondaryRole,
        group: p.group,
        notes: "Demo player — replace with your real roster.",
        primaryPool: p.primaryPool.filter((c) => known.has(c)),
        secondaryPool: p.secondaryPool.filter((c) => known.has(c)),
      },
    );
    created[p.displayName] = record.id;
  }
  await setLineup(db, team.id, {
    TOP: created["Demo Top"]!,
    JUNGLE: created["Demo Jungle"]!,
    MID: created["Demo Mid"]!,
    ADC: created["Demo ADC"]!,
    SUPPORT: created["Demo Support"]!,
  });
  return { created: DEMO_PLAYERS.length };
}

/** Writes synthetic demo statistics for the current patch unless real statistics already exist. */
export async function seedDemoStats(db: Db): Promise<{ seeded: boolean; reason?: string }> {
  const current = await getCurrentPatch(db);
  if (!current) return { seeded: false, reason: "No current patch yet" };
  const [real] = await db.select({ n: sql<number>`count(*)` }).from(statPeriods).where(sql`${statPeriods.source} <> 'demo' AND ${statPeriods.games} > 0`);
  if (Number(real?.n ?? 0) > 0) return { seeded: false, reason: "Real statistics exist" };
  const [existing] = await db.select().from(statPeriods).where(and(eq(statPeriods.patch, current.patch), eq(statPeriods.source, "demo")));
  if (existing) return { seeded: false, reason: "Demo statistics already present" };

  const known = new Set((await db.select({ id: champions.id }).from(champions)).map((c) => c.id));
  const demo = generateDemoStats();
  const patch = current.patch;
  await db.transaction(async (tx) => {
    await tx.insert(statPeriods).values({ patch, source: "demo", games: demo.totalGames, updatedAt: new Date() }).onConflictDoNothing();
    const chunk = async <T>(rows: T[], fn: (batch: T[]) => Promise<unknown>) => {
      for (let i = 0; i < rows.length; i += 500) await fn(rows.slice(i, i + 500));
    };
    await chunk(
      demo.roleStats.filter((r) => known.has(r.championId)).map((r) => ({ patch, source: "demo" as const, ...r })),
      (batch) => tx.insert(championRoleStats).values(batch).onConflictDoNothing(),
    );
    await chunk(
      demo.bans.filter((r) => known.has(r.championId)).map((r) => ({ patch, source: "demo" as const, ...r })),
      (batch) => tx.insert(championBanStats).values(batch).onConflictDoNothing(),
    );
    await chunk(
      demo.matchups.filter((r) => known.has(r.championId) && known.has(r.enemyChampionId)).map((r) => ({ patch, source: "demo" as const, ...r })),
      (batch) => tx.insert(championMatchups).values(batch).onConflictDoNothing(),
    );
    await chunk(
      demo.synergies.filter((r) => known.has(r.championAId) && known.has(r.championBId)).map((r) => ({ patch, source: "demo" as const, ...r })),
      (batch) => tx.insert(championSynergies).values(batch).onConflictDoNothing(),
    );
    await tx.insert(appSettings).values({ key: "demo_stats_seeded", value: true, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value: true, updatedAt: new Date() } });
  });
  await bumpStatsVersion(db);
  return { seeded: true };
}

export async function clearDemoStats(db: Db) {
  await db.delete(championRoleStats).where(eq(championRoleStats.source, "demo"));
  await db.delete(championBanStats).where(eq(championBanStats.source, "demo"));
  await db.delete(championMatchups).where(eq(championMatchups.source, "demo"));
  await db.delete(championSynergies).where(eq(championSynergies.source, "demo"));
  await db.delete(statPeriods).where(eq(statPeriods.source, "demo"));
  await bumpStatsVersion(db);
}

/**
 * Demo linked accounts with synthetic champion history so proficiency tiers are visible before a
 * Riot key exists. Labelled "demo" and never synced against Riot.
 */
export async function seedDemoAccounts(db: Db): Promise<{ created: number }> {
  const team = await getOrCreateTeam(db);
  const roster = await listPlayers(db, team.id);
  let created = 0;
  for (const p of roster) {
    if (!p.displayName.startsWith("Demo")) continue;
    const [existing] = await db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.playerId, p.id));
    if (existing) continue;
    const [account] = await db
      .insert(riotAccounts)
      .values({ ownerType: "player", playerId: p.id, gameName: p.displayName, tagLine: "DEMO", platform: "euw1", puuid: `demo-${p.id}`, label: "demo", syncStatus: "demo", lastSyncAt: new Date() })
      .returning({ id: riotAccounts.id });
    const pools = [{ role: p.primaryRole, pool: p.primaryPool }, ...(p.secondaryRole ? [{ role: p.secondaryRole, pool: p.secondaryPool }] : [])];
    const now = Date.now();
    let seed = p.displayName.length;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280), seed / 233280);
    for (const { role, pool } of pools) {
      pool.forEach(async (championId, i) => {
        const games = Math.max(2, Math.round((pool.length - i) * 14 * (0.6 + rnd())));
        const daysAgo = i < 3 ? Math.round(rnd() * 20) : Math.round(30 + rnd() * 200);
        const wins = Math.round(games * (0.46 + rnd() * 0.1));
        await db.insert(accountChampionHistory).values({ accountId: account!.id, championId, role, queueGroup: "flex", patch: "0.0", games, wins, lastPlayedAt: new Date(now - daysAgo * 86_400_000) }).onConflictDoNothing();
        await db.insert(accountMastery).values({ accountId: account!.id, championId, points: games * 4500, level: Math.min(10, 3 + Math.floor(games / 10)), lastPlayedAt: new Date(now - daysAgo * 86_400_000) }).onConflictDoNothing();
      });
    }
    created += 1;
  }
  if (created) invalidateProficiencyCache();
  void ROLES;
  return { created };
}
