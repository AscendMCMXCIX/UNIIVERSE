import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Interrupts an erasure at its last step, to show it is all or nothing.
const control = vi.hoisted(() => ({ failPrune: false }));
vi.mock("@/server/auth/throttle", async (orig) => {
  const real = await orig<typeof import("@/server/auth/throttle")>();
  return {
    ...real,
    pruneAuthFailures: async (...args: Parameters<typeof real.pruneAuthFailures>) => {
      if (control.failPrune) {
        control.failPrune = false;
        throw new Error("connection lost");
      }
      return real.pruneAuthFailures(...args);
    },
  };
});
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import {
  accountMatches,
  appSettings,
  auditEvents,
  developmentObjectives,
  developmentPlans,
  jobRuns,
  lastKnownRanks,
  matchDetails,
  matchTimelines,
  players,
  privacyErasures,
  rankedBlocks,
  rankedGames,
  riotAccounts,
  sessions,
  teamBookmarks,
  users,
  type MatchParticipantDetail,
} from "@/server/db/schema";
import { getOrCreateTeam } from "@/server/repositories/team";
import { eraseSubject, memberSubject, previewErasure, formerMemberSubject, ERASED_MEMBER } from "@/server/privacy/erasure";
import { erasureFilter, exportErasures, importErasures, releaseErasure } from "@/server/privacy/ledger";
import { reconcileErasures } from "@/server/privacy/reconcile";
import { matchDetailRow, storeMatchDetail } from "@/server/accounts/match-details";
import { addAccount, AccountError } from "@/server/accounts/repository";
import { verifyRiotIdentity, type RiotIdentityClient } from "@/server/riot/verify-identity";
import type { RiotMatch } from "@/server/riot/api/schemas";

/*
  Permanent personal-data erasure on a realistic member (synthetic data, never a real player):
  Alice has an account, a profile, two Riot accounts, games of her own and games shared with Bob
  and Carol, an old game recorded under another API key's PUUID and her former Riot ID, a journal,
  job log lines and admin log entries (the Draft feature's team records and the Clash scouts went
  with their tables, migrations 0063 and 0064). After the erasure nothing anywhere in the database names her, shared games keep the
  others, the erasure keeps her out of later syncs and links, and a restored backup is reconciled.
*/

let handle: DbHandle;
let teamId: string;
const id = {
  owner: randomUUID(),
  admin: randomUUID(),
  alice: randomUUID(),
  bob: randomUUID(),
  alicePlayer: randomUUID(),
  bobPlayer: randomUUID(),
  carolPlayer: randomUUID(),
  aliceMain: randomUUID(),
  aliceAlt: randomUUID(),
  bobAccount: randomUUID(),
  carolAccount: randomUUID(),
};
// Identifiers that must not survive anywhere (checked across every table at the end).
const ALICE_TRACES = ["alice", "AliceMain", "AliceAlt", "AliceOld", "puuid-alice-main", "puuid-alice-alt", "puuid-alice-oldkey", id.alice, id.alicePlayer, id.aliceMain, id.aliceAlt];

const part = (puuid: string, name: string | null, teamId_: number, championId: string, position: string, over: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({
  puuid,
  name,
  teamId: teamId_,
  championId,
  championKey: 0,
  champLevel: 15,
  position,
  win: teamId_ === 100,
  kills: 4,
  deaths: 2,
  assists: 6,
  cs: 180,
  gold: 10000,
  damage: 15000,
  damageTaken: 14000,
  vision: 20,
  wardsPlaced: 9,
  items: [1, 2, 3, 0, 0, 0, 3340],
  spells: [4, 14],
  runes: { keystone: 8112, primary: 8100, secondary: 8300 },
  ...over,
});
const strangers = (teamId_: number, n: number, from = 0) => Array.from({ length: n }, (_, i) => part(`stranger-${teamId_}-${from + i}`, `Stranger${from + i}#EUW`, teamId_, ["Garen", "Lux", "Jinx", "Thresh", "LeeSin"][i % 5]!, ["TOP", "JUNGLE", "BOTTOM", "UTILITY", "MIDDLE"][i % 5]!));

async function seed(db: Db): Promise<void> {
  teamId = (await getOrCreateTeam(db)).id;
  await db.insert(players).values([
    { id: id.alicePlayer, teamId, displayName: "Alice A.", riotId: "AliceMain#OCE", primaryRole: "MID", publicName: "Alice the Great", socialLinks: { twitch: { handle: "alicetv", visibility: "members" } } as never, cardStyle: { accent: "violet" }, notes: "prefers mid" },
    { id: id.bobPlayer, teamId, displayName: "Bob", riotId: "Bob#OCE", primaryRole: "TOP" },
    { id: id.carolPlayer, teamId, displayName: "Carol", riotId: "Carol#OCE", primaryRole: "ADC" },
  ]);
  await db.insert(users).values([
    { id: id.owner, username: "owner", displayName: "Owner", passwordHash: "x", role: "owner" },
    { id: id.admin, username: "dana", displayName: "Dana", passwordHash: "x", role: "player", isAdmin: true },
    { id: id.alice, username: "alice", displayName: "Alice A.", passwordHash: "x", role: "player", playerId: id.alicePlayer },
    { id: id.bob, username: "bob", displayName: "Bob", passwordHash: "x", role: "player", playerId: id.bobPlayer },
  ]);
  await db.insert(sessions).values({ userId: id.alice, tokenHash: "alice-session", expiresAt: new Date(Date.now() + 86_400_000) });
  await db.insert(riotAccounts).values([
    { id: id.aliceMain, ownerType: "player", playerId: id.alicePlayer, gameName: "AliceMain", tagLine: "OCE", platform: "oc1", puuid: "puuid-alice-main", label: "main" },
    { id: id.aliceAlt, ownerType: "player", playerId: id.alicePlayer, gameName: "AliceAlt", tagLine: "OCE", platform: "oc1", puuid: "puuid-alice-alt", label: "alt" },
    { id: id.bobAccount, ownerType: "player", playerId: id.bobPlayer, gameName: "Bob", tagLine: "OCE", platform: "oc1", puuid: "puuid-bob", label: "main" },
    { id: id.carolAccount, ownerType: "player", playerId: id.carolPlayer, gameName: "Carol", tagLine: "OCE", platform: "oc1", puuid: "puuid-carol", label: "main" },
  ]);
  const game = (accountId: string, matchId: string, championId: string, role: string, team: number, enemy: string | null = null) => ({ accountId, matchId, gameCreation: 1_760_000_000_000, queueId: 420, championId, role, win: team === 100, enemyChampionId: enemy, patch: "16.1", gameDuration: 1800, kills: 4, deaths: 2, assists: 6, cs: 180, damage: 15000, visionScore: 20, teamId: team });
  await db.insert(accountMatches).values([
    game(id.aliceMain, "OC1_SOLO", "Ahri", "MID", 100),
    game(id.aliceMain, "OC1_SHARED", "Ahri", "MID", 100),
    game(id.bobAccount, "OC1_SHARED", "Garen", "TOP", 100),
    game(id.aliceAlt, "OC1_VS", "Syndra", "MID", 200),
    game(id.bobAccount, "OC1_VS", "Ahri", "MID", 100, "Syndra"),
    // A game recorded under another API key: Riot's PUUID then was different, and so was her name.
    game(id.aliceMain, "OC1_OLDKEY", "Zed", "MID", 100),
    game(id.carolAccount, "OC1_CAROL", "Jinx", "ADC", 200),
  ]);
  await db.insert(matchDetails).values([
    { matchId: "OC1_SOLO", platform: "oc1", queueId: 420, gameCreation: 1, gameDuration: 1800, teams: [], participants: [part("puuid-alice-main", "AliceMain#OCE", 100, "Ahri", "MIDDLE"), ...strangers(100, 4), ...strangers(200, 5, 10)] },
    { matchId: "OC1_SHARED", platform: "oc1", queueId: 420, gameCreation: 1, gameDuration: 1800, teams: [{ teamId: 100, win: true, bans: [], objectives: { champion: 23, tower: 9 } }, { teamId: 200, win: false, bans: [], objectives: { champion: 12 } }], participants: [part("puuid-alice-main", "AliceMain#OCE", 100, "Ahri", "MIDDLE", { kills: 11, stats: { pentaKills: 1 } }), part("puuid-bob", "Bob#OCE", 100, "Garen", "TOP"), ...strangers(100, 3, 1), ...strangers(200, 5, 20)] },
    { matchId: "OC1_VS", platform: "oc1", queueId: 0, gameCreation: 1, gameDuration: 1800, teams: [], participants: [part("puuid-bob", "Bob#OCE", 100, "Ahri", "MIDDLE"), part("puuid-alice-alt", "AliceAlt#OCE", 200, "Syndra", "MIDDLE"), ...strangers(100, 4, 30), ...strangers(200, 4, 40)] },
    { matchId: "OC1_OLDKEY", platform: "oc1", queueId: 420, gameCreation: 1, gameDuration: 1800, teams: [], participants: [part("puuid-alice-oldkey", "AliceOld#OCE", 100, "Zed", "MIDDLE"), ...strangers(100, 4, 50), ...strangers(200, 5, 60)] },
    // Carol's game: Alice was on the other team, before either linked an account; known only by her old-key PUUID.
    { matchId: "OC1_CAROL", platform: "oc1", queueId: 420, gameCreation: 1, gameDuration: 1800, teams: [], participants: [part("puuid-carol", "Carol#OCE", 200, "Jinx", "BOTTOM"), part("puuid-alice-oldkey", "AliceOld#OCE", 100, "Zed", "MIDDLE"), ...strangers(100, 4, 70), ...strangers(200, 4, 80)] },
  ]);
  const frames = (puuids: string[]) => ({ t: [0, 60000], p: Object.fromEntries(puuids.map((p) => [p, { g: [500, 900], x: [0, 280], c: [0, 8] }])) });
  await db.insert(matchTimelines).values([
    { matchId: "OC1_SOLO", platform: "oc1", participants: [{ puuid: "puuid-alice-main", purchases: [[1000, 1056]], skills: [1, 2] }], frames: frames(["puuid-alice-main", "stranger-100-0"]) },
    {
      matchId: "OC1_SHARED",
      platform: "oc1",
      participants: [
        { puuid: "puuid-alice-main", purchases: [[1000, 1056]], skills: [1], kills: [300000], deaths: [], assists: [420000] },
        { puuid: "puuid-bob", purchases: [[1000, 1055]], skills: [3], kills: [420000], deaths: [600000], assists: [300000] },
      ],
      frames: frames(["puuid-alice-main", "puuid-bob"]),
      events: { objectives: [{ t: 360000, team: 100, kind: "dragon", detail: "FIRE" }] },
    },
  ]);
  await db.insert(teamBookmarks).values([{ teamId, riotMatchId: "OC1_SHARED", playerId: null, createdByUserId: id.alice, note: "great game" }]);
  // Her journal, and Bob's entry that names her as a duo (and as someone he did not play with).
  const [block] = await db.insert(rankedBlocks).values({ playerId: id.alicePlayer, number: 1 }).returning({ id: rankedBlocks.id });
  await db.insert(rankedGames).values({ blockId: block!.id, playerId: id.alicePlayer, riotMatchId: "OC1_SOLO", championId: "Ahri", result: "win", notes: "felt good" });
  const [bobBlock] = await db.insert(rankedBlocks).values({ playerId: id.bobPlayer, number: 1 }).returning({ id: rankedBlocks.id });
  await db.insert(rankedGames).values({ blockId: bobBlock!.id, playerId: id.bobPlayer, riotMatchId: "OC1_VS", championId: "Ahri", enemyChampionId: "Syndra", result: "win", teammatePlayerId: id.alicePlayer, notPlayedWith: [id.alicePlayer], learning: "Alice roamed bot first", adjustment: "Tell AliceMain earlier" });
  // Ranked Development: her own objective and plan, and Bob's private notes that name her.
  const [aliceObjective] = await db.insert(developmentObjectives).values({ playerId: id.alicePlayer, title: "Ward the river before I shove", category: "vision", status: "practising", isPrimary: true }).returning({ id: developmentObjectives.id });
  await db.insert(developmentPlans).values({ playerId: id.alicePlayer, objectiveId: aliceObjective!.id, ifText: "my wave is crashing", thenText: "I ward the river" });
  await db.update(rankedBlocks).set({ focus: "Ward the river before I shove", closingNote: "felt good" }).where(eq(rankedBlocks.id, block!.id));
  const [bobObjective] = await db.insert(developmentObjectives).values({ playerId: id.bobPlayer, title: "Ping Alice before I roam", detail: "AliceMain roams first", category: "map-awareness", status: "practising", isPrimary: true }).returning({ id: developmentObjectives.id });
  await db.insert(developmentPlans).values({ playerId: id.bobPlayer, objectiveId: bobObjective!.id, ifText: "AliceMain shoves mid", thenText: "I follow Alice A. to the river" });
  await db.update(rankedBlocks).set({ focus: "Ping Alice before I roam", closingNote: "Good games with Alice" }).where(eq(rankedBlocks.id, bobBlock!.id));
  await db.insert(lastKnownRanks).values([
    { puuid: "puuid-alice-main", tier: "GOLD", division: "I", observedAt: new Date(), source: "draft scouting" },
    // A match window's rank checks (migration 0057): hers goes, a stranger's stays.
    { puuid: "puuid-alice-alt", tier: "UNRANKED", flexTier: "SILVER", flexDivision: "II", flexLeaguePoints: 40, observedAt: new Date(), source: "match lookup" },
    { puuid: "stranger-200-10", tier: "PLATINUM", division: "III", leaguePoints: 12, flexTier: "UNRANKED", observedAt: new Date(), source: "match lookup" },
  ]);
  await db.insert(auditEvents).values([
    { actorUserId: id.owner, actorName: "owner", action: "account.create", targetType: "user", targetId: id.alice, targetName: "alice", details: { teamMember: true } },
    { actorUserId: id.alice, actorName: "alice", action: "password.change", targetType: "user", targetId: id.alice, targetName: "alice" },
    { actorUserId: id.owner, actorName: "owner", action: "branding.save", targetType: "branding", details: { field: "name" } },
  ]);
  await db.insert(jobRuns).values({ job: "account-sync", ok: "true", summary: { logs: ["AliceMain#OCE: season 16 history complete (420:12); fetched 3", "rank lookup failed for AliceMain: timeout", "Bob#OCE: season 16 history complete"] } });
  await db.insert(appSettings).values([
    { key: `account_sync:${id.aliceMain}`, value: {} },
    { key: `account_refresh:${id.alicePlayer}`, value: {} },
    { key: `figures_catchup:${id.alicePlayer}`, value: {} },
  ]);
}

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

/** Every row of every table as text: whatever identifies her must be gone from all of it. */
async function whereTraces(db: Db, needles: string[]): Promise<string[]> {
  const tables = rowsOf<{ table_name: string }>(await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'privacy_erasures'`));
  expect(tables.length).toBeGreaterThan(40);
  const out: string[] = [];
  for (const { table_name } of tables) {
    for (const needle of needles) {
      const [row] = rowsOf<{ n: number | string }>(await db.execute(sql`SELECT count(*) AS n FROM ${sql.identifier(table_name)} t WHERE strpos(lower(to_jsonb(t)::text), lower(${needle})) > 0`));
      if (Number(row?.n ?? 0) > 0) out.push(`${table_name}: ${needle} (${row!.n})`);
    }
  }
  return out;
}

beforeAll(async () => {
  handle = await testDb();
  await seed(handle.db);
}, 120_000);
afterAll(async () => {
  await handle?.close();
});

describe("personal-data erasure", () => {
  it("finds every identity, including an old-key PUUID and a former Riot ID, and previews without changing anything", async () => {
    const subject = await memberSubject(handle.db, { userId: id.alice });
    expect(subject.puuids.sort()).toEqual(["puuid-alice-alt", "puuid-alice-main", "puuid-alice-oldkey"]);
    expect(subject.riotIds).toEqual(expect.arrayContaining(["AliceMain#OCE", "AliceAlt#OCE", "AliceOld#OCE"]));
    const preview = await previewErasure(handle.db, subject);
    expect(preview.counts).toMatchObject({ account: true, profile: true, riotAccounts: 2, journalEntries: 1, gamesDeleted: 2, gamesDeidentified: 3, lanePartners: 1, notes: 8 });
    expect(preview.counts.auditEntries).toBe(2);
    expect(preview.counts.jobLogs).toBe(1);
    expect(preview.mentions).toEqual(
      expect.arrayContaining([
        { where: "Ranked Development notes of other players", rows: 4 },
        { where: "Ranked Development objectives of other players", rows: 4 },
      ]),
    );
    // Nothing changed.
    expect((await handle.db.select().from(users).where(eq(users.id, id.alice))).length).toBe(1);
    expect((await handle.db.select().from(privacyErasures)).length).toBe(0);
  });

  it("refuses the Owner, yourself, an administrator unless the Owner asks, and the last administrator", async () => {
    await expect(eraseSubject(handle.db, id.admin, { userId: id.owner })).rejects.toThrow(/Owner account cannot be erased/);
    await expect(eraseSubject(handle.db, id.alice, { userId: id.alice })).rejects.toThrow(/your own account/);
    await expect(eraseSubject(handle.db, id.bob, { userId: id.admin })).rejects.toThrow(/Only the Owner can erase an administrator/);
    expect((await handle.db.select().from(privacyErasures)).length).toBe(0);
  });

  it("changes nothing when it is interrupted, and completes when run again", async () => {
    control.failPrune = true;
    await expect(eraseSubject(handle.db, id.owner, { userId: id.alice })).rejects.toThrow("connection lost");
    expect((await handle.db.select().from(users).where(eq(users.id, id.alice))).length).toBe(1);
    expect((await handle.db.select().from(matchDetails).where(eq(matchDetails.matchId, "OC1_SOLO"))).length).toBe(1);
    expect((await handle.db.select().from(privacyErasures)).length).toBe(0);

    const result = await eraseSubject(handle.db, id.owner, { userId: id.alice });
    expect(result.reference).toMatch(/^ER-[A-Z2-9]{6}$/);
    // Run again: she is no longer there.
    await expect(eraseSubject(handle.db, id.owner, { userId: id.alice })).rejects.toThrow(/Account not found/);
    expect((await handle.db.select().from(privacyErasures)).length).toBe(1);
  });

  it("removes her account, sessions, profile, Riot accounts, games and journal", async () => {
    const db = handle.db;
    expect(await db.select().from(users).where(eq(users.id, id.alice))).toEqual([]);
    expect(await db.select().from(sessions).where(eq(sessions.userId, id.alice))).toEqual([]);
    expect(await db.select().from(players).where(eq(players.id, id.alicePlayer))).toEqual([]);
    expect(await db.select().from(riotAccounts).where(eq(riotAccounts.playerId, id.alicePlayer))).toEqual([]);
    expect(await db.select().from(accountMatches).where(eq(accountMatches.accountId, id.aliceMain))).toEqual([]);
    expect(await db.select().from(rankedGames).where(eq(rankedGames.playerId, id.alicePlayer))).toEqual([]);
    expect(await db.select().from(rankedBlocks).where(eq(rankedBlocks.playerId, id.alicePlayer))).toEqual([]);
    expect(await db.select().from(developmentObjectives).where(eq(developmentObjectives.playerId, id.alicePlayer))).toEqual([]);
    expect(await db.select().from(developmentPlans).where(eq(developmentPlans.playerId, id.alicePlayer))).toEqual([]);
    // Games only she played are gone with their timelines.
    expect(await db.select().from(matchDetails).where(eq(matchDetails.matchId, "OC1_SOLO"))).toEqual([]);
    expect(await db.select().from(matchDetails).where(eq(matchDetails.matchId, "OC1_OLDKEY"))).toEqual([]);
    expect(await db.select().from(matchTimelines).where(eq(matchTimelines.matchId, "OC1_SOLO"))).toEqual([]);
  });

  it("keeps shared games for the others with her as a Removed player, and forgets her as a lane opponent", async () => {
    const db = handle.db;
    const [shared] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, "OC1_SHARED"));
    expect(shared!.participants).toHaveLength(10);
    const removed = shared!.participants[0]!;
    expect(removed).toEqual({ puuid: "", name: null, teamId: 100, championId: null, championKey: 0, champLevel: null, position: null, win: true, kills: 0, deaths: 0, assists: 0, cs: null, gold: null, damage: null, damageTaken: null, vision: null, wardsPlaced: null, items: null, spells: null, runes: null, removed: true });
    expect(shared!.participants[1]).toMatchObject({ puuid: "puuid-bob", name: "Bob#OCE", championId: "Garen" });
    const [timeline] = await db.select().from(matchTimelines).where(eq(matchTimelines.matchId, "OC1_SHARED"));
    expect(timeline!.participants.map((p) => p.puuid)).toEqual(["puuid-bob"]);
    expect(Object.keys(timeline!.frames!.p)).toEqual(["puuid-bob"]);
    // Her kill times went with her entry; Bob's stay, and the objectives are the teams', not hers.
    expect(timeline!.participants[0]).toEqual({ puuid: "puuid-bob", purchases: [[1000, 1055]], skills: [3], kills: [420000], deaths: [600000], assists: [300000] });
    expect(timeline!.events).toEqual({ objectives: [{ t: 360000, team: 100, kind: "dragon", detail: "FIRE" }] });
    // Bob's summary of the shared game: the team's kills from Riot's team total, no team damage (hers is gone).
    const [bobShared] = await db.select().from(accountMatches).where(sql`${accountMatches.accountId} = ${id.bobAccount} AND ${accountMatches.matchId} = 'OC1_SHARED'`);
    expect(bobShared).toMatchObject({ teamKills: 23, teamDamage: null });
    // Bob faced her in OC1_VS: his record and his journal no longer say which champion she played.
    const [bobVs] = await db.select().from(accountMatches).where(sql`${accountMatches.accountId} = ${id.bobAccount} AND ${accountMatches.matchId} = 'OC1_VS'`);
    expect(bobVs!.enemyChampionId).toBeNull();
    const [bobJournal] = await db.select().from(rankedGames).where(eq(rankedGames.playerId, id.bobPlayer));
    expect(bobJournal).toMatchObject({ enemyChampionId: null, teammatePlayerId: null, notPlayedWith: [] });
    // Carol's game, where she was known only by an old-key PUUID, is de-identified too.
    const [carol] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, "OC1_CAROL"));
    expect(carol!.participants.filter((p) => p.removed)).toHaveLength(1);
    expect(carol!.participants.find((p) => p.puuid === "puuid-carol")).toBeTruthy();
    // The bookmark of the shared game stays, without who made it.
    const [bookmark] = await db.select().from(teamBookmarks).where(eq(teamBookmarks.riotMatchId, "OC1_SHARED"));
    expect(bookmark).toMatchObject({ createdByUserId: null, note: "great game" });
  });

  it("keeps the others' private Ranked Development notes, with her name taken out of them", async () => {
    const db = handle.db;
    const [objective] = await db.select().from(developmentObjectives).where(eq(developmentObjectives.playerId, id.bobPlayer));
    expect(objective).toMatchObject({ title: "Ping [removed] before I roam", detail: "[removed] roams first", status: "practising", isPrimary: true });
    const [plan] = await db.select().from(developmentPlans).where(eq(developmentPlans.playerId, id.bobPlayer));
    expect(plan).toMatchObject({ ifText: "[removed] shoves mid", thenText: "I follow [removed] to the river", objectiveId: objective!.id });
    const [session] = await db.select().from(rankedBlocks).where(eq(rankedBlocks.playerId, id.bobPlayer));
    expect(session).toMatchObject({ focus: "Ping [removed] before I roam", closingNote: "Good games with [removed]" });
    const [review] = await db.select().from(rankedGames).where(eq(rankedGames.playerId, id.bobPlayer));
    expect(review).toMatchObject({ learning: "[removed] roamed bot first", adjustment: "Tell [removed] earlier" });
  });

  it("removes her rank and log traces", async () => {
    const db = handle.db;
    expect((await db.select().from(lastKnownRanks)).map((r) => r.puuid)).toEqual(["stranger-200-10"]);
    const [run] = await db.select().from(jobRuns);
    expect(run!.summary).toEqual({ logs: ["[removed]: season 16 history complete (420:12); fetched 3", "rank lookup failed for [removed]: timeout", "Bob#OCE: season 16 history complete"] });
    // Every lease keyed by her accounts or profile goes too (the figures catch-up's since round 2 of the leases review).
    expect(await db.select().from(appSettings).where(sql`${appSettings.key} LIKE 'account_%' OR ${appSettings.key} LIKE 'figures_catchup:%'`)).toEqual([]);
  });

  it("keeps the admin log's record of what happened, naming her Erased member", async () => {
    const rows = await handle.db.select().from(auditEvents);
    expect(rows.find((r) => r.action === "account.create")).toMatchObject({ actorName: "owner", targetId: null, targetName: ERASED_MEMBER });
    expect(rows.find((r) => r.action === "password.change")).toMatchObject({ actorUserId: null, actorName: ERASED_MEMBER, targetId: null, targetName: ERASED_MEMBER });
    expect(rows.find((r) => r.action === "branding.save")).toMatchObject({ actorName: "owner", details: { field: "name" } });
  });

  it("leaves nothing in the database that names or identifies her", async () => {
    expect(await whereTraces(handle.db, ALICE_TRACES)).toEqual([]);
    // The erasure record holds keyed tokens only.
    const [record] = await handle.db.select().from(privacyErasures);
    expect(JSON.stringify(record)).not.toMatch(/alice|puuid-|OCE/i);
    expect(record!.tokens.every((t) => /^(user|player|account|puuid|riotid):[0-9a-f]{64}$/.test(t))).toBe(true);
  });

  it("keeps her out of games synced later, by PUUID or (after an API key change) by Riot ID, learning the new PUUID", async () => {
    const db = handle.db;
    const match = (matchId: string, alice: { puuid: string; gameName: string; tagLine: string }) =>
      ({
        metadata: { matchId, participants: [] },
        info: {
          gameCreation: 1_760_000_000_000,
          gameDuration: 1800,
          gameVersion: "16.1.1",
          queueId: 420,
          teams: [{ teamId: 100, win: true, bans: [], objectives: { champion: { kills: 20 } } }],
          participants: [
            { puuid: alice.puuid, riotIdGameName: alice.gameName, riotIdTagline: alice.tagLine, teamId: 100, championId: 103, championName: "Ahri", teamPosition: "MIDDLE", win: true, kills: 9, deaths: 1, assists: 3 },
            { puuid: "puuid-bob", riotIdGameName: "Bob", riotIdTagline: "OCE", teamId: 100, championId: 86, championName: "Garen", teamPosition: "TOP", win: true, kills: 2, deaths: 2, assists: 2 },
          ],
        },
      }) as unknown as RiotMatch;
    await storeMatchDetail(db, "oc1", match("OC1_LATER", { puuid: "puuid-alice-main", gameName: "AliceMain", tagLine: "OCE" }), new Map());
    await storeMatchDetail(db, "oc1", match("OC1_NEWKEY", { puuid: "puuid-alice-newkey", gameName: "alicemain", tagLine: "oce" }), new Map());
    for (const matchId of ["OC1_LATER", "OC1_NEWKEY"]) {
      const [row] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, matchId));
      expect(row!.participants[0]).toMatchObject({ removed: true, puuid: "", name: null });
      expect(row!.participants[1]).toMatchObject({ puuid: "puuid-bob" });
    }
    // The new PUUID was learned: the erasure now holds even if she renames.
    const filter = await erasureFilter(db);
    expect(filter.puuid("puuid-alice-newkey")).toBe(true);
    expect(filter.participant({ puuid: "puuid-alice-newkey", name: "Totally New#NAME" })).toBe(true);
    // A pure row build (no filter) still stores everyone: the redaction is the filter's doing.
    expect(matchDetailRow("oc1", match("X", { puuid: "p", gameName: "A", tagLine: "B" }), new Map()).participants).toHaveLength(2);
  });

  it("refuses to link her Riot accounts again by accident", async () => {
    const db = handle.db;
    await expect(addAccount(db, { ownerType: "player", playerId: id.bobPlayer, riotId: "AliceAlt#OCE", platform: "oc1" })).rejects.toThrow(AccountError);
    const client: RiotIdentityClient = { accountByRiotId: async () => ({ puuid: "puuid-alice-main", gameName: "AliceMain", tagLine: "OCE" }), activePlatformByPuuid: async () => null };
    expect(await verifyRiotIdentity(db, "AliceMain#OCE", client, { platformHint: "oc1" })).toMatchObject({ status: "erased" });
  });

  it("re-applies the erasure to a restored backup taken before it, from the exported records", async () => {
    const exported = await exportErasures(handle.db);
    expect(JSON.stringify(exported)).not.toMatch(/alice/i);
    const restored = await testDb();
    try {
      // The restored backup: everything as it was before the erasure (same ids), without the records.
      await seed(restored.db);
      expect((await whereTraces(restored.db, ["AliceMain"])).length).toBeGreaterThan(0);
      expect(await importErasures(restored.db, JSON.parse(JSON.stringify(exported)))).toEqual({ added: 1, updated: 0 });
      const result = await reconcileErasures(restored.db, { mode: "full" });
      expect(result).toMatchObject({ records: 1, unusable: 0, people: 1 });
      expect(await whereTraces(restored.db, ALICE_TRACES)).toEqual([]);
      // Reconciling again finds nothing more.
      expect(await reconcileErasures(restored.db, { mode: "full" })).toMatchObject({ people: 0, traces: 0 });
    } finally {
      await restored.close();
    }
  }, 120_000);

  it("lets an administrator release her Riot accounts when she asks to come back", async () => {
    const db = handle.db;
    const [record] = await db.select().from(privacyErasures);
    expect(await releaseErasure(db, record!.reference)).toBe(true);
    const client: RiotIdentityClient = { accountByRiotId: async () => ({ puuid: "puuid-alice-main", gameName: "AliceMain", tagLine: "OCE" }), activePlatformByPuuid: async () => null };
    expect(await verifyRiotIdentity(db, "AliceMain#OCE", client, { platformHint: "oc1" })).toMatchObject({ status: "verified" });
  });

  it("erases a former member known only by their Riot account", async () => {
    const db = handle.db;
    await db.insert(matchDetails).values({ matchId: "OC1_FORMER", platform: "oc1", queueId: 420, gameCreation: 1, gameDuration: 1800, teams: [], participants: [part("puuid-gone", "GoneGuy#OCE", 100, "Lux", "MIDDLE"), part("puuid-carol", "Carol#OCE", 100, "Jinx", "BOTTOM"), ...strangers(100, 3, 90), ...strangers(200, 5, 95)] });
    await db.insert(accountMatches).values({ accountId: id.carolAccount, matchId: "OC1_FORMER", gameCreation: 1, queueId: 420, championId: "Jinx", role: "ADC", win: true, teamId: 100 });
    await expect(formerMemberSubject(db, { puuid: "puuid-carol", riotId: "Carol#OCE" })).rejects.toThrow(/erase that member/);
    const subject = await formerMemberSubject(db, { puuid: "puuid-gone", riotId: "GoneGuy#OCE", names: ["Gone Guy"] });
    await eraseSubject(db, id.owner, subject);
    const [row] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, "OC1_FORMER"));
    expect(row!.participants[0]).toMatchObject({ removed: true });
    expect(await whereTraces(db, ["puuid-gone", "GoneGuy"])).toEqual([]);
  });
});
