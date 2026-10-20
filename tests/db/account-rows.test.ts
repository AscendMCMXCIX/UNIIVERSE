import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory, accountMastery, accountMatches } from "@/server/db/schema";
import { addAccount } from "@/server/accounts/repository";
import { accountRows, forgetAccountRows } from "@/server/accounts/account-rows";
import { processEgress } from "@/server/db/egress";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";

/*
  An account's stored rows (games, mastery, champion history) are kept by each server instance
  until they change (server/accounts/account-rows.ts). The database decides on every read, so a
  change shows at once; only the accounts that changed are read again, and a warm read sends one
  short row per account. On Postgres the bytes are checked too (egress accounting).
*/

let handle: DbHandle;
let a: string;
let b: string;
const onPostgres = !!process.env.TEST_DATABASE_URL;

beforeAll(async () => {
  handle = await testDb();
  const team = await getOrCreateTeam(handle.db);
  const player = await createPlayer(handle.db, team.id, { displayName: "Rows", primaryRole: "MID", primaryPool: [] });
  a = (await addAccount(handle.db, { ownerType: "player", playerId: player.id, riotId: "RowsA#OCE", platform: "oc1" })).id;
  b = (await addAccount(handle.db, { ownerType: "player", playerId: player.id, riotId: "RowsB#OCE", platform: "oc1" })).id;
  const games = (account: string, n: number) => Array.from({ length: n }, (_, i) => ({ accountId: account, matchId: `OC1_${account.slice(0, 4)}_${i}`, gameCreation: Date.now() - i * 3_600_000, queueId: 420, championId: "Ahri", role: "MIDDLE", win: i % 2 === 0, patch: "16.20", kills: i, deaths: 1, assists: 2 }));
  await handle.db.insert(accountMatches).values([...games(a, 120), ...games(b, 80)]);
  await handle.db.insert(accountMastery).values([
    { accountId: a, championId: "Ahri", points: 50_000, level: 7 },
    { accountId: b, championId: "Ahri", points: 10_000, level: 4 },
  ]);
  await handle.db.insert(accountChampionHistory).values({ accountId: a, championId: "Ahri", role: "MIDDLE", queueGroup: "solo", patch: "16.20", games: 3, wins: 2 });
});
afterAll(async () => {
  await handle.close();
});

describe("an account's stored rows", () => {
  it("are read once, then only their fingerprints, until they change", async () => {
    const db = handle.db;
    forgetAccountRows(db);
    const cold = processEgress();
    expect(await accountRows(db, "games", [a, b])).toHaveLength(200);
    const warm = processEgress();
    expect(await accountRows(db, "games", [b, a, a])).toHaveLength(200);
    const after = processEgress();
    if (onPostgres) {
      // Cold: fingerprints and all 200 rows. Warm: one fingerprint row per account, nothing else.
      expect(warm.rows - cold.rows).toBe(202);
      expect(after.rows - warm.rows).toBe(2);
      expect(after.bytes - warm.bytes).toBeLessThan(600);
      expect(warm.bytes - cold.bytes).toBeGreaterThan(20_000);
    }
  });

  it("show every change on the next read, reading again only the account that changed", async () => {
    const db = handle.db;
    await accountRows(db, "games", [a, b]);
    // A filled-in record on one account: same count, new values.
    await db.update(accountMatches).set({ cs: 211 }).where(and(eq(accountMatches.accountId, b), eq(accountMatches.matchId, `OC1_${b.slice(0, 4)}_3`)));
    const before = processEgress();
    const rows = await accountRows(db, "games", [a, b]);
    expect(rows.find((r) => r.matchId === `OC1_${b.slice(0, 4)}_3`)?.cs).toBe(211);
    if (onPostgres) expect(processEgress().rows - before.rows).toBe(2 + 80);
    // A new game, then one removed.
    await db.insert(accountMatches).values({ accountId: a, matchId: "OC1_NEW", gameCreation: Date.now(), queueId: 420, championId: "Orianna", role: "MIDDLE", win: true, patch: "16.20" });
    expect((await accountRows(db, "games", [a])).some((r) => r.matchId === "OC1_NEW")).toBe(true);
    await db.delete(accountMatches).where(eq(accountMatches.matchId, "OC1_NEW"));
    expect((await accountRows(db, "games", [a])).some((r) => r.matchId === "OC1_NEW")).toBe(false);
  });

  it("cover mastery and champion history the same way, and an account with none", async () => {
    const db = handle.db;
    expect((await accountRows(db, "mastery", [a, b])).map((m) => m.points).sort((x, y) => x - y)).toEqual([10_000, 50_000]);
    await db.update(accountMastery).set({ points: 51_234 }).where(eq(accountMastery.accountId, a));
    expect((await accountRows(db, "mastery", [a])).map((m) => m.points)).toEqual([51_234]);
    expect(await accountRows(db, "history", [b])).toEqual([]);
    expect((await accountRows(db, "history", [a, b]))[0]).toMatchObject({ championId: "Ahri", games: 3, wins: 2 });
    await db.insert(accountChampionHistory).values({ accountId: b, championId: "Ahri", role: "MIDDLE", queueGroup: "solo", patch: "16.20", games: 1, wins: 1 });
    expect(await accountRows(db, "history", [b])).toHaveLength(1);
  });

  it("carry each game's multikill counts in a short form, and a newly summarised game's counts show on the next read", async () => {
    const db = handle.db;
    const id = (n: number) => `OC1_${a.slice(0, 4)}_${n}`;
    await db.update(accountMatches).set({ extraStats: { doubleKills: 2, tripleKills: 1, quadraKills: 0, pentaKills: 0, largestMultiKill: 3 } }).where(eq(accountMatches.matchId, id(10)));
    await db.update(accountMatches).set({ extraStats: { doubleKills: 0, tripleKills: 0, quadraKills: 0, pentaKills: 0, wardsKilled: 4 } }).where(eq(accountMatches.matchId, id(11)));
    // A record with other figures but no multikill counts (it never will have them: "-"), and one
    // never summarised (still to come: null).
    await db.update(accountMatches).set({ extraStats: { wardsKilled: 2 } }).where(eq(accountMatches.matchId, id(12)));
    const of = async (n: number) => (await accountRows(db, "games", [a])).find((r) => r.matchId === id(n))?.multikills;
    expect(await of(10)).toBe("2,1,0,0");
    expect(await of(11)).toBe("");
    expect(await of(12)).toBe("-");
    expect(await of(13)).toBeNull();
    // Checked by the figures backfill and found without counts: "-" as well.
    await db.update(accountMatches).set({ extraStats: {} }).where(eq(accountMatches.matchId, id(12)));
    expect(await of(12)).toBe("-");
    await db.update(accountMatches).set({ extraStats: { doubleKills: 1, tripleKills: 1, quadraKills: 1, pentaKills: 1 } }).where(eq(accountMatches.matchId, id(13)));
    expect(await of(13)).toBe("1,1,1,1");
  });

  it("share one load between concurrent readers, and cannot be changed by a caller", async () => {
    const db = handle.db;
    forgetAccountRows(db);
    const before = processEgress();
    const [x, y] = await Promise.all([accountRows(db, "games", [a]), accountRows(db, "games", [a])]);
    expect(x).toHaveLength(120);
    expect(y).toHaveLength(120);
    if (onPostgres) expect(processEgress().rows - before.rows).toBe(2 + 120);
    expect(() => {
      (x[0] as { kills: number | null }).kills = 99;
    }).toThrow();
  });
});
