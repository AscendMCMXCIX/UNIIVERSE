import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import { createDb, type DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import { matchDetails, type MatchParticipantDetail, type MatchTeamDetail } from "@/server/db/schema";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import { runMigrations } from "@/server/db/migrator";
import { storeMatchDetail } from "@/server/accounts/match-details";
import { explainMultikillBaseline, readBaseline } from "@/server/leaderboards/multikill-baseline";
import type { BaselineRow } from "@/domain/multikill-score";
import type { RiotMatch } from "@/server/riot/api/schemas";
import { riotGame, type ScriptPlayer } from "../fixtures/riot-game";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  The players' multikill counters in their own table (migration 0070, docs/PERFORMANCE.md 27 Nov 2026):
  `match_multikills` holds one row per counted player of each stored record, copied by the database
  itself (trigger match_multikills_rows) whenever a record is stored or its players, teams, queue or
  length are rewritten, and deleted with it. The comparison then reads that table instead of every
  record's players from TOAST storage. Its answers must be exactly the answers of the statement it
  replaced (the reference below, verbatim from 26 Nov 2026), and no stored record may ever fail
  because of it.
*/

let handle: DbHandle;
const keyToId = new Map(fixture.champions.map((c) => [c.key, c.id]));

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

interface Counted {
  match_id: string;
  slot: number;
  puuid: string;
  position: string | null;
  champion_id: string | null;
  queue_id: number | null;
  duration_s: number;
  team_id: number | null;
  kills: number | null;
  team_kills: number | null;
  doubles: number;
  triples: number;
  quadras: number;
  pentas: number;
  largest: number | null;
}
const counted = async (db: Db, matchId: string) => rowsOf<Counted>(await db.execute(sql`SELECT * FROM match_multikills WHERE match_id = ${matchId} ORDER BY slot`)).map((r) => ({ ...r, slot: Number(r.slot) }));

const part = (puuid: string, teamId: number, position: string | null, championId: string | null, stats: unknown, extra: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail =>
  ({ puuid, name: `${puuid}#X`, teamId, championId, championKey: 1, champLevel: 15, position, win: teamId === 100, kills: 4, deaths: 3, assists: 5, cs: 150, gold: 10_000, damage: 15_000, damageTaken: 15_000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null, ...(stats === undefined ? {} : { stats }), ...extra }) as MatchParticipantDetail;
const record = (matchId: string, participants: unknown, teams: unknown = [], over: Partial<typeof matchDetails.$inferInsert> = {}): typeof matchDetails.$inferInsert =>
  ({ matchId, platform: "euw1", queueId: 420, gameCreation: 1_700_000_000_000, gameDuration: 1800, gameVersion: "16.20.1", teams, participants, ...over }) as typeof matchDetails.$inferInsert;
const mk = (d: number, t: number, q: number, p: number, largest?: number) => ({ doubleKills: d, tripleKills: t, quadraKills: q, pentaKills: p, ...(largest === undefined ? {} : { largestMultiKill: largest }) });

/** The comparison's statement until 27 Nov 2026 (multikill-baseline.ts at 8af78d27), kept here as the reference the new one must equal. */
async function referenceRows(db: Db, matchIds: readonly string[], memberPuuids: readonly string[]): Promise<BaselineRow[]> {
  const ids = JSON.stringify(matchIds);
  const members = JSON.stringify(memberPuuids);
  const counter = (k: string) => sql.raw(`(x->'stats'->>'${k}')::int`);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL jit = off`);
    return tx.execute(sql`
      WITH p AS (
        SELECT x->>'position' AS position, x->>'championId' AS champion,
          coalesce(x->>'puuid', '') IN (SELECT jsonb_array_elements_text(${members}::jsonb)) AS member,
          ${counter("doubleKills")} AS d, ${counter("tripleKills")} AS t, ${counter("quadraKills")} AS q, ${counter("pentaKills")} AS pk
        FROM (SELECT DISTINCT value AS match_id FROM jsonb_array_elements_text(${ids}::jsonb)) g
        JOIN match_details md ON md.match_id = g.match_id
        CROSS JOIN LATERAL jsonb_array_elements(md.participants) x
        WHERE x->>'removed' IS NULL
          AND jsonb_typeof(x->'stats'->'doubleKills') = 'number' AND jsonb_typeof(x->'stats'->'tripleKills') = 'number'
          AND jsonb_typeof(x->'stats'->'quadraKills') = 'number' AND jsonb_typeof(x->'stats'->'pentaKills') = 'number'
      )
      SELECT
        (SELECT coalesce(json_agg(json_build_array(position, champion, games, n2, n3, n4, n5, s2, s3, s4, s5)), '[]') FROM (
          SELECT position, champion, count(*)::int AS games,
            sum(greatest(d - t, 0))::int AS n2, sum(greatest(t - q, 0))::int AS n3, sum(greatest(q - pk, 0))::int AS n4, sum(pk)::int AS n5,
            sum(d)::int AS s2, sum(t)::int AS s3, sum(q)::int AS s4, sum(pk)::int AS s5
          FROM p WHERE NOT member GROUP BY position, champion) groups) AS rows`);
  });
  const [answer] = rowsOf<{ rows: unknown }>(result);
  const raw = (typeof answer?.rows === "string" ? JSON.parse(answer.rows) : (answer?.rows ?? [])) as Array<[string | null, string | null, ...number[]]>;
  return raw.map(([position, championId, games, n2, n3, n4, n5, s2, s3, s4, s5]) => ({ position, championId, games: Number(games), nested: { double: Number(n2), triple: Number(n3), quadra: Number(n4), penta: Number(n5) }, separate: { double: Number(s2), triple: Number(s3), quadra: Number(s4), penta: Number(s5) } }));
}
const sorted = (rows: readonly BaselineRow[]) => rows.map((r) => JSON.stringify(r)).sort();

beforeAll(async () => {
  handle = await testDb();
}, 60_000);
afterAll(async () => {
  await handle?.close();
});

describe("the players' multikill counters (match_multikills)", () => {
  it("gives a record stored by the sync one row per counted player, in the record's order, with its queue, length, side, kills and team kills", async () => {
    const db = handle.db;
    const champions = ["Garen", "LeeSin", "Ahri", "Jinx", "Thresh", "Darius", "Vi", "Syndra", "Caitlyn", "Lux"];
    const players: ScriptPlayer[] = champions.map((champion, i) => ({ puuid: `sync-${i}`, gameName: `P${i}`, tagLine: "X", champion }));
    const game = riotGame({ matchId: "EUW1_MK_SYNC", players, winner: 100, durationS: 1_754, created: 1_700_000_000_000, queueId: 440, seed: 7 });
    const match = game.match as unknown as RiotMatch;
    // Nested counters for two players (a pentakill game, a triple game) and a removed-looking one left as Riot sent it.
    Object.assign(match.info.participants[2]!, { doubleKills: 2, tripleKills: 1, quadraKills: 1, pentaKills: 1, largestMultiKill: 5 });
    Object.assign(match.info.participants[7]!, { doubleKills: 1, tripleKills: 1, quadraKills: 0, pentaKills: 0, largestMultiKill: 3 });
    await storeMatchDetail(db, "euw1", match, keyToId, { summarise: false });
    const [stored] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, "EUW1_MK_SYNC"));
    const rows = await counted(db, "EUW1_MK_SYNC");
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    stored!.participants.forEach((p, i) => {
      const side = stored!.teams.find((t) => t.teamId === p.teamId)!;
      expect(rows[i]).toEqual({
        match_id: "EUW1_MK_SYNC",
        slot: i,
        puuid: p.puuid,
        position: p.position,
        champion_id: p.championId,
        queue_id: 440,
        duration_s: 1_754,
        team_id: p.teamId,
        kills: p.kills,
        team_kills: side.objectives.champion,
        doubles: p.stats!.doubleKills,
        triples: p.stats!.tripleKills,
        quadras: p.stats!.quadraKills,
        pentas: p.stats!.pentaKills,
        largest: p.stats!.largestMultiKill,
      });
    });
    expect(rows[2]).toMatchObject({ doubles: 2, triples: 1, quadras: 1, pentas: 1, largest: 5 });
    // The script's own team kills (independent of the app's code).
    expect(rows[0]!.team_kills).toBe(game.truth.kills[100]);
    expect(rows[9]!.team_kills).toBe(game.truth.kills[200]);
    // Stored again (a second account in the same game): nothing changes, nothing is doubled.
    await storeMatchDetail(db, "euw1", match, keyToId, { summarise: false });
    expect(await counted(db, "EUW1_MK_SYNC")).toEqual(rows);
  });

  it("follows the record: counters added later (the figures backfill), teams, queue or length rewritten, a player redacted, the record deleted", async () => {
    const db = handle.db;
    // Stored before Phase 14: no counters, so nobody is counted.
    const players = [part("f-0", 100, "TOP", "Garen", undefined), part("f-1", 100, "MIDDLE", "Ahri", undefined), part("f-2", 200, "MIDDLE", "Syndra", undefined)];
    await db.insert(matchDetails).values(record("EUW1_MK_FIG", players));
    expect(await counted(db, "EUW1_MK_FIG")).toEqual([]);
    // The figures backfill's statement shape: teams and players rewritten together.
    const withCounters = players.map((p, i) => ({ ...p, stats: mk(i, 0, 0, 0, i ? 2 : 0) }));
    const teams: MatchTeamDetail[] = [{ teamId: 100, win: true, bans: [], objectives: { champion: 21 } }, { teamId: 200, win: false, bans: [], objectives: { champion: 9 } }];
    await db.execute(sql`UPDATE match_details SET teams = ${JSON.stringify(teams)}::jsonb, participants = ${JSON.stringify(withCounters)}::jsonb WHERE match_id = 'EUW1_MK_FIG'`);
    expect((await counted(db, "EUW1_MK_FIG")).map((r) => [r.slot, r.puuid, r.doubles, r.team_kills])).toEqual([[0, "f-0", 0, 21], [1, "f-1", 1, 21], [2, "f-2", 2, 9]]);
    // Teams alone, then the queue and length alone, rewritten: the rows follow.
    await db.update(matchDetails).set({ teams: teams.map((t) => ({ ...t, objectives: { champion: t.objectives.champion! + 1 } })) }).where(eq(matchDetails.matchId, "EUW1_MK_FIG"));
    await db.update(matchDetails).set({ queueId: 400, gameDuration: 1500 }).where(eq(matchDetails.matchId, "EUW1_MK_FIG"));
    expect((await counted(db, "EUW1_MK_FIG")).map((r) => [r.team_kills, r.queue_id, r.duration_s])).toEqual([[22, 400, 1500], [22, 400, 1500], [10, 400, 1500]]);
    // A player redacted (an erasure's shape: a Removed player, no PUUID or counters): their row goes, the others stay as they were.
    const before = await counted(db, "EUW1_MK_FIG");
    const redacted = withCounters.map((p, i) => (i === 1 ? { puuid: "", name: null, teamId: 100, championId: null, championKey: 0, champLevel: null, position: null, win: true, kills: 0, deaths: 0, assists: 0, cs: null, gold: null, damage: null, damageTaken: null, vision: null, wardsPlaced: null, items: null, spells: null, runes: null, removed: true as const } : p));
    await db.update(matchDetails).set({ participants: redacted as MatchParticipantDetail[] }).where(eq(matchDetails.matchId, "EUW1_MK_FIG"));
    expect(await counted(db, "EUW1_MK_FIG")).toEqual([before[0], before[2]]);
    // The record deleted (an erasure of a game only the person played): its rows go with it.
    await db.delete(matchDetails).where(eq(matchDetails.matchId, "EUW1_MK_FIG"));
    expect(await counted(db, "EUW1_MK_FIG")).toEqual([]);
  });

  it("never fails a record's insert: a counter that is not a small whole number leaves that player out, any other figure only that figure", async () => {
    const db = handle.db;
    const players = [
      part("ok", 100, "TOP", "Garen", mk(1, 0, 0, 0, 2)),
      part("text", 100, "JUNGLE", "Vi", { doubleKills: "2", tripleKills: 0, quadraKills: 0, pentaKills: 0 }),
      part("fraction", 100, "MIDDLE", "Ahri", mk(1.5, 0, 0, 0)),
      part("huge", 100, "BOTTOM", "Jinx", mk(99_999, 0, 0, 0)),
      part("null", 100, "UTILITY", "Lulu", { doubleKills: null, tripleKills: 0, quadraKills: 0, pentaKills: 0 }),
      part("partial", 200, "TOP", "Darius", { doubleKills: 1, tripleKills: 0, quadraKills: 0 }),
      part("no-stats", 200, "JUNGLE", "LeeSin", undefined),
      part("scalar-stats", 200, "MIDDLE", "Syndra", 7),
      part("odd-figures", 200, "BOTTOM", "Caitlyn", { ...mk(2, 1, 0, 0), largestMultiKill: 2.5 }, { kills: 1.5 as unknown as number, teamId: "red" as unknown as number }),
      part("removed", 200, "UTILITY", "Thresh", mk(3, 0, 0, 0), { removed: true }),
    ];
    // Scalars and nulls in the list itself, and teams that are not a list.
    await db.insert(matchDetails).values(record("EUW1_MK_ODD", [...players, 5, null, "x"], { not: "a list" }));
    expect((await counted(db, "EUW1_MK_ODD")).map((r) => [r.slot, r.puuid, r.doubles, r.largest, r.kills, r.team_id, r.team_kills])).toEqual([
      [0, "ok", 1, 2, 4, 100, null],
      [8, "odd-figures", 2, null, null, null, null],
    ]);
    // A record with no players (Riot no longer returns it), or players that are not a list: stored, no rows.
    await db.insert(matchDetails).values([record("EUW1_MK_EMPTY", []), record("EUW1_MK_OBJECT", { players: 3 })]);
    expect(await counted(db, "EUW1_MK_EMPTY")).toEqual([]);
    expect(await counted(db, "EUW1_MK_OBJECT")).toEqual([]);
    expect((await db.select({ id: matchDetails.matchId }).from(matchDetails).where(eq(matchDetails.matchId, "EUW1_MK_ODD"))).length).toBe(1);
  });

  it("answers the comparison exactly as the statement it replaced, on a random history of stored records", async () => {
    const db = handle.db;
    let seed = 20_261_127;
    const rnd = () => ((seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0) / 4_294_967_296);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
    const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY", "MID", "SUPPORT", "", null];
    const champions = ["Garen", "Ahri", "Jinx", "Thresh", "LeeSin", "Katarina", null];
    // A team of five, one with two accounts.
    const members = ["m-0", "m-1", "m-2", "m-3", "m-4", "m-4b"];
    const ids: string[] = [];
    const records: Array<typeof matchDetails.$inferInsert> = [];
    for (let g = 0; g < 400; g++) {
      const matchId = `EUW1_EQ_${g}`;
      ids.push(matchId);
      const seats = new Set<number>();
      const memberCount = Math.floor(rnd() * 6);
      while (seats.size < memberCount) seats.add(Math.floor(rnd() * 10));
      const withCounters = rnd() > 0.1;
      const players = Array.from({ length: 10 }, (_, i) => {
        const puuid = seats.has(i) ? pick(members) : `o-${g}-${i}`;
        if (rnd() < 0.03) return part("", i < 5 ? 100 : 200, null, null, undefined, { removed: true });
        // Nested counters mostly; now and then out of order (as separate counters would be).
        const d = Math.floor(rnd() * 3);
        const t = rnd() < 0.15 ? Math.floor(rnd() * 2) + (rnd() < 0.2 ? 1 : 0) : 0;
        const q = t && rnd() < 0.2 ? 1 : 0;
        const p = q && rnd() < 0.3 ? 1 : 0;
        const stats = withCounters && rnd() > 0.05 ? mk(d, t, q, p, Math.max(d ? 2 : 1, t ? 3 : 0)) : rnd() < 0.5 ? { wardsKilled: 2 } : undefined;
        return part(puuid, i < 5 ? 100 : 200, pick(positions), pick(champions), stats);
      });
      records.push(record(matchId, players, [{ teamId: 100, win: true, bans: [], objectives: { champion: 20 } }, { teamId: 200, win: false, bans: [], objectives: { champion: 15 } }]));
    }
    for (let i = 0; i < records.length; i += 100) await db.insert(matchDetails).values(records.slice(i, i + 100));
    const season = ids.filter(() => rnd() > 0.2);
    const cases: Array<[string, string[], string[]]> = [
      ["the season's games, the team's accounts", season, members],
      ["duplicate ids in the input", [...season, ...season.slice(0, 40)], members],
      ["no member (nobody is left out)", season, []],
      ["one member", season.slice(0, 120), ["m-2"]],
      ["every stored game", ids, members],
    ];
    for (const [what, matchIds, puuids] of cases) {
      const expected = await referenceRows(db, matchIds, puuids);
      expect(expected.length, what).toBeGreaterThan(20);
      expect(sorted(await readBaseline(db, matchIds, puuids)), what).toEqual(sorted(expected));
    }
    // No game: no row.
    expect(await readBaseline(db, [], members)).toEqual([]);
    expect(await referenceRows(db, [], members)).toEqual([]);
  });

  it("reads only the players' counters, never the stored records", async () => {
    const db = handle.db;
    const ids = Array.from({ length: 400 }, (_, g) => `EUW1_EQ_${g}`);
    const games = ids.map((matchId) => ({ matchId, playerId: "x", championId: "Ahri", role: "MID", queueId: 420, patch: "16.20", win: true, gameCreation: 1, durationS: 1800 }) as never);
    const plan = await explainMultikillBaseline(db, { games, memberPuuids: ["m-0"] }, 16);
    expect(plan.relations).toEqual(["match_multikills"]);
    expect(plan.executionMs).toBeGreaterThanOrEqual(0);
    expect(plan.hit + plan.read).toBeGreaterThan(0);
  });

  it("is rebuilt from the records by rewriting them (docs/BACKUPS.md, after a partial restore)", async () => {
    const db = handle.db;
    const before = rowsOf<Counted>(await db.execute(sql`SELECT * FROM match_multikills ORDER BY match_id, slot`));
    expect(before.length).toBeGreaterThan(1000);
    await db.execute(sql`DELETE FROM match_multikills`);
    await db.execute(sql`UPDATE match_details SET participants = participants`);
    expect(rowsOf<Counted>(await db.execute(sql`SELECT * FROM match_multikills ORDER BY match_id, slot`))).toEqual(before);
  });
});

describe("migration 0070 on a database that already holds records", () => {
  it("copies every stored record's counted players once, and the trigger keeps them from then on", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    const m70 = EMBEDDED_MIGRATIONS.find((m) => m.tag === "0070_match_multikills")!;
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < m70.tag)) {
        await db.transaction(async (tx) => {
          for (const statement of m.statements) await tx.execute(sql.raw(statement));
          await tx.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
        });
      }
      const teams = [{ teamId: 100, win: true, bans: [], objectives: { champion: 30 } }, { teamId: 200, win: false, bans: [], objectives: { champion: 11 } }];
      await db.insert(matchDetails).values([
        record("OC1_OLD_1", [part("a", 100, "MIDDLE", "Ahri", mk(2, 1, 0, 0, 3)), part("", 200, null, null, undefined, { removed: true }), part("b", 200, "TOP", "Garen", undefined), part("c", 200, "UTILITY", "Lulu", mk(0, 0, 0, 0, 0))], teams),
        record("OC1_OLD_2", [], [], { queueId: 400, gameDuration: 900 }),
        record("OC1_OLD_3", [part("d", 100, "BOTTOM", "Jinx", mk(1, 1, 1, 1, 5))], [], { queueId: 1700 }),
      ]);
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toEqual(["0070_match_multikills"]);
      const all = rowsOf<Counted>(await db.execute(sql`SELECT * FROM match_multikills ORDER BY match_id, slot`)).map((r) => [r.match_id, Number(r.slot), r.puuid, r.position, r.champion_id, r.queue_id, r.duration_s, r.team_id, r.team_kills, r.doubles, r.triples, r.quadras, r.pentas, r.largest]);
      expect(all).toEqual([
        ["OC1_OLD_1", 0, "a", "MIDDLE", "Ahri", 420, 1800, 100, 30, 2, 1, 0, 0, 3],
        ["OC1_OLD_1", 3, "c", "UTILITY", "Lulu", 420, 1800, 200, 11, 0, 0, 0, 0, 0],
        ["OC1_OLD_3", 0, "d", "BOTTOM", "Jinx", 1700, 1800, 100, null, 1, 1, 1, 1, 5],
      ]);
      // The migration's copy again (as a restore that kept the trigger off would): nothing is doubled.
      const backfill = m70.statements.find((s) => s.includes("FROM public.match_details md"))!;
      await db.execute(sql.raw(backfill));
      expect(Number(rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM match_multikills`))[0]!.n)).toBe(3);
      // From now on the database keeps it: a new record, and the first record's players rewritten.
      await db.insert(matchDetails).values(record("OC1_NEW", [part("e", 100, "JUNGLE", "Vi", mk(1, 0, 0, 0, 2))]));
      await db.update(matchDetails).set({ participants: [part("a", 100, "MIDDLE", "Ahri", mk(3, 1, 0, 0, 3))] }).where(eq(matchDetails.matchId, "OC1_OLD_1"));
      expect(rowsOf<Counted>(await db.execute(sql`SELECT match_id, puuid, doubles FROM match_multikills ORDER BY match_id, slot`)).map((r) => [r.match_id, r.puuid, Number(r.doubles)])).toEqual([
        ["OC1_NEW", "e", 1],
        ["OC1_OLD_1", "a", 3],
        ["OC1_OLD_3", "d", 1],
      ]);
      // Closed like every table: Row Level Security on.
      expect(rowsOf<{ on: boolean }>(await db.execute(sql`SELECT relrowsecurity AS on FROM pg_class WHERE relname = 'match_multikills'`))).toEqual([{ on: true }]);
      // Once applied, it never runs again.
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toEqual([]);
    } finally {
      await fresh.close();
    }
  }, 120_000);
});
