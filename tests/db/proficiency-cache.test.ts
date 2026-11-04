import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { getProficiencyLookup, invalidateProficiencyCache } from "@/server/proficiency/service";

/*
  The proficiency bundles each instance keeps for five minutes (server/proficiency/service.ts).
  A sync, a new account or an erasure drops them (invalidateProficiencyCache); a lookup still
  being built at that moment must not put them back when it finishes, nor keep its own bundle,
  which may have been read before the change. Readers that arrive together build the bundle once.
*/

let handle: DbHandle;
const ids = { pat: "", sam: "", patAccount: "" };

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  const team = await getOrCreateTeam(db);
  ids.pat = (await createPlayer(db, team.id, { displayName: "Pat", primaryRole: "MID" })).id;
  ids.sam = (await createPlayer(db, team.id, { displayName: "Sam", primaryRole: "TOP" })).id;
  ids.patAccount = (await addAccount(db, { ownerType: "player", playerId: ids.pat, riotId: "Pat#OCE", platform: "oc1", puuid: "puuid-pat" })).id;
  const sam = (await addAccount(db, { ownerType: "player", playerId: ids.sam, riotId: "Sam#OCE", platform: "oc1", puuid: "puuid-sam" })).id;
  await db.insert(accountChampionHistory).values([
    { accountId: ids.patAccount, championId: "Ahri", role: "MID", queueGroup: "solo", patch: "16.20", games: 3, wins: 2, lastPlayedAt: new Date() },
    { accountId: sam, championId: "Gwen", role: "TOP", queueGroup: "solo", patch: "16.20", games: 4, wins: 2, lastPlayedAt: new Date() },
  ]);
}, 60_000);
afterAll(async () => {
  invalidateProficiencyCache();
  await handle.close();
});

/** A sync stored more of Pat's Ahri games. */
const patPlayed = (games: number) => handle.db.update(accountChampionHistory).set({ games }).where(and(eq(accountChampionHistory.accountId, ids.patAccount), eq(accountChampionHistory.championId, "Ahri")));
const ahriGames = async (players: string[]) => (await getProficiencyLookup(handle.db, players))(ids.pat, "Ahri", "MID")!.games;

describe("the proficiency cache", () => {
  it("is not put back by a lookup that was being built when it was dropped", async () => {
    invalidateProficiencyCache();
    expect(await ahriGames([ids.pat])).toBe(3);
    // The sync stores two more games and drops the bundles while another lookup is being built.
    await patPlayed(5);
    const building = getProficiencyLookup(handle.db, [ids.pat, ids.sam]);
    invalidateProficiencyCache();
    await building;
    expect(await ahriGames([ids.pat])).toBe(5);
  });

  it("does not keep the bundle of a lookup built across the drop", async () => {
    invalidateProficiencyCache();
    const building = getProficiencyLookup(handle.db, [ids.pat, ids.sam]);
    invalidateProficiencyCache();
    await building;
    // What that build read may predate the change that dropped the cache: here a write it did not see.
    await patPlayed(7);
    expect(await ahriGames([ids.pat, ids.sam])).toBe(7);
  });

  it("still keeps a bundle built without a drop for the next lookup", async () => {
    invalidateProficiencyCache();
    expect(await ahriGames([ids.pat])).toBe(7);
    await patPlayed(9);
    expect(await ahriGames([ids.pat])).toBe(7);
    invalidateProficiencyCache();
    expect(await ahriGames([ids.pat])).toBe(9);
  });

  it("builds the bundle once for readers that arrive together, and not at all once it is kept", async () => {
    const select = vi.spyOn(handle.db, "select");
    invalidateProficiencyCache();
    await getProficiencyLookup(handle.db, [ids.pat, ids.sam]);
    const alone = select.mock.calls.length;
    expect(alone).toBeGreaterThan(0);
    invalidateProficiencyCache();
    select.mockClear();
    await Promise.all([getProficiencyLookup(handle.db, [ids.pat, ids.sam]), getProficiencyLookup(handle.db, [ids.pat, ids.sam]), getProficiencyLookup(handle.db, [ids.pat, ids.sam])]);
    expect(select.mock.calls.length).toBe(alone);
    select.mockClear();
    await getProficiencyLookup(handle.db, [ids.pat, ids.sam]);
    expect(select.mock.calls.length).toBe(0);
    // A reader after a drop does not join a build started before it: it reads for itself.
    const building = getProficiencyLookup(handle.db, [ids.pat]);
    invalidateProficiencyCache();
    select.mockClear();
    await Promise.all([building, getProficiencyLookup(handle.db, [ids.pat])]);
    expect(select.mock.calls.length).toBeGreaterThan(0);
    select.mockRestore();
  });
});
