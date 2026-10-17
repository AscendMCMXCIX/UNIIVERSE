import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountChampionHistory, accountMastery, accountMatches, matchDetails, matchTimelines, type MatchFrames, type MatchParticipantDetail, appSettings, championBanStats, championMatchups, championRoleStats, championSynergies, champions, players, rankSnapshots, riotAccounts, statPeriods } from "@/server/db/schema";
import { listPlayers } from "@/server/repositories/team";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { ROLES } from "@/domain/roles";
import { getCurrentPatch } from "@/server/repositories/champions";
import { createPlayer, getOrCreateTeam, setLineup } from "@/server/repositories/team";
import { createUser } from "@/server/repositories/users";
import { ensureLocalOwnerAccount, isProductionDeployment } from "@/server/auth/session";
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
  await seedDemoNewcomers(db, team.id, known);
  return { created: DEMO_PLAYERS.length + 2 };
}

/**
 * Two demo members who have not finished their first-time setup, so the demo shows members in
 * every state: "Demo Newcomer" has chosen nothing yet (no role, no champions, no Riot account),
 * "Demo Halfway" has a role and two champions. Both accounts have no password (they cannot sign
 * in) and are members of the team like anyone else.
 */
async function seedDemoNewcomers(db: Db, teamId: string, known: ReadonlySet<string>) {
  // Never on a production deployment: demo accounts stay out of real account lists.
  if (isProductionDeployment()) return;
  // Local development stays open: the automatic local owner exists before any other account.
  await ensureLocalOwnerAccount(db);
  const [newcomer] = await db.insert(players).values({ teamId, displayName: "Demo Newcomer", group: "main", notes: "Demo member who has not finished setup.", sortOrder: 90 }).returning({ id: players.id });
  await createUser(db, { username: "demo-newcomer", displayName: "Demo Newcomer", password: null, role: "player", playerId: newcomer!.id, setupCompletedAt: null });
  const halfway = await createPlayer(db, teamId, { displayName: "Demo Halfway", primaryRole: "ADC", group: "main", notes: "Demo member who has not finished setup.", primaryPool: ["Ashe", "Caitlyn"].filter((c) => known.has(c)) });
  await createUser(db, { username: "demo-halfway", displayName: "Demo Halfway", password: null, role: "player", playerId: halfway.id, setupCompletedAt: null });
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
    // Members still in setup have linked no Riot account yet.
    if (!p.displayName.startsWith("Demo") || p.setupPending) continue;
    const [existing] = await db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.playerId, p.id));
    if (existing) continue;
    const [account] = await db
      .insert(riotAccounts)
      .values({ ownerType: "player", playerId: p.id, gameName: p.displayName, tagLine: "DEMO", platform: "euw1", puuid: `demo-${p.id}`, label: "demo", syncStatus: "demo", lastSyncAt: new Date() })
      .returning({ id: riotAccounts.id });
    if (!p.primaryRole) continue;
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
    await seedDemoRankHistory(db, account!.id, created);
    await seedDemoGames(db, account!.id, `demo-${p.id}`, p.displayName, pools.filter((x): x is { role: Role; pool: string[] } => !!x.role && x.pool.length > 0));
    created += 1;
  }
  if (created) {
    invalidateProficiencyCache();
    await seedDemoTogether(db, team.id);
  }
  void ROLES;
  return { created };
}

/**
 * Demo mode only: a few weeks of synthetic Solo/Duo rank snapshots (with a promotion and a
 * demotion) and one Flex reading, so Ranked progress has something to show. Never real data.
 */
async function seedDemoRankHistory(db: Db, accountId: string, index: number) {
  const day = 86_400_000;
  const start = Date.now() - 35 * day;
  const tiers = ["SILVER", "GOLD", "PLATINUM", "EMERALD", "GOLD"];
  const tier = tiers[index % tiers.length]!;
  const path: Array<[number, string, string, number, number, number]> = [
    [0, tier, "III", 42, 20, 18],
    [4, tier, "III", 71, 22, 19],
    [9, tier, "II", 8, 25, 20],
    [15, tier, "II", 55, 29, 23],
    [19, tier, "III", 80, 30, 27],
    [26, tier, "II", 31, 35, 29],
    [33, tier, "II", 64, 38, 31],
  ];
  await db.insert(rankSnapshots).values([
    ...path.map(([d, t, division, leaguePoints, wins, losses]) => ({ accountId, queue: "solo", tier: t, division, leaguePoints, wins, losses, capturedAt: new Date(start + d * day) })),
    { accountId, queue: "flex", tier: "SILVER", division: "I", leaguePoints: 12, wins: 6, losses: 5, capturedAt: new Date(start + 20 * day) },
  ]);
  // The account's stored rank is the latest Solo/Duo reading, as account sync leaves it, so the
  // profile header and Ranked progress agree.
  const [d, t, division, leaguePoints, wins, losses] = path[path.length - 1]!;
  await db
    .update(riotAccounts)
    .set({ tier: t, division, leaguePoints, rankedWins: wins, rankedLosses: losses, rankQueue: "solo", rankUpdatedAt: new Date(start + d * day) })
    .where(eq(riotAccounts.id, accountId));
}

/**
 * A few synthetic games in which demo players were on the same team (demo mode only), so Team →
 * Matches → Played together has something to show: parties of two to five, one game with a demo
 * player on the other side, and a Ranked Solo/Duo game with three (not all can have queued
 * together). Match ids start DEMO_9; never real Riot data.
 */
async function seedDemoTogether(db: Db, teamId: string) {
  const roster = (await listPlayers(db, teamId)).filter((p) => p.displayName.startsWith("Demo") && p.primaryRole);
  const accounts = await db.select({ id: riotAccounts.id, playerId: riotAccounts.playerId, puuid: riotAccounts.puuid }).from(riotAccounts).where(eq(riotAccounts.label, "demo"));
  const acc = new Map(accounts.map((a) => [a.playerId, a]));
  const byRole = new Map(roster.map((p) => [p.primaryRole!, p]));
  const pick = (roles: Role[]) => roles.map((r) => byRole.get(r)).filter((p): p is NonNullable<typeof p> => !!p && acc.has(p.id));
  const season = await currentSeason(db);
  const now = Date.now();
  const plan: Array<{ blue: Role[]; red?: Role[]; queueId: number; win: boolean; hoursAgo: number }> = [
    { blue: ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"], queueId: 440, win: true, hoursAgo: 20 },
    { blue: ["ADC", "SUPPORT"], queueId: 420, win: true, hoursAgo: 30 },
    { blue: ["ADC", "SUPPORT"], queueId: 420, win: false, hoursAgo: 54 },
    { blue: ["JUNGLE", "MID", "SUPPORT"], queueId: 420, win: true, hoursAgo: 80 },
    { blue: ["TOP", "JUNGLE"], queueId: 400, win: false, hoursAgo: 100 },
    { blue: ["MID", "ADC", "SUPPORT"], red: ["TOP"], queueId: 490, win: true, hoursAgo: 130 },
    { blue: ["TOP", "JUNGLE", "MID", "ADC"], queueId: 440, win: false, hoursAgo: 160 },
    { blue: ["JUNGLE", "SUPPORT"], queueId: 440, win: true, hoursAgo: 190 },
  ];
  const games: Array<typeof accountMatches.$inferInsert> = [];
  const details: Array<typeof matchDetails.$inferInsert> = [];
  plan.forEach((g, i) => {
    const matchId = `DEMO_9${String(1000 + i)}`;
    const gameCreation = now - g.hoursAgo * 3_600_000;
    const duration = 1500 + i * 97;
    const sides = [...pick(g.blue).map((p) => ({ p, teamId: 100 })), ...pick(g.red ?? []).map((p) => ({ p, teamId: 200 }))];
    if (sides.filter((x) => x.teamId === 100).length < 2) return;
    const parts: MatchParticipantDetail[] = [];
    for (const { p, teamId } of sides) {
      const a = acc.get(p.id)!;
      const win = teamId === 100 ? g.win : !g.win;
      const role = p.primaryRole as Role;
      const championId = p.primaryPool[(i + teamId) % Math.max(1, p.primaryPool.length)] ?? p.primaryPool[0]!;
      const kills = 2 + ((i * 3 + role.length) % 7);
      const deaths = 1 + ((i + role.length) % 5);
      const assists = 4 + ((i * 5 + role.length) % 9);
      const cs = role === "SUPPORT" ? 30 + i : 150 + ((i * 17) % 60);
      const damage = 9000 + ((i * 1731 + role.length * 977) % 14000);
      const vision = role === "SUPPORT" ? 60 + i : 18 + i;
      games.push({ accountId: a.id, matchId, gameCreation, queueId: g.queueId, championId, role, win, patch: `${season}.20`, gameDuration: duration, kills, deaths, assists, cs, damage, visionScore: vision });
      parts.push({ puuid: a.puuid!, name: `${p.displayName}#DEMO`, teamId, championId, championKey: 0, champLevel: 15, position: role, win, kills, deaths, assists, cs, gold: 9000 + i * 300, damage, damageTaken: 15000, vision, wardsPlaced: 10, items: null, spells: null, runes: null });
    }
    for (let n = parts.length; n < 10; n++) parts.push({ puuid: `demo-together-${i}-${n}`, name: null, teamId: parts.filter((x) => x.teamId === 100).length < 5 ? 100 : 200, championId: null, championKey: 0, champLevel: 14, position: null, win: false, kills: 3, deaths: 4, assists: 5, cs: 140, gold: 8000, damage: 11000, damageTaken: 14000, vision: 15, wardsPlaced: 8, items: null, spells: null, runes: null });
    details.push({ matchId, platform: "euw1", queueId: g.queueId, gameCreation, gameDuration: duration, gameVersion: `${season}.20.1`, teams: [{ teamId: 100, win: g.win, bans: [], objectives: {} }, { teamId: 200, win: !g.win, bans: [], objectives: {} }], participants: parts });
  });
  if (games.length) await db.insert(accountMatches).values(games).onConflictDoNothing();
  if (details.length) await db.insert(matchDetails).values(details).onConflictDoNothing();
}

/**
 * Synthetic games for a demo account (demo mode only: the in-memory database, or when demo data
 * is asked for explicitly), so Team Leaderboards, season figures and match history have
 * something to show. Deterministic per player; match ids start with DEMO_ and the other nine
 * players are placeholders. Never real Riot data.
 */
/** Demo lane opponents per role (the first ones most often), so Matchups has pairings to show. */
const DEMO_LANE_OPPONENTS: Record<Role, string[]> = {
  TOP: ["Nasus", "Darius", "Garen", "Malphite", "Sett"],
  JUNGLE: ["LeeSin", "Vi", "Sejuani", "Kayn"],
  MID: ["Ahri", "Syndra", "Zed", "Orianna"],
  ADC: ["Jinx", "Kaisa", "Ezreal", "Caitlyn"],
  SUPPORT: ["Thresh", "Leona", "Nautilus", "Lulu"],
};

/**
 * Synthetic gold, experience and CS frames for a demo game (demo mode only): frames a little more
 * than a minute apart and a last frame at the end of the game, like Riot's, with a lane that drifts
 * towards the result. Never real data.
 */
function demoFrames(rnd: () => number, durationSeconds: number, me: string, them: string, role: Role, win: boolean, bias: number): MatchFrames {
  const t: number[] = [0];
  for (let m = 1; m * 60_000 < durationSeconds * 1000; m++) t.push(m * 60_000 + Math.round(rnd() * 400));
  t.push(durationSeconds * 1000);
  const support = role === "SUPPORT";
  const csPerMin = support ? 1.2 : role === "JUNGLE" ? 5.6 : 7.4;
  const series = (lead: number) => {
    let gold = 500;
    let xp = 0;
    let cs = 0;
    let prev = 0;
    const out = { g: [] as number[], x: [] as number[], c: [] as number[] };
    for (const ms of t) {
      const minutes = (ms - prev) / 60_000;
      const minute = ms / 60_000;
      const drift = (lead * Math.min(minute, 25)) / 25;
      gold += minutes * ((support ? 250 : 360) + drift + (rnd() - 0.5) * 60);
      xp += minutes * (minute < 1.5 ? 0 : 420 + drift * 0.5 + (rnd() - 0.5) * 40);
      cs += minute < 1.5 ? 0 : minutes * (csPerMin + drift / 120 + (rnd() - 0.5) * 0.6);
      out.g.push(Math.round(gold));
      out.x.push(Math.round(xp));
      out.c.push(Math.max(0, Math.round(cs)));
      prev = ms;
    }
    return out;
  };
  const edge = (win ? 30 : -30) + bias;
  return { t, p: { [me]: series(edge / 2), [them]: series(-edge / 2) } };
}

async function seedDemoGames(db: Db, accountId: string, puuid: string, name: string, pools: Array<{ role: Role; pool: string[] }>) {
  if (pools.length === 0) return;
  // A second sequence for the lane opponents and frames, so the games themselves stay as before.
  let laneSeed = [...name].reduce((s, c) => s + c.charCodeAt(0) * 3, 11);
  const laneRnd = () => ((laneSeed = (laneSeed * 9301 + 49297) % 233280), laneSeed / 233280);
  const timelines: Array<typeof matchTimelines.$inferInsert> = [];
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
    const laneOptions = DEMO_LANE_OPPONENTS[role];
    const opponentIndex = Math.min(laneOptions.length - 1, Math.floor(laneRnd() * laneRnd() * laneOptions.length));
    const enemyChampionId = laneOptions[opponentIndex]!;
    games.push({ accountId, matchId, gameCreation, queueId, championId, role, win, enemyChampionId, patch: `${season}.${Math.max(1, 20 - Math.floor((count - i) / 3))}`, gameDuration: duration, kills, deaths, assists, cs, damage, visionScore: vision });
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
    // The lane opponent: the enemy in the same position.
    const lane = `demo-lane-${puuid.slice(5, 13)}-${i}`;
    enemies[0] = { ...enemies[0]!, puuid: lane, championId: enemyChampionId, position: role };
    // Most demo games have a timeline; every sixth is left "still to be collected".
    if (i % 6 !== 5) timelines.push({ matchId, platform: "euw1", participants: [], frames: demoFrames(laneRnd, duration, puuid, lane, role, win, (opponentIndex - 1) * 25) });
    details.push({ matchId, platform: "euw1", queueId, gameCreation, gameDuration: duration, gameVersion: `${season}.20.1`, teams: [{ teamId: 100, win, bans: [], objectives: {} }, { teamId: 200, win: !win, bans: [], objectives: {} }], participants: [me, ...allies, ...enemies] });
  }
  await db.insert(accountMatches).values(games).onConflictDoNothing();
  await db.insert(matchDetails).values(details).onConflictDoNothing();
  if (timelines.length) await db.insert(matchTimelines).values(timelines).onConflictDoNothing();
}
