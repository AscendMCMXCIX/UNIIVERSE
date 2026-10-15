import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountChampionHistory, accountMastery, accountMatches, matchDetails, type MatchParticipantDetail, appSettings, championBanStats, championMatchups, championRoleStats, championSynergies, champions, players, riotAccounts, statPeriods } from "@/server/db/schema";
import { listPlayers } from "@/server/repositories/team";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { ROLES } from "@/domain/roles";
import { getCurrentPatch } from "@/server/repositories/champions";
import { createPlayer, getOrCreateTeam, setLineup } from "@/server/repositories/team";
import { generateDemoStats } from "./demo-stats";
import { bumpStatsVersion } from "@/server/stats/loader";
import { currentSeason } from "@/server/accounts/sync";
import type { Role } from "@/domain/roles";

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
    await seedDemoGames(db, account!.id, `demo-${p.id}`, p.displayName, pools.filter((x): x is { role: Role; pool: string[] } => !!x.role && x.pool.length > 0));
    created += 1;
  }
  if (created) invalidateProficiencyCache();
  void ROLES;
  return { created };
}

/**
 * Synthetic games for a demo account (demo mode only: the in-memory database, or when demo data
 * is asked for explicitly), so Team Leaderboards, season figures and match history have
 * something to show. Deterministic per player; match ids start with DEMO_ and the other nine
 * players are placeholders. Never real Riot data.
 */
async function seedDemoGames(db: Db, accountId: string, puuid: string, name: string, pools: Array<{ role: Role; pool: string[] }>) {
  if (pools.length === 0) return;
  const season = await currentSeason(db);
  let seed = [...name].reduce((s, c) => s + c.charCodeAt(0), 7);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280), seed / 233280);
  const int = (lo: number, hi: number) => Math.round(lo + rnd() * (hi - lo));
  const count = int(24, 48);
  const skill = 0.44 + rnd() * 0.14;
  const now = Date.now();
  const games: Array<typeof accountMatches.$inferInsert> = [];
  const details: Array<typeof matchDetails.$inferInsert> = [];
  for (let i = 0; i < count; i++) {
    const { role, pool } = pools.length > 1 && rnd() < 0.2 ? pools[1]! : pools[0]!;
    const championId = pool[Math.min(pool.length - 1, Math.floor(rnd() * rnd() * pool.length))]!;
    const duration = int(1450, 2350);
    const minutes = duration / 60;
    const win = rnd() < skill;
    const support = role === "SUPPORT";
    const jungle = role === "JUNGLE";
    const kills = support ? int(0, 4) : int(1, win ? 12 : 8);
    const deaths = int(1, win ? 6 : 9);
    const assists = support ? int(8, 22) : jungle ? int(4, 14) : int(2, 11);
    const cs = support ? int(15, 45) : Math.round(minutes * (jungle ? 5.4 + rnd() * 1.6 : 6.2 + rnd() * 2.6));
    const damage = Math.round(minutes * (support ? 260 + rnd() * 200 : 520 + rnd() * 520));
    const vision = Math.round(minutes * (support ? 2.1 + rnd() * 1.1 : jungle ? 1.0 + rnd() * 0.6 : 0.6 + rnd() * 0.5));
    const matchId = `DEMO_${puuid.slice(5, 13)}_${i}`;
    const gameCreation = now - (count - i) * 86_400_000 * 1.6 - int(0, 40_000_000);
    const queueId = rnd() < 0.7 ? 420 : 440;
    games.push({ accountId, matchId, gameCreation, queueId, championId, role, win, patch: `${season}.${Math.max(1, 20 - Math.floor((count - i) / 3))}`, gameDuration: duration, kills, deaths, assists, cs, damage, visionScore: vision });
    const teamKills = kills + assists + int(2, 10);
    const filler = (n: number, teamId: number, ally: boolean): MatchParticipantDetail => ({ puuid: `demo-filler-${n}`, name: null, teamId, championId: null, championKey: 0, champLevel: 15, position: null, win: ally ? win : !win, kills: ally ? Math.round((teamKills - kills) / 4) : int(2, 8), deaths: int(1, 7), assists: int(2, 12), cs: int(30, 240), gold: int(7000, 14000), damage: int(6000, 26000), damageTaken: int(9000, 30000), vision: int(10, 50), wardsPlaced: int(4, 20), items: null, spells: null, runes: null });
    const me: MatchParticipantDetail = {
      puuid,
      name: `${name}#DEMO`,
      teamId: 100,
      championId,
      championKey: 0,
      champLevel: 16,
      position: role,
      win,
      kills,
      deaths,
      assists,
      cs,
      gold: Math.round(minutes * (support ? 260 : 380 + rnd() * 90)),
      damage,
      damageTaken: int(12000, 32000),
      vision,
      wardsPlaced: support ? int(14, 36) : int(5, 14),
      items: null,
      spells: null,
      runes: null,
      stats: {
        doubleKills: kills >= 3 ? int(0, 2) : 0,
        tripleKills: kills >= 6 && rnd() < 0.35 ? 1 : 0,
        quadraKills: kills >= 9 && rnd() < 0.25 ? 1 : 0,
        pentaKills: kills >= 10 && rnd() < 0.2 ? 1 : 0,
        firstBloodKill: rnd() < (jungle ? 0.25 : 0.1),
        wardsKilled: support || jungle ? int(2, 9) : int(0, 4),
        controlWardsBought: support ? int(3, 7) : int(0, 3),
        objectiveDamage: jungle ? int(18000, 42000) : int(2000, 14000),
        buildingDamage: role === "TOP" || role === "ADC" ? int(3000, 11000) : int(500, 5000),
        turretTakedowns: int(0, 4),
        ccSeconds: support ? int(25, 70) : int(5, 35),
        soloKills: role === "TOP" || role === "MID" ? int(0, 3) : int(0, 1),
      },
    };
    const allies = [1, 2, 3, 4].map((n) => filler(n, 100, true));
    const enemies = [5, 6, 7, 8, 9].map((n) => filler(n, 200, false));
    details.push({ matchId, platform: "euw1", queueId, gameCreation, gameDuration: duration, gameVersion: `${season}.20.1`, teams: [{ teamId: 100, win, bans: [], objectives: {} }, { teamId: 200, win: !win, bans: [], objectives: {} }], participants: [me, ...allies, ...enemies] });
  }
  await db.insert(accountMatches).values(games).onConflictDoNothing();
  await db.insert(matchDetails).values(details).onConflictDoNothing();
}
