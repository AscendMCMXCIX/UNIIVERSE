import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { rankSnapshots, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { loadRankHistory, recordRankSnapshots, storedRankFrom } from "@/server/accounts/rank-history";
import { rankProgress } from "@/domain/rank-progress";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  R8 rank history: the first reading is stored even when nothing moves afterwards, repeated
  readings are not, Solo/Duo and Flex are kept apart, a queue that disappears is recorded once as
  unranked (a reset), and the Main account comes first.
*/

let handle: DbHandle;
let playerId: string;
let main: string;
let alt: string;
const day = (n: number) => new Date(Date.UTC(2026, 8, 1) + n * 86_400_000);
const solo = (tier: string, rank: string, lp: number, wins: number, losses: number) => ({ queueType: "RANKED_SOLO_5x5", tier, rank, leaguePoints: lp, wins, losses });
const flex = (tier: string, rank: string, lp: number, wins: number, losses: number) => ({ queueType: "RANKED_FLEX_SR", tier, rank, leaguePoints: lp, wins, losses });

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  playerId = (await createPlayer(db, team.id, { displayName: "Ranker", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: "Alt", tagLine: "T", platform: "oc1", puuid: "p-alt", label: "alt" }).returning({ id: riotAccounts.id });
  const [m] = await db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: "Main", tagLine: "T", platform: "oc1", puuid: "p-main", label: "main" }).returning({ id: riotAccounts.id });
  alt = a!.id;
  main = m!.id;
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("rank snapshots", () => {
  it("stores the first reading, skips repeats and keeps queues apart", async () => {
    const db = handle.db;
    expect(await recordRankSnapshots(db, main, [solo("GOLD", "III", 85, 20, 18), flex("SILVER", "I", 10, 5, 5)], day(0))).toBe(2);
    expect(await recordRankSnapshots(db, main, [solo("GOLD", "III", 85, 20, 18), flex("SILVER", "I", 10, 5, 5)], day(1))).toBe(0);
    expect(await recordRankSnapshots(db, main, [solo("GOLD", "II", 3, 21, 18), flex("SILVER", "I", 10, 5, 5)], day(2))).toBe(1);
    const rows = await db.select().from(rankSnapshots);
    expect(rows.filter((r) => r.queue === "solo")).toHaveLength(2);
    expect(rows.filter((r) => r.queue === "flex")).toHaveLength(1);
  });

  it("never records an account that was never ranked in a queue", async () => {
    expect(await recordRankSnapshots(handle.db, alt, [], day(0))).toBe(0);
  });

  it("records a queue that disappears once, as unranked, and the chart starts a new season", async () => {
    const db = handle.db;
    expect(await recordRankSnapshots(db, main, [flex("SILVER", "I", 10, 5, 5)], day(30))).toBe(1); // solo gone
    expect(await recordRankSnapshots(db, main, [flex("SILVER", "I", 10, 5, 5)], day(31))).toBe(0); // only once
    expect(await recordRankSnapshots(db, main, [solo("GOLD", "IV", 20, 3, 2), flex("SILVER", "I", 10, 5, 5)], day(33))).toBe(1);
    const { accounts } = await loadRankHistory(db, playerId);
    expect(accounts.map((a) => a.label)).toEqual(["main", "alt"]);
    const p = rankProgress("solo", accounts[0]!.snapshots, day(34).getTime());
    expect(p.trackingSince).toBe(day(0).getTime());
    expect(p.segments).toBe(2);
    expect(p.events.map((e) => e.kind)).toEqual(["placed", "reset", "promotion"]);
  });
});

describe("the account's stored rank (profile header)", () => {
  it("prefers Solo/Duo, falls back to Flex, and is cleared when Riot reports no ranked queue", () => {
    const now = day(40);
    expect(storedRankFrom([flex("SILVER", "I", 10, 5, 5), solo("GOLD", "II", 64, 38, 31)], now)).toMatchObject({ tier: "GOLD", division: "II", leaguePoints: 64, rankQueue: "solo" });
    expect(storedRankFrom([flex("SILVER", "I", 10, 5, 5)], now)).toMatchObject({ tier: "SILVER", rankQueue: "flex" });
    expect(storedRankFrom([], now)).toEqual({ tier: null, division: null, leaguePoints: null, rankedWins: null, rankedLosses: null, rankQueue: null, rankUpdatedAt: now });
  });

  it("agrees with the latest snapshot after a season reset", async () => {
    const db = handle.db;
    const answer: ReturnType<typeof solo>[] = [];
    await recordRankSnapshots(db, main, answer, day(50));
    const latest = (await loadRankHistory(db, playerId)).accounts[0]!.snapshots.filter((s) => s.queue === "solo").at(-1)!;
    expect(latest.tier).toBeNull();
    expect(storedRankFrom(answer, day(50)).tier).toBeNull();
  });
});
