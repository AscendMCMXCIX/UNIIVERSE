import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches } from "@/server/db/schema";
import { addAccount } from "@/server/accounts/repository";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { loadSeasonGames } from "@/server/players/season-games";

/*
  A player's stored games are read on every profile page, so each instance keeps them until they
  change. "Change" is decided by the database on every read (a fingerprint of every column read),
  so a synced game, a filled-in record or a removed game shows at once, never after a delay.
*/

let handle: DbHandle;
let accountId: string;

beforeAll(async () => {
  handle = await testDb();
  const team = await getOrCreateTeam(handle.db);
  const player = await createPlayer(handle.db, team.id, { displayName: "Cached", primaryRole: "MID", primaryPool: [] });
  accountId = (await addAccount(handle.db, { ownerType: "player", playerId: player.id, riotId: "Cached#OCE", platform: "oc1" })).id;
  await handle.db.insert(accountMatches).values([
    { accountId, matchId: "OC1_C1", gameCreation: Date.now() - 86_400_000, queueId: 420, championId: "Ahri", role: "MIDDLE", win: true, patch: "16.20", kills: 1, deaths: 2, assists: 3 },
    { accountId, matchId: "OC1_C2", gameCreation: Date.now() - 2 * 86_400_000, queueId: 440, championId: "Ahri", role: "MIDDLE", win: false, patch: "16.20", kills: 4, deaths: 5, assists: 6 },
  ]);
});
afterAll(async () => {
  await handle.close();
});

describe("a player's stored games", () => {
  it("are served from the instance while unchanged, and every change shows on the next read", async () => {
    const db = handle.db;
    const first = await loadSeasonGames(db, [accountId]);
    expect(first.map((g) => g.matchId)).toEqual(["OC1_C1", "OC1_C2"]);
    // Unchanged: the same rows (the instance's copy; a caller's array is its own).
    const again = await loadSeasonGames(db, [accountId]);
    expect(again).toEqual(first);
    expect(again).not.toBe(first);

    // A record filled in later (the same number of games).
    await db.update(accountMatches).set({ cs: 211, damage: 23_000 }).where(and(eq(accountMatches.accountId, accountId), eq(accountMatches.matchId, "OC1_C2")));
    expect((await loadSeasonGames(db, [accountId])).find((g) => g.matchId === "OC1_C2")).toMatchObject({ cs: 211, damage: 23_000 });

    // A new game from the account sync, then one removed.
    await db.insert(accountMatches).values({ accountId, matchId: "OC1_C3", gameCreation: Date.now() - 3_600_000, queueId: 420, championId: "Ahri", role: "MIDDLE", win: true, patch: "16.20", kills: 9, deaths: 0, assists: 9 });
    expect((await loadSeasonGames(db, [accountId])).map((g) => g.matchId)).toEqual(["OC1_C3", "OC1_C1", "OC1_C2"]);
    await db.delete(accountMatches).where(eq(accountMatches.matchId, "OC1_C1"));
    expect((await loadSeasonGames(db, [accountId], { dedupe: false })).map((g) => g.matchId).sort()).toEqual(["OC1_C2", "OC1_C3"]);
  });
});
