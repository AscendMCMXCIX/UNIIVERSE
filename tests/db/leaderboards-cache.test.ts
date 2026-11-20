import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMastery, accountMatches, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { historyFingerprint } from "@/server/leaderboards/service";

/*
  Leaderboards' games cache (and Team Matches', on the same fingerprint) is emptied only by a change
  to what it holds: a game stored, details summarised, mastery changed, an account linked or removed.
  A sync that stored nothing (most runs: every account is read every 15 minutes) leaves it alone; it
  moved the last sync's time, which emptied the cache on every run (HOSTING_USAGE, "Not changed here").
*/

let handle: DbHandle;
let account: string;

beforeAll(async () => {
  handle = await testDb();
  const teamId = (await getOrCreateTeam(handle.db)).id;
  const p = await createPlayer(handle.db, teamId, { displayName: "Ace", primaryRole: "TOP", primaryPool: [] });
  const [a] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: p.id, gameName: "ace", tagLine: "T", platform: "oc1", puuid: "p-ace-cache", label: "main", lastSyncAt: new Date(Date.now() - 3_600_000) }).returning({ id: riotAccounts.id });
  account = a!.id;
  await handle.db.insert(accountMatches).values({ accountId: account, matchId: "OC1_CACHE_1", gameCreation: Date.now() - 7_200_000, queueId: 420, championId: "Gwen", role: "TOP", win: true, teamId: 100, patch: "16.20", gameDuration: 1800, kills: 4, deaths: 2, assists: 6, cs: 200, damage: 20000, visionScore: 20 });
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("Leaderboards' games cache", () => {
  it("is kept by a sync that stored nothing, and emptied by a game stored or mastery changed", async () => {
    const before = await historyFingerprint(handle.db, [account]);
    // A sync that found nothing new: only its time and state move.
    await handle.db.update(riotAccounts).set({ lastSyncAt: new Date(), syncStatus: "synced", syncCursor: Date.now() }).where(eq(riotAccounts.id, account));
    expect(await historyFingerprint(handle.db, [account]), "a sync that stored nothing").toBe(before);
    // A sync that stored a game.
    await handle.db.insert(accountMatches).values({ accountId: account, matchId: "OC1_CACHE_2", gameCreation: Date.now() - 60_000, queueId: 420, championId: "Gwen", role: "TOP", win: false, teamId: 100, patch: "16.20", gameDuration: 1700, kills: 1, deaths: 5, assists: 3, cs: 150, damage: 12000, visionScore: 14 });
    const afterGame = await historyFingerprint(handle.db, [account]);
    expect(afterGame, "a game stored").not.toBe(before);
    // Mastery read again unchanged: kept; changed: emptied.
    await handle.db.insert(accountMastery).values({ accountId: account, championId: "Gwen", points: 1000, level: 3 });
    const withMastery = await historyFingerprint(handle.db, [account]);
    expect(withMastery, "mastery stored").not.toBe(afterGame);
    await handle.db.update(accountMastery).set({ points: 1000 }).where(eq(accountMastery.accountId, account));
    expect(await historyFingerprint(handle.db, [account]), "mastery rewritten unchanged").toBe(withMastery);
    await handle.db.update(accountMastery).set({ points: 1250 }).where(eq(accountMastery.accountId, account));
    expect(await historyFingerprint(handle.db, [account]), "mastery changed").not.toBe(withMastery);
  });
});
