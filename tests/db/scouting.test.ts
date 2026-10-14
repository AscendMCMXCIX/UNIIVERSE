import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { draftEnemyScouting } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getActiveLineupProfiles, getOrCreateTeam, setLineupSlot } from "@/server/repositories/team";
import { createDraft, getDraft } from "@/server/repositories/drafts";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { enemyRiotIds, listEnemyScouting, loadEnemyTendencies, scoutDraftEnemies } from "@/server/scouting/session";
import { recommendForDraft, getChampionMap } from "@/server/engine/service";
import { preDraftForDraft } from "@/server/predraft/service";
import { loadStatsProvider } from "@/server/stats/loader";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
let handle: DbHandle;
let teamId: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const db = handle.db;
  const team = await getOrCreateTeam(db);
  teamId = team.id;
  const specs: Array<[string, "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT", string[]]> = [
    ["Top", "TOP", ["Riven", "Gwen", "Ambessa"]],
    ["Jungle", "JUNGLE", ["Viego", "LeeSin", "Sejuani"]],
    ["Mid", "MID", ["Orianna", "Syndra", "Azir"]],
    ["Adc", "ADC", ["Jinx", "Kaisa", "Ezreal"]],
    ["Support", "SUPPORT", ["Nautilus", "Rakan", "Lulu"]],
  ];
  for (const [name, role, pool] of specs) {
    const p = await createPlayer(db, teamId, { displayName: name, primaryRole: role, primaryPool: pool });
    await setLineupSlot(db, teamId, role, p.id);
  }
});
afterAll(async () => {
  await handle.close();
});

type Behaviour = { status?: number; unknownNames?: string[]; calls?: string[] };
function enemyFetch(b: Behaviour = {}) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    b.calls?.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (b.status) return json({ status: { message: "nope", status_code: b.status } }, b.status);
    const acc = /\/by-riot-id\/([^/]+)\/([^/?]+)/.exec(url);
    if (acc) {
      const name = decodeURIComponent(acc[1]!);
      if (b.unknownNames?.includes(name)) return json({ status: { message: "not found" } }, 404);
      return json({ puuid: `puuid-${name}`, gameName: name, tagLine: decodeURIComponent(acc[2]!) });
    }
    if (url.includes("/region/by-game/")) return json({ puuid: "x", game: "lol", region: "KR" });
    if (url.includes("/lol/league/v4/entries/by-puuid/")) return json([{ queueType: "RANKED_SOLO_5x5", tier: "DIAMOND", rank: "I", leaguePoints: 75, wins: 200, losses: 150 }]);
    if (url.includes("/lol/champion-mastery/v4/")) return json([{ championId: keyOf("Darius"), championLevel: 10, championPoints: 500000, lastPlayTime: Date.now() }, { championId: keyOf("Sion"), championLevel: 6, championPoints: 60000 }]);
    const ids = /\/by-puuid\/([^/]+)\/ids/.exec(url);
    if (ids) return json(Array.from({ length: 8 }, (_, i) => `KR_${decodeURIComponent(ids[1]!)}_${i}`));
    const m = /\/lol\/match\/v5\/matches\/([^/?]+)$/.exec(url);
    if (m) {
      const [, puuidPart, idx] = decodeURIComponent(m[1]!).split("_");
      const puuid = `${puuidPart}`;
      const i = Number(idx);
      const champion = i < 6 ? "Darius" : "Jax"; // 6 of 8 recent games on Darius
      const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
      const participants = Array.from({ length: 10 }, (_, k) => ({ puuid: k === 0 ? puuid : `other-${k}`, teamId: k < 5 ? 100 : 200, championId: k === 0 ? keyOf(champion) : keyOf("Ahri") + k, teamPosition: positions[k % 5], win: k < 5, kills: 1, deaths: 1, assists: 1 }));
      return json({ metadata: { matchId: m[1] }, info: { gameCreation: Date.now() - i * 86_400_000, gameDuration: 1800, gameVersion: "15.19.1.1", queueId: i === 7 ? 450 : 420, teams: [], participants } });
    }
    return json({}, 404);
  };
}
const client = (b: Behaviour = {}) => new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl: enemyFetch(b), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });

async function newDraft(enemyPlayers: Record<string, string>) {
  const lineup = (await getActiveLineupProfiles(handle.db, teamId))!;
  return createDraft(handle.db, teamId, { opponentName: "Scouted", side: "blue", patch: "15.19", players: lineup.players, assignment: lineup.assignment, mode: "ranked-flex", formatId: "ranked-flex", enemyPlayers });
}

describe("session scouting", () => {
  it("only Riot IDs are scouted; plain names stay as names", () => {
    expect(enemyRiotIds({ TOP: "Faker#KR1", MID: "just a name", ADC: " " })).toEqual([{ role: "TOP", riotId: "Faker#KR1", gameName: "Faker", tagLine: "KR1" }]);
  });

  it("a full roster is resolved, stored per draft and feeds the recommendation", async () => {
    const db = handle.db;
    const draft = await newDraft({ TOP: "EnemyTop#KR1", JUNGLE: "EnemyJg#KR1", MID: "EnemyMid#KR1", ADC: "EnemyAdc#KR1", SUPPORT: "EnemySup#KR1" });
    const calls: string[] = [];
    const summary = await scoutDraftEnemies(db, draft.id, { client: client({ calls }), maxMatchesPerEnemy: 8, currentPatch: "15.19" });
    expect(summary.scouted).toBe(5);
    const rows = await listEnemyScouting(db, draft.id);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.status === "ok" && r.platform === "kr" && r.rank === "DIAMOND I 75 LP")).toBe(true);
    expect(rows[0]!.gamesAnalysed).toBe(7); // the ARAM game is not counted
    // Bounded: account + region + rank + mastery + ids + 8 matches per enemy at most.
    expect(calls.length).toBeLessThanOrEqual(5 * 13);
    const stats = await loadStatsProvider(db);
    const tendencies = await loadEnemyTendencies(db, draft.id, stats, await getChampionMap(db));
    expect(tendencies?.TOP?.picks[0]?.championId).toBe("Darius");
    expect(tendencies?.TOP?.picks[0]?.likelihood).toBe("high");
    // The version bump makes the recommendation include the tendencies.
    const fresh = (await getDraft(db, draft.id))!;
    expect(fresh.version).toBe(draft.version + 1);
    const rec = await recommendForDraft(db, fresh);
    expect(rec.tendencies?.TOP?.label).toBe("EnemyTop#KR1");
    expect(rec.kind).toBe("ban");
    // The pre-draft plan reports the scouted priorities.
    const { plan } = await preDraftForDraft(db, fresh);
    expect(plan.scouting.available).toBe(true);
    expect(plan.expectedPriorities.find((p) => p.role === "TOP")?.picks[0]?.championId).toBe("Darius");
  });

  it("a partial roster scouts only the known roles and the draft works", async () => {
    const db = handle.db;
    const draft = await newDraft({ TOP: "Partial#KR1", MID: "No Tag Name" });
    const summary = await scoutDraftEnemies(db, draft.id, { client: client(), maxMatchesPerEnemy: 4 });
    expect(summary.scouted).toBe(1);
    const rows = await listEnemyScouting(db, draft.id);
    expect(rows.map((r) => r.role)).toEqual(["TOP"]);
    const rec = await recommendForDraft(db, (await getDraft(db, draft.id))!);
    expect(rec.primary).not.toBeNull();
    expect(rec.tendencies?.MID).toBeUndefined();
  });

  it("an unknown Riot ID is 'unresolved', a rejected key leaves everything pending, and the draft still works", async () => {
    const db = handle.db;
    const draft = await newDraft({ TOP: "Ghost#KR1", JUNGLE: "Real#KR1" });
    const s1 = await scoutDraftEnemies(db, draft.id, { client: client({ unknownNames: ["Ghost"] }), maxMatchesPerEnemy: 2 });
    expect(s1.unresolved).toBe(1);
    expect(s1.scouted).toBe(1);
    const rows = await listEnemyScouting(db, draft.id);
    expect(rows.find((r) => r.role === "TOP")?.status).toBe("unresolved");
    expect(rows.find((r) => r.role === "TOP")?.error).toMatch(/could not find/);
    const draft2 = await newDraft({ TOP: "A#KR1", MID: "B#KR1" });
    const s2 = await scoutDraftEnemies(db, draft2.id, { client: client({ status: 403 }) });
    expect(s2.pending).toBe(2);
    const pending = await listEnemyScouting(db, draft2.id);
    expect(pending.every((r) => r.status === "pending")).toBe(true);
    expect(pending[0]!.error).toMatch(/temporarily unavailable/);
    const rec = await recommendForDraft(db, (await getDraft(db, draft2.id))!);
    expect(rec.kind).toBe("ban");
    expect(rec.tendencies).toBeNull();
    // Without any client (no key) nothing breaks either.
    const s3 = await scoutDraftEnemies(db, draft2.id, { client: null });
    expect(s3.pending).toBe(2);
  });

  it("re-scouting never duplicates rows and the next game of a series reuses fresh evidence", async () => {
    const db = handle.db;
    const draft = await newDraft({ TOP: "Reuse#KR1" });
    const calls: string[] = [];
    await scoutDraftEnemies(db, draft.id, { client: client({ calls }), maxMatchesPerEnemy: 3 });
    const firstCalls = calls.length;
    await scoutDraftEnemies(db, draft.id, { client: client({ calls }), maxMatchesPerEnemy: 3 });
    expect(calls.length).toBe(firstCalls); // already scouted: no requests
    expect(await db.select().from(draftEnemyScouting).where(eq(draftEnemyScouting.draftId, draft.id))).toHaveLength(1);
    const next = await newDraft({ TOP: "reuse#kr1" });
    const summary = await scoutDraftEnemies(db, next.id, { client: client({ calls }), maxMatchesPerEnemy: 3 });
    expect(summary.reused).toBe(1);
    expect(calls.length).toBe(firstCalls);
    expect((await listEnemyScouting(db, next.id))[0]?.status).toBe("ok");
  });
});
