import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, jobRuns, lastKnownRanks, matchTimelines, playerChampionPools, riotAccounts, players, users } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam, setCardStyle, setTeamMember } from "@/server/repositories/team";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { addAccount } from "@/server/accounts/repository";
import { jobsFreshness, playerFreshness, teamFreshness } from "@/server/ops/freshness";

/*
  The versions open pages compare to update themselves (server/ops/freshness.ts): each changes when
  something its pages show changes, and only then. Asking never calls Riot (nothing here mocks it).
*/

let handle: DbHandle;
let playerId: string;
let accountId: string;
const now = new Date();

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  const player = await createPlayer(db, team.id, { displayName: "Fresh", primaryRole: "MID", primaryPool: [] });
  playerId = player.id;
  const account = await addAccount(db, { ownerType: "player", playerId, riotId: "Fresh#OCE", platform: "oc1", puuid: "fresh-1" });
  accountId = account.id;
  await db.update(riotAccounts).set({ syncStatus: "ok", lastSyncAt: new Date(now.getTime() - 60_000) }).where(eq(riotAccounts.id, accountId));
  await db.insert(accountMatches).values({ accountId, matchId: "OC1_100", gameCreation: now.getTime() - 3_600_000, queueId: 420, championId: "Ahri", role: "MIDDLE", win: true, patch: "16.20" });
});

afterAll(async () => {
  await handle?.close();
});

describe("a player's version", () => {
  it("stays the same while nothing changes", async () => {
    const a = await playerFreshness(handle.db, playerId);
    const b = await playerFreshness(handle.db, playerId);
    expect(b.v).toBe(a.v);
    expect(a.pace).toBe("idle");
  });

  it("changes with a new game, a figures backfill, a rank change, a sync and a profile edit", async () => {
    const db = handle.db;
    const versions = [(await playerFreshness(db, playerId)).v];
    await db.insert(accountMatches).values({ accountId, matchId: "OC1_101", gameCreation: now.getTime() - 60_000, queueId: 420, championId: "Ahri", role: "MIDDLE", win: false, patch: "16.20" });
    versions.push((await playerFreshness(db, playerId)).v);
    await db.update(accountMatches).set({ extraStats: { pentaKills: 1 } }).where(eq(accountMatches.matchId, "OC1_100"));
    versions.push((await playerFreshness(db, playerId)).v);
    await db.update(riotAccounts).set({ tier: "EMERALD", division: "II", leaguePoints: 40, rankedWins: 10, rankedLosses: 8, rankQueue: "solo" }).where(eq(riotAccounts.id, accountId));
    versions.push((await playerFreshness(db, playerId)).v);
    await db.update(riotAccounts).set({ lastSyncAt: new Date() }).where(eq(riotAccounts.id, accountId));
    versions.push((await playerFreshness(db, playerId)).v);
    await db.update(players).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(players.id, playerId));
    versions.push((await playerFreshness(db, playerId)).v);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("changes with the card, the pools, the picture and the opponents' ranks stored for Match History", async () => {
    const db = handle.db;
    const versions = [(await playerFreshness(db, playerId)).v];
    await setCardStyle(db, playerId, { featuredChampionId: "Ahri", featuredSkinNum: 0, cardAccent: "gold" });
    versions.push((await playerFreshness(db, playerId)).v);
    await db.insert(playerChampionPools).values({ playerId, slot: "primary", championId: "Ahri", position: 0 });
    versions.push((await playerFreshness(db, playerId)).v);
    await db.update(playerChampionPools).set({ position: 1 }).where(eq(playerChampionPools.playerId, playerId));
    versions.push((await playerFreshness(db, playerId)).v);
    await db.insert(users).values({ username: "fresh-user", displayName: "Fresh", passwordHash: "x", role: "player", playerId, avatarVersion: 1 });
    versions.push((await playerFreshness(db, playerId)).v);
    await db.update(users).set({ avatarVersion: 2 }).where(eq(users.playerId, playerId));
    versions.push((await playerFreshness(db, playerId)).v);
    await db.insert(lastKnownRanks).values({ puuid: "someone-else", tier: "GOLD", division: "II", leaguePoints: 10, observedAt: new Date(), source: "match lookup" });
    versions.push((await playerFreshness(db, playerId)).v);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("asks again soon while the visit refresh's lease is held, and not otherwise", async () => {
    const db = handle.db;
    expect((await playerFreshness(db, playerId)).pace).toBe("idle");
    await db.execute(sql`INSERT INTO app_settings (key, value, updated_at) VALUES (${`account_refresh:${playerId}`}, '"x"'::jsonb, now())`);
    expect((await playerFreshness(db, playerId)).pace).toBe("now");
    await db.execute(sql`UPDATE app_settings SET updated_at = now() - interval '3 minutes' WHERE key = ${`account_refresh:${playerId}`}`);
    expect((await playerFreshness(db, playerId)).pace).toBe("idle");
  });

  it("follows an account still adding older games", async () => {
    const db = handle.db;
    await db.update(riotAccounts).set({ historyBackfill: { season: 16, startedAt: new Date().toISOString(), completedAt: null, queues: { "420": { offset: 20, done: false } } } }).where(eq(riotAccounts.id, accountId));
    expect((await playerFreshness(db, playerId)).pace).toBe("catching-up");
    await db.update(riotAccounts).set({ historyBackfill: { season: 16, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), queues: { "420": { offset: 20, done: true } } } }).where(eq(riotAccounts.id, accountId));
    expect((await playerFreshness(db, playerId)).pace).toBe("idle");
  });

  it("follows the timelines of the player's games, so Matchups updates when the backfill stores one", async () => {
    const db = handle.db;
    const [game] = await db.select({ matchId: accountMatches.matchId }).from(accountMatches).where(eq(accountMatches.accountId, accountId)).limit(1);
    const before = await playerFreshness(db, playerId, { now });
    await db.insert(matchTimelines).values({ matchId: game!.matchId, platform: "oc1", participants: [], frames: null });
    const stored = await playerFreshness(db, playerId, { now });
    expect(stored.v).not.toBe(before.v);
    await db.update(matchTimelines).set({ frames: { t: [0, 60_000], p: {} } }).where(eq(matchTimelines.matchId, game!.matchId));
    const framed = await playerFreshness(db, playerId, { now });
    expect(framed.v).not.toBe(stored.v);
    // Another player's timeline is not this player's.
    await db.insert(matchTimelines).values({ matchId: "OC1_NOT_MINE", platform: "oc1", participants: [], frames: null });
    expect((await playerFreshness(db, playerId, { now })).v).toBe(framed.v);
  });
});

describe("the team's version", () => {
  it("ignores an account's routine check but follows its games and rank", async () => {
    const db = handle.db;
    const before = await teamFreshness(db);
    await db.update(riotAccounts).set({ lastSyncAt: new Date(Date.now() + 5000) }).where(eq(riotAccounts.id, accountId));
    expect((await teamFreshness(db)).v).toBe(before.v);
    await db.update(riotAccounts).set({ rankedWins: 11 }).where(eq(riotAccounts.id, accountId));
    const ranked = await teamFreshness(db);
    expect(ranked.v).not.toBe(before.v);
    await db.insert(accountMatches).values({ accountId, matchId: "OC1_102", gameCreation: now.getTime(), queueId: 420, championId: "Ahri", role: "MIDDLE", win: true, patch: "16.20" });
    expect((await teamFreshness(db)).v).not.toBe(ranked.v);
    expect(before.pace).toBe("idle");
  });

  it("follows members' cards and pools, and not the ranks stored for Match History", async () => {
    const db = handle.db;
    const versions = [(await teamFreshness(db)).v];
    await setCardStyle(db, playerId, { featuredChampionId: "Ahri", featuredSkinNum: 0, cardAccent: "teal" });
    versions.push((await teamFreshness(db)).v);
    await db.update(playerChampionPools).set({ position: 2 }).where(eq(playerChampionPools.playerId, playerId));
    versions.push((await teamFreshness(db)).v);
    expect(new Set(versions).size).toBe(versions.length);
    await db.insert(lastKnownRanks).values({ puuid: "another-one", tier: "SILVER", division: "I", leaguePoints: 5, observedAt: new Date(Date.now() + 1000), source: "match lookup" });
    expect((await teamFreshness(db)).v).toBe(versions.at(-1));
  });

  it("does not move with a personal-use player's account, games, card or pools; the same changes on a member's do", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    // A personal-use player (not on the team) with a linked account, and a member with one.
    const solo = (await createPlayer(db, team.id, { displayName: "Solo", primaryRole: "ADC", primaryPool: [] })).id;
    await setTeamMember(db, team.id, solo, false);
    const member = (await createPlayer(db, team.id, { displayName: "Member", primaryRole: "TOP", primaryPool: [] })).id;
    const accountOf = new Map<string, string>();
    for (const [id, riotId, puuid] of [[solo, "Solo#OCE", "solo-1"], [member, "Member#OCE", "member-1"]] as const) {
      const a = await addAccount(db, { ownerType: "player", playerId: id, riotId, platform: "oc1", puuid });
      await db.update(riotAccounts).set({ syncStatus: "ok", lastSyncAt: new Date() }).where(eq(riotAccounts.id, a.id));
      accountOf.set(id, a.id);
    }
    // The same activity on one profile's account and card: a rank change, a rename, a new game, a new card and pool.
    const activity = async (id: string, n: number) => {
      const account = accountOf.get(id)!;
      await db.update(riotAccounts).set({ tier: "GOLD", division: "I", leaguePoints: 10 + n, rankedWins: 20 + n, rankedLosses: 10, rankQueue: "solo" }).where(eq(riotAccounts.id, account));
      await db.update(riotAccounts).set({ gameName: `Renamed${n}` }).where(eq(riotAccounts.id, account));
      await db.insert(accountMatches).values({ accountId: account, matchId: `OC1_70${n}`, gameCreation: now.getTime() + n, queueId: 420, championId: "Ahri", role: "MIDDLE", win: true, patch: "16.20" });
      await setCardStyle(db, id, { featuredChampionId: "Ahri", featuredSkinNum: 0, cardAccent: n % 2 ? "gold" : "teal" });
      await db.insert(playerChampionPools).values({ playerId: id, slot: "primary", championId: "Ahri", position: n });
    };
    const before = (await teamFreshness(db)).v;
    await activity(solo, 1);
    expect((await teamFreshness(db)).v).toBe(before);
    await activity(member, 2);
    const moved = (await teamFreshness(db)).v;
    expect(moved).not.toBe(before);
    // Joining the team moves it (the roster); so does leaving it.
    await setTeamMember(db, team.id, solo, true);
    const joined = (await teamFreshness(db)).v;
    expect(joined).not.toBe(moved);
    await setTeamMember(db, team.id, solo, false);
    expect((await teamFreshness(db)).v).not.toBe(joined);
  });
});

describe("the jobs' version", () => {
  it("changes when a job starts and when it finishes, and asks soon while one runs", async () => {
    const db = handle.db;
    const before = await jobsFreshness(db);
    const [run] = await db.insert(jobRuns).values({ job: "account-sync", trigger: "tick" }).returning();
    const running = await jobsFreshness(db);
    expect(running.v).not.toBe(before.v);
    expect(running.pace).toBe("now");
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: "true", durationMs: 1000 }).where(eq(jobRuns.id, run!.id));
    const done = await jobsFreshness(db);
    expect(done.v).not.toBe(running.v);
    expect(done.pace).toBe("idle");
  });

  it("still asks soon while a job runs when an older run never finished", async () => {
    const db = handle.db;
    // A run whose process died yesterday: it was never closed.
    const [dead] = await db.insert(jobRuns).values({ job: "integrity", trigger: "tick", startedAt: new Date(Date.now() - 86_400_000) }).returning();
    expect((await jobsFreshness(db)).pace).toBe("idle");
    const [run] = await db.insert(jobRuns).values({ job: "account-sync", trigger: "tick" }).returning();
    expect((await jobsFreshness(db)).pace).toBe("now");
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: "true", durationMs: 1000 }).where(eq(jobRuns.id, run!.id));
    expect((await jobsFreshness(db)).pace).toBe("idle");
    await db.delete(jobRuns).where(eq(jobRuns.id, dead!.id));
  });
});
