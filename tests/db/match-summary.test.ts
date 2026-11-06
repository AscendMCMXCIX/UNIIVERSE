import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { summariseMatches } from "@/server/accounts/match-summary";
import { storeMatchUnavailable } from "@/server/accounts/match-details";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  Each stored game gets its player's figures from the stored match details once (synthetic
  data): side, gold, wards, the team's kills and damage, the extra figures. Games without
  details wait; unavailable matches are marked looked-at with empty figures; running it again
  changes nothing.
*/

let handle: DbHandle;
let account: string;
const part = (puuid: string, teamId: number, over: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({ puuid, name: null, teamId, championId: null, championKey: 0, champLevel: 15, position: null, win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null, ...over });

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const teamId = (await getOrCreateTeam(db)).id;
  const p = await createPlayer(db, teamId, { displayName: "Sum", primaryRole: "MID", primaryPool: ["Ahri"] });
  [{ id: account }] = (await db.insert(riotAccounts).values({ ownerType: "player", playerId: p.id, gameName: "sum", tagLine: "T", platform: "oc1", puuid: "puuid-sum", label: "main" }).returning({ id: riotAccounts.id })) as [{ id: string }];
  const game = (matchId: string) => ({ accountId: account, matchId, gameCreation: 1, queueId: 420, championId: "Ahri", role: "MID", win: true, patch: "16.1", gameDuration: 1800, kills: 5, deaths: 1, assists: 2, cs: 200, damage: 20000, visionScore: 20 });
  await db.insert(accountMatches).values([game("M_RED"), game("M_LATER"), game("M_GONE")]);
  await db.insert(matchDetails).values({ matchId: "M_RED", gameCreation: 1, gameDuration: 1800, teams: [], participants: [part("x1", 100, { kills: 9 }), part("puuid-sum", 200, { kills: 5, gold: 12345, wardsPlaced: 14, stats: { pentaKills: 1 } }), part("x2", 200, { kills: 6, damage: 30000 })] });
}, 60_000);
afterAll(async () => {
  await handle.close();
});

const row = async (matchId: string) => (await handle.db.select().from(accountMatches).where(and(eq(accountMatches.accountId, account), eq(accountMatches.matchId, matchId))))[0]!;

describe("match summaries", () => {
  it("copies the player's side, gold, wards, team figures and extras, and leaves games without details waiting", async () => {
    expect(await summariseMatches(handle.db)).toBe(1);
    expect(await row("M_RED")).toMatchObject({ teamId: 200, gold: 12345, wardsPlaced: 14, teamKills: 11, teamDamage: 42000, extraStats: { pentaKills: 1 } });
    expect((await row("M_RED")).summarisedAt).not.toBeNull();
    expect((await row("M_LATER")).summarisedAt).toBeNull();
    // Nothing left to do: a second run changes nothing.
    expect(await summariseMatches(handle.db)).toBe(0);
  });

  it("summarises details that arrive later, and marks an unavailable match as looked at", async () => {
    await handle.db.insert(matchDetails).values({ matchId: "M_LATER", gameCreation: 1, gameDuration: 1800, teams: [], participants: [part("puuid-sum", 100, { damage: null as unknown as number }), part("x3", 100)] });
    expect(await summariseMatches(handle.db, { matchIds: ["M_LATER"] })).toBe(1);
    // A teammate's damage is missing: no team damage, never a partial sum.
    expect(await row("M_LATER")).toMatchObject({ teamId: 100, teamKills: 6, teamDamage: null, extraStats: null });
    await storeMatchUnavailable(handle.db, account, "M_GONE");
    expect(await row("M_GONE")).toMatchObject({ teamId: null, gold: null, teamKills: null });
    expect((await row("M_GONE")).summarisedAt).not.toBeNull();
  });
});

describe("an account whose PUUID is unknown", () => {
  it("has its games left waiting by the summary until the PUUID is known, never marked checked without a side", async () => {
    const db = handle.db;
    const [player] = await db.select({ playerId: riotAccounts.playerId }).from(riotAccounts).where(eq(riotAccounts.id, account));
    const inserted = await db.insert(riotAccounts).values({ ownerType: "player", playerId: player!.playerId, gameName: "sum", tagLine: "ALT", platform: "oc1", puuid: null, label: "alt" }).returning({ id: riotAccounts.id });
    const unverified = inserted[0]!.id;
    await db.insert(accountMatches).values({ accountId: unverified, matchId: "OC1_NOPUUID", gameCreation: 1, queueId: 420, championId: "Ahri", role: "MID", win: true, patch: "16.1", gameDuration: 1800, kills: 5, deaths: 1, assists: 2 });
    await db.insert(matchDetails).values({ matchId: "OC1_NOPUUID", platform: "oc1", queueId: 420, gameCreation: 1, gameDuration: 1800, gameVersion: null, teams: [], participants: [part("puuid-sum-alt", 200), part("other-1", 100)] });
    expect(await summariseMatches(db, { accountIds: [unverified] })).toBe(0);
    const waiting = (await db.select({ summarisedAt: accountMatches.summarisedAt, teamId: accountMatches.teamId }).from(accountMatches).where(and(eq(accountMatches.accountId, unverified), eq(accountMatches.matchId, "OC1_NOPUUID"))))[0]!;
    expect(waiting).toEqual({ summarisedAt: null, teamId: null });
    // The PUUID verified again: the game gets its side.
    await db.update(riotAccounts).set({ puuid: "puuid-sum-alt" }).where(eq(riotAccounts.id, unverified));
    expect(await summariseMatches(db, { accountIds: [unverified] })).toBe(1);
    const done = (await db.select({ summarisedAt: accountMatches.summarisedAt, teamId: accountMatches.teamId }).from(accountMatches).where(and(eq(accountMatches.accountId, unverified), eq(accountMatches.matchId, "OC1_NOPUUID"))))[0]!;
    expect(done.summarisedAt).not.toBeNull();
    expect(done.teamId).toBe(200);
    await db.delete(riotAccounts).where(eq(riotAccounts.id, unverified));
    await db.delete(matchDetails).where(eq(matchDetails.matchId, "OC1_NOPUUID"));
  });
});
