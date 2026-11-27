import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { makeSeason2026Current, testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, matchTimelines, players, riotAccounts, staticDigests, type MatchParticipantDetail, type MatchTimelineParticipant } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { invalidateCache } from "@/server/observability/cache";
import { STANDARD_PLAYER, type Session } from "@/server/auth/permissions";
import { readLaneGames } from "@/server/matchup/lane-query";
import { loadLaneEvidence } from "@/server/matchup/lane-evidence";
import { matchupCoverage } from "@/server/matchup/coverage";
import { eraseSubject, memberSubject } from "@/server/privacy/erasure";
import { resultBytes } from "@/server/db/egress";

/*
  Matchup Intel's "In the team's matches" on synthetic records and timelines (no Riot request;
  docs/MATCHUP_INTEL.md): every lane of the team's games (both teams), the one lane opponent rule
  (a shared position, an old record's merged position, an erased seat), only current members'
  draft games of the season that lasted 10:00, every queue apart, only anonymous numbers out, the
  champions' index used, and the block only for accounts that may see teammates' statistics.
*/

let handle: DbHandle;
let n = 0;
const base: Omit<Session, "role" | "playerId"> = { userId: null, label: "Member", username: "member", hasPassword: true, mustChangePassword: false, setupComplete: true };
const member = (): Session => ({ ...base, role: "player", playerId: null, capabilities: STANDARD_PLAYER, teamMember: true }) as Session;
const noStats = (): Session => ({ ...base, role: "player", playerId: null, capabilities: STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats"), teamMember: true }) as Session;

const T = [0, 60_100, 120_200, 180_300, 240_400, 300_500, 360_600, 420_700, 480_800, 540_900, 601_000, 661_100, 721_200];
const POS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

interface GameOpts {
  /** Blue's and red's champions by position (5 each; the mid seat is index 2). */
  blue: string[];
  red: string[];
  owners: string[];
  /** The member's PUUID in the blue top seat (its own game). */
  memberPuuid?: string;
  /** Other seats held by members: [seat index, PUUID]. */
  seats?: Array<[number, string]>;
  queueId?: number;
  duration?: number;
  version?: string;
  blueWins?: boolean;
  /** Riot's two readings kept (records from 20 Nov 2026); false: the merged position only. */
  readings?: boolean;
  /** Seats whose team position is changed: [seat index, position]. */
  positions?: Array<[number, string]>;
  removed?: number[];
  timeline?: boolean;
  /** Blue mid ahead by this much gold at every frame. */
  lead?: number;
  /** Kill times: [killer seat, victim seat, ms]. */
  kills?: Array<[number, number, number]>;
  firstBlood?: number | null;
}

async function game(o: GameOpts): Promise<string> {
  const db = handle.db;
  const matchId = `OC1_${++n}`;
  const parts: MatchParticipantDetail[] = [];
  for (let i = 0; i < 10; i++) {
    const blue = i < 5;
    const position = POS[i % 5]!;
    const puuid = i === 0 && o.memberPuuid ? o.memberPuuid : (o.seats?.find(([seat]) => seat === i)?.[1] ?? `${matchId}-s${i}`);
    const p: MatchParticipantDetail = { puuid, name: `${puuid}#OCE`, teamId: blue ? 100 : 200, championId: (blue ? o.blue : o.red)[i % 5]!, championKey: 0, champLevel: 12, position, win: blue === (o.blueWins ?? true), kills: 1, deaths: 1, assists: 1, cs: 100, gold: 9000, damage: 1, damageTaken: 1, vision: 1, wardsPlaced: 1, items: null, spells: null, runes: null, stats: { firstBloodKill: o.firstBlood === i } };
    if (o.readings !== false) Object.assign(p, { teamPosition: position, individualPosition: position });
    parts.push(p);
  }
  for (const [i, pos] of o.positions ?? []) Object.assign(parts[i]!, { position: pos, ...(o.readings !== false ? { teamPosition: pos, individualPosition: pos } : {}) });
  for (const i of o.removed ?? []) parts[i] = { ...parts[i]!, puuid: "", name: "", championId: null, position: null, removed: true } as MatchParticipantDetail;
  await db.insert(matchDetails).values({ matchId, platform: "oc1", queueId: o.queueId ?? 420, gameCreation: Date.UTC(2026, 10, 20) + n * 60_000, gameDuration: o.duration ?? 1800, gameVersion: o.version ?? "16.22.712.1", teams: [], participants: parts });
  for (const accountId of o.owners) await db.insert(accountMatches).values({ accountId, matchId, gameCreation: Date.UTC(2026, 10, 20), queueId: o.queueId ?? 420, championId: o.blue[0]!, role: "TOP", enemyChampionId: o.red[0]!, win: o.blueWins ?? true, patch: "16.22", gameDuration: o.duration ?? 1800, kills: 1, deaths: 1, assists: 1, cs: 100, damage: 1, visionScore: 1 });
  if (o.timeline !== false) {
    const lead = o.lead ?? 100;
    const frames = { t: T, p: Object.fromEntries(parts.filter((p) => !p.removed).map((p, i) => [p.puuid, { g: T.map((_, k) => 500 + k * 400 + (i === 2 ? lead : 0)), x: T.map((_, k) => k * 420), c: T.map((_, k) => k * 7) }])) };
    const tl: MatchTimelineParticipant[] = parts.filter((p) => !p.removed).map((p) => {
      const seat = parts.indexOf(p);
      return { puuid: p.puuid, purchases: [], skills: [], kills: (o.kills ?? []).filter((k) => k[0] === seat).map((k) => k[2]), deaths: (o.kills ?? []).filter((k) => k[1] === seat).map((k) => k[2]), assists: [] };
    });
    await db.insert(matchTimelines).values({ matchId, platform: "oc1", participants: tl, frames, events: { objectives: [], plates: [] } });
  }
  return matchId;
}

const BLUE = ["Garen", "LeeSin", "Ahri", "Jinx", "Thresh"];
const RED = ["Darius", "Vi", "Zed", "Caitlyn", "Leona"];
let ace = "";
let bea = "";
let solo = "";
let old = "";

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  await makeSeason2026Current(db);
  invalidateCache("patch");
  const teamId = (await getOrCreateTeam(db)).id;
  const account = async (name: string, puuid: string, over: Partial<typeof players.$inferInsert> = {}) => {
    const playerId = (await createPlayer(db, teamId, { displayName: name, primaryRole: "TOP", primaryPool: ["Garen"] })).id;
    if (Object.keys(over).length) await db.update(players).set(over).where(sql`${players.id} = ${playerId}::uuid`);
    const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: name, tagLine: "OCE", platform: "oc1", puuid, label: "main" }).returning({ id: riotAccounts.id });
    return a!.id;
  };
  ace = await account("Ace", "p-ace");
  bea = await account("Bea", "p-bea");
  solo = await account("Solo", "p-solo", { teamMember: false });
  old = await account("Old", "p-old", { archivedAt: new Date() });
  // 12 games of a member's in Solo/Duo: Ahri (blue mid) against Zed (red mid), 8 won by Ahri's side, Ahri 150 gold ahead.
  for (let i = 0; i < 12; i++) await game({ blue: BLUE, red: RED, owners: [ace], memberPuuid: "p-ace", blueWins: i < 8, lead: 150, kills: i < 4 ? [[2, 7, 200_000]] : i < 6 ? [[7, 2, 300_000]] : [], firstBlood: i < 3 ? 2 : i < 5 ? 7 : 0 });
  // Two in Flex, one each side the other way round (Zed blue): kept apart from Solo/Duo.
  await game({ blue: ["Garen", "LeeSin", "Zed", "Jinx", "Thresh"], red: ["Darius", "Vi", "Ahri", "Caitlyn", "Leona"], owners: [ace], memberPuuid: "p-ace", queueId: 440 });
  await game({ blue: BLUE, red: RED, owners: [ace], memberPuuid: "p-ace", queueId: 440 });
  // Not counted: no member (a personal-use and an archived profile's own games), a Swiftplay game, a game under 10:00, another season.
  await game({ blue: BLUE, red: RED, owners: [solo] });
  await game({ blue: BLUE, red: RED, owners: [old] });
  await game({ blue: BLUE, red: RED, owners: [ace], queueId: 480 });
  await game({ blue: BLUE, red: RED, owners: [ace], duration: 590 });
  await game({ blue: BLUE, red: RED, owners: [ace], version: "15.24.1.1" });
  // Not counted: the lane unclear (two blue mids), an old record's merged position with an erased seat.
  await game({ blue: BLUE, red: RED, owners: [ace], positions: [[1, "MIDDLE"]] });
  await game({ blue: BLUE, red: RED, owners: [ace], readings: false, removed: [9] });
  // Counted: an old record's merged position with nobody erased, without a timeline; and with an erased seat elsewhere but Riot's team position kept.
  await game({ blue: BLUE, red: RED, owners: [ace], readings: false, timeline: false });
  await game({ blue: BLUE, red: RED, owners: [ace], removed: [9] });
});

afterAll(async () => {
  await handle?.close();
});

describe("the lane games of one pairing", () => {
  it("count both teams' lanes of the team's draft games by the one lane opponent rule, every queue at once", async () => {
    const rows = await readLaneGames(handle.db, { lo: "Ahri", hi: "Zed", role: "MID", season: 16 });
    expect(rows.filter((r) => r.queue === 420)).toHaveLength(14);
    expect(rows.filter((r) => r.queue === 440)).toHaveLength(2);
    expect(rows.every((r) => r.patch === "16.22")).toBe(true);
    // The Flex game with Zed on blue is seen from Ahri all the same: Ahri's side lost it.
    const flex = rows.filter((r) => r.queue === 440);
    expect(flex.map((r) => r.loWon).sort()).toEqual([false, true]);
    // One game has no timeline (the old record); the others carry the two seats' frames and kill times.
    expect(rows.filter((r) => r.t === null)).toHaveLength(1);
    expect(rows.find((r) => r.t)!.lo!.g).toHaveLength(12);
    expect(rows.some((r) => r.loKills?.includes(200_000) && r.hiDeaths?.includes(200_000))).toBe(true);
  });

  it("send only anonymous numbers: no match id, PUUID or name, a few KB", async () => {
    const rows = await readLaneGames(handle.db, { lo: "Ahri", hi: "Zed", role: "MID", season: 16 });
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/OC1_|p-ace|#OCE|-s\d/);
    expect(Object.keys(rows[0]!).sort()).toEqual(["deaths", "hi", "hiDeaths", "hiFirstBlood", "hiKills", "lo", "loDeaths", "loFirstBlood", "loKills", "loWon", "member", "patch", "queue", "t"]);
    expect(resultBytes(rows).bytes).toBeLessThan(20_000);
  });

  it("find the records through the champions' index, so a pair never unpacks every record", async () => {
    const plan = await handle.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      const result = await tx.execute(sql`EXPLAIN SELECT d.match_id FROM match_details d WHERE jsonb_path_query_array(d.participants, '$[*].championId') ?& ARRAY[${"Ahri"}, ${"Zed"}]::text[]`);
      return ((result as { rows?: unknown[] }).rows ?? (result as unknown as unknown[])) as Array<Record<string, string>>;
    });
    expect(plan.map((row) => Object.values(row)[0]).join("\n")).toContain("match_details_champions_idx");
    expect(readFileSync(join(__dirname, "..", "..", "src", "server", "matchup", "lane-query.ts"), "utf8")).toContain("jsonb_path_query_array(d.participants, '$[*].championId') ?& ARRAY[${input.lo}, ${input.hi}]::text[]");
  });

  it("find nothing for a pair in another role, or two champions who never shared a lane", async () => {
    expect(await readLaneGames(handle.db, { lo: "Ahri", hi: "Zed", role: "TOP", season: 16 })).toEqual([]);
    expect(await readLaneGames(handle.db, { lo: "Ahri", hi: "Darius", role: "MID", season: 16 })).toEqual([]);
    expect((await readLaneGames(handle.db, { lo: "Darius", hi: "Garen", role: "TOP", season: 16 })).length).toBeGreaterThan(0);
  });
});

describe("the block", () => {
  it("is only for accounts that may see teammates' statistics", async () => {
    expect(await loadLaneEvidence(handle.db, noStats(), { a: { id: "Ahri", name: "Ahri" }, b: { id: "Zed", name: "Zed" }, role: "MID" })).toBeNull();
  });

  it("shows Solo/Duo's figures from 10 games with a timeline, Flex's count alone, and the same games from either side", async () => {
    const view = await loadLaneEvidence(handle.db, member(), { a: { id: "Ahri", name: "Ahri" }, b: { id: "Zed", name: "Zed" }, role: "MID" });
    if (view?.status !== "counted") throw new Error(String(view?.status));
    expect(view.queues.solo).toMatchObject({ games: 13, stored: 14, noTimeline: 1 });
    expect(view.queues.solo.figures!.ahead).toMatchObject({ n: 13, of: 13 });
    expect(view.queues.solo.figures!.gold.median).toBe(150);
    expect(view.queues.solo.figures!.kills).toMatchObject({ games: 13, a: 4, b: 2 });
    expect(view.queues.solo.figures!.firstBlood).toMatchObject({ a: 3, b: 2 });
    expect(view.queues.flex).toMatchObject({ games: 2, figures: null });
    const swapped = await loadLaneEvidence(handle.db, member(), { a: { id: "Zed", name: "Zed" }, b: { id: "Ahri", name: "Ahri" }, role: "MID" });
    if (swapped?.status !== "counted") throw new Error("counted");
    expect(swapped.queues.solo.figures!.gold.median).toBe(-150);
    expect(swapped.queues.solo.figures!.won.n).toBe(13 - view.queues.solo.figures!.won.n);
    expect(await loadLaneEvidence(handle.db, member(), { a: { id: "Ahri", name: "Ahri" }, b: { id: "Ahri", name: "Ahri" }, role: "MID" })).toEqual({ status: "mirror" });
  });

  it("names Riot's latest recorded change to either champion and keeps the season where fewer games came after it", async () => {
    await handle.db.insert(staticDigests).values([
      { patch: "16.21", kind: "champion", key: "Zed", hash: "a" },
      { patch: "16.22", kind: "champion", key: "Zed", hash: "b" },
      { patch: "16.21", kind: "champion", key: "Ahri", hash: "x" },
      { patch: "16.22", kind: "champion", key: "Ahri", hash: "x" },
    ]);
    const view = await loadLaneEvidence(handle.db, member(), { a: { id: "Ahri", name: "Ahri" }, b: { id: "Zed", name: "Zed" }, role: "MID" });
    if (view?.status !== "counted") throw new Error("counted");
    expect(view.queues.solo.window).toEqual({ kind: "since-change", change: { patch: "16.22", champions: ["Zed"] } });
    await handle.db.delete(staticDigests);
  });

  it("is counted for the data audit: pairings by queue and their games, never a champion's name", async () => {
    const c = await matchupCoverage(handle.db);
    expect(c.season).toBe(16);
    // Every lane of the members' games (both teams): Ahri–Zed reaches 10 games with a timeline in Solo/Duo.
    expect(c.everyLane.solo.atLeast10).toBeGreaterThanOrEqual(1);
    expect(c.everyLane.flex.atLeast10).toBe(0);
    // The members' own lanes: Ace's Garen against Darius (top), in Solo/Duo.
    expect(c.members.solo.pairings).toBe(1);
    expect(c.members.allDraft.laneGames).toBeGreaterThanOrEqual(c.members.solo.laneGames);
    expect(JSON.stringify(c)).not.toMatch(/Ahri|Zed|Garen|Darius|p-ace|OC1_/);
  });

  // 27 Nov 2026: this test erased the only member of every game, so it passed with no game left; now a second member shares three of them.
  it("drops an erased member's seats: their games stay for the others, their own seat never counts", async () => {
    // Three Normal Draft games of Ace (blue top, Garen) and Bea (red mid, Zed): Ahri against Zed in Mid is Bea's lane, Garen against Darius in Top Ace's.
    for (let i = 0; i < 3; i++) await game({ blue: BLUE, red: RED, owners: [ace, bea], memberPuuid: "p-ace", seats: [[7, "p-bea"]], queueId: 400 });
    const draft = (rows: Awaited<ReturnType<typeof readLaneGames>>) => rows.filter((r) => r.queue === 400);
    const top = { lo: "Darius", hi: "Garen", role: "TOP" as const, season: 16 };
    const mid = { lo: "Ahri", hi: "Zed", role: "MID" as const, season: 16 };
    const before = { top: await readLaneGames(handle.db, top), mid: await readLaneGames(handle.db, mid) };
    expect(draft(before.top)).toHaveLength(3);
    expect(draft(before.mid)).toHaveLength(3);
    const [acePlayer] = await handle.db.select({ id: riotAccounts.playerId }).from(riotAccounts).where(sql`${riotAccounts.puuid} = 'p-ace'`);
    await eraseSubject(handle.db, null, await memberSubject(handle.db, { playerId: acePlayer!.id! }));
    const after = { top: await readLaneGames(handle.db, top), mid: await readLaneGames(handle.db, mid) };
    // Ace's own games (no other member in them) are gone.
    expect(after.top.length).toBeLessThan(before.top.length);
    // The shared games stay for Bea: her lane is counted as before, a member's seat in it.
    expect(draft(after.mid)).toHaveLength(3);
    expect(draft(after.mid).every((r) => r.member && r.t !== null && r.hi !== null)).toBe(true);
    // Ace's own seat in them never counts: no Garen against Darius in Top from those games.
    expect(draft(after.top)).toEqual([]);
    const [shared] = await handle.db.select({ participants: matchDetails.participants }).from(matchDetails).where(sql`${matchDetails.queueId} = 400`).limit(1);
    expect(shared!.participants[0]).toMatchObject({ removed: true, championId: null });
    expect(JSON.stringify(after)).not.toMatch(/p-ace|p-bea|OC1_/);
  });
});
