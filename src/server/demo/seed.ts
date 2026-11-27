import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountChampionHistory, accountMastery, accountMatches, brandAssets, matchDetails, matchTimelines, type MatchEvents, type MatchFrames, type MatchObjectiveEvent, type MatchParticipantDetail, champions, playerChampionPools, players, rankSnapshots, riotAccounts, users } from "@/server/db/schema";
import { listPlayers } from "@/server/repositories/team";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { ROLES } from "@/domain/roles";
import { createPlayer, getOrCreateTeam, setLineup, setLineupSubstitute } from "@/server/repositories/team";
import { createUser, findUserByUsername, setTemporaryPassword } from "@/server/repositories/users";
import { ensureLocalOwnerAccount, isProductionDeployment } from "@/server/auth/session";
import { VERIFY_DISPLAY_NAME, VERIFY_USERNAME } from "@/server/auth/verification-account";
import { randomToken } from "@/server/auth/password";
import { demoBackdropPng } from "./backdrop-art";
import { invalidateCache } from "@/server/observability/cache";
import { currentSeason } from "@/server/accounts/sync";
import { summariseMatches } from "@/server/accounts/match-summary";
import type { Role } from "@/domain/roles";

/**
 * Demo roster: clearly labelled sample players so Team Setup, lineup and statistics can be
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
  // Two designated substitutes, so the demo shows cards that turn over (Jungle, Mid and Bottom have none).
  await setLineupSubstitute(db, team.id, "TOP", created["Demo Sub (Top)"]!);
  await setLineupSubstitute(db, team.id, "SUPPORT", created["Demo Sub (Support)"]!);
  // Synthetic social links (domain/social-links), switched on and off, so the cards, the public
  // page and the substitute side show them: Mid has YouTube and Discord shown publicly and Twitch
  // off; the Support substitute their Twitch shown; Support a Discord kept off, which must show nowhere.
  const social = (playerId: string, socialLinks: typeof players.$inferInsert.socialLinks) => db.update(players).set({ socialLinks }).where(eq(players.id, playerId));
  await social(created["Demo Mid"]!, { youtube: { value: "https://www.youtube.com/@DemoMidChannel", public: true }, twitch: { value: "https://www.twitch.tv/demo_mid_live", public: false }, discord: { value: "demo.mid", public: true } });
  await social(created["Demo Sub (Support)"]!, { twitch: { value: "https://www.twitch.tv/demo_sub_support", public: true } });
  await social(created["Demo Support"]!, { discord: { value: "demo.support.private", public: false } });
  await seedDemoNewcomers(db, team.id, known);
  return { created: DEMO_PLAYERS.length + 2 };
}

/**
 * Two demo members who have not finished their first-time setup, so the demo shows members in
 * every state: "Demo Newcomer" has chosen nothing yet (no role, no champions, no Riot account),
 * "Demo Halfway" has a role and two champions. Neither can sign in: Demo Halfway has no password,
 * and Demo Newcomer's temporary password expired unused. Both are members of the team like anyone
 * else.
 */
async function seedDemoNewcomers(db: Db, teamId: string, known: ReadonlySet<string>) {
  // Never on a production deployment: demo accounts stay out of real account lists.
  if (isProductionDeployment()) return;
  // Local development stays open: the automatic local owner exists before any other account.
  await ensureLocalOwnerAccount(db);
  const [newcomer] = await db.insert(players).values({ teamId, displayName: "Demo Newcomer", group: "main", notes: "Demo member who has not finished setup.", sortOrder: 90 }).returning({ id: players.id });
  const newcomerUser = await createUser(db, { username: "demo-newcomer", displayName: "Demo Newcomer", password: null, role: "player", playerId: newcomer!.id, setupCompletedAt: null });
  // A temporary password issued a month ago and never used: the Dashboard's "Needs you" has an expired one to show.
  await setTemporaryPassword(db, newcomerUser.id, { now: new Date(Date.now() - 30 * 86_400_000) });
  const halfway = await createPlayer(db, teamId, { displayName: "Demo Halfway", primaryRole: "ADC", group: "main", notes: "Demo member who has not finished setup.", primaryPool: ["Ashe", "Caitlyn"].filter((c) => known.has(c)) });
  await createUser(db, { username: "demo-halfway", displayName: "Demo Halfway", password: null, role: "player", playerId: halfway.id, setupCompletedAt: null });
}

/**
 * Demo linked accounts with synthetic champion history so proficiency tiers are visible before a
 * Riot key exists. Labelled "demo" and never synced against Riot. `fullRoster` is the full-roster
 * layout check's half of the seed (every substitute's game with its multikill counts: see
 * applyFullRosterFixture), decided by the caller (bootstrap: the flag on an in-memory demo only),
 * never read from the environment here: a file or Postgres demo seeded once with the flag kept half
 * a full roster (the substitutes' counts, no games for the members in setup) after it was removed.
 */
export async function seedDemoAccounts(db: Db, { fullRoster = false }: { fullRoster?: boolean } = {}): Promise<{ created: number }> {
  const allCounts = fullRoster && !isProductionDeployment();
  const team = await getOrCreateTeam(db);
  const roster = await listPlayers(db, team.id);
  let created = 0;
  const gone: string[] = [];
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
    gone.push(...(await seedDemoGames(db, account!.id, `demo-${p.id}`, p.displayName, pools.filter((x): x is { role: Role; pool: string[] } => !!x.role && x.pool.length > 0), { allCounts })));
    await seedDemoRankHistory(db, account!.id, created);
    created += 1;
  }
  if (created) {
    invalidateProficiencyCache();
    await seedDemoTogether(db, team.id);
    // Each game's figures from its record (multikills, gold, the team's kills), as a real sync
    // stores them, so the profile and Leaderboards have them from the first view.
    await summariseMatches(db);
    // What the figures backfill records for a game whose record Riot no longer provides.
    if (gone.length) await db.update(accountMatches).set({ extraStats: sql`'{}'::jsonb` }).where(inArray(accountMatches.matchId, gone));
  }
  void ROLES;
  return { created };
}

/**
 * Demo mode only: synthetic rank readings that agree with the demo games, as the rank watch would
 * have taken them, so Ranked progress and the LP on match cards have something real-shaped to
 * show. Never real data. Each queue's readings start part-way through its games (the earlier ones
 * are "before tracking"); then a reading is confirmed during each game and the new rank is read a
 * few minutes after it ends, with LP moving by plausible amounts, a promotion when it passes 100
 * and a demotion (to 75 LP) below 0. Some games are left without a reading after them, so the next
 * reading spans two games (a gap the chart and the cards show), and one is read too late.
 */
async function seedDemoRankHistory(db: Db, accountId: string, index: number) {
  const games = await db
    .select({ gameCreation: accountMatches.gameCreation, gameDuration: accountMatches.gameDuration, queueId: accountMatches.queueId, win: accountMatches.win })
    .from(accountMatches)
    .where(and(eq(accountMatches.accountId, accountId), inArray(accountMatches.queueId, [420, 440])))
    .orderBy(asc(accountMatches.gameCreation));
  const tiers = ["SILVER", "GOLD", "PLATINUM", "EMERALD", "GOLD"] as const;
  const order = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"] as const;
  const divisions = ["IV", "III", "II", "I"] as const;
  const rows: Array<typeof rankSnapshots.$inferInsert> = [];
  let latest: { queue: "solo" | "flex"; tier: string; division: string; lp: number; wins: number; losses: number; at: number } | null = null;
  for (const [queue, queueId] of [["solo", 420], ["flex", 440]] as const) {
    const list = games.filter((g) => g.queueId === queueId && (g.gameDuration ?? 0) >= 300);
    if (list.length < 3) continue;
    const first = Math.floor(list.length * 0.4);
    let t = order.indexOf(queue === "solo" ? tiers[index % tiers.length]! : "SILVER");
    let d = 1;
    let lp = 42;
    // Riot's count covers the whole ranked year: games before the stored ones are in it too.
    let wins = 31 + list.slice(0, first).filter((g) => g.win).length;
    let losses = 29 + list.slice(0, first).filter((g) => !g.win).length;
    const minute = 60_000;
    const endOf = (g: (typeof list)[number]) => g.gameCreation + (g.gameDuration ?? 0) * 1000;
    let row: typeof rankSnapshots.$inferInsert = { accountId, queue, tier: order[t]!, division: divisions[d]!, leaguePoints: lp, wins, losses, capturedAt: new Date(list[first]!.gameCreation - 30 * minute), confirmedAt: new Date(list[first]!.gameCreation + 10 * minute) };
    rows.push(row);
    for (let k = first; k < list.length; k++) {
      const g = list[k]!;
      const delta = g.win ? 17 + ((k * 7) % 10) : -(14 + ((k * 5) % 9));
      lp += delta;
      if (g.win) wins += 1;
      else losses += 1;
      if (lp >= 100) {
        lp -= 100;
        if (d === 3) {
          t = Math.min(order.length - 1, t + 1);
          d = 0;
        } else d += 1;
      } else if (lp < 0) {
        lp = 75;
        if (d === 0) {
          t = Math.max(0, t - 1);
          d = 3;
        } else d -= 1;
      }
      const next = list[k + 1];
      // Every seventh game: no reading after it, so the next one spans two games.
      if (k % 7 === 3 && next) continue;
      // One game read late (after the game's quiet hour), which proves nothing.
      const late = k % 11 === 5 && (!next || next.gameCreation - endOf(g) > 90 * minute);
      const at = endOf(g) + (late ? 45 : 3) * minute;
      row = { accountId, queue, tier: order[t]!, division: divisions[d]!, leaguePoints: lp, wins, losses, capturedAt: new Date(at), confirmedAt: next ? new Date(next.gameCreation + 10 * minute) : new Date(at + 5 * minute) };
      rows.push(row);
    }
    const last = rows.at(-1)!;
    if (queue === "solo" || !latest) latest = { queue, tier: last.tier!, division: last.division!, lp: last.leaguePoints!, wins: last.wins!, losses: last.losses!, at: (last.confirmedAt ?? last.capturedAt!).getTime() };
  }
  if (rows.length) await db.insert(rankSnapshots).values(rows);
  // The account's stored rank is the latest Solo/Duo reading (else Flex), as account sync leaves it,
  // so the profile header and Ranked progress agree.
  if (latest)
    await db
      .update(riotAccounts)
      .set({ tier: latest.tier, division: latest.division, leaguePoints: latest.lp, rankedWins: latest.wins, rankedLosses: latest.losses, rankQueue: latest.queue, rankUpdatedAt: new Date(latest.at) })
      .where(eq(riotAccounts.id, accountId));
}

/**
 * The other players of a synthetic demo game: a champion each (no champion twice in one game) and
 * a plainly synthetic name ("Demo Ally 2", "Demo Rival 4"), so match lists can show both teams.
 */
const DEMO_OTHERS = ["Garen", "Darius", "Malphite", "Leona", "Lux", "Ashe", "Caitlyn", "Morgana", "Annie", "Ezreal", "Thresh", "Yasuo", "Zed", "Lulu", "Nami", "Sona", "Shen", "Fiora", "Graves", "Kindred", "Ekko", "Zeri", "Milio", "Pyke", "Kayn", "Hecarim", "Diana", "Akali", "Irelia", "Senna"];
function demoOther(game: number, slot: number, taken: Set<string>): string {
  let k = (game * 7 + slot * 3) % DEMO_OTHERS.length;
  while (taken.has(DEMO_OTHERS[k]!)) k = (k + 1) % DEMO_OTHERS.length;
  taken.add(DEMO_OTHERS[k]!);
  return DEMO_OTHERS[k]!;
}
const demoOtherName = (ally: boolean, slot: number) => `Demo ${ally ? "Ally" : "Rival"} ${slot}#DEMO`;

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
      // Riot's multikill counts, as every stored record since Team Leaderboards carries them (the more kills, the larger).
      const largest = kills >= 8 ? 4 : kills >= 6 ? 3 : kills >= 4 ? 2 : 1;
      const stats = { doubleKills: largest >= 2 ? 1 : 0, tripleKills: largest >= 3 ? 1 : 0, quadraKills: largest >= 4 ? 1 : 0, pentaKills: 0, largestMultiKill: largest };
      parts.push({ puuid: a.puuid!, name: `${p.displayName}#DEMO`, teamId, championId, championKey: 0, champLevel: 15, position: role, win, kills, deaths, assists, cs, gold: 9000 + i * 300, damage, damageTaken: 15000, vision, wardsPlaced: 10, items: null, spells: null, runes: null, stats });
    }
    const taken = new Set(parts.map((x) => x.championId!).filter(Boolean));
    for (let n = parts.length; n < 10; n++) {
      const teamId = parts.filter((x) => x.teamId === 100).length < 5 ? 100 : 200;
      parts.push({ puuid: `demo-together-${i}-${n}`, name: demoOtherName(teamId === 100, n), teamId, championId: demoOther(i, n, taken), championKey: 0, champLevel: 14, position: null, win: teamId === 100 ? g.win : !g.win, kills: 3, deaths: 4, assists: 5, cs: 140, gold: 8000, damage: 11000, damageTaken: 14000, vision: 15, wardsPlaced: 8, items: null, spells: null, runes: null });
    }
    balanceTogetherGame(parts, duration / 60, i);
    // Everyone's build, summoner spells and runes (these games have no timeline: a sequence of the
    // game's own). The members play their roles; the others take their side's open roles in order.
    const ownRnd = demoGameRnd(matchId);
    for (const team of [100, 200]) {
      const side = parts.filter((x) => x.teamId === team);
      const open = (["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as Role[]).filter((r) => !side.some((x) => x.position === r));
      for (const x of side) {
        const own = x.position !== null;
        const role = (x.position as Role | null) ?? open.shift() ?? "MID";
        giveDemoLoadout(x, role, demoBuild(ownRnd, duration, role).purchases, duration);
        if (!own) giveDemoOtherFigures(x, role, matchId);
      }
    }
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
 * towards the result. The player and the lane opponent come from `rnd` (as they always have, so the
 * Matchups demo reads the same); the other eight players, when given, from their own sequence, so
 * the whole game's gold can be drawn. Never real data.
 */
function demoFrames(rnd: () => number, durationSeconds: number, me: string, them: string, role: Role, win: boolean, bias: number, others: { rnd: () => number; players: Array<{ puuid: string; ally: boolean; role: Role }> } | null = null): MatchFrames {
  const t: number[] = [0];
  for (let m = 1; m * 60_000 < durationSeconds * 1000; m++) t.push(m * 60_000 + Math.round(rnd() * 400));
  t.push(durationSeconds * 1000);
  const series = (lead: number, playerRole: Role, r: () => number) => {
    const support = playerRole === "SUPPORT";
    const csPerMin = support ? 1.2 : playerRole === "JUNGLE" ? 5.6 : 7.4;
    let gold = 500;
    let xp = 0;
    let cs = 0;
    let prev = 0;
    const out = { g: [] as number[], x: [] as number[], c: [] as number[] };
    for (const ms of t) {
      const minutes = (ms - prev) / 60_000;
      const minute = ms / 60_000;
      const drift = (lead * Math.min(minute, 25)) / 25;
      gold += minutes * ((support ? 250 : 360) + drift + (r() - 0.5) * 60);
      xp += minutes * (minute < 1.5 ? 0 : 420 + drift * 0.5 + (r() - 0.5) * 40);
      cs += minute < 1.5 ? 0 : minutes * (csPerMin + drift / 120 + (r() - 0.5) * 0.6);
      out.g.push(Math.round(gold));
      out.x.push(Math.round(xp));
      out.c.push(Math.max(0, Math.round(cs)));
      prev = ms;
    }
    return out;
  };
  const edge = (win ? 30 : -30) + bias;
  const p: MatchFrames["p"] = { [me]: series(edge / 2, role, rnd), [them]: series(-edge / 2, role, rnd) };
  // The rest of both teams drift with the result too, each a little differently.
  for (const o of others?.players ?? []) p[o.puuid] = series(((o.ally === win ? 1 : -1) * (10 + others!.rnd() * 30)) / 2, o.role, others!.rnd);
  return { t, p };
}

/** Riot's experience to reach each champion level (index 1 is level 1), for demo frames that end on the recorded level. */
const XP_TO_LEVEL = [0, 0, 280, 660, 1140, 1720, 2400, 3180, 4060, 5040, 6120, 7300, 8580, 9960, 11440, 13020, 14700, 16480, 18360];

/**
 * Demo frames end where the game's record does (demo mode only): each player's last frame holds
 * their recorded gold, CS and a level's worth of experience, the curve keeping its shape. Without
 * this the timeline told a different game from the scoreboard (the gold difference at the end
 * against the teams' recorded gold). Real timelines come from Riot and are never changed.
 */
function fitFramesToRecord(frames: MatchFrames, parts: readonly MatchParticipantDetail[]): MatchFrames {
  const p: MatchFrames["p"] = { ...frames.p };
  const fit = (series: number[], from: number, to: number | null) => {
    const end = series[series.length - 1];
    if (to === null || end === undefined || end <= from) return series;
    return series.map((v) => Math.round(from + ((v - from) * (to - from)) / (end - from)));
  };
  for (const x of parts) {
    const s = p[x.puuid];
    if (!s) continue;
    const level = x.champLevel === null ? null : Math.max(1, Math.min(18, x.champLevel));
    p[x.puuid] = { g: fit(s.g, 500, x.gold), x: fit(s.x, 0, level === null ? null : XP_TO_LEVEL[level]! + (level < 18 ? 0.4 * (XP_TO_LEVEL[level + 1]! - XP_TO_LEVEL[level]!) : 400)), c: fit(s.c, 0, x.cs) };
  }
  return { t: frames.t, p };
}

/** `total` shared out over `players` unevenly but deterministically (the game's number turns the weights). */
function shareOut(total: number, players: MatchParticipantDetail[], key: "kills" | "deaths", turn: number) {
  const weights = players.map((_, k) => 1 + ((k + turn) % 3));
  const whole = weights.reduce((n, w) => n + w, 0);
  const shares = weights.map((w) => Math.floor((total * w) / whole));
  for (let k = 0, rest = total - shares.reduce((n, v) => n + v, 0); rest > 0; k++, rest--) shares[(k + turn) % shares.length]! += 1;
  players.forEach((x, k) => (x[key] = shares[k]!));
}

/**
 * A demo game several members played (demo mode only): the members' own figures are their stored
 * games, so the other players' make the sides add up. Each side kills at least as many as any of its
 * members took part in, one side's deaths are the other side's kills, and the others' gold follows
 * their kills, assists and the result.
 */
function balanceTogetherGame(parts: MatchParticipantDetail[], minutes: number, turn: number) {
  const other = (x: MatchParticipantDetail) => x.puuid.startsWith("demo-together-");
  const side = (team: number) => parts.filter((x) => x.teamId === team);
  const sum = (xs: MatchParticipantDetail[], key: "kills" | "deaths") => xs.reduce((n, x) => n + x[key], 0);
  for (const team of [100, 200]) {
    const fillers = side(team).filter(other);
    if (!fillers.length) continue;
    const needed = Math.max(0, ...side(team).filter((x) => !other(x)).map((x) => x.kills + x.assists));
    for (let k = 0; sum(side(team), "kills") < needed; k++) fillers[k % fillers.length]!.kills += 1;
  }
  for (const team of [100, 200]) {
    const enemy = team === 100 ? 200 : 100;
    const fixed = sum(side(team).filter((x) => !other(x)), "deaths");
    const fillers = side(team).filter(other);
    const enemyFillers = side(enemy).filter(other);
    // The other side made at least the kills behind this side's members' own deaths, and exactly as many as this side's deaths when no one here can take the rest.
    for (let k = 0; enemyFillers.length && sum(side(enemy), "kills") < fixed; k++) enemyFillers[k % enemyFillers.length]!.kills += 1;
    if (!fillers.length && enemyFillers.length) shareOut(fixed - sum(side(enemy).filter((x) => !other(x)), "kills"), enemyFillers, "kills", turn);
  }
  for (const team of [100, 200]) {
    const fillers = side(team).filter(other);
    if (fillers.length) shareOut(sum(side(team === 100 ? 200 : 100), "kills") - sum(side(team).filter((x) => !other(x)), "deaths"), fillers, "deaths", turn);
    const made = sum(side(team), "kills");
    for (const x of fillers) {
      x.assists = Math.min(x.assists, Math.max(0, made - x.kills));
      x.gold = Math.round(minutes * 285 + x.kills * 300 + x.assists * 110 + (x.win ? 1100 : 0));
    }
  }
}

/**
 * A demo game whose two sides add up as a real one does (demo mode only): one side's deaths are
 * the other side's kills, nobody assists more kills than their team made, and the other players'
 * gold follows their kills, assists and the result. The player's own figures (their stored game)
 * are left as drawn.
 */
function balanceDemoGame(me: MatchParticipantDetail, allies: MatchParticipantDetail[], enemies: MatchParticipantDetail[], minutes: number, turn: number) {
  const sum = (xs: MatchParticipantDetail[], key: "kills" | "deaths") => xs.reduce((n, x) => n + x[key], 0);
  // The other side's kills cover the player's own deaths (the demo has no executions).
  for (let k = 0; sum(enemies, "kills") < me.deaths; k++) enemies[k % enemies.length]!.kills += 1;
  for (let k = 0; me.kills + sum(allies, "kills") < me.kills + me.assists; k++) allies[k % allies.length]!.kills += 1;
  shareOut(me.kills + sum(allies, "kills"), enemies, "deaths", turn);
  shareOut(sum(enemies, "kills") - me.deaths, allies, "deaths", turn + 1);
  for (const side of [[me, ...allies], enemies]) {
    const made = sum(side, "kills");
    for (const x of side) if (x !== me) x.assists = Math.min(x.assists, Math.max(0, made - x.kills));
  }
  // Gold from the game's length, kills, assists and the result, the drawn figure keeping a little of its spread.
  for (const x of [...allies, ...enemies]) x.gold = Math.round(minutes * 285 + x.kills * 300 + x.assists * 110 + (x.win ? 1100 : 0) + ((x.gold ?? 10_500) - 10_500) * 0.3);
}

/**
 * A demo game's other player (never a member): their position, and Riot's multikill counts drawn
 * within their kills from a sequence of their own (seeded by the game and the player, so no other
 * demo figure moves), drawn once at their largest and kept as nested counters, as the demo members'
 * own are (seedDemoGames), at about the members' rates for the role: so the multikill score compares
 * the demo members with players like them (demo only; never real data).
 */
function giveDemoOtherFigures(x: MatchParticipantDetail, role: Role, matchId: string) {
  let seed = [...`${matchId}|${x.puuid}`].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 233280, 17);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280), seed / 233280);
  const support = role === "SUPPORT";
  let budget = x.kills;
  const made = { 5: 0, 4: 0, 3: 0, 2: 0 } as Record<2 | 3 | 4 | 5, number>;
  const chance: Record<2 | 3 | 4 | 5, number> = support ? { 5: 0.004, 4: 0.012, 3: 0.05, 2: 0.3 } : { 5: 0.03, 4: 0.07, 3: 0.2, 2: 0.45 };
  for (const size of [5, 4, 3] as const) {
    if (budget >= size && rnd() < chance[size]) {
      made[size] += 1;
      budget -= size;
    }
  }
  while (budget >= 2 && rnd() < chance[2]) {
    made[2] += 1;
    budget -= 2;
  }
  const largest = made[5] ? 5 : made[4] ? 4 : made[3] ? 3 : made[2] ? 2 : x.kills > 0 ? 1 : 0;
  x.position = role;
  x.stats = { ...(x.stats ?? {}), doubleKills: made[2], tripleKills: made[3], quadraKills: made[4], pentaKills: made[5], largestMultiKill: largest };
  nestDemoCounters(x.stats);
}

const DEMO_STARTS: Record<Role, number[]> = { TOP: [1054, 2003], JUNGLE: [1102, 2003], MID: [1056, 2003, 2003], ADC: [1055, 2003], SUPPORT: [3865, 2003] };
const DEMO_CORE: Record<Role, number[]> = {
  TOP: [1028, 3047, 1037, 3078, 1029, 3068, 3075],
  JUNGLE: [1036, 3158, 1037, 3071, 1028, 3053, 3742],
  MID: [1052, 3020, 1026, 6655, 1058, 3089, 3157],
  ADC: [1036, 3006, 1037, 6672, 1038, 3031, 3036],
  SUPPORT: [2055, 1028, 3158, 3190, 2055, 3107, 3109],
};

/** The components on DEMO_CORE's paths: each is built into the next finished item bought after it. */
const DEMO_COMPONENTS = new Set([1026, 1028, 1029, 1036, 1037, 1038, 1052, 1058]);
/** The starting items players keep (a Doran's item, a jungle pet, the support item), listed after the finished items. */
const DEMO_KEPT_STARTS = new Set([1054, 1055, 1056, 1102, 3865, 3869]);
/** Each role's trinket: Stealth Ward, or Oracle Lens for junglers and supports. */
const DEMO_TRINKET: Record<Role, number> = { TOP: 3340, JUNGLE: 3364, MID: 3340, ADC: 3340, SUPPORT: 3364 };
/** Each role's summoner spells (Data Dragon keys): Flash with Teleport, Smite, Ignite, Heal and Ignite. */
const DEMO_SPELLS: Record<Role, number[]> = { TOP: [4, 12], JUNGLE: [4, 11], MID: [4, 14], ADC: [4, 7], SUPPORT: [4, 14] };
/** Each role's rune page (Data Dragon ids): the keystone and trees, with every rune chosen. */
const DEMO_RUNES: Record<Role, NonNullable<MatchParticipantDetail["runes"]>> = {
  TOP: { keystone: 8010, primary: 8000, secondary: 8400, primaryPerks: [8010, 9111, 9104, 8299], secondaryPerks: [8444, 8451] },
  JUNGLE: { keystone: 8128, primary: 8100, secondary: 8000, primaryPerks: [8128, 8143, 8140, 8105], secondaryPerks: [9111, 9104] },
  MID: { keystone: 8229, primary: 8200, secondary: 8300, primaryPerks: [8229, 8226, 8210, 8237], secondaryPerks: [8304, 8347] },
  ADC: { keystone: 8008, primary: 8000, secondary: 8100, primaryPerks: [8008, 9111, 9104, 8014], secondaryPerks: [8139, 8135] },
  SUPPORT: { keystone: 8439, primary: 8400, secondary: 8300, primaryPerks: [8439, 8463, 8473, 8242], secondaryPerks: [8304, 8347] },
};

/** Each role's stat shards (Riot's ids: offense, flex, defense), as records stored from 20 Nov 2026 on carry them. */
const DEMO_SHARDS: Record<Role, [number, number, number]> = { TOP: [5005, 5008, 5001], JUNGLE: [5008, 5008, 5001], MID: [5008, 5008, 5011], ADC: [5005, 5008, 5011], SUPPORT: [5007, 5008, 5001] };

/**
 * What a demo player ends the game holding (demo mode only), as Riot's record lists it (item0 to
 * item5, 0 for an empty slot, then the trinket): their purchases (demoBuild), each component built
 * into the next finished item bought after it, potions drunk, one Control Ward kept, and the
 * support item upgraded to its last form after 15 minutes, as the game does. Never real data.
 */
function demoFinalItems(purchases: ReadonlyArray<readonly [number, number]>, role: Role, durationSeconds: number, sold: ReadonlyArray<readonly [number, number]> = []): number[] {
  const finished: number[] = [];
  const parts: number[] = [];
  // An item sold (a starting item sold for the last slot, demoSales) is not held at the end.
  const gone = new Set(sold.map(([, id]) => id));
  for (const [, bought] of purchases) {
    if (gone.has(bought)) continue;
    const id = bought === 3865 && durationSeconds >= 900 ? 3869 : bought;
    if (id === 2003) continue;
    if (DEMO_COMPONENTS.has(id)) parts.push(id);
    else {
      if (id !== 2055) parts.pop();
      if (id !== 2055 || !finished.includes(2055)) finished.push(id);
    }
  }
  const six = [...finished.filter((id) => !DEMO_KEPT_STARTS.has(id)), ...finished.filter((id) => DEMO_KEPT_STARTS.has(id)), ...parts].slice(0, 6);
  return [...six, ...Array.from({ length: 6 - six.length }, () => 0), DEMO_TRINKET[role]];
}

/** A demo player's build, summoner spells and runes for the stored record (demo mode only), from their purchases. */
function giveDemoLoadout(x: MatchParticipantDetail, role: Role, purchases: ReadonlyArray<readonly [number, number]>, durationSeconds: number, sold: ReadonlyArray<readonly [number, number]> = []) {
  x.items = demoFinalItems(purchases, role, durationSeconds, sold);
  x.spells = [...DEMO_SPELLS[role]];
  x.runes = { ...DEMO_RUNES[role], primaryPerks: [...DEMO_RUNES[role].primaryPerks!], secondaryPerks: [...DEMO_RUNES[role].secondaryPerks!], shards: [...DEMO_SHARDS[role]] };
}

/** A sequence of its own for a demo game's builds where no timeline drew them (the other sequences stay as they were). */
function demoGameRnd(matchId: string): () => number {
  let s = [...matchId].reduce((n, c) => n + c.charCodeAt(0) * 11, 17);
  return () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
}

/**
 * Purchases and skill order for one demo player (demo mode only): the role's starting items, then
 * the next item of a fixed path every few minutes, and the usual skill order (R at 6, 11 and 16).
 */
function demoBuild(rnd: () => number, durationSeconds: number, role: Role): { purchases: Array<[number, number]>; skills: number[] } {
  const purchases: Array<[number, number]> = DEMO_STARTS[role].map((id, i) => [1_000 + i * 400, id]);
  let at = 300_000 + Math.round(rnd() * 120_000);
  for (const id of DEMO_CORE[role]) {
    if (at >= durationSeconds * 1000) break;
    purchases.push([at, id]);
    at += 150_000 + Math.round(rnd() * 180_000);
  }
  const first = role === "SUPPORT" ? 3 : 1;
  const second = first === 1 ? 3 : 2;
  const third = 6 - first - second;
  const order = [first, second, third, first, first, 4, first, second, first, second, 4, second, second, third, third, 4, third, third];
  const level = Math.min(18, Math.max(6, Math.round(durationSeconds / 120)));
  return { purchases, skills: order.slice(0, level) };
}

/**
 * A demo laner's sale (demo mode only): in every third game with a timeline, the Doran's item they
 * started with sold a moment before their last purchase, as players free a slot late in a game, so
 * the build path shows a sale. None for junglers and supports, whose starting items upgrade.
 */
function demoSales(purchases: ReadonlyArray<readonly [number, number]>, role: Role, game: number): Array<[number, number]> {
  if (game % 3 !== 1 || role === "JUNGLE" || role === "SUPPORT" || purchases.length < 8) return [];
  const doran = purchases.find(([, id]) => id === 1054 || id === 1055 || id === 1056);
  const last = purchases.at(-1)!;
  return doran ? [[last[0] - 4_000, doran[1]]] : [];
}

/**
 * The figures that serve supports, tanks and junglers for every demo player whose record carries
 * extra figures (demo mode only; never real data): crowd control, healing and shielding of
 * teammates, damage mitigated, wards cleared, control wards, objective damage and turrets, by role,
 * from a sequence of their own (seeded by the game and the player, so no other demo figure moves),
 * each only where the record does not already have it. The performance score reads them.
 */
function giveDemoUtilityFigures(x: MatchParticipantDetail, role: Role, matchId: string) {
  if (!x.stats) return;
  let seed = [...`${matchId}#utility|${x.puuid}`].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 233280, 29);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280), seed / 233280);
  const int = (lo: number, hi: number) => Math.round(lo + rnd() * (hi - lo));
  const support = role === "SUPPORT";
  const jungle = role === "JUNGLE";
  const tank = role === "TOP" || support;
  const add: NonNullable<MatchParticipantDetail["stats"]> = {
    ccSeconds: support ? int(25, 70) : jungle ? int(12, 40) : int(5, 30),
    teamHealing: support ? int(800, 6000) : int(0, 600),
    teamShielding: support ? int(500, 5000) : int(0, 400),
    damageMitigated: tank || jungle ? int(12_000, 40_000) : int(3_000, 14_000),
    wardsKilled: support || jungle ? int(2, 9) : int(0, 4),
    controlWardsBought: support ? int(3, 7) : int(0, 3),
    objectiveDamage: jungle ? int(18_000, 42_000) : int(2_000, 14_000),
    turretTakedowns: int(0, 4),
  };
  x.stats = { ...add, ...x.stats };
}

const DEMO_DRAGONS = ["FIRE", "EARTH", "WATER", "AIR", "HEXTECH", "CHEMTECH"];
const DEMO_LANES = ["TOP", "MID", "BOT"];

/**
 * The champion kills each demo player took part in (as many as the game's record gives them) and
 * the objectives and buildings each team took, at plausible times, the winner taking more (demo
 * mode only; never real data). Also the team counts for the stored record, so the scoreboard's
 * dragons and towers agree with the timeline's.
 */
function demoEvents(rnd: () => number, durationSeconds: number, winner: number, players: ReadonlyArray<Pick<MatchParticipantDetail, "puuid" | "kills" | "deaths" | "assists">>): { kda: Map<string, { kills: number[]; deaths: number[]; assists: number[] }>; events: MatchEvents; counts: Record<number, Record<string, number>> } {
  const end = durationSeconds * 1000;
  const at = (lo: number, hi: number) => Math.round(lo + rnd() * (hi - lo));
  // Fights get more frequent as the game goes on: later times are likelier.
  const times = (n: number) => Array.from({ length: n }, () => Math.round((0.1 + 0.88 * Math.sqrt(rnd())) * end)).sort((a, b) => a - b);
  const kda = new Map(players.map((p) => [p.puuid, { kills: times(p.kills), deaths: times(p.deaths), assists: times(p.assists) }]));
  const loser = winner === 100 ? 200 : 100;
  const side = (lean: number) => (rnd() < lean ? winner : loser);
  const objectives: MatchObjectiveEvent[] = [];
  // Dragons from 5:00, about every five and a half minutes, until one side has four.
  const dragons = { [winner]: 0, [loser]: 0 } as Record<number, number>;
  for (let t = at(300_000, 380_000); t < end - 30_000; t += at(300_000, 360_000)) {
    if (dragons[winner]! >= 4 || dragons[loser]! >= 4) {
      if (t > 1_800_000) objectives.push({ t, team: side(0.75), kind: "elder" });
      continue;
    }
    const team = side(0.65);
    dragons[team]! += 1;
    objectives.push({ t, team, kind: "dragon", detail: DEMO_DRAGONS[Math.floor(rnd() * DEMO_DRAGONS.length)] });
  }
  // Voidgrubs: a camp of three at 6:00 or so, sometimes shared.
  const grubsAt = at(360_000, 420_000);
  for (let k = 0; k < 3; k++) objectives.push({ t: grubsAt + k * at(8_000, 20_000), team: side(0.6), kind: "grubs" });
  if (end > 900_000) objectives.push({ t: at(840_000, 960_000), team: side(0.6), kind: "herald" });
  if (end > 1_260_000 && rnd() < 0.6) objectives.push({ t: at(1_200_000, 1_320_000), team: side(0.65), kind: "atakhan" });
  for (let t = at(1_380_000, 1_560_000); t < end - 60_000; t += at(420_000, 540_000)) objectives.push({ t, team: side(0.75), kind: "baron" });
  // Towers lane by lane, outer to base; the winner breaks more and ends on the nexus towers.
  const broken = { [winner]: 0, [loser]: 0 } as Record<number, number>;
  const towers = (team: number, n: number, from: number) => {
    for (let k = 0; k < n; k++) {
      const tier = ["OUTER", "INNER", "BASE"][Math.min(2, Math.floor(k / 3))]!;
      objectives.push({ t: Math.min(end - 20_000, from + Math.round(((end - from) * (k + rnd())) / (n + 1))), team, kind: "tower", detail: `${DEMO_LANES[k % 3]} ${tier}` });
      broken[team]! += 1;
    }
  };
  towers(winner, Math.min(9, 6 + Math.floor(rnd() * 4)), 600_000);
  towers(loser, 1 + Math.floor(rnd() * 4), 540_000);
  const inhibitors = 1 + Math.floor(rnd() * 2);
  for (let k = 0; k < inhibitors; k++) objectives.push({ t: end - at(60_000, 180_000), team: winner, kind: "inhibitor", detail: DEMO_LANES[(k + 1) % 3] });
  objectives.push({ t: end - at(25_000, 45_000), team: winner, kind: "tower", detail: "MID NEXUS" }, { t: end - at(10_000, 22_000), team: winner, kind: "tower", detail: "MID NEXUS" });
  broken[winner]! += 2;
  objectives.sort((a, b) => a.t - b.t);
  const count = (team: number, kinds: string[]) => objectives.filter((o) => o.team === team && kinds.includes(o.kind)).length;
  const counts = Object.fromEntries(
    [winner, loser].map((team) => [team, { tower: count(team, ["tower"]), dragon: count(team, ["dragon", "elder"]), baron: count(team, ["baron"]), horde: count(team, ["grubs"]), riftHerald: count(team, ["herald"]), inhibitor: count(team, ["inhibitor"]) }]),
  ) as Record<number, Record<string, number>>;
  return { kda, events: { objectives }, counts };
}

/** The four other roles of a team, in lane order, around the demo player's own. */
const DEMO_ROLES_FOR = (role: Role): Role[] => (["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as Role[]).filter((r) => r !== role);

/**
 * One demo player's older games read as most real accounts' early games do until the figures
 * backfill reaches them (server/accounts/figures-backfill): stored before the extra figures were
 * kept, so no multikill counts yet, and every fourth of them no longer at Riot. Their profile shows
 * how partial multikill counts read.
 */
const DEMO_OLDER_RECORDS = "Demo Support";

/** Demo members whose newest N games alone carry multikill counts (the board's provisional and too-few groups). */
const DEMO_FEW_COUNTS: Readonly<Record<string, number>> = { "Demo Sub (Support)": 12, "Demo Sub (Top)": 5 };

/** Each multikill once, at its largest (the demo's draws), as nested counters: every larger multikill also counts each smaller one. */
function nestDemoCounters(stats: NonNullable<MatchParticipantDetail["stats"]>) {
  const e = [stats.doubleKills ?? 0, stats.tripleKills ?? 0, stats.quadraKills ?? 0, stats.pentaKills ?? 0];
  stats.doubleKills = e[0]! + e[1]! + e[2]! + e[3]!;
  stats.tripleKills = e[1]! + e[2]! + e[3]!;
  stats.quadraKills = e[2]! + e[3]!;
  stats.pentaKills = e[3]!;
}

/**
 * Demo mode only: the positions one demo member played some of their champions in besides their
 * pool's, and one game Riot recorded no position for (null), so All Champions shows a champion played
 * in all five positions (Sion), in three (Malphite), in two (Ornn) and in one (Mordekaiser), with
 * single games among them, and a game in no position (docs/MATCHUPS.md). Keyed by the n-th game on
 * the champion (from 1); any other game is in the pool's role. A substitute whose multikills are too
 * few to be placed (DEMO_FEW_COUNTS), so no board's order moves. Only the stored position, the lane
 * opponent drawn for it (none without a position) and that game's own record and timeline follow
 * it; every figure of the game is drawn as before, so no other demo figure changes.
 */
const DEMO_OTHER_POSITIONS: Readonly<Record<string, Readonly<Record<string, Readonly<Record<number, Role | null>>>>>> = {
  "Demo Sub (Top)": {
    Sion: { 3: "JUNGLE", 6: "MID", 9: "JUNGLE", 12: "SUPPORT", 15: "ADC", 18: "MID", 21: null },
    Malphite: { 2: "SUPPORT", 5: "SUPPORT", 8: "MID" },
    Ornn: { 3: "JUNGLE" },
  },
};

/** What a fixture asks of seedDemoGames beyond a member's own season (applyWideChampionFixture). */
interface DemoGamesOptions {
  /** Every game keeps its multikill counts (DEMO_FEW_COUNTS stands down): the full-roster layout check only. */
  allCounts?: boolean;
  /** How many games, in place of the season's drawn 24–48. */
  count?: number;
  /** The match ids' first number (`DEMO_<8 hex>_<firstIndex + i>`), clear of the member's own 0–47. */
  firstIndex?: number;
  /** The random sequences' seed in place of the name (the name stays the player's, for DEMO_OTHER_POSITIONS and the record). */
  seed?: string;
  /** The lane opponent of the i-th game in place of DEMO_LANE_OPPONENTS' draw (drawn all the same, so the frames are as before). */
  opponentFor?: (i: number, role: Role) => string;
  /** The position recorded for the i-th game in place of the pool's (null: none recorded). */
  positionFor?: (i: number, role: Role) => Role | null;
}

/**
 * A demo player's games; returns those whose record "Riot no longer provides" (see DEMO_OLDER_RECORDS).
 * `allCounts`: every game keeps its multikill counts (DEMO_FEW_COUNTS stands down), for the
 * full-roster layout check only (seedDemoAccounts' `fullRoster`, applyFullRosterFixture). The other
 * options are the wide-champion fixture's (applyWideChampionFixture); without them a member's season
 * is drawn exactly as it always was.
 */
async function seedDemoGames(db: Db, accountId: string, puuid: string, name: string, pools: Array<{ role: Role; pool: string[] }>, { allCounts = false, count: fixedCount, firstIndex = 0, seed: seedText = name, opponentFor, positionFor }: DemoGamesOptions = {}): Promise<string[]> {
  const gone: string[] = [];
  if (pools.length === 0) return gone;
  // A second sequence for the lane opponents and frames, so the games themselves stay as before.
  let laneSeed = [...seedText].reduce((s, c) => s + c.charCodeAt(0) * 3, 11);
  const laneRnd = () => ((laneSeed = (laneSeed * 9301 + 49297) % 233280), laneSeed / 233280);
  const timelines: Array<typeof matchTimelines.$inferInsert> = [];
  const season = await currentSeason(db);
  let seed = [...seedText].reduce((s, c) => s + c.charCodeAt(0), 7);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280), seed / 233280);
  const int = (lo: number, hi: number) => Math.round(lo + rnd() * (hi - lo));
  const drawnCount = int(24, 48);
  const count = fixedCount ?? drawnCount;
  const skill = 0.44 + rnd() * 0.14;
  const now = Date.now();
  const games: Array<typeof accountMatches.$inferInsert> = [];
  const details: Array<typeof matchDetails.$inferInsert> = [];
  const onChampion = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const { role, pool } = pools.length > 1 && rnd() < 0.2 ? pools[1]! : pools[0]!;
    const championId = pool[Math.min(pool.length - 1, Math.floor(rnd() * rnd() * pool.length))]!;
    // The position played: the pool's, or another for a few games (DEMO_OTHER_POSITIONS; null: none recorded).
    const nth = (onChampion.get(championId) ?? 0) + 1;
    onChampion.set(championId, nth);
    const other = DEMO_OTHER_POSITIONS[name]?.[championId]?.[nth];
    const played: Role | null = positionFor ? positionFor(i, role) : other === undefined ? role : other;
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
    const matchId = `DEMO_${puuid.slice(5, 13)}_${firstIndex + i}`;
    const gameCreation = now - (count - i) * 86_400_000 * 1.6 - int(0, 40_000_000);
    const queueId = rnd() < 0.7 ? 420 : 440;
    const laneOptions = DEMO_LANE_OPPONENTS[played ?? role];
    const opponentIndex = Math.min(laneOptions.length - 1, Math.floor(laneRnd() * laneRnd() * laneOptions.length));
    // The enemy in the same position; without a recorded position no lane opponent is known (laneOpponentOf).
    const laneChampion = opponentFor ? opponentFor(i, played ?? role) : laneOptions[opponentIndex]!;
    const enemyChampionId = played ? laneChampion : null;
    games.push({ accountId, matchId, gameCreation, queueId, championId, role: played, win, enemyChampionId, patch: `${season}.${Math.max(1, 20 - Math.floor((count - i) / 3))}`, gameDuration: duration, kills, deaths, assists, cs, damage, visionScore: vision });
    // Every third game on the red side (never one with the recurring duo below), so every view is
    // seen from both sides: Riot lists the blue side (100) first, as here.
    const ownTeam = i % 3 === 2 ? 200 : 100;
    const otherTeam = ownTeam === 100 ? 200 : 100;
    const teamKills = kills + assists + int(2, 10);
    const taken = new Set([championId, laneChampion]);
    // Other players are new in every game, except a pair of rivals who queue together and meet
    // this player in every third game (what the match window's possible groups show; demo only).
    const duo = (n: number, ally: boolean) => i % 3 === 0 && !ally && (n === 6 || n === 7);
    const filler = (n: number, teamId: number, ally: boolean): MatchParticipantDetail => ({ puuid: duo(n, ally) ? `demo-duo-${puuid.slice(5, 13)}-${n}` : `demo-filler-${puuid.slice(5, 13)}-${firstIndex + i}-${n}`, name: duo(n, ally) ? `Demo Duo ${n - 5}#DEMO` : demoOtherName(ally, n), teamId, championId: n === 5 ? laneChampion : demoOther(i, n, taken), championKey: 0, champLevel: 15, position: null, win: ally ? win : !win, kills: ally ? Math.round((teamKills - kills) / 4) : int(2, 8), deaths: int(1, 7), assists: int(2, 12), cs: int(30, 240), gold: int(7000, 14000), damage: int(6000, 26000), damageTaken: int(9000, 30000), vision: int(10, 50), wardsPlaced: int(4, 20), items: null, spells: null, runes: null });
    const me: MatchParticipantDetail = {
      puuid,
      name: `${name}#DEMO`,
      teamId: ownTeam,
      championId,
      championKey: 0,
      champLevel: 16,
      position: played,
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
    // Riot's counters as nested ones (a triple also counts a double, a pentakill a double, a triple
    // and a quadra), as the public match records suggest Riot keeps them: the draws above are each
    // multikill once, at its largest, turned into counters here (no draw added or moved, so no other
    // demo figure changes). The multikill board reads them back as one event each.
    nestDemoCounters(me.stats!);
    if (name === DEMO_OLDER_RECORDS && i < count / 2) {
      delete me.stats;
      if (i % 4 === 0) gone.push(matchId);
    }
    // Two members with few games carrying counts (their older records still to be fetched again),
    // so the multikill board shows a provisional score and a member with too few games for one.
    // A full roster's layout check (UNIIVERSE_DEMO_FULL_ROSTER=1 on the in-memory demo: bootstrap) has every member's counts, so both rankings hold nine.
    const few = allCounts ? undefined : DEMO_FEW_COUNTS[name];
    if (few !== undefined && i < count - few) delete me.stats;
    const allies = [1, 2, 3, 4].map((n) => filler(n, ownTeam, true));
    const enemies = [5, 6, 7, 8, 9].map((n) => filler(n, otherTeam, false));
    // The lane opponent: the enemy in the same position.
    const lane = `demo-lane-${puuid.slice(5, 13)}-${firstIndex + i}`;
    enemies[0] = { ...enemies[0]!, puuid: lane, championId: laneChampion, position: played ?? role };
    balanceDemoGame(me, allies, enemies, minutes, i);
    const sides = ownTeam === 100 ? [me, ...allies, ...enemies] : [...enemies, me, ...allies];
    // Most demo games have a timeline; every sixth (by its match number) is left "still to be collected". Everyone in
    // it has frames, a build and kill times, from a sequence of the game's own (the player's and
    // the lane opponent's frames are as they always were), and the record's team counts follow
    // the timeline's objectives.
    let objectiveCounts: Record<number, Record<string, number>> | null = null;
    // Everyone's lane: the player and the lane opponent play the player's role, the others the four other roles.
    // In another position (DEMO_OTHER_POSITIONS), the player trades it with the teammate (and the
    // lane opponent with the enemy) who would have held it, so each side still holds every position once.
    const lanePosition = played ?? role;
    const roles = DEMO_ROLES_FOR(role).map((r) => (r === lanePosition ? role : r));
    const others = [...allies.map((a, k) => ({ puuid: a.puuid, ally: true, role: roles[k]! })), ...enemies.slice(1).map((e, k) => ({ puuid: e.puuid, ally: false, role: roles[k]! }))];
    const players = [{ puuid, role: lanePosition }, { puuid: lane, role: lanePosition }, ...others];
    let builds: Array<{ puuid: string; purchases: Array<[number, number]> }> | null = null;
    if ((firstIndex + i) % 6 !== 5) {
      let gameSeed = [...matchId].reduce((n, c) => n + c.charCodeAt(0) * 7, 13);
      const gameRnd = () => ((gameSeed = (gameSeed * 9301 + 49297) % 233280), gameSeed / 233280);
      const frames = fitFramesToRecord(demoFrames(laneRnd, duration, puuid, lane, lanePosition, win, (opponentIndex - 1) * 25, { rnd: gameRnd, players: others }), sides);
      const drawn = players.map((x) => ({ puuid: x.puuid, ...demoBuild(gameRnd, duration, x.role) }));
      const { kda, events, counts } = demoEvents(gameRnd, duration, win ? ownTeam : otherTeam, sides);
      // A sale or two in some games (demoSales); the events carry the plates' list (none here), as a timeline kept since 20 Nov 2026 does, so its sales are read as kept.
      const withSales = drawn.map((b) => {
        const sold = demoSales(b.purchases, players.find((x) => x.puuid === b.puuid)!.role, i);
        return { ...b, ...kda.get(b.puuid)!, ...(sold.length ? { sold } : {}) };
      });
      timelines.push({ matchId, platform: "euw1", participants: withSales, frames, events: { ...events, plates: [] } });
      objectiveCounts = counts;
      builds = drawn;
    }
    // Everyone's build, summoner spells and runes in the stored record, as a real record has them:
    // the build from the timeline's own purchases, or, in a game left without a timeline, from a
    // sequence of the game's own (the games' other figures stay as they were).
    const ownRnd = builds ? null : demoGameRnd(matchId);
    for (const x of players) {
      const purchases = builds?.find((b) => b.puuid === x.puuid)?.purchases ?? demoBuild(ownRnd!, duration, x.role).purchases;
      const part = sides.find((p) => p.puuid === x.puuid)!;
      giveDemoLoadout(part, x.role, purchases, duration, builds ? demoSales(purchases, x.role, i) : []);
      // Everyone else's position and multikill counts, as a real record carries them (the multikill
      // score compares the members with them), from a sequence of their own: nothing else moves.
      if (part !== me) giveDemoOtherFigures(part, x.role, matchId);
      giveDemoUtilityFigures(part, x.role, matchId);
    }
    details.push({ matchId, platform: "euw1", queueId, gameCreation, gameDuration: duration, gameVersion: `${season}.20.1`, teams: [100, 200].map((teamId) => ({ teamId, win: teamId === ownTeam ? win : !win, bans: [], objectives: objectiveCounts?.[teamId] ?? {} })), participants: sides });
  }
  // One evening of back-to-back games: the 2nd and 3rd newest move up to the newest (same order,
  // 15 and 12 minutes between them), so Match History's playing sessions have a sitting to show
  // near the top of the list, on its first page whatever its size.
  for (const [back, gapMinutes] of [[2, 15], [3, 12]] as const) {
    const earlier = games[count - back];
    const later = games[count - back + 1];
    if (!earlier || !later) continue;
    earlier.gameCreation = later.gameCreation - (earlier.gameDuration! * 1000 + gapMinutes * 60_000);
    const record = details.find((d) => d.matchId === earlier.matchId);
    if (record) record.gameCreation = earlier.gameCreation;
  }
  await db.insert(accountMatches).values(games).onConflictDoNothing();
  await db.insert(matchDetails).values(details).onConflictDoNothing();
  if (timelines.length) await db.insert(matchTimelines).values(timelines).onConflictDoNothing();
  return gone;
}

/**
 * Layout checks of a full roster only (UNIIVERSE_DEMO_FULL_ROSTER=1, in-memory demo; Release 19): the
 * two members still in setup get a demo Riot account, up to date, and a season of games, and the two
 * substitutes' games all carry multikill counts (DEMO_FEW_COUNTS stands down), so nine players are
 * active and both of Leaderboards' rankings hold nine (the owner's team is eight or nine; the default
 * demo's seven, five of them on the multikill board, left the one screen untested at that size). Demo Halfway plays its two ADC champions;
 * Demo Newcomer, who has chosen no role, plays three junglers (its profile still shows no role). The
 * default demo is unchanged. Never on a Postgres database or a deployment, and only with
 * seedDemoAccounts' `fullRoster` (the substitutes' half), both decided once by bootstrap
 * (demoFullRoster: the flag on an in-memory demo).
 */
const FULL_ROSTER_GAMES: Readonly<Record<string, ReadonlyArray<{ role: Role; pool: readonly string[] }>>> = {
  "Demo Halfway": [{ role: "ADC", pool: ["Ashe", "Caitlyn"] }],
  "Demo Newcomer": [{ role: "JUNGLE", pool: ["Kayn", "Hecarim", "Graves"] }],
};

export async function applyFullRosterFixture(db: Db): Promise<{ created: number }> {
  if (isProductionDeployment()) return { created: 0 };
  const team = await getOrCreateTeam(db);
  const roster = await listPlayers(db, team.id);
  const known = new Set((await db.select({ id: champions.id }).from(champions)).map((c) => c.id));
  let created = 0;
  for (const p of roster) {
    const plan = FULL_ROSTER_GAMES[p.displayName];
    if (!plan) continue;
    const [existing] = await db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.playerId, p.id));
    if (existing) continue;
    const [account] = await db
      .insert(riotAccounts)
      .values({ ownerType: "player", playerId: p.id, gameName: p.displayName, tagLine: "DEMO", platform: "euw1", puuid: `demo-${p.id}`, label: "demo", syncStatus: "demo", lastSyncAt: new Date() })
      .returning({ id: riotAccounts.id });
    const pools = plan.map((x) => ({ role: x.role, pool: x.pool.filter((c) => known.has(c)) })).filter((x) => x.pool.length > 0);
    await seedDemoGames(db, account!.id, `demo-${p.id}`, p.displayName, pools, { allCounts: true });
    await seedDemoRankHistory(db, account!.id, 7 + created);
    created += 1;
  }
  if (created) {
    invalidateProficiencyCache();
    await summariseMatches(db);
  }
  return { created };
}

/**
 * All Champions' one-screen workspace (UNIIVERSE_DEMO_WIDE_CHAMPION=1, in-memory demo only; the
 * owner's request of 27 Nov 2026): a champion with dozens of lane opponents, as production's
 * Ambessa has, which no default demo champion comes near (four at most). Demo Top gets:
 *  - Ambessa, Top only: 98 games against 40 Top opponents (WIDE_CHAMPION_OPPONENTS: 15 ranked with
 *    3+ games, 25 small samples), interleaved round-robin so the dates spread over about 157 days;
 *    every sixth game has no timeline, so Darius's 9 include the 10:00 sentence and "no timeline";
 *  - Aatrox, Top 20 and Mid 8, against 12 and 5 opponents (a position switch resets the pages);
 *  - 22 more champions with 1–4 games each, over all five positions, one game with no recorded
 *    position: 30 rows in all, more than any page shows and than Show all's 20;
 *  - Ambessa's mastery (405,000 points, level 10) and a place in the Top pool ("In pool").
 * The default demo and every figure the suite asserts on it are unchanged. Run after the other demo
 * fixtures (which rewrite the members' own DEMO_ games), with match ids from 1000 (clear of the
 * member's own 0–47). Never on a Postgres database or a deployment (bootstrap: demoWideChampion).
 */
const WIDE_CHAMPION_OPPONENTS: ReadonlyArray<readonly [string, number]> = [
  ["Darius", 9], ["Garen", 7], ["Fiora", 6], ["Camille", 5], ["Renekton", 5],
  ["Aatrox", 4], ["Jax", 4], ["Sett", 4],
  ["Malphite", 3], ["Mordekaiser", 3], ["Ornn", 3], ["Riven", 3], ["Shen", 3], ["Teemo", 3], ["Volibear", 3],
  ["Gnar", 2], ["Gwen", 2], ["Illaoi", 2], ["Irelia", 2], ["Jayce", 2], ["KSante", 2], ["Kayle", 2], ["Kennen", 2],
  ["Kled", 1], ["Nasus", 1], ["Olaf", 1], ["Pantheon", 1], ["Poppy", 1], ["Quinn", 1], ["Rumble", 1], ["Singed", 1], ["Sion", 1],
  ["Trundle", 1], ["Tryndamere", 1], ["Urgot", 1], ["Vladimir", 1], ["Yasuo", 1], ["Yone", 1], ["Yorick", 1], ["Gangplank", 1],
];
const WIDE_AATROX_TOP: ReadonlyArray<readonly [string, number]> = [["Darius", 4], ["Garen", 3], ["Sett", 2], ["Fiora", 2], ["Camille", 2], ["Renekton", 1], ["Jax", 1], ["Malphite", 1], ["Shen", 1], ["Riven", 1], ["Teemo", 1], ["Volibear", 1]];
const WIDE_AATROX_MID: ReadonlyArray<readonly [string, number]> = [["Ahri", 3], ["Syndra", 2], ["Zed", 1], ["Orianna", 1], ["Yasuo", 1]];
/** The 22 champions played a little, by position, with their games; Kayn's last game records no position. */
const WIDE_MORE_CHAMPIONS: ReadonlyArray<readonly [Role, string, number]> = [
  ["TOP", "Camille", 3], ["TOP", "Fiora", 2], ["TOP", "Renekton", 4], ["TOP", "Sett", 1], ["TOP", "Riven", 2],
  ["JUNGLE", "Viego", 3], ["JUNGLE", "LeeSin", 2], ["JUNGLE", "Vi", 1], ["JUNGLE", "Kayn", 4],
  ["MID", "Ahri", 2], ["MID", "Orianna", 3], ["MID", "Syndra", 1], ["MID", "Zed", 2], ["MID", "Yasuo", 1],
  ["ADC", "Jinx", 2], ["ADC", "Kaisa", 3], ["ADC", "Ezreal", 1],
  ["SUPPORT", "Thresh", 2], ["SUPPORT", "Leona", 1], ["SUPPORT", "Lulu", 3], ["SUPPORT", "Nautilus", 2], ["SUPPORT", "Braum", 1],
];

/** A schedule's opponents, one game each round over the counts still left, in the schedule's order. */
export function roundRobin(schedule: ReadonlyArray<readonly [string, number]>): string[] {
  const left = schedule.map(([id, n]) => [id, n] as [string, number]);
  const out: string[] = [];
  while (left.some(([, n]) => n > 0)) {
    for (const entry of left) {
      if (entry[1] <= 0) continue;
      out.push(entry[0]);
      entry[1] -= 1;
    }
  }
  return out;
}

export async function applyWideChampionFixture(db: Db): Promise<{ created: number }> {
  if (isProductionDeployment()) return { created: 0 };
  const [top] = await db.select({ id: players.id }).from(players).where(eq(players.displayName, "Demo Top"));
  if (!top) return { created: 0 };
  const puuid = `demo-${top.id}`;
  const [account] = await db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.puuid, puuid));
  if (!account) return { created: 0 };
  const firstId = `DEMO_${puuid.slice(5, 13)}_1000`;
  const [done] = await db.select({ id: accountMatches.matchId }).from(accountMatches).where(and(eq(accountMatches.accountId, account.id), eq(accountMatches.matchId, firstId)));
  if (done) return { created: 0 };
  const known = new Set((await db.select({ id: champions.id }).from(champions)).map((c) => c.id));
  const has = (id: string) => known.has(id);
  const schedule = (list: ReadonlyArray<readonly [string, number]>) => roundRobin(list.filter(([id]) => has(id)));
  let created = 0;
  if (has("Ambessa")) {
    const ambessa = schedule(WIDE_CHAMPION_OPPONENTS);
    await seedDemoGames(db, account.id, puuid, "Demo Top", [{ role: "TOP", pool: ["Ambessa"] }], { count: ambessa.length, firstIndex: 1000, seed: "Demo Top · Ambessa", opponentFor: (i) => ambessa[i]! });
    created += ambessa.length;
    const [last] = await db.select({ at: accountMatches.gameCreation }).from(accountMatches).where(and(eq(accountMatches.accountId, account.id), eq(accountMatches.championId, "Ambessa"))).orderBy(sql`${accountMatches.gameCreation} desc`).limit(1);
    await db.insert(accountMastery).values({ accountId: account.id, championId: "Ambessa", points: 405_000, level: 10, lastPlayedAt: last ? new Date(last.at) : new Date() }).onConflictDoNothing();
    await db.insert(playerChampionPools).values({ playerId: top.id, slot: "primary", championId: "Ambessa", position: 20 }).onConflictDoNothing();
  }
  if (has("Aatrox")) {
    const topGames = schedule(WIDE_AATROX_TOP);
    const midGames = schedule(WIDE_AATROX_MID);
    await seedDemoGames(db, account.id, puuid, "Demo Top", [{ role: "TOP", pool: ["Aatrox"] }], { count: topGames.length, firstIndex: 1200, seed: "Demo Top · Aatrox Top", opponentFor: (i) => topGames[i]! });
    await seedDemoGames(db, account.id, puuid, "Demo Top", [{ role: "MID", pool: ["Aatrox"] }], { count: midGames.length, firstIndex: 1220, seed: "Demo Top · Aatrox Mid", opponentFor: (i) => midGames[i]! });
    created += topGames.length + midGames.length;
  }
  let next = 1300;
  for (const [role, championId, games] of WIDE_MORE_CHAMPIONS) {
    if (!has(championId)) continue;
    await seedDemoGames(db, account.id, puuid, "Demo Top", [{ role, pool: [championId] }], { count: games, firstIndex: next, seed: `Demo Top · ${championId}`, positionFor: (i) => (championId === "Kayn" && i === games - 1 ? null : role) });
    next += games;
    created += games;
  }
  if (created) {
    invalidateProficiencyCache();
    await summariseMatches(db);
  }
  return { created };
}

/**
 * Screenshot and layout checks only (UNIIVERSE_DEMO_SCREENSHOT=1, in-memory demo): gives the demo
 * roster real-length names (from 3 letters to 21), so pages are judged against names longer than
 * "Demo Top", and lets the local owner play as the Mid player, so pages show "you" as a team
 * member does, and gives the team a background artwork (drawn in backdrop-art.ts) so Team
 * Overview's background visibility can be judged. The Players directory gets what a real team's
 * cards carry: a tagline and a personal look on some cards only, a pool longer than any card
 * shows, and the longest rank label. Runs after the demo statistics (which find the demo players
 * by name); never on a Postgres database.
 */
const LONG_DEMO_NAMES: Record<string, string> = {
  "Demo Top": "Thunderstruck Kaiser",
  "Demo Jungle": "Vex",
  "Demo Mid": "Wandering Mapleleaf",
  "Demo ADC": "Moonlit Arbalest",
  "Demo Support": "Sovereign of the Rift",
  "Demo Sub (Top)": "Ozymandias Prime",
  "Demo Sub (Support)": "Lio",
};

const SCREENSHOT_LOOKS: Record<string, Record<string, unknown>> = {
  "Demo Top": { frame: "premium", colours: { primary: "#e8b04a", secondary: "#e0566b", gradient: "diagonal", border: "gradient", avatarFrame: "gradient" }, identity: { tagline: "Top lane or no lane", emblem: "flame", nameStyle: "wide" } },
  "Demo Mid": { identity: { tagline: "Calm in the chaos, loud in the comms" } },
  "Demo Sub (Support)": { frame: "glow", colours: { primary: "#a78bfa", secondary: "#fb7185", border: "primary" }, identity: { tagline: "Wards win games", emblem: "moon", nameStyle: "italic" } },
};
// Added after Demo Top's six, so one Primary Role pool is longer than any card shows.
const SCREENSHOT_LONG_POOL = ["Darius", "Garen", "Sett", "Fiora", "Camille", "Aatrox", "Riven", "Irelia"];

/**
 * The local demo's stand-in for production's verification account ("verify", a member with no
 * player profile: jobs/verify-account.ts keeps the real one), so Admin Mode's People page shows its
 * locked "Kept automatically" row as production's does, and the browser tests check it. Its
 * password is random and thrown away (an active account, as production's is, that nobody can sign
 * in to), and it is in no list members see. Never on a deployment.
 */
export async function seedDemoVerificationAccount(db: Db): Promise<void> {
  if (isProductionDeployment() || (await findUserByUsername(db, VERIFY_USERNAME))) return;
  await createUser(db, { username: VERIFY_USERNAME, displayName: VERIFY_DISPLAY_NAME, password: randomToken(24), role: "player", playerId: null });
}

export async function applyScreenshotFixture(db: Db): Promise<void> {
  const ids: Record<string, string> = {};
  for (const [from, to] of Object.entries(LONG_DEMO_NAMES)) {
    const [row] = await db.update(players).set({ displayName: to }).where(eq(players.displayName, from)).returning({ id: players.id });
    if (row) ids[from] = row.id;
  }
  if (ids["Demo Mid"]) await db.update(users).set({ playerId: ids["Demo Mid"], setupCompletedAt: new Date() }).where(eq(users.username, "local-owner"));
  for (const [who, cardStyle] of Object.entries(SCREENSHOT_LOOKS)) if (ids[who]) await db.update(players).set({ cardStyle }).where(eq(players.id, ids[who]!));
  if (ids["Demo Top"]) {
    const known = new Set((await db.select({ id: champions.id }).from(champions)).map((c) => c.id));
    const extra = SCREENSHOT_LONG_POOL.filter((c) => known.has(c));
    if (extra.length) await db.insert(playerChampionPools).values(extra.map((championId, i) => ({ playerId: ids["Demo Top"]!, slot: "primary" as const, championId, position: 6 + i }))).onConflictDoNothing();
  }
  if (ids["Demo ADC"]) await db.update(riotAccounts).set({ tier: "GRANDMASTER", division: null, leaguePoints: 412 }).where(eq(riotAccounts.playerId, ids["Demo ADC"]!));
  await db.insert(brandAssets).values({ kind: "appBackground", contentType: "image/png", data: demoBackdropPng(), width: 1280, height: 720, animated: false }).onConflictDoNothing();
  invalidateCache("branding");
}
