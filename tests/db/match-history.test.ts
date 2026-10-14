import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, appSettings, matchDetails, patches, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { storeMatchDetail } from "@/server/accounts/match-details";
import { compareInMatch, getMatchDetail, getMatchHistory } from "@/server/players/match-history";
import { compactAssets, ddragonVersionOf } from "@/server/riot/static/assets";
import { invalidateCache } from "@/server/observability/cache";
import { importMatch, startBlock } from "@/server/ranked/repository";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import type { RiotMatch } from "@/server/riot/api/schemas";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
const keyToId = new Map(fixture.champions.map((c) => [c.key, c.id]));
const POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const OTHERS = ["Ahri", "Jinx", "Thresh", "LeeSin", "Ornn", "Jax", "Lux", "Caitlyn", "Nautilus"].filter((c) => fixture.champions.some((f) => f.id === c));

/** A full Riot match record: `me` (puuid) plays `champion` in `role` on blue; everyone else is filler. */
function riotMatch(matchId: string, spec: { puuid: string; champion: string; role: string; win: boolean; queue: number; created: number; extra?: Array<{ puuid: string; slot: number }> }): RiotMatch {
  const participants = Array.from({ length: 10 }, (_, i) => {
    const mine = i === 0;
    const other = spec.extra?.find((e) => e.slot === i);
    const champion = mine ? spec.champion : OTHERS[(i - 1) % OTHERS.length]!;
    return {
      puuid: mine ? spec.puuid : (other?.puuid ?? `${matchId}-other-${i}`),
      riotIdGameName: mine ? "Me" : `Player${i}`,
      riotIdTagline: "OCE",
      teamId: i < 5 ? 100 : 200,
      championId: keyOf(champion),
      championName: champion,
      champLevel: 16,
      teamPosition: mine ? spec.role : POSITIONS[i % 5]!,
      win: i < 5 ? spec.win : !spec.win,
      kills: mine ? 6 : 2,
      deaths: mine ? 2 : 3,
      assists: mine ? 8 : 4,
      totalMinionsKilled: 180,
      neutralMinionsKilled: 12,
      goldEarned: 12_000,
      totalDamageDealtToChampions: mine ? 27_000 : 15_000,
      totalDamageTaken: 20_000,
      visionScore: 24,
      wardsPlaced: 10,
      item0: 3078,
      item1: 0,
      item6: 3340,
      summoner1Id: 4,
      summoner2Id: 12,
      perks: { styles: [{ description: "primaryStyle", style: 8000, selections: [{ perk: 8010 }] }, { description: "subStyle", style: 8400, selections: [{ perk: 8444 }] }] },
    };
  });
  return {
    metadata: { matchId, participants: participants.map((p) => p.puuid) },
    info: {
      gameCreation: spec.created,
      gameDuration: 1800,
      gameVersion: "16.20.715.1234",
      queueId: spec.queue,
      teams: [
        { teamId: 100, win: spec.win, bans: [{ championId: keyOf("Zed"), pickTurn: 1 }], objectives: { dragon: { first: true, kills: 3 }, baron: { first: false, kills: 1 }, tower: { first: true, kills: 8 } } },
        { teamId: 200, win: !spec.win, bans: [], objectives: { dragon: { first: false, kills: 1 }, tower: { first: false, kills: 3 } } },
      ],
      participants,
    },
  } as unknown as RiotMatch;
}

function fakeFetch(puuid: string, matches: Record<string, { champion: string; role: string; win: boolean; queue: number; created: number }>, options: { calls?: string[]; gone?: Set<string> } = {}) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    options.calls?.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/riot/account/v1/region/by-game/lol/by-puuid/")) return json({ puuid, game: "lol", region: "OC1" });
    if (url.includes("/riot/account/v1/accounts/by-riot-id/")) {
      const parts = url.split("/by-riot-id/")[1]!.split("/");
      return json({ puuid, gameName: decodeURIComponent(parts[0]!), tagLine: decodeURIComponent(parts[1]!) });
    }
    if (url.includes("/lol/league/v4/entries/by-puuid/")) return json([]);
    if (url.includes("/lol/champion-mastery/v4/")) return json([]);
    if (url.includes("/ids?")) {
      const q = new URL(url).searchParams;
      const queue = Number(q.get("queue"));
      const start = Number(q.get("start") ?? 0);
      const count = Number(q.get("count") ?? 20);
      const startTime = Number(q.get("startTime") ?? 0) * 1000;
      const ids = Object.entries(matches)
        .filter(([, m]) => m.queue === queue && m.created >= startTime)
        .sort((a, b) => b[1].created - a[1].created)
        .map(([id]) => id);
      return json(ids.slice(start, start + count));
    }
    const m = /\/lol\/match\/v5\/matches\/([^/?]+)$/.exec(url);
    if (m) {
      const id = decodeURIComponent(m[1]!);
      const spec = matches[id];
      if (!spec || options.gone?.has(id)) return json({ status: { message: "not found" } }, 404);
      return json(riotMatch(id, { puuid, ...spec }));
    }
    return json({}, 404);
  };
}

const client = (fetchImpl: ReturnType<typeof fakeFetch>) => new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });

let handle: DbHandle;
let teamId: string;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(handle.db)).id;
});
afterAll(async () => {
  await handle.close();
});

describe("match records are kept from the account sync", () => {
  it("stores each fetched game's full record once, and backfills older games within the budget", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Records", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Records#OCE", platform: "oc1" });
    const now = Date.now();
    const matches = {
      OC1_R1: { champion: "Gwen", role: "TOP", win: true, queue: 420, created: now - 86_400_000 },
      OC1_R2: { champion: "Gwen", role: "TOP", win: false, queue: 440, created: now - 2 * 86_400_000 },
    };
    const calls: string[] = [];
    await syncAccount(db, client(fakeFetch("puuid-records", matches, { calls })), account);
    const stored = await db.select().from(matchDetails);
    const r1 = stored.find((d) => d.matchId === "OC1_R1")!;
    expect(r1.participants).toHaveLength(10);
    expect(r1.teams.find((t) => t.teamId === 100)).toMatchObject({ win: true, bans: ["Zed"], objectives: { dragon: 3, baron: 1, tower: 8 } });
    const me = r1.participants.find((p) => p.puuid === "puuid-records")!;
    expect(me).toMatchObject({ name: "Me#OCE", championId: "Gwen", position: "TOP", cs: 192, gold: 12_000, damage: 27_000, damageTaken: 20_000, vision: 24, items: [3078, 0, 0, 0, 0, 0, 3340], spells: [4, 12], runes: { keystone: 8010, primary: 8000, secondary: 8400 } });
    // Each game was requested once: the list, then the record (kept for both the stats and the history).
    expect(calls.filter((u) => /\/matches\/OC1_R1$/.test(u))).toHaveLength(1);

    // Games stored before records were kept: one is fetched, one Riot no longer serves.
    await db.insert(accountMatches).values([
      { accountId: account.id, matchId: "OC1_OLD", gameCreation: now - 3 * 86_400_000, queueId: 420, championId: "Gwen", role: "TOP", win: true, patch: "16.20", kills: 5, deaths: 1, assists: 5, cs: 200, damage: 20_000, visionScore: 20, gameDuration: 1800 },
      { accountId: account.id, matchId: "OC1_GONE", gameCreation: now - 4 * 86_400_000, queueId: 420, championId: "Gwen", role: "TOP", win: false, patch: "16.20", kills: 3, deaths: 4, assists: 2, cs: 150, damage: 12_000, visionScore: 15, gameDuration: 1700 },
    ]);
    const more = { ...matches, OC1_OLD: { champion: "Gwen", role: "TOP", win: true, queue: 420, created: now - 3 * 86_400_000 }, OC1_GONE: { champion: "Gwen", role: "TOP", win: false, queue: 420, created: now - 4 * 86_400_000 } };
    calls.length = 0;
    await syncAccount(db, client(fakeFetch("puuid-records", more, { calls, gone: new Set(["OC1_GONE"]) })), (await listAccountsForPlayer(db, player.id))[0]!);
    const after = new Map((await db.select().from(matchDetails)).map((d) => [d.matchId, d]));
    expect(after.get("OC1_OLD")?.participants).toHaveLength(10);
    // Marked unavailable (no players), and its stored statistics are left exactly as they were.
    expect(after.get("OC1_GONE")?.participants).toEqual([]);
    const gone = (await db.select().from(accountMatches).where(eq(accountMatches.matchId, "OC1_GONE")))[0]!;
    expect(gone).toMatchObject({ kills: 3, deaths: 4, assists: 2, cs: 150, damage: 12_000 });
    // A further run asks Riot for none of these again.
    calls.length = 0;
    await syncAccount(db, client(fakeFetch("puuid-records", more, { calls, gone: new Set(["OC1_GONE"]) })), (await listAccountsForPlayer(db, player.id))[0]!);
    expect(calls.filter((u) => /\/matches\/OC1_(OLD|GONE|R1|R2)$/.test(u))).toHaveLength(0);
  });

  it("can skip the record backfill", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "NoBackfill", primaryRole: "MID", primaryPool: ["Ahri"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "NoBackfill#OCE", platform: "oc1" });
    await db.insert(accountMatches).values({ accountId: account.id, matchId: "OC1_NB", gameCreation: Date.now() - 86_400_000, queueId: 420, championId: "Ahri", role: "MIDDLE", win: true, patch: "16.20", kills: 1, deaths: 1, assists: 1 });
    const calls: string[] = [];
    await syncAccount(db, client(fakeFetch("puuid-nb", {}, { calls })), account, { detailsBackfill: false });
    expect(calls.some((u) => u.endsWith("/OC1_NB"))).toBe(false);
  });
});

describe("personal match history", () => {
  let playerId: string;
  let main: string;
  let alt: string;
  let mateId: string;
  const base = 1_790_000_000_000;

  beforeAll(async () => {
    const db = handle.db;
    await db.update(patches).set({ isCurrent: false });
    await db.insert(patches).values(["16.20", "15.24"].map((id, i) => ({ id, ddragonVersion: `${id}.1`, isCurrent: i === 0, sortKey: patchSortKey(id) }))).onConflictDoNothing();
    await db.update(patches).set({ isCurrent: true }).where(eq(patches.id, "16.20"));
    playerId = (await createPlayer(db, teamId, { displayName: "Historian", primaryRole: "TOP", primaryPool: ["Gwen", "Riven"] })).id;
    main = (await addAccount(db, { ownerType: "player", playerId, riotId: "Hist#OCE", platform: "oc1" })).id;
    alt = (await addAccount(db, { ownerType: "player", playerId, riotId: "HistAlt#OCE", platform: "oc1" })).id;
    await db.update(riotAccounts).set({ puuid: "h-main", syncStatus: "ok" }).where(eq(riotAccounts.id, main));
    await db.update(riotAccounts).set({ puuid: "h-alt", syncStatus: "ok" }).where(eq(riotAccounts.id, alt));
    mateId = (await createPlayer(db, teamId, { displayName: "Duo Mate", primaryRole: "JUNGLE", primaryPool: ["LeeSin"] })).id;
    const mateAccount = (await addAccount(db, { ownerType: "player", playerId: mateId, riotId: "Mate#OCE", platform: "oc1" })).id;
    await db.update(riotAccounts).set({ puuid: "h-mate" }).where(eq(riotAccounts.id, mateAccount));

    // 20 games on the main (alternating Solo/Duo and Flex, Gwen and Riven), 3 on the alt, one
    // game seen from both accounts, one from last season.
    const rows: Array<typeof accountMatches.$inferInsert> = [];
    for (let i = 0; i < 20; i++) rows.push({ accountId: main, matchId: `OC1_H${i}`, gameCreation: base + i * 3_600_000, queueId: i % 2 ? 440 : 420, championId: i % 4 === 0 ? "Riven" : "Gwen", role: "TOP", win: i % 3 !== 0, patch: "16.20", kills: 6, deaths: 2, assists: 8, cs: 192, damage: 27_000, visionScore: 24, gameDuration: 1800 });
    for (let i = 0; i < 3; i++) rows.push({ accountId: alt, matchId: `OC1_A${i}`, gameCreation: base - (i + 1) * 3_600_000, queueId: 420, championId: "Gwen", role: "TOP", win: true, patch: "16.20", kills: 6, deaths: 2, assists: 8, cs: 192, damage: 27_000, visionScore: 24, gameDuration: 1800 });
    rows.push({ accountId: alt, matchId: "OC1_H19", gameCreation: base + 19 * 3_600_000, queueId: 440, championId: "Gwen", role: "TOP", win: true, patch: "16.20", kills: 6, deaths: 2, assists: 8, cs: 192, damage: 27_000, visionScore: 24, gameDuration: 1800 });
    rows.push({ accountId: main, matchId: "OC1_OLDSEASON", gameCreation: base - 300 * 86_400_000, queueId: 420, championId: "Gwen", role: "TOP", win: true, patch: "15.24", kills: 1, deaths: 1, assists: 1, cs: 100, damage: 9_000, visionScore: 9, gameDuration: 1500 });
    // A game stored before its performance was recorded.
    rows.push({ accountId: main, matchId: "OC1_BARE", gameCreation: base - 10 * 3_600_000, queueId: 420, championId: "Gwen", role: "TOP", win: false, patch: "16.20" });
    await db.insert(accountMatches).values(rows);
    // Full records for the newest game (with the duo mate on the team) and for one alt game.
    await storeMatchDetail(db, "oc1", riotMatch("OC1_H19", { puuid: "h-main", champion: "Gwen", role: "TOP", win: true, queue: 440, created: base + 19 * 3_600_000, extra: [{ puuid: "h-mate", slot: 1 }] }), keyToId);
    await storeMatchDetail(db, "oc1", riotMatch("OC1_H18", { puuid: "h-main", champion: "Gwen", role: "TOP", win: true, queue: 420, created: base + 18 * 3_600_000 }), keyToId);
    await db.insert(matchDetails).values({ matchId: "OC1_H17", platform: null, queueId: 440, gameCreation: base + 17 * 3_600_000, gameDuration: 1800, gameVersion: null, teams: [], participants: [] });
    await db.insert(appSettings).values({ key: "riot_assets", value: compactAssets("16.20.1", { data: { "3078": { name: "Trinity Force" }, "3340": { name: "Stealth Ward" } } }, { data: { SummonerFlash: { id: "SummonerFlash", key: "4", name: "Flash" }, SummonerTeleport: { id: "SummonerTeleport", key: "12", name: "Teleport" } } }, [{ id: 8000, name: "Precision", icon: "perk-images/Styles/7201_Precision.png", slots: [{ runes: [{ id: 8010, name: "Conqueror", icon: "perk-images/Styles/Precision/Conqueror/Conqueror.png" }] }] }, { id: 8400, name: "Resolve", icon: "perk-images/Styles/7204_Resolve.png", slots: [] }]), updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { updatedAt: new Date() } });
    invalidateCache("riot_assets");
  });

  it("lists this season's games newest first, a page at a time, a shared game once", async () => {
    const page = await getMatchHistory(handle.db, playerId, { per: 10 }, true);
    // 20 main + 3 alt + 1 bare (the shared game once, last season's game left out).
    expect(page.total).toBe(24);
    expect(page.pages).toBe(3);
    expect(page.rows).toHaveLength(10);
    expect(page.rows.map((r) => r.matchId).slice(0, 3)).toEqual(["OC1_H19", "OC1_H18", "OC1_H17"]);
    const ids = new Set<string>();
    for (let p = 1; p <= page.pages; p++) for (const r of (await getMatchHistory(handle.db, playerId, { per: 10, page: p }, true)).rows) ids.add(r.matchId);
    expect(ids.size).toBe(24);
    // Out-of-range page numbers and sizes are clamped rather than empty.
    expect((await getMatchHistory(handle.db, playerId, { per: 10, page: 99 }, true)).page).toBe(3);
    expect((await getMatchHistory(handle.db, playerId, { per: 1 }, true)).per).toBe(5);
    expect((await getMatchHistory(handle.db, playerId, { per: 500 }, true)).per).toBe(25);
  });

  it("filters by mode, champion, account and season", async () => {
    const db = handle.db;
    expect((await getMatchHistory(db, playerId, { mode: "flex", per: 25 }, true)).total).toBe(10);
    expect((await getMatchHistory(db, playerId, { mode: "solo", per: 25 }, true)).total).toBe(14);
    expect((await getMatchHistory(db, playerId, { championId: "Riven", per: 25 }, true)).total).toBe(5);
    // The alt: its three games and the one shared game.
    const altPage = await getMatchHistory(db, playerId, { accountId: alt, per: 25 }, true);
    expect(altPage.total).toBe(4);
    expect(altPage.accountOptions.map((a) => a.riotId).sort()).toEqual(["Hist#OCE", "HistAlt#OCE"]);
    // Every row says which account played it when several are linked.
    expect(altPage.rows.every((r) => r.riotId === "HistAlt#OCE")).toBe(true);
    expect(altPage.championOptions.map((c) => c.id)).toEqual(["Gwen"]);
    const all = await getMatchHistory(db, playerId, { per: 25 }, true);
    expect(all.seasons.length).toBeGreaterThanOrEqual(2);
    const last = await getMatchHistory(db, playerId, { season: all.seasons[1], per: 25 }, true);
    expect(last.rows.map((r) => r.matchId)).toEqual(["OC1_OLDSEASON"]);
  });

  it("shows per-minute figures, kill participation and icons only where they are recorded", async () => {
    const page = await getMatchHistory(handle.db, playerId, { per: 25 }, true);
    const top = page.rows.find((r) => r.matchId === "OC1_H19")!;
    expect(top.record).toBe("stored");
    expect(top.csPerMin).toBeCloseTo(192 / 30, 6);
    expect(top.damagePerMin).toBeCloseTo(27_000 / 30, 6);
    expect(top.kda).toBeCloseTo(7, 6);
    // Team kills: me 6 + four teammates with 2 each.
    expect(top.killParticipation).toBeCloseTo(14 / 14, 6);
    expect(top.items?.[0]).toMatchObject({ name: "Trinity Force" });
    expect(top.items?.[0]?.url).toContain("/cdn/16.20.1/img/item/3078.png");
    expect(top.items?.[1]).toBeNull();
    expect(top.spells?.map((s) => s.name)).toEqual(["Flash", "Teleport"]);
    expect(top.keystone?.name).toBe("Conqueror");
    expect(top.secondary?.name).toBe("Resolve");
    expect(page.rows.find((r) => r.matchId === "OC1_H17")?.record).toBe("unavailable");
    const missing = page.rows.find((r) => r.matchId === "OC1_H16")!;
    expect(missing).toMatchObject({ record: "missing", killParticipation: null, items: null, spells: null });
    // Its stored figures still show.
    expect(missing.csPerMin).toBeCloseTo(192 / 30, 6);
    const bare = page.rows.find((r) => r.matchId === "OC1_BARE")!;
    expect(bare).toMatchObject({ kills: null, deaths: null, assists: null, kda: null, csPerMin: null, damagePerMin: null, perfect: false });
  });

  it("summarises every matching game, filters by pool and previews both lineups", async () => {
    const db = handle.db;
    const all = await getMatchHistory(db, playerId, { per: 10 }, true);
    // The whole filtered population, not just the page: 16 wins, 8 losses (the shared game once).
    expect(all.summary.record).toMatchObject({ games: 24, wins: 16, losses: 8 });
    expect(all.summary.performance.detailedGames).toBe(23);
    expect(all.summary.performance.kdaRatio).toBeCloseTo(7, 6);
    expect(all.summary.performance.csPerMinute).toBeCloseTo(192 / 30, 6);
    // Pool scope: the champions of the configured pool of the role each game was played in.
    const riven = await getMatchHistory(db, playerId, { scope: "pool", per: 25 }, true, (r) => (r === "TOP" ? ["Riven"] : []));
    expect(riven.filter.scope).toBe("pool");
    expect(riven.total).toBe(5);
    expect(riven.rows.every((r) => r.championId === "Riven")).toBe(true);
    // Lineups only where the full record is stored: own team first, lane order, the player marked.
    const top = all.rows.find((r) => r.matchId === "OC1_H19")!;
    expect(top.lineups?.own.map((x) => x.championId)[0]).toBe("Gwen");
    expect(top.lineups?.own.filter((x) => x.isPlayer)).toHaveLength(1);
    expect(top.lineups?.enemy).toHaveLength(5);
    expect(all.rows.find((r) => r.matchId === "OC1_H17")?.lineups).toBeNull();
    expect(all.rows.find((r) => r.matchId === "OC1_H16")?.lineups).toBeNull();
  });

  it("hides the account choice when only one account is linked", async () => {
    const db = handle.db;
    const solo = (await createPlayer(db, teamId, { displayName: "Single", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
    const acc = (await addAccount(db, { ownerType: "player", playerId: solo, riotId: "Single#OCE", platform: "oc1" })).id;
    await db.insert(accountMatches).values({ accountId: acc, matchId: "OC1_S1", gameCreation: base, queueId: 420, championId: "Ahri", role: "MIDDLE", win: true, patch: "16.20" });
    const page = await getMatchHistory(db, solo, {}, true);
    expect(page.accountOptions).toEqual([]);
    expect(page.rows[0]?.riotId).toBeNull();
    expect(page.total).toBe(1);
  });

  it("opens one match with both teams, objectives and registered teammates", async () => {
    const res = await getMatchDetail(handle.db, playerId, "OC1_H19", { viewerIsOwner: true });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    const v = res.view;
    expect(v).toMatchObject({ queue: "Ranked Flex", patch: "16.20", win: true, championId: "Gwen", durationS: 1800 });
    expect(v.teams.map((t) => t.side)).toEqual(["blue", "red"]);
    expect(v.teams.map((t) => t.participants.length)).toEqual([5, 5]);
    expect(v.teams[0]!.participants[0]!.position).toBe("TOP");
    expect(v.teams[0]!.participants.map((p) => p.position)).toEqual(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);
    expect(v.teams[0]).toMatchObject({ win: true, kills: 14, gold: 60_000, bans: ["Zed"], objectives: { dragon: 3, baron: 1, tower: 8 } });
    expect(v.teams[1]).toMatchObject({ win: false, kills: 10 });
    expect(v.player).toMatchObject({ isPlayer: true, kills: 6, deaths: 2, assists: 8, gold: 12_000, damageTaken: 20_000, vision: 24 });
    expect(v.player.killParticipation).toBeCloseTo(1, 6);
    expect(v.player.damagePerMin).toBeCloseTo(900, 6);
    expect(v.teams[0]!.participants.find((p) => p.teamMember && !p.isPlayer)?.teamMember).toBe("Duo Mate");
    expect(v.maxDamage).toBe(27_000);
    // Flex: not a Solo Queue Block game.
    expect(v.journal.eligible).toBe(false);
    // Comparisons from the record only: shares of the team, the enemy top laner, team totals.
    const c = v.comparison;
    expect(c.damageShare).toBeCloseTo(27_000 / 87_000, 6);
    expect(c.goldShare).toBeCloseTo(0.2, 6);
    expect(c.killParticipation).toBeCloseTo(1, 6);
    expect(c.opponent?.championId).toBe(v.teams[1]!.participants[0]!.championId);
    const fig = Object.fromEntries(c.figures.map((f) => [f.key, f]));
    expect(fig.damagePerMin).toMatchObject({ you: 900, opponent: 500 });
    expect(fig.damagePerMin!.teamAverage).toBeCloseTo(87_000 / 5 / 30, 6);
    expect(fig.csPerMin).toMatchObject({ you: 192 / 30, opponent: 192 / 30 });
    expect(fig.goldPerMin).toMatchObject({ you: 400, opponent: 400, teamAverage: 400 });
    const totals = Object.fromEntries(c.teams.map((t) => [t.key, t]));
    expect(totals.kills).toMatchObject({ own: 14, enemy: 10 });
    expect(totals.damage).toMatchObject({ own: 87_000, enemy: 75_000 });
    expect(totals.tower).toMatchObject({ own: 8, enemy: 3 });
    expect(totals.dragon).toMatchObject({ own: 3, enemy: 1 });
  });

  it("compares from the player's side wherever they played, and pairs no opponent without positions", () => {
    const part = (teamId: number, position: string | null, over: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({ puuid: `${teamId}-${position}`, name: null, teamId, championId: "Ahri", championKey: 103, champLevel: 18, position, win: teamId === 200, kills: 2, deaths: 2, assists: 2, cs: 200, gold: 10_000, damage: 20_000, damageTaken: 10_000, vision: 20, wardsPlaced: 5, items: null, spells: null, runes: null, ...over });
    const lanes = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
    const me = part(200, "MIDDLE", { puuid: "me", kills: 8, assists: 2, damage: 40_000 });
    const parts = [...lanes.map((l) => part(100, l)), ...lanes.map((l) => (l === "MIDDLE" ? me : part(200, l)))];
    const c = compareInMatch(parts, [{ teamId: 100, objectives: { tower: 2 } }, { teamId: 200, objectives: { tower: 9 } }], me, 1500);
    expect(c.damageShare).toBeCloseTo(40_000 / 120_000, 6);
    expect(c.killParticipation).toBeCloseTo(10 / 16, 6);
    expect(c.opponent).not.toBeNull();
    expect(c.teams.find((t) => t.key === "tower")).toMatchObject({ own: 9, enemy: 2 });
    expect(c.teams.find((t) => t.key === "kills")).toMatchObject({ own: 16, enemy: 10 });
    // Positions missing (e.g. an old or odd game): no lane opponent rather than a guess.
    const unknown = { ...me, position: null };
    const c2 = compareInMatch(parts.map((p) => (p === me ? unknown : { ...p, position: null })), [], unknown, 1500);
    expect(c2.opponent).toBeNull();
    expect(c2.figures.every((f) => f.opponent === null)).toBe(true);
    // A figure Riot left out for anyone makes the team share unknown, never a wrong percentage.
    const gap = compareInMatch(parts.map((p, i) => (i === 6 ? { ...p, gold: null } : p)), [], me, 1500);
    expect(gap.goldShare).toBeNull();
    // Remakes have no per-minute figures.
    expect(compareInMatch(parts, [], me, 200).figures.find((f) => f.key === "csPerMin")?.you).toBeNull();
  });

  it("only opens the player's own games, and is honest about missing records", async () => {
    const db = handle.db;
    expect((await getMatchDetail(db, mateId, "OC1_H19", { viewerIsOwner: true })).status).toBe("not-found");
    expect((await getMatchDetail(db, playerId, "OC1_NOPE", { viewerIsOwner: true })).status).toBe("not-found");
    expect((await getMatchDetail(db, playerId, "OC1_H17", { viewerIsOwner: true })).status).toBe("unavailable");
    // Not collected yet, and no Riot access here: says so instead of guessing.
    const missing = await getMatchDetail(db, playerId, "OC1_H16", { viewerIsOwner: true, fetchMissing: true });
    expect(missing.status).toBe("missing");
  });

  it("adds a Solo/Duo game to the owner's Solo Queue Block once", async () => {
    const db = handle.db;
    const before = await getMatchDetail(db, playerId, "OC1_H18", { viewerIsOwner: true });
    expect(before.status === "ok" && before.view.journal).toEqual({ eligible: true, inJournal: false });
    // Teammates viewing the profile never get the journal action.
    const viewer = await getMatchDetail(db, playerId, "OC1_H18", { viewerIsOwner: false });
    expect(viewer.status === "ok" && viewer.view.journal.eligible).toBe(false);
    await startBlock(db, playerId, 5);
    await importMatch(db, playerId, "OC1_H18");
    await expect(importMatch(db, playerId, "OC1_H18")).rejects.toThrow(/already in your journal/);
    const after = await getMatchDetail(db, playerId, "OC1_H18", { viewerIsOwner: true });
    expect(after.status === "ok" && after.view.journal.inJournal).toBe(true);
    const page = await getMatchHistory(db, playerId, { per: 25 }, true);
    expect(page.rows.find((r) => r.matchId === "OC1_H18")?.inJournal).toBe(true);
    expect((await getMatchHistory(db, playerId, { per: 25 }, false)).rows.find((r) => r.matchId === "OC1_H18")?.inJournal).toBe(false);
  });
});

describe("riot assets", () => {
  it("maps Data Dragon versions and compacts the asset files", () => {
    expect(ddragonVersionOf("16.20.715.1234", null)).toBe("16.20.1");
    expect(ddragonVersionOf(null, "16.19.1")).toBe("16.19.1");
    expect(ddragonVersionOf("garbage", null)).toBeNull();
    const a = compactAssets("16.20.1", { data: { "1001": { name: "Boots" }, "9": {} } }, { data: { SummonerFlash: { id: "SummonerFlash", key: "4", name: "Flash" } } }, [{ id: 8000, name: "Precision", icon: "p.png", slots: [{ runes: [{ id: 8005, name: "Press the Attack", icon: "pta.png" }] }] }]);
    expect(a.items).toEqual({ "1001": "Boots" });
    expect(a.spells["4"]).toEqual({ id: "SummonerFlash", name: "Flash" });
    expect(a.runes["8005"]).toEqual({ name: "Press the Attack", icon: "pta.png" });
    expect(a.runes["8000"]?.name).toBe("Precision");
  });
});
