import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountChampionHistory, accountMastery, accountMatches, brandAssets, matchDetails, matchTimelines, type MatchEvents, type MatchFrames, type MatchObjectiveEvent, type MatchParticipantDetail, champions, playerChampionPools, players, rankSnapshots, riotAccounts, users } from "@/server/db/schema";
import { listPlayers } from "@/server/repositories/team";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { ROLES } from "@/domain/roles";
import { createPlayer, getOrCreateTeam, setLineup, setLineupSubstitute } from "@/server/repositories/team";
import { createUser } from "@/server/repositories/users";
import { ensureLocalOwnerAccount, isProductionDeployment } from "@/server/auth/session";
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

/**
 * Demo linked accounts with synthetic champion history so proficiency tiers are visible before a
 * Riot key exists. Labelled "demo" and never synced against Riot.
 */
export async function seedDemoAccounts(db: Db): Promise<{ created: number }> {
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
    gone.push(...(await seedDemoGames(db, account!.id, `demo-${p.id}`, p.displayName, pools.filter((x): x is { role: Role; pool: string[] } => !!x.role && x.pool.length > 0))));
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
        const role = (x.position as Role | null) ?? open.shift() ?? "MID";
        giveDemoLoadout(x, role, demoBuild(ownRnd, duration, role).purchases, duration);
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

/**
 * What a demo player ends the game holding (demo mode only), as Riot's record lists it (item0 to
 * item5, 0 for an empty slot, then the trinket): their purchases (demoBuild), each component built
 * into the next finished item bought after it, potions drunk, one Control Ward kept, and the
 * support item upgraded to its last form after 15 minutes, as the game does. Never real data.
 */
function demoFinalItems(purchases: ReadonlyArray<readonly [number, number]>, role: Role, durationSeconds: number): number[] {
  const finished: number[] = [];
  const parts: number[] = [];
  for (const [, bought] of purchases) {
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
function giveDemoLoadout(x: MatchParticipantDetail, role: Role, purchases: ReadonlyArray<readonly [number, number]>, durationSeconds: number) {
  x.items = demoFinalItems(purchases, role, durationSeconds);
  x.spells = [...DEMO_SPELLS[role]];
  x.runes = { ...DEMO_RUNES[role], primaryPerks: [...DEMO_RUNES[role].primaryPerks!], secondaryPerks: [...DEMO_RUNES[role].secondaryPerks!] };
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

/** A demo player's games; returns those whose record "Riot no longer provides" (see DEMO_OLDER_RECORDS). */
async function seedDemoGames(db: Db, accountId: string, puuid: string, name: string, pools: Array<{ role: Role; pool: string[] }>): Promise<string[]> {
  const gone: string[] = [];
  if (pools.length === 0) return gone;
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
    // Every third game on the red side (never one with the recurring duo below), so every view is
    // seen from both sides: Riot lists the blue side (100) first, as here.
    const ownTeam = i % 3 === 2 ? 200 : 100;
    const otherTeam = ownTeam === 100 ? 200 : 100;
    const teamKills = kills + assists + int(2, 10);
    const taken = new Set([championId, enemyChampionId]);
    // Other players are new in every game, except a pair of rivals who queue together and meet
    // this player in every third game (what the match window's possible groups show; demo only).
    const duo = (n: number, ally: boolean) => i % 3 === 0 && !ally && (n === 6 || n === 7);
    const filler = (n: number, teamId: number, ally: boolean): MatchParticipantDetail => ({ puuid: duo(n, ally) ? `demo-duo-${puuid.slice(5, 13)}-${n}` : `demo-filler-${puuid.slice(5, 13)}-${i}-${n}`, name: duo(n, ally) ? `Demo Duo ${n - 5}#DEMO` : demoOtherName(ally, n), teamId, championId: n === 5 ? enemyChampionId : demoOther(i, n, taken), championKey: 0, champLevel: 15, position: null, win: ally ? win : !win, kills: ally ? Math.round((teamKills - kills) / 4) : int(2, 8), deaths: int(1, 7), assists: int(2, 12), cs: int(30, 240), gold: int(7000, 14000), damage: int(6000, 26000), damageTaken: int(9000, 30000), vision: int(10, 50), wardsPlaced: int(4, 20), items: null, spells: null, runes: null });
    const me: MatchParticipantDetail = {
      puuid,
      name: `${name}#DEMO`,
      teamId: ownTeam,
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
    if (name === DEMO_OLDER_RECORDS && i < count / 2) {
      delete me.stats;
      if (i % 4 === 0) gone.push(matchId);
    }
    const allies = [1, 2, 3, 4].map((n) => filler(n, ownTeam, true));
    const enemies = [5, 6, 7, 8, 9].map((n) => filler(n, otherTeam, false));
    // The lane opponent: the enemy in the same position.
    const lane = `demo-lane-${puuid.slice(5, 13)}-${i}`;
    enemies[0] = { ...enemies[0]!, puuid: lane, championId: enemyChampionId, position: role };
    balanceDemoGame(me, allies, enemies, minutes, i);
    const sides = ownTeam === 100 ? [me, ...allies, ...enemies] : [...enemies, me, ...allies];
    // Most demo games have a timeline; every sixth is left "still to be collected". Everyone in
    // it has frames, a build and kill times, from a sequence of the game's own (the player's and
    // the lane opponent's frames are as they always were), and the record's team counts follow
    // the timeline's objectives.
    let objectiveCounts: Record<number, Record<string, number>> | null = null;
    // Everyone's lane: the player and the lane opponent play the player's role, the others the four other roles.
    const roles = DEMO_ROLES_FOR(role);
    const others = [...allies.map((a, k) => ({ puuid: a.puuid, ally: true, role: roles[k]! })), ...enemies.slice(1).map((e, k) => ({ puuid: e.puuid, ally: false, role: roles[k]! }))];
    const players = [{ puuid, role }, { puuid: lane, role }, ...others];
    let builds: Array<{ puuid: string; purchases: Array<[number, number]> }> | null = null;
    if (i % 6 !== 5) {
      let gameSeed = [...matchId].reduce((n, c) => n + c.charCodeAt(0) * 7, 13);
      const gameRnd = () => ((gameSeed = (gameSeed * 9301 + 49297) % 233280), gameSeed / 233280);
      const frames = fitFramesToRecord(demoFrames(laneRnd, duration, puuid, lane, role, win, (opponentIndex - 1) * 25, { rnd: gameRnd, players: others }), sides);
      const drawn = players.map((x) => ({ puuid: x.puuid, ...demoBuild(gameRnd, duration, x.role) }));
      const { kda, events, counts } = demoEvents(gameRnd, duration, win ? ownTeam : otherTeam, sides);
      timelines.push({ matchId, platform: "euw1", participants: drawn.map((b) => ({ ...b, ...kda.get(b.puuid)! })), frames, events });
      objectiveCounts = counts;
      builds = drawn;
    }
    // Everyone's build, summoner spells and runes in the stored record, as a real record has them:
    // the build from the timeline's own purchases, or, in a game left without a timeline, from a
    // sequence of the game's own (the games' other figures stay as they were).
    const ownRnd = builds ? null : demoGameRnd(matchId);
    for (const x of players) {
      const purchases = builds?.find((b) => b.puuid === x.puuid)?.purchases ?? demoBuild(ownRnd!, duration, x.role).purchases;
      giveDemoLoadout(sides.find((p) => p.puuid === x.puuid)!, x.role, purchases, duration);
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
