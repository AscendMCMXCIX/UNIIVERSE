import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { makeSeason2026Current, testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import championFixture from "@/server/riot/fixtures/champions.fixture.json";
import { matchSchema, matchTimelineSchema, type RiotMatch, type RiotMatchTimeline } from "@/server/riot/api/schemas";
import { RiotApiError } from "@/server/riot/api/client";
import { failureReason, HighEloOffError, runHighEloSlice, type SamplerClient } from "@/server/champion-builds/high-elo/sampler";
import { commitVisit, highEloChampionCounts } from "@/server/champion-builds/high-elo/store";
import { abilityRanks } from "@/server/champion-builds/high-elo/ranks";
import { highEloState } from "@/server/champion-builds/high-elo/state";
import { runHighEloSample } from "@/server/jobs/high-elo-sample";
import { runJob } from "@/server/jobs";
import { patches } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { loadChampionAbilities, seedChampionAbilitiesFromFixture } from "@/server/riot/static/abilities";
import { skillRanksOf } from "@/server/champion-builds/load";
import { invalidateChampionCaches } from "@/server/repositories/champions";
import { invalidateCache } from "@/server/observability/cache";
import { processEgress } from "@/server/db/egress";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { RIOT_PLATFORMS } from "@/domain/riot-platforms";
import type { CountDelta } from "@/domain/high-elo/counts";
import { demoHighEloDeltas } from "@/server/demo/high-elo";
import { inclusionProbability, WINDOW_LAG_MS } from "@/domain/high-elo/sample";
import { highEloBuildRows } from "@/domain/high-elo/counts";
import { BUILD_DIMS, championBuildsView, hasPerformer, itemClasses, validBuildValue, type BuildDim, type BuildItemInfo } from "@/domain/champion-builds";
import { patchFromVersion } from "@/domain/patch";
import { riotGame } from "../fixtures/riot-game";
import { withCaptureFields } from "../fixtures/riot-game-capture";

/*
  Champion Intel's Master+ builds, prepared and switched off (docs/HIGH_ELO_EVIDENCE.md), against a
  real database with a fake Riot: the tables have no column that could hold a player, a game or a
  Riot ID and every stored value has its kind's form; the counts and the cursor move together and
  once; a slice that runs out of requests writes nothing; a refused key stops it; old patches are
  deleted by every slice (over the storage cap too) and by the daily housekeeping with the
  collection off; the storage cap refuses; the team's own accounts are never sampled or counted; a
  failed region's reason names no route or game; two regions writing the same rows in opposite
  orders do not deadlock; the job reads the abilities' ranks only; with the gate off the slice and
  the job make no client and ask Riot nothing; the page's read is a range of the key; the demo's
  counts give the views the browser tests read.
*/

const rowsOf = <T,>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];
const keyToId = new Map(championFixture.champions.map((c) => [Number(c.key), c.id]));
const fixture = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "ddragon-16.22.1-item-builds.json"), "utf8")) as { items: Record<string, BuildItemInfo> };
const ITEMS = itemClasses(fixture.items);
const CHAMPIONS = ["Riven", "LeeSin", "Ahri", "Jinx", "Thresh", "Darius", "Vi", "Zed", "Caitlyn", "Lulu"];
const LADDER = 30;
const ladderPuuid = (platform: string, i: number) => `${platform}-player-${i}`;
const ON = { on: true, off: [] } as const;

/** Each server: 5 Challenger, 5 Grandmaster and 20 Master players; every player's window holds the same two games, each with three of them. */
function fakeRiot(options: { refuse?: boolean; matchError?: (platform: string, id: string) => Error } = {}): SamplerClient & { calls: number } {
  const games = new Map<string, { match: RiotMatch; timeline: RiotMatchTimeline }>();
  const gameOf = (platform: string, id: string) => {
    if (!games.has(id)) {
      const players = CHAMPIONS.map((champion, i) => ({ puuid: i < 3 ? ladderPuuid(platform, i) : `${platform}-other-${id}-${i}`, gameName: `N${i}`, tagLine: "T", champion }));
      const g = withCaptureFields(riotGame({ matchId: id, players, winner: 100, durationS: 1_800, created: Date.UTC(2026, 10, 22) }));
      games.set(id, { match: matchSchema.parse(g.match), timeline: matchTimelineSchema.parse(g.timeline) });
    }
    return games.get(id)!;
  };
  const c = {
    calls: 0,
    async apexLeague(platform: string, tier: "challenger" | "grandmaster" | "master") {
      c.calls += 1;
      if (options.refuse) throw new RiotApiError("Riot API 403", 403, false);
      const [from, to] = tier === "challenger" ? [0, 5] : tier === "grandmaster" ? [5, 10] : [10, LADDER];
      return { entries: Array.from({ length: to - from }, (_, i) => ({ puuid: ladderPuuid(platform, from + i) })) };
    },
    async matchIdsByPuuid(platform: string) {
      c.calls += 1;
      return [`${platform.toUpperCase()}_1`, `${platform.toUpperCase()}_2`];
    },
    async match(platform: string, id: string) {
      c.calls += 1;
      if (options.matchError) throw options.matchError(platform, id);
      return gameOf(platform, id).match;
    },
    async matchTimeline(platform: string, id: string) {
      c.calls += 1;
      return gameOf(platform, id).timeline;
    },
  };
  return c;
}

const PATCH = patchFromVersion((matchSchema.parse(riotGame({ matchId: "X", players: CHAMPIONS.map((champion, i) => ({ puuid: `x${i}`, gameName: "a", tagLine: "b", champion })), winner: 100, durationS: 1_800, created: 0 }).match) as RiotMatch).info.gameVersion)!;
const NOW = Date.UTC(2026, 10, 23, 12);

async function slice(db: Db, riot: SamplerClient, over: Partial<Parameters<typeof runHighEloSlice>[1]> = {}) {
  return runHighEloSlice(db, { gate: ON, clientFor: () => riot, now: NOW, seed: "seed-1", keyToId, items: ITEMS, ranksOf: () => ({ 1: 5, 2: 5, 3: 5, 4: 3 }), keep: [PATCH], ...over });
}

const all = async (db: Db, table: string) => rowsOf<Record<string, unknown>>(await db.execute(sql.raw(`SELECT * FROM ${table}`)));

describe("the Master+ builds' storage and sampling (switched off)", () => {
  let handle: DbHandle;
  let db: Db;
  beforeAll(async () => {
    handle = await testDb();
    db = handle.db;
  }, 120_000);
  afterAll(async () => handle?.close());
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM high_elo_counts`);
    await db.execute(sql`DELETE FROM high_elo_cursors`);
    await db.execute(sql`DELETE FROM high_elo_population`);
    await db.execute(sql`DELETE FROM app_settings WHERE key = 'high_elo_day'`);
  });

  it("has three tables with row-level security and no column that could hold a player, a game or a Riot ID", async () => {
    const cols = rowsOf<{ table_name: string; column_name: string }>(await db.execute(sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name LIKE 'high_elo_%'`));
    expect(new Set(cols.map((c) => c.table_name))).toEqual(new Set(["high_elo_counts", "high_elo_cursors", "high_elo_population"]));
    for (const c of cols) expect(c.column_name, `${c.table_name}.${c.column_name}`).not.toMatch(/puuid|match|riot|summoner|name|account|player|game_name|tag_line/);
    const rls = rowsOf<{ relname: string; relrowsecurity: boolean }>(await db.execute(sql`SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'high_elo_%' AND relkind = 'r'`));
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);
    expect(rls).toHaveLength(3);
  });

  it("writes every region's counts with the weights (the build kinds for all regions, the games per region too), moves each server's cursor, and stores no identifier", async () => {
    const run = await slice(db, fakeRiot());
    expect(run.regions.map((r) => r.outcome)).toEqual(["written", "written", "written", "written"]);
    expect(run.games).toBe(8);
    expect(run.observations).toBe(4 * 2 * 3);
    const cursors = await all(db, "high_elo_cursors");
    expect(cursors).toHaveLength(4);
    for (const c of cursors) expect(new Date(c.window_end as string).getTime()).toBe(NOW - WINDOW_LAG_MS);
    const games = rowsOf<{ region: string; n: number; w: number }>(await db.execute(sql`SELECT region, SUM(n)::int AS n, SUM(w) AS w FROM high_elo_counts WHERE kind = 'games' GROUP BY region ORDER BY region`));
    expect(games.map((g) => g.region)).toEqual(["all", "americas", "asia", "europe", "sea"]);
    const weight = 1 / inclusionProbability(LADDER, 3, 6);
    for (const g of games.filter((x) => x.region !== "all")) {
      expect(g.n).toBe(6);
      expect(Number(g.w)).toBeCloseTo(6 * weight, 6);
    }
    // "all" is exactly the regions' sum; every build kind is kept for all regions together only.
    expect(games.find((g) => g.region === "all")!.n).toBe(24);
    expect(rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM high_elo_counts WHERE kind <> 'games' AND region <> 'all'`))[0]!.n).toBe(0);
    const stored = await all(db, "high_elo_counts");
    for (const r of stored) {
      expect(BUILD_DIMS).toContain(r.kind);
      expect(validBuildValue(r.kind as BuildDim, String(r.value)), `${r.kind} ${r.value}`).toBe(true);
      expect(r.opponent).toBe("");
    }
    expect(JSON.stringify([stored, cursors, await all(db, "high_elo_population")])).not.toMatch(/-player-|-other-|_1"|_2"|N\d#?T/);
  });

  it("reads each window once: the same slice again finds nothing new, and two slices at once count it once", async () => {
    const riot = fakeRiot();
    await slice(db, riot);
    const before = await all(db, "high_elo_counts");
    const again = await slice(db, riot);
    expect(again.regions.every((r) => r.outcome === "nothing new")).toBe(true);
    expect(await all(db, "high_elo_counts")).toEqual(before);
    const later = NOW + 2 * 3_600_000;
    const [a, b] = await Promise.all([slice(db, riot, { now: later }), slice(db, riot, { now: later })]);
    const outcomes = [...a.regions, ...b.regions].map((r) => r.outcome);
    expect(outcomes.filter((o) => o === "written")).toHaveLength(4);
    expect(outcomes.filter((o) => o === "taken by another slice")).toHaveLength(4);
  });

  it("writes nothing for a region that runs out of requests, and stops every region on a key Riot refuses", async () => {
    const run = await slice(db, fakeRiot(), { maxRequests: 4 * 5 });
    expect(run.regions.every((r) => r.outcome === "out of requests")).toBe(true);
    expect(await all(db, "high_elo_counts")).toEqual([]);
    expect(await all(db, "high_elo_cursors")).toEqual([]);
    await expect(slice(db, fakeRiot({ refuse: true }))).rejects.toThrow(/403/);
    expect(await all(db, "high_elo_counts")).toEqual([]);
  });

  it("keeps only the current and previous patches' counts, and refuses to write above its storage cap", async () => {
    await db.execute(sql`INSERT INTO high_elo_counts (champion, patch, role, region, kind, n, w, w2, ww) VALUES ('Riven', '15.1', 'TOP', 'all', 'games', 5, 5, 5, 2)`);
    const run = await slice(db, fakeRiot());
    expect(run.oldCountsDeleted).toBe(1);
    expect(rowsOf<{ patch: string }>(await db.execute(sql`SELECT DISTINCT patch FROM high_elo_counts`)).map((r) => r.patch)).toEqual([PATCH]);
    const capped = await commitVisit(db, { platform: "kr", from: null, to: NOW, games: 1, deltas: [], keep: [PATCH], maxBytes: 0 });
    expect(capped).toBe("storage cap");
    expect((await all(db, "high_elo_cursors")).some((c) => c.platform === "kr")).toBe(false);
  });

  it("deletes older patches' counts whatever the regions do: a slice over the storage cap, or out of today's games, deletes them before it stops", async () => {
    const old = sql`INSERT INTO high_elo_counts (champion, patch, role, region, kind, n, w, w2, ww) VALUES ('Riven', '15.1', 'TOP', 'all', 'games', 5, 5, 5, 2)`;
    const oldRows = async () => rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM high_elo_counts WHERE patch = '15.1'`))[0]!.n;
    await db.execute(old);
    const capped = await slice(db, fakeRiot(), { maxBytes: 0 });
    expect(capped.regions.map((r) => r.outcome)).toEqual(["storage cap", "storage cap", "storage cap", "storage cap"]);
    expect(capped.oldCountsDeleted).toBe(1);
    expect(await oldRows()).toBe(0);
    expect(await all(db, "high_elo_cursors")).toEqual([]);
    await db.execute(old);
    const dayDone = await slice(db, fakeRiot(), { dailyGames: 0 });
    expect(dayDone.regions.every((r) => r.outcome === "daily cap")).toBe(true);
    expect(dayDone.oldCountsDeleted).toBe(1);
    expect(await oldRows()).toBe(0);
  });

  it("the daily housekeeping deletes older patches' counts with the collection off (it never runs), and keeps the current and previous patch", async () => {
    await makeSeason2026Current(db);
    await db.insert(patches).values({ id: "16.19", ddragonVersion: "16.19.1", isCurrent: false, sortKey: 16_019 }).onConflictDoNothing();
    invalidateChampionCaches();
    for (const patch of ["16.18", "16.19", "16.20"]) await db.execute(sql`INSERT INTO high_elo_counts (champion, patch, role, region, kind, n, w, w2, ww) VALUES ('Riven', ${patch}, 'TOP', 'all', 'games', 5, 5, 5, 2)`);
    const run = await runJob(db, "integrity", "cli");
    expect(run).toMatchObject({ ok: true });
    expect((run.summary as { oldHighEloCountsDeleted: number }).oldHighEloCountsDeleted).toBe(1);
    expect(rowsOf<{ patch: string }>(await db.execute(sql`SELECT patch FROM high_elo_counts ORDER BY patch`)).map((r) => r.patch)).toEqual(["16.19", "16.20"]);
  });

  it("never samples or counts the team's own accounts: a member on the ladder adds no observation, and their champion no count", async () => {
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Ladder member", primaryRole: "TOP" } as Parameters<typeof createPlayer>[2]);
    // ladderPuuid(…, 0) plays Riven in every fake game, on every server.
    for (const [i, p] of RIOT_PLATFORMS.entries()) {
      await db.execute(sql`INSERT INTO riot_accounts (owner_type, player_id, game_name, tag_line, platform, puuid, label) VALUES ('player', ${player.id}, ${`Member${i}`}, 'T', ${p.id}, ${ladderPuuid(p.id, 0)}, ${i === 0 ? "main" : "alt"})`);
    }
    try {
      const run = await slice(db, fakeRiot());
      expect(run.regions.map((r) => r.outcome)).toEqual(["written", "written", "written", "written"]);
      // Two Master+ players a game where there were three; the ladder's size is Riot's.
      expect(run.observations).toBe(4 * 2 * 2);
      expect(run.regions.every((r) => r.ladder === LADDER)).toBe(true);
      expect(rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM high_elo_counts WHERE champion = 'Riven'`))[0]!.n).toBe(0);
      expect(rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM high_elo_counts WHERE champion = 'LeeSin'`))[0]!.n).toBeGreaterThan(0);
    } finally {
      await db.execute(sql`DELETE FROM riot_accounts WHERE player_id = ${player.id}`);
    }
  });

  it("states a failed region's reason with no route, player or game, and a refused key in words", async () => {
    const ids: string[] = [];
    const kinds = [
      (id: string) => new RiotApiError(`Riot API 503 on /lol/match/v5/matches/${id}`, 503, true),
      (id: string) => new RiotApiError(`Network error calling /lol/match/v5/matches/${id}: socket hang up`, 0, true),
      (id: string) => new RiotApiError(`Unexpected response shape on /lol/match/v5/matches/${id}: Required`, 200, false),
      (id: string) => new RiotApiError(`Unreadable answer from /lol/match/v5/matches/${id}: Unexpected token <`, 0, true),
    ];
    const run = await slice(db, fakeRiot({ matchError: (platform, id) => (ids.push(id), kinds[RIOT_PLATFORMS.findIndex((p) => p.id === platform) % kinds.length]!(id)) }));
    expect(run.regions.every((r) => r.outcome === "failed")).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
    const text = JSON.stringify(run);
    for (const id of ids) expect(text).not.toContain(id);
    expect(text).not.toMatch(/\/lol\/|matches|-player-/);
    for (const r of run.regions) expect(r.error).toMatch(/^Riot API/);
    // Anything else: its name, its message without identifiers or routes.
    expect(failureReason(new Error(`could not read KR_7401234567 for ${"a".repeat(78)} at /lol/match/v5/matches/KR_7401234567/timeline`))).toBe("Error: could not read <match> for <token> at <route>");
    expect(failureReason(Object.assign(new Error("deadlock detected"), { code: "40P01" }))).toBe("Database error 40P01");
    // A refused key stops the run with Riot's words for it, not the route it came on.
    const refused = await slice(db, fakeRiot({ matchError: (_p, id) => new RiotApiError(`Riot API 403 on /lol/match/v5/matches/${id}`, 403, false) }), { now: NOW + 4 * 3_600_000 }).catch((err: Error) => err);
    expect(refused).toBeInstanceOf(RiotApiError);
    expect((refused as Error).message).toMatch(/^Riot API 403: the key was rejected/);
    expect((refused as Error).message).not.toMatch(/matches|_\d/);
  });

  it("commits regions in the key's order: two regions writing the same rows in opposite orders both write, with no deadlock", async () => {
    const delta = (i: number): CountDelta => ({ champion: `Champion${String(i).padStart(4, "0")}`, patch: PATCH, role: "TOP", region: "all", opponent: "", kind: "games", value: "", n: 1, w: 1, w2: 1, ww: 0 });
    // Three statements each (500 rows a statement), the second's rows overlapping the other's.
    const up = Array.from({ length: 1_500 }, (_, i) => delta(i));
    const down = [...up].reverse();
    for (const [a, b] of [["euw1", "kr"], ["eun1", "jp1"], ["na1", "oc1"]] as const) {
      const outcomes = await Promise.allSettled([commitVisit(db, { platform: a, from: null, to: NOW, games: 1, deltas: up, keep: [PATCH] }), commitVisit(db, { platform: b, from: null, to: NOW, games: 1, deltas: down, keep: [PATCH] })]);
      expect(outcomes.map((o) => (o.status === "fulfilled" ? o.value : String((o.reason as Error)?.cause ?? o.reason)))).toEqual(["written", "written"]);
    }
    expect(rowsOf<{ lo: number; hi: number; rows: number }>(await db.execute(sql`SELECT min(n)::int AS lo, max(n)::int AS hi, count(*)::int AS rows FROM high_elo_counts`))[0]).toEqual({ lo: 6, hi: 6, rows: 1_500 });
  });

  it("reads the abilities' ranks only (the page's ranks for every champion), so a slice's own reads stay a few tens of KB", async () => {
    await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
    await seedChampionAbilitiesFromFixture(db);
    const ranks = await abilityRanks(db);
    const roster = rowsOf<{ id: string }>(await db.execute(sql`SELECT id FROM champions WHERE is_active`)).map((r) => r.id);
    expect(roster.length).toBeGreaterThan(150);
    const loaded = await loadChampionAbilities(db, roster);
    for (const id of roster) expect(ranks.get(id) ?? null, id).toEqual(skillRanksOf((loaded.champions[id]?.abilities ?? []).map((a) => ({ slot: a.slot, ranks: a.maxRank }))));
    // The job's own reads on a slice (the egress counter counts Postgres's answers: postgres only).
    invalidateCache("champion_abilities");
    invalidateCache("riot_build_data");
    invalidateChampionCaches();
    const before = processEgress().bytes;
    const run = await runHighEloSample({ db, log: () => undefined, startedAt: Date.now(), budgetMs: 60_000 }, { gate: ON, clientFor: () => fakeRiot(), now: NOW });
    expect(run).toMatchObject({ ok: true, summary: { collection: "on" } });
    const read = processEgress().bytes - before;
    if (process.env.TEST_DATABASE_URL) {
      expect(read).toBeGreaterThan(0);
      expect(read).toBeLessThan(80_000);
    }
  });

  it("with the gate off, the slice makes no client and the job asks Riot nothing and writes nothing", async () => {
    const clientFor = vi.fn(() => fakeRiot());
    await expect(runHighEloSlice(db, { gate: { on: false, off: ["not-registered"] }, clientFor, now: NOW, seed: "s", keyToId, items: ITEMS, ranksOf: () => null, keep: [PATCH] })).rejects.toBeInstanceOf(HighEloOffError);
    expect(clientFor).not.toHaveBeenCalled();
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const logs: string[] = [];
      // The job's own gate: this build has no ladder request, and no environment switch.
      const run = await runHighEloSample({ db, log: (m) => logs.push(m), startedAt: Date.now(), budgetMs: 60_000 }, { clientFor });
      expect(run).toMatchObject({ ok: true, summary: { collection: "off" } });
      expect((run.summary as { off: string[] }).off).toEqual(expect.arrayContaining(["not-registered", "switch-off"]));
      expect(clientFor).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(await all(db, "high_elo_counts")).toEqual([]);
      expect(logs.join(" ")).toMatch(/no Riot request made, nothing written/);
    } finally {
      fetch.mockRestore();
    }
  });

  it("gives the page one champion's counts for all regions as a range of its key, and Admin its state in counts", async () => {
    await slice(db, fakeRiot());
    const rows = await highEloChampionCounts(db, { champion: "Riven", patches: [PATCH] });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.kind !== "" && r.n > 0)).toBe(true);
    const plan = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      return rowsOf<Record<string, string>>(await tx.execute(sql`EXPLAIN SELECT * FROM high_elo_counts WHERE champion = 'Riven' AND patch = ANY(ARRAY['16.22']) AND region = 'all' AND opponent = ''`));
    });
    expect(plan.map((r) => Object.values(r)[0]).join("\n")).toContain("high_elo_counts_pk");
    const state = await highEloState(db, new Date(NOW));
    expect(state).toMatchObject({ on: false, gamesToday: 8 });
    expect(state.rows).toBeGreaterThan(0);
    expect(state.off).toEqual(expect.arrayContaining(["not-registered", "switch-off"]));
  });

  it("the demo's synthetic counts give a Highest win rate, two roles, too few and none, through the builds' own rules", async () => {
    const deltas = demoHighEloDeltas("16.22");
    for (const d of deltas) expect(validBuildValue(d.kind, d.value), `${d.kind} ${d.value}`).toBe(true);
    // One row per key (the regions' "all" rows summed), so seeding stores every game.
    const keys = deltas.map((d) => [d.champion, d.patch, d.role, d.region, d.opponent, d.kind, d.value].join("|"));
    expect(new Set(keys).size).toBe(keys.length);
    const games = (region: string) => deltas.filter((d) => d.champion === "Thresh" && d.kind === "games" && d.region === region).reduce((s, d) => s + d.n, 0);
    expect(games("all")).toBe(games("americas") + games("europe") + games("asia") + games("sea"));
    const icons = { item: (id: number) => ({ url: "", name: `Item ${id}` }), rune: (id: number) => ({ url: "", name: `Rune ${id}` }), spell: (k: number) => ({ url: "", name: `Spell ${k}` }), shard: (id: number, row: number) => ({ url: "", name: `Shard ${row}` }) };
    const view = (champion: string) => championBuildsView(champion, highEloBuildRows(deltas.filter((d) => d.champion === champion && d.region === "all")), { current: "16.22", previous: "16.21" }, icons, "solo", "master");
    const thresh = view("Thresh");
    expect(thresh.status === "shown" && hasPerformer(thresh.builds.SUPPORT!)).toBe(true);
    if (thresh.status === "shown") expect(thresh.builds.SUPPORT!.observed).toBeGreaterThan(thresh.builds.SUPPORT!.games);
    const leona = view("Leona");
    expect(leona.status === "shown" && leona.roles.map((r) => r.role)).toEqual(["SUPPORT", "ADC"]);
    expect(view("Nasus")).toMatchObject({ status: "few", source: "master" });
    expect(view("Ahri")).toMatchObject({ status: "few", games: 0, role: null });
  });
});
