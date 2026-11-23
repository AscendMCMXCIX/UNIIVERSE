import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import championFixture from "@/server/riot/fixtures/champions.fixture.json";
import { matchSchema, matchTimelineSchema, type RiotMatch, type RiotMatchTimeline } from "@/server/riot/api/schemas";
import { RiotApiError } from "@/server/riot/api/client";
import { runHighEloSlice, type SamplerClient } from "@/server/matchup-intel/high-elo/sampler";
import { highEloRows } from "@/server/matchup-intel/high-elo/store";
import { inclusionProbability, WINDOW_LAG_MS } from "@/domain/matchup-intel/high-elo/sample";
import { patchFromVersion } from "@/domain/patch";
import { runJob } from "@/server/jobs";
import { riotGame } from "../fixtures/riot-game";
import { withCaptureFields } from "../fixtures/riot-game-capture";

/*
  Matchup Intel's high-elo sampling (docs/HIGH_ELO_EVIDENCE.md) against a real database with a fake
  Riot: the counts and the cursor move together and once, nothing that names a player or a game is
  stored, a slice that runs out of requests writes nothing, a refused key stops it, and with the
  switch off the job asks Riot nothing.
*/

const rowsOf = <T,>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];
const keyToId = new Map(championFixture.champions.map((c) => [Number(c.key), c.id]));
const CHAMPIONS = ["Riven", "LeeSin", "Ahri", "Jinx", "Thresh", "Darius", "Vi", "Zed", "Caitlyn", "Lulu"];
const LADDER = 30;
const ladderPuuid = (platform: string, i: number) => `${platform}-player-${i}`;

/** Each server: 5 Challenger, 5 Grandmaster and 20 Master players; every player's window holds the same two games, each with three of them. */
function fakeRiot(options: { refuse?: boolean } = {}): SamplerClient & { calls: number } {
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
  return runHighEloSlice(db, { clientFor: () => riot, now: NOW, seed: "seed-1", keyToId, items: null, keep: [PATCH], ...over });
}

const all = async (db: Db, table: string) => rowsOf<Record<string, unknown>>(await db.execute(sql.raw(`SELECT * FROM ${table}`)));

describe("high-elo sampling", () => {
  let handle: DbHandle;
  let db: Db;
  beforeAll(async () => {
    handle = await testDb();
    db = handle.db;
  });
  afterAll(async () => handle.close());
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM mi_high_counts`);
    await db.execute(sql`DELETE FROM mi_high_cursors`);
    await db.execute(sql`DELETE FROM mi_high_population`);
    await db.execute(sql`DELETE FROM app_settings WHERE key = 'high_elo_day'`);
  });

  it("has no column that could hold a player, a game or a Riot ID", async () => {
    const cols = rowsOf<{ table_name: string; column_name: string }>(await db.execute(sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name LIKE 'mi_high_%'`));
    expect(new Set(cols.map((c) => c.table_name))).toEqual(new Set(["mi_high_counts", "mi_high_cursors", "mi_high_population"]));
    for (const c of cols) expect(c.column_name, `${c.table_name}.${c.column_name}`).not.toMatch(/puuid|match|riot|summoner|name|account|player/);
  });

  it("writes every region's counts with the weights, moves each server's cursor to an hour ago, and stores no identifier", async () => {
    const riot = fakeRiot();
    const run = await slice(db, riot);
    expect(run.regions.map((r) => r.outcome)).toEqual(["written", "written", "written", "written"]);
    expect(run.games).toBe(8);
    // Two games a server, three Master+ players in each.
    expect(run.observations).toBe(4 * 2 * 3);
    const cursors = await all(db, "mi_high_cursors");
    expect(cursors).toHaveLength(4);
    for (const c of cursors) expect(new Date(c.window_end as string).getTime()).toBe(NOW - WINDOW_LAG_MS);
    expect(await all(db, "mi_high_population")).toHaveLength(4);

    const games = rowsOf<{ region: string; n: number; w: number }>(await db.execute(sql`SELECT region, SUM(n)::int AS n, SUM(w) AS w FROM mi_high_counts WHERE kind = 'games' AND opponent = '' GROUP BY region ORDER BY region`));
    expect(games.map((g) => g.region)).toEqual(["americas", "asia", "europe", "sea"]);
    // Each observation: one over the chance of finding a game with 3 of a server's 30 Master+ players when 6 are sampled (both games fetched, the whole window read).
    const weight = 1 / inclusionProbability(LADDER, 3, 6);
    for (const g of games) {
      expect(g.n).toBe(6);
      expect(Number(g.w)).toBeCloseTo(6 * weight, 6);
    }
    const stored = JSON.stringify([await all(db, "mi_high_counts"), cursors, await all(db, "mi_high_population")]);
    expect(stored).not.toMatch(/-player-|-other-|_1"|_2"/);
  });

  it("reads each window once: the same slice again finds nothing new, and two slices at once count it once", async () => {
    const riot = fakeRiot();
    await slice(db, riot);
    const before = await all(db, "mi_high_counts");
    const again = await slice(db, riot);
    expect(again.regions.every((r) => r.outcome === "nothing new")).toBe(true);
    expect(await all(db, "mi_high_counts")).toEqual(before);

    const later = NOW + 2 * 3_600_000;
    const [a, b] = await Promise.all([slice(db, riot, { now: later }), slice(db, riot, { now: later })]);
    const outcomes = [...a.regions, ...b.regions].map((r) => r.outcome).sort();
    expect(outcomes.filter((o) => o === "written")).toHaveLength(4);
    expect(outcomes.filter((o) => o === "taken by another slice")).toHaveLength(4);
    const n = rowsOf<{ n: number }>(await db.execute(sql`SELECT SUM(n)::int AS n FROM mi_high_counts WHERE kind = 'games' AND opponent = ''`))[0]!.n;
    expect(n).toBe(2 * 24);
  });

  it("writes nothing for a region that runs out of requests, and leaves its cursor for the next slice", async () => {
    const run = await slice(db, fakeRiot(), { maxRequests: 4 * 5 });
    expect(run.regions.every((r) => r.outcome === "out of requests")).toBe(true);
    expect(await all(db, "mi_high_counts")).toEqual([]);
    expect(await all(db, "mi_high_cursors")).toEqual([]);
  });

  it("stops on a key Riot refuses, writing nothing", async () => {
    await expect(slice(db, fakeRiot({ refuse: true }))).rejects.toThrow(/403/);
    expect(await all(db, "mi_high_counts")).toEqual([]);
  });

  it("keeps only the current and previous patches' counts", async () => {
    await db.execute(sql`INSERT INTO mi_high_counts (patch, region, role, champion, kind, n, w, w2, ww) VALUES ('15.1', 'europe', 'TOP', 'Riven', 'games', 5, 5, 5, 2)`);
    await slice(db, fakeRiot());
    expect(rowsOf<{ patch: string }>(await db.execute(sql`SELECT DISTINCT patch FROM mi_high_counts`)).map((r) => r.patch)).toEqual([PATCH]);
  });

  it("stops for the day at its daily cap", async () => {
    const riot = fakeRiot();
    const run = await slice(db, riot, { dailyGames: 0 });
    expect(run.regions.every((r) => r.outcome === "daily cap")).toBe(true);
    expect(riot.calls).toBe(0);
  });

  it("gives the page every region's rows for a champion in a role, against everyone and the chosen opponent", async () => {
    await slice(db, fakeRiot());
    const rows = await highEloRows(db, { role: "TOP", champion: "Riven", opponent: "Darius", patches: [PATCH] });
    expect(new Set(rows.map((r) => r.region))).toEqual(new Set(["americas", "asia", "europe", "sea"]));
    expect(rows.some((r) => r.opponent === "Darius" && r.kind === "games")).toBe(true);
    expect(rows.every((r) => r.opponent === "" || r.opponent === "Darius")).toBe(true);
  });

  it("with collection switched off, the job asks Riot nothing and writes nothing", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const run = await runJob(db, "high-elo-sample", "test");
      expect(run.ok).toBe(true);
      expect(run.summary).toMatchObject({ collection: "off" });
      expect(fetch).not.toHaveBeenCalled();
      expect(await all(db, "mi_high_counts")).toEqual([]);
    } finally {
      fetch.mockRestore();
    }
  });
});
