import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { accountRows } from "@/server/accounts/account-rows";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  A game on a champion the champions table does not know yet: a champion released since the last
  Data Dragon sync, which can lag a release by hours. Before, such a game was stored as a stub
  (no champion, no result) that no later run ever folded, so a member's first games on a new
  champion were lost for good. Riot names the champion in the match (the id Data Dragon gives
  it), so the game is stored and counted under that name at once.
*/

const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
let handle: DbHandle;
let playerId: string;
const NOW = Date.UTC(2026, 10, 1);

function riot(calls: string[]) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "retry-after": "1" } });
    if (url.includes("/riot/account/v1/accounts/by-riot-id/")) return json({ puuid: "p-new", gameName: "New", tagLine: "OCE" });
    if (url.includes("/riot/account/v1/region/by-game/")) return json({ puuid: "p-new", game: "lol", region: "OC1" });
    if (url.includes("/lol/league/v4/") || url.includes("/lol/champion-mastery/v4/")) return json([]);
    if (url.includes("/ids?")) return json(new URL(url).searchParams.get("queue") === "420" && !new URL(url).searchParams.get("start") ? ["OC1_NEWCHAMP", "OC1_KNOWN"] : []);
    const id = /\/matches\/([^/?]+)$/.exec(url)?.[1];
    if (!id) return json({}, 404);
    const mine = id === "OC1_NEWCHAMP" ? { championId: 999_999, championName: "Zaahen" } : { championId: keyOf("Ahri"), championName: "Ahri" };
    const participants = Array.from({ length: 10 }, (_, i) => ({ puuid: i === 0 ? "p-new" : `${id}-${i}`, teamId: i < 5 ? 100 : 200, ...(i === 0 ? mine : i === 5 ? { championId: 999_998, championName: "Newcomer" } : { championId: keyOf("Gwen"), championName: "Gwen" }), teamPosition: ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5], win: i < 5, kills: 3, deaths: 1, assists: 2 }));
    return json({ metadata: { matchId: id }, info: { gameCreation: id === "OC1_NEWCHAMP" ? NOW - 3_600_000 : NOW - 7_200_000, gameDuration: 1800, gameVersion: "16.22.1.1", queueId: 420, teams: [], participants } });
  };
}

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  playerId = (await createPlayer(handle.db, (await getOrCreateTeam(handle.db)).id, { displayName: "New", primaryRole: "TOP", primaryPool: ["Gwen"] })).id;
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("a champion the champions table does not know yet", () => {
  it("is stored under Riot's own name for it, with the game's result and opponent, and counted at once", async () => {
    const account = await addAccount(handle.db, { ownerType: "player", playerId, riotId: "New#OCE", platform: "oc1" });
    const calls: string[] = [];
    const r = await syncAccount(handle.db, new RiotApiClient({ apiKey: "k", fetchImpl: riot(calls), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 }), account, { season: 16 });
    expect(r).toMatchObject({ status: "ok", matchesFetched: 2, matchesFolded: 2 });
    const rows = await handle.db.select().from(accountMatches).where(eq(accountMatches.accountId, account.id));
    expect(rows.find((x) => x.matchId === "OC1_NEWCHAMP")).toMatchObject({ championId: "Zaahen", enemyChampionId: "Newcomer", win: true, role: "TOP", kills: 3 });
    expect(rows.find((x) => x.matchId === "OC1_KNOWN")).toMatchObject({ championId: "Ahri", win: true });
    // The pages' rows carry it; the record names it the same way.
    expect((await accountRows(handle.db, "games", [account.id])).map((g) => g.championId).sort()).toEqual(["Ahri", "Zaahen"]);
    const [record] = await handle.db.select({ participants: matchDetails.participants }).from(matchDetails).where(eq(matchDetails.matchId, "OC1_NEWCHAMP"));
    expect(record?.participants[0]?.championId).toBe("Zaahen");
    // Nothing is asked for again on the next run.
    const again: string[] = [];
    await syncAccount(handle.db, new RiotApiClient({ apiKey: "k", fetchImpl: riot(again), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 }), { ...account, puuid: "p-new" }, { season: 16 });
    expect(again.filter((u) => /\/matches\/OC1_/.test(u))).toEqual([]);
  });
});
