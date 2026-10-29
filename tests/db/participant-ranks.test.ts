import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, lastKnownRanks, matchDetails, privacyErasures, rankSnapshots, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { getMatchHistory, getMatchRanks } from "@/server/players/match-history";
import { lookUpRanks, rankChecksAvailable, rankCoverage, resetRankLookups, RANK_LOOKUP_SHARE } from "@/server/players/participant-ranks";
import { forgetErasureCache } from "@/server/privacy/ledger";
import { keyCheckOf, tagged } from "@/server/privacy/tokens";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import type { ParticipantRank } from "@/domain/known-rank";

/*
  The ranks beside a match's players (server/players/participant-ranks.ts): stored readings first;
  LEAGUE-V4 asked only for the opened match's players whose reading is missing or over three days
  old, once each, within the daily limit and half of each rate-limit window, never waiting; both
  queues kept, "UNRANKED" where Riot lists no entry; nothing stored for anyone no longer in the
  stored match or whose personal data was erased; nothing at all for a match outside the player's
  history.
*/

let handle: DbHandle;
let memberId: string;
let strangerPlayerId: string;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-10-20T10:00:00Z");

const entry = (queueType: "RANKED_SOLO_5x5" | "RANKED_FLEX_SR", tier: string, rank: string, leaguePoints: number) => ({ queueType, tier, rank, leaguePoints, wins: 50, losses: 45 });
/** What the stand-in Riot answers per PUUID: entries, or an HTTP status. */
const ANSWERS: Record<string, unknown[] | number> = {
  "m-2": [entry("RANKED_SOLO_5x5", "BRONZE", "II", 30)],
  "x-1": [entry("RANKED_SOLO_5x5", "PLATINUM", "IV", 5)],
  "x-2": [entry("RANKED_SOLO_5x5", "EMERALD", "III", 50)],
  "x-3": [],
  "x-4": [entry("RANKED_FLEX_SR", "GOLD", "I", 77)],
  "x-5": 500,
  "x-6": [entry("RANKED_SOLO_5x5", "MASTER", "I", 120), entry("RANKED_FLEX_SR", "DIAMOND", "II", 10)],
  "x-7": [entry("RANKED_SOLO_5x5", "SILVER", "I", 99)],
  // A PUUID this key cannot read (stored under an earlier key): Riot answers 400.
  "x-9": 400,
};

function riot(options: { limiter?: RateLimiter; noWait?: boolean } = {}) {
  const asked: string[] = [];
  const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    const puuid = decodeURIComponent(url.split("/entries/by-puuid/")[1] ?? "");
    asked.push(puuid);
    const a = ANSWERS[puuid];
    if (typeof a === "number" || a === undefined) return new Response("{}", { status: typeof a === "number" ? a : 404 });
    return new Response(JSON.stringify(a), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: options.limiter ?? new RateLimiter([{ requests: 1_000, seconds: 1 }]), limitShare: RANK_LOOKUP_SHARE, noWait: options.noWait ?? true, maxRetries: 0, sleep: async () => {} });
  return { client, asked };
}

const part = (puuid: string, name: string | null, teamId: number, over: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({
  puuid,
  name,
  teamId,
  championId: "Ahri",
  championKey: 0,
  champLevel: 15,
  position: null,
  win: teamId === 100,
  kills: 1,
  deaths: 1,
  assists: 1,
  cs: 100,
  gold: 9000,
  damage: 10000,
  damageTaken: 10000,
  vision: 10,
  wardsPlaced: 5,
  items: null,
  spells: null,
  runes: null,
  ...over,
});

/** m-1 and m-2 are members; x-1 … x-7 are not; the last place is a "Removed player". */
const PLAYERS: MatchParticipantDetail[] = [
  part("m-1", "MemberOne#OCE", 100),
  part("m-2", "MemberTwo#OCE", 100),
  part("x-1", "One#OCE", 100),
  part("x-2", "Two#OCE", 100),
  part("x-3", "Three#OCE", 100),
  part("x-4", "Four#OCE", 200),
  part("x-5", "Five#OCE", 200),
  part("x-6", "Six#OCE", 200),
  part("x-7", "Seven#OCE", 200),
  { ...part("", null, 200), championId: null, removed: true },
];

async function storeMatch(matchId: string, queueId: number, accountId: string) {
  const db = handle.db;
  await db.insert(matchDetails).values({ matchId, platform: "oc1", queueId, gameCreation: NOW.getTime() - 30 * DAY, gameDuration: 1800, gameVersion: "16.20.1", teams: [], participants: PLAYERS });
  // A Season 2026 patch, so Match History lists the game in the current season.
  await db.insert(accountMatches).values({ accountId, matchId, gameCreation: NOW.getTime() - 30 * DAY, queueId, championId: "Ahri", role: "MID", win: true, patch: "16.20" });
}

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  const member = await createPlayer(db, team.id, { displayName: "MemberOne", primaryRole: "MID", primaryPool: ["Ahri"] });
  const second = await createPlayer(db, team.id, { displayName: "MemberTwo", primaryRole: "TOP", primaryPool: ["Garen"] });
  const stranger = await createPlayer(db, team.id, { displayName: "Elsewhere", primaryRole: "ADC", primaryPool: ["Jinx"] });
  memberId = member.id;
  strangerPlayerId = stranger.id;
  const one = await addAccount(db, { ownerType: "player", playerId: member.id, riotId: "MemberOne#OCE", platform: "oc1", puuid: "m-1" });
  const two = await addAccount(db, { ownerType: "player", playerId: second.id, riotId: "MemberTwo#OCE", platform: "oc1", puuid: "m-2" });
  await addAccount(db, { ownerType: "player", playerId: stranger.id, riotId: "Elsewhere#OCE", platform: "oc1", puuid: "e-1" });
  // x-7 also has an account from the retired Draft scouting: never synced, so no reading of its own.
  await db.insert(riotAccounts).values({ ownerType: "opponent", gameName: "Seven", tagLine: "OCE", platform: "oc1", puuid: "x-7" });
  // m-1 synced yesterday (Gold II in Solo/Duo, no Flex); m-2's last sync is ten days old.
  await db.update(riotAccounts).set({ tier: "GOLD", division: "II", leaguePoints: 40, rankQueue: "solo", rankUpdatedAt: new Date(NOW.getTime() - DAY) }).where(eq(riotAccounts.id, one.id));
  await db.insert(rankSnapshots).values({ accountId: one.id, queue: "solo", tier: "GOLD", division: "II", leaguePoints: 40, wins: 10, losses: 9, capturedAt: new Date(NOW.getTime() - 5 * DAY) });
  await db.update(riotAccounts).set({ tier: "SILVER", division: "I", rankQueue: "solo", rankUpdatedAt: new Date(NOW.getTime() - 10 * DAY) }).where(eq(riotAccounts.id, two.id));
  await db.insert(rankSnapshots).values({ accountId: two.id, queue: "solo", tier: "SILVER", division: "I", leaguePoints: 0, wins: 1, losses: 1, capturedAt: new Date(NOW.getTime() - 10 * DAY) });
  await storeMatch("OC1_100", 420, one.id);
  await storeMatch("OC1_200", 440, one.id);
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  resetRankLookups();
  const db = handle.db;
  await db.delete(lastKnownRanks);
  await db.delete(privacyErasures);
  forgetErasureCache();
  // x-1 was checked 20 hours ago (current); x-2 five days ago (stale); x-3 only seen by the retired Draft scouting.
  await db.insert(lastKnownRanks).values([
    { puuid: "x-1", tier: "PLATINUM", division: "IV", leaguePoints: 5, flexTier: "UNRANKED", observedAt: new Date(NOW.getTime() - 20 * HOUR), source: "match lookup" },
    { puuid: "x-2", tier: "GOLD", division: "I", leaguePoints: 90, flexTier: "UNRANKED", observedAt: new Date(NOW.getTime() - 5 * DAY), source: "match lookup" },
    { puuid: "x-3", tier: "DIAMOND", division: "IV", observedAt: new Date("2026-09-01T00:00:00Z"), source: "draft scouting" },
  ]);
});

const bySlot = (ranks: Array<{ slot: number; rank: ParticipantRank }>) => new Map(ranks.map((r) => [r.slot, r.rank]));

describe("rank checks for an opened match", () => {
  it("use stored ranks first and ask Riot once for each player whose rank is missing or stale", async () => {
    const { client, asked } = riot();
    const result = await getMatchRanks(handle.db, memberId, "OC1_100", { lookup: true, client, now: NOW });
    if (result.status !== "ok") throw new Error(result.message);
    // Not m-1 (synced yesterday), not x-1 (checked 20 hours ago), not the removed player.
    expect(asked.sort()).toEqual(["m-2", "x-2", "x-3", "x-4", "x-5", "x-6", "x-7"]);
    expect(result.check).toEqual({ asked: 7, found: 6, failed: 1, skipped: 0, reason: null });
    const r = bySlot(result.ranks);
    expect(r.get(0)).toMatchObject({ state: "ranked", queue: "solo", tier: "GOLD", division: "II", kind: "check", stale: false });
    expect(r.get(1)).toMatchObject({ state: "ranked", tier: "BRONZE", division: "II", leaguePoints: 30, stale: false });
    expect(r.get(2)).toMatchObject({ state: "ranked", tier: "PLATINUM", asOf: new Date(NOW.getTime() - 20 * HOUR).toISOString() });
    expect(r.get(3)).toMatchObject({ state: "ranked", tier: "EMERALD", division: "III", asOf: NOW.toISOString() });
    // Riot lists no entry: unranked, and when.
    expect(r.get(4)).toMatchObject({ state: "unranked", kind: "check", asOf: NOW.toISOString(), stale: false });
    // Ranked in Flex only: shown in this Solo/Duo game as Flex.
    expect(r.get(5)).toMatchObject({ state: "ranked", queue: "flex", tier: "GOLD", division: "I" });
    // Riot failed: nothing known, not "unranked".
    expect(r.get(6)).toMatchObject({ state: "unknown", stale: true });
    expect(r.get(7)).toMatchObject({ state: "ranked", queue: "solo", tier: "MASTER", division: null, leaguePoints: 120 });
    expect(r.get(9)).toMatchObject({ state: "unknown", stale: false });
    // Both queues kept, "UNRANKED" where there was no entry.
    const rows = new Map((await handle.db.select().from(lastKnownRanks)).map((x) => [x.puuid, x]));
    expect(rows.get("x-3")).toMatchObject({ tier: "UNRANKED", division: null, leaguePoints: null, flexTier: "UNRANKED", source: "match lookup" });
    expect(rows.get("x-6")).toMatchObject({ tier: "MASTER", leaguePoints: 120, flexTier: "DIAMOND", flexDivision: "II", flexLeaguePoints: 10 });
    // One row per player: x-2's and x-3's older rows were replaced, x-5 (failed) has none.
    expect([...rows.keys()].sort()).toEqual(["m-2", "x-1", "x-2", "x-3", "x-4", "x-6", "x-7"]);
  });

  it("ask nothing again for three days, and leave a failed player alone for 30 minutes", async () => {
    const first = riot();
    await getMatchRanks(handle.db, memberId, "OC1_100", { lookup: true, client: first.client, now: NOW });
    const again = riot();
    const result = await getMatchRanks(handle.db, memberId, "OC1_100", { lookup: true, client: again.client, now: new Date(NOW.getTime() + HOUR / 4) });
    expect(again.asked).toEqual([]);
    expect(result.status === "ok" && result.check).toEqual({ asked: 0, found: 0, failed: 0, skipped: 0, reason: null });
    // The Flex game shows the same readings in its own queue: x-4's Flex rank plainly, m-1 marked Solo/Duo.
    const flex = await getMatchRanks(handle.db, memberId, "OC1_200", { lookup: false, now: NOW });
    if (flex.status !== "ok") throw new Error(flex.message);
    expect(bySlot(flex.ranks).get(5)).toMatchObject({ queue: "flex", tier: "GOLD" });
    expect(bySlot(flex.ranks).get(0)).toMatchObject({ queue: "solo", tier: "GOLD" });
    expect(bySlot(flex.ranks).get(7)).toMatchObject({ queue: "flex", tier: "DIAMOND", division: "II" });
  });

  it("ask a failed player again after 30 minutes, and one Riot cannot read with this key after a day", async () => {
    const match = { matchId: "OC1_100", platform: "oc1" };
    const players = [
      { puuid: "x-5", name: "Five#OCE" },
      { puuid: "x-9", name: "Nine#OCE" },
    ];
    const at = (ms: number) => ({ now: new Date(NOW.getTime() + ms) });
    const first = riot();
    expect(await lookUpRanks(handle.db, first.client, match, players, at(0))).toMatchObject({ asked: 2, found: 0, failed: 2 });
    const soon = riot();
    await lookUpRanks(handle.db, soon.client, match, players, at(29 * 60_000));
    expect(soon.asked).toEqual([]);
    const later = riot();
    await lookUpRanks(handle.db, later.client, match, players, at(31 * 60_000));
    expect(later.asked).toEqual(["x-5"]);
    const nextDay = riot();
    await lookUpRanks(handle.db, nextDay.client, match, players, at(25 * HOUR));
    expect(nextDay.asked.sort()).toEqual(["x-5", "x-9"]);
  });

  it("keep within the daily limit across the site", async () => {
    const { client, asked } = riot();
    // x-1's check 20 hours ago counts: with a limit of 3, two are left.
    const result = await getMatchRanks(handle.db, memberId, "OC1_100", { lookup: true, client, now: NOW, perDay: 3 });
    expect(asked).toHaveLength(2);
    expect(result.status === "ok" && result.check).toMatchObject({ asked: 2, skipped: 5, reason: "budget" });
  });

  it("never wait for the rate limits: with no free slot in their half, the rest are skipped and say so", async () => {
    // Two a second: half is one.
    const { client, asked } = riot({ limiter: new RateLimiter([{ requests: 2, seconds: 1 }]) });
    const started = Date.now();
    const result = await getMatchRanks(handle.db, memberId, "OC1_100", { lookup: true, client, now: NOW });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(asked).toHaveLength(1);
    expect(result.status === "ok" && result.check).toMatchObject({ asked: 1, skipped: 6, reason: "busy" });
  });

  it("without Riot access, show stored ranks and ask nothing", async () => {
    const result = await getMatchRanks(handle.db, memberId, "OC1_100", { lookup: true, client: null, now: NOW });
    expect(result.status === "ok" && result.check).toMatchObject({ asked: 0, skipped: 7, reason: "unavailable" });
    expect(result.status === "ok" && bySlot(result.ranks).get(4)).toMatchObject({ state: "ranked", tier: "DIAMOND", kind: "sighting", stale: true });
    // This deployment has no key in the tests: the match window does not offer a check.
    expect(rankChecksAvailable({ matchId: "OC1_100", platform: "oc1" })).toBe(!!process.env.RIOT_API_KEY);
    expect(rankChecksAvailable({ matchId: "DEMO_1a2b3c4d_1", platform: "euw1" })).toBe(false);
    expect(rankChecksAvailable({ matchId: "OC1_100", platform: null })).toBe(false);
  });

  it("find nothing, and ask nothing, for a match outside the player's history", async () => {
    const { client, asked } = riot();
    expect(await getMatchRanks(handle.db, strangerPlayerId, "OC1_100", { lookup: true, client, now: NOW })).toMatchObject({ status: "not-found" });
    expect(await getMatchRanks(handle.db, memberId, "OC1_999", { lookup: true, client, now: NOW })).toMatchObject({ status: "not-found" });
    expect(asked).toEqual([]);
  });

  it("are reported to the data audit as counts only", async () => {
    const { client } = riot();
    await getMatchRanks(handle.db, memberId, "OC1_100", { lookup: true, client, now: NOW });
    const report = await rankCoverage(handle.db, NOW);
    expect(report.kept).toEqual([{ source: "match lookup", players: 7, unranked: 1, current: 7 }]);
    expect(report.lookupsByDay).toEqual([
      { day: "2026-10-19", lookups: 1 },
      { day: "2026-10-20", lookups: 6 },
    ]);
    // Two stored games of nine named players each: m-1 and m-2 linked, x-7 a legacy opponent account, x-5 (Riot failed) without anything.
    expect(report.gamesLast30Days).toEqual({ games: 2, places: 18, linkedAccounts: 4, linkedAccountsSynced: 4, legacyOpponentAccounts: 2, othersChecked: 10, othersCheckedCurrent: 10, othersCheckedUnranked: 2, othersSightingOnly: 0, othersNothingStored: 2 });
    expect(JSON.stringify(report)).not.toMatch(/"[mx]-\d"|#OCE/);
  });

  it("never ask about or keep a rank for someone erased, or for anyone no longer in the stored match", async () => {
    await handle.db.insert(privacyErasures).values({ reference: "ER-TEST01", tokens: [tagged("puuid", "x-7")], keyCheck: keyCheckOf() });
    forgetErasureCache();
    const { client, asked } = riot();
    await getMatchRanks(handle.db, memberId, "OC1_100", { lookup: true, client, now: NOW });
    expect(asked).not.toContain("x-7");
    expect((await handle.db.select().from(lastKnownRanks).where(eq(lastKnownRanks.puuid, "x-7"))).length).toBe(0);
    // Asked directly for a player the match does not hold (an erasure replaced them meanwhile): Riot answers, nothing is written.
    const direct = riot();
    const outcome = await lookUpRanks(handle.db, direct.client, { matchId: "OC1_100", platform: "oc1" }, [{ puuid: "x-1-renamed", name: "Gone#OCE" }], { now: NOW });
    expect(direct.asked).toEqual(["x-1-renamed"]);
    expect(outcome.failed + outcome.found).toBe(1);
    expect((await handle.db.select().from(lastKnownRanks).where(eq(lastKnownRanks.puuid, "x-1-renamed"))).length).toBe(0);
  });
});

describe("opponents' ranks on the collapsed match cards", () => {
  // A slot is the place in the stored record: x-4 … x-7 are 5 … 8, the removed player 9.
  const opponents = async (matchId: string) => {
    const page = await getMatchHistory(handle.db, memberId, { per: 25 });
    const teams = page.rows.find((r) => r.matchId === matchId)!.teams!;
    return { teams, red: new Map(teams.red.map((s) => [s.slot, s])) };
  };

  it("come from storage only, for the opponents only, and a rank checked in the match window shows on the next load", async () => {
    const { client, asked } = riot();
    const before = await opponents("OC1_100");
    // The player's own side carries no ranks (x-3's stored sighting included); every opponent has one, "unknown" while nothing is stored.
    expect([...before.teams.blue].every((s) => !("rank" in s))).toBe(true);
    expect([5, 6, 7, 8].map((slot) => before.red.get(slot)?.rank?.state)).toEqual(["unknown", "unknown", "unknown", "unknown"]);
    // The erased player keeps nothing, a rank included.
    expect(before.red.get(9)).toMatchObject({ removed: true });
    expect(before.red.get(9)).not.toHaveProperty("rank");
    expect(asked).toEqual([]);
    // Opening the match checks them with Riot (within the limits); the next list load shows what was found.
    await getMatchRanks(handle.db, memberId, "OC1_100", { lookup: true, client, now: NOW });
    const asksAfterWindow = asked.length;
    expect(asksAfterWindow).toBeGreaterThan(0);
    const after = await opponents("OC1_100");
    // A Solo/Duo game: x-4 only has a Flex rank (shown, marked Flex); x-5's check failed (still unknown);
    // x-6 is Master in Solo/Duo; x-7 Silver I.
    expect(after.red.get(5)?.rank).toMatchObject({ state: "ranked", tier: "GOLD", division: "I", queue: "flex" });
    expect(after.red.get(6)?.rank?.state).toBe("unknown");
    expect(after.red.get(7)?.rank).toMatchObject({ state: "ranked", tier: "MASTER", division: null, queue: "solo" });
    expect(after.red.get(8)?.rank).toMatchObject({ state: "ranked", tier: "SILVER", division: "I", queue: "solo" });
    // Listing never asks Riot anything.
    expect(asked.length).toBe(asksAfterWindow);
    // The Flex game shows each opponent in Flex where they have a Flex rank, else their Solo/Duo one.
    const flex = await opponents("OC1_200");
    expect(flex.red.get(7)?.rank).toMatchObject({ tier: "DIAMOND", division: "II", queue: "flex" });
    expect(flex.red.get(5)?.rank).toMatchObject({ tier: "GOLD", queue: "flex" });
    expect(flex.red.get(8)?.rank).toMatchObject({ tier: "SILVER", queue: "solo" });
    expect(asked.length).toBe(asksAfterWindow);
  });

  it("tell a confirmed unranked player from one never read", async () => {
    await handle.db.insert(lastKnownRanks).values({ puuid: "x-5", tier: "UNRANKED", division: null, leaguePoints: null, flexTier: "UNRANKED", observedAt: new Date(NOW.getTime() - HOUR), source: "match lookup" });
    const { red } = await opponents("OC1_100");
    expect(red.get(6)?.rank?.state).toBe("unranked");
    expect(red.get(7)?.rank?.state).toBe("unknown");
  });
});
