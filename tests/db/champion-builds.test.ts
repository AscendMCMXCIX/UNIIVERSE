import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, appSettings, matchDetails, matchTimelines, patches, players, riotAccounts, type MatchParticipantDetail, type MatchTimelineParticipant } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { invalidateCache } from "@/server/observability/cache";
import { STANDARD_PLAYER, type Session } from "@/server/auth/permissions";
import { patchSortKey } from "@/domain/patch";
import { itemClasses, skillMaxOrder, startingSet, type BuildItemInfo, type SkillRanks } from "@/domain/champion-builds";
import { readBuildCounts } from "@/server/champion-builds/query";
import { loadChampionBuilds } from "@/server/champion-builds/load";
import { resultBytes } from "@/server/db/egress";

/*
  Champion Intel's builds from the team's stored matches (docs/CHAMPION_INTEL.md, "Builds and
  runes"), on synthetic records and timelines (no Riot request): only matches a current team member
  played count (a personal-use profile's and an archived profile's own games never do), only the
  draft queues, no remake, every player on the champion (both teams, both spellings of a position),
  never an erased player; the item and skill rules are the domain's; only totals leave the database
  (no PUUID, name or match id), in a few KB; the champion index is used; and the section is only for
  accounts that may see teammates' statistics.
*/

const fixture = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "ddragon-16.22.1-item-builds.json"), "utf8")) as { items: Record<string, BuildItemInfo & { name: string }> };
const ITEMS = itemClasses(fixture.items);
const RANKS: SkillRanks = { 1: 5, 2: 5, 3: 5, 4: 3 };
let handle: DbHandle;
let n = 0;

const base: Omit<Session, "role" | "playerId"> = { userId: "11111111-1111-4111-8111-111111111111", label: "Member", username: "member", hasPassword: true, mustChangePassword: false, setupComplete: true };
const member = (): Session => ({ ...base, role: "player", playerId: null, capabilities: STANDARD_PLAYER, teamMember: true }) as Session;
const noStats = (): Session => ({ ...base, role: "player", playerId: null, capabilities: STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats"), teamMember: true }) as Session;
const personal = (): Session => ({ ...base, role: "player", playerId: null, capabilities: STANDARD_PLAYER, teamMember: false }) as Session;

/** Q, W, E then Q at every chance, R at 6, 11 and 16 (13 levels): maxes Q, then E, then W. */
const QEW = [1, 2, 3, 1, 1, 4, 1, 3, 1, 3, 4, 3, 3];
/** Mid's usual purchases: a Doran's Ring and two potions, boots, then three completed items and a fourth. */
const MID_BUY: Array<[number, number]> = [[1000, 1056], [1200, 2003], [1400, 2003], [400_000, 1001], [600_000, 3020], [800_000, 6655], [1_000_000, 3157], [1_200_000, 3089], [1_500_000, 3135]];
const PAGE = { keystone: 8229, primary: 8200, secondary: 8300, primaryPerks: [8229, 8226, 8210, 8237], secondaryPerks: [8304, 8347], shards: [5008, 5008, 5011] as [number, number, number] };

interface Seat {
  puuid: string;
  championId?: string;
  position?: string;
  win?: boolean;
  removed?: true;
  runes?: MatchParticipantDetail["runes"];
  spells?: number[] | null;
  timeline?: Partial<MatchTimelineParticipant> | null;
}

function participant(s: Seat, teamId: number): MatchParticipantDetail {
  return { puuid: s.puuid, name: `${s.puuid}#OCE`, teamId, championId: s.championId ?? "Garen", championKey: 0, champLevel: 15, position: s.position ?? "TOP", win: s.win ?? teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: s.spells === undefined ? [4, 14] : s.spells, runes: s.runes === undefined ? PAGE : s.runes, ...(s.removed ? { removed: true as const } : {}) };
}

/** A stored game: the seats given (blue first), the rest filled; the account rows of `owners`; a timeline unless `timeline` is false. */
async function game(seats: Seat[], opts: { owners: string[]; queueId?: number; duration?: number; version?: string; timeline?: boolean }) {
  const db = handle.db;
  const matchId = `OC1_${++n}`;
  const parts = Array.from({ length: 10 }, (_, i) => participant(seats[i] ?? { puuid: `${matchId}-f${i}`, championId: `Filler${i}` }, i < 5 ? 100 : 200));
  await db.insert(matchDetails).values({ matchId, platform: "oc1", queueId: opts.queueId ?? 420, gameCreation: Date.UTC(2026, 10, 20) + n * 60_000, gameDuration: opts.duration ?? 1800, gameVersion: opts.version ?? "16.22.712.1", teams: [{ teamId: 100, win: true, bans: [], objectives: {} }, { teamId: 200, win: false, bans: [], objectives: {} }], participants: parts });
  for (const accountId of opts.owners) await db.insert(accountMatches).values({ accountId, matchId, gameCreation: Date.UTC(2026, 10, 20), queueId: opts.queueId ?? 420, championId: "Garen", role: "TOP", win: true, patch: "16.22", gameDuration: opts.duration ?? 1800, kills: 1, deaths: 1, assists: 1, cs: 100, damage: 1000, visionScore: 10 });
  if (opts.timeline !== false) {
    const tl: MatchTimelineParticipant[] = parts.flatMap((p, i) => {
      const s = seats[i];
      if (s?.timeline === null || p.removed) return [];
      return [{ puuid: p.puuid, purchases: MID_BUY, skills: QEW, ...(s?.timeline ?? {}) }];
    });
    await db.insert(matchTimelines).values({ matchId, platform: "oc1", participants: tl, frames: null, events: null });
  }
  return matchId;
}

/** Ten seats with a member in the first and the champion's player in the sixth (the enemy side's first); the rest filled. */
function seatsAt(first: Seat, sixth: Seat): Seat[] {
  const seats: Seat[] = [];
  seats[0] = first;
  seats[5] = sixth;
  return seats;
}

let ace = "";
let solo = "";
let old = "";

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  await db.update(patches).set({ isCurrent: false });
  for (const [id, current] of [["16.22", true], ["16.21", false]] as const) await db.insert(patches).values({ id, ddragonVersion: `${id}.1`, isCurrent: current, sortKey: patchSortKey(id) }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: current } });
  // The static data the item rules and the icons read (Data Dragon 16.22.1's items).
  const itemInfo = Object.fromEntries(Object.entries(fixture.items).map(([id, v]) => [id, { gold: { base: 0, total: v.gold.total, sell: 0, purchasable: v.gold.purchasable }, tags: v.tags, from: v.from, into: v.into, depth: v.depth, haste: null }]));
  await db.insert(appSettings).values({ key: "riot_build_data", value: { version: "16.22.1", format: 4, itemInfo, spellCooldowns: {}, runeSlots: {} } });
  await db.insert(appSettings).values({ key: "riot_assets", value: { version: "16.22.1", format: 4, items: Object.fromEntries(Object.entries(fixture.items).map(([id, v]) => [id, v.name])), spells: { "4": { id: "SummonerFlash", name: "Flash" }, "14": { id: "SummonerDot", name: "Ignite" } }, runes: { "8229": { name: "Arcane Comet", icon: "perk-images/Styles/Sorcery/ArcaneComet/ArcaneComet.png" } } } });
  invalidateCache("riot_assets");
  invalidateCache("riot_build_data");
  invalidateCache("patch");
  const teamId = (await getOrCreateTeam(db)).id;
  const account = async (name: string, puuid: string, over: Partial<typeof players.$inferInsert> = {}) => {
    const playerId = (await createPlayer(db, teamId, { displayName: name, primaryRole: "MID", primaryPool: ["Ahri"] })).id;
    if (Object.keys(over).length) await db.update(players).set(over).where(sql`${players.id} = ${playerId}::uuid`);
    const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: name, tagLine: "OCE", platform: "oc1", puuid, label: "main" }).returning({ id: riotAccounts.id });
    return a!.id;
  };
  ace = await account("Ace", "p-ace");
  solo = await account("Solo", "p-solo", { teamMember: false });
  old = await account("Old", "p-old", { archivedAt: new Date() });

  // 22 games with Ace in them and Ahri in mid: 12 on the enemy side (Riot's "MIDDLE"), 10 on Ace's
  // side (the demo's "MID"), Ace's own Ahri in two of them; 11 won. One has no timeline, one a
  // timeline with an item the data does not know, one another skill order and a potion sold in the
  // first minute.
  for (let i = 0; i < 22; i++) {
    const enemy = i < 12;
    const own = i === 12 || i === 13;
    const timeline: Partial<MatchTimelineParticipant> | undefined =
      i === 5 ? { purchases: [...MID_BUY.slice(0, 5), [700_000, 9999]] } : i === 6 ? { purchases: [[1000, 1056], [1200, 2003], [1400, 2003], [30_000, 2003], ...MID_BUY.slice(3)], sold: [[40_000, 2003]], skills: [3, 1, 2, 3, 3, 4, 3, 1, 3, 1, 4, 1, 1] } : undefined;
    const ahri: Seat = { puuid: own ? "p-ace" : `p-ahri-${i}`, championId: "Ahri", position: enemy ? "MIDDLE" : "MID", win: i % 2 === 0, ...(timeline ? { timeline } : {}) };
    const seats: Seat[] = [];
    if (enemy) {
      seats[0] = { puuid: "p-ace" };
      seats[5] = ahri;
    } else {
      seats[0] = ahri;
      if (!own) seats[1] = { puuid: "p-ace" };
    }
    await game(seats, { owners: [ace], timeline: i !== 7 });
  }
  // Left out: a personal-use profile's own game, an archived profile's own game, a remake, a
  // Swiftplay game, a Blind Pick game, an older patch, and an erased player on Ahri.
  await game(seatsAt({ puuid: "p-solo" }, { puuid: "p-ahri-solo", championId: "Ahri", position: "MIDDLE" }), { owners: [solo] });
  await game(seatsAt({ puuid: "p-old" }, { puuid: "p-ahri-old", championId: "Ahri", position: "MIDDLE" }), { owners: [old] });
  await game(seatsAt({ puuid: "p-ace" }, { puuid: "p-ahri-remake", championId: "Ahri", position: "MIDDLE" }), { owners: [ace], duration: 200 });
  await game(seatsAt({ puuid: "p-ace" }, { puuid: "p-ahri-swift", championId: "Ahri", position: "MIDDLE" }), { owners: [ace], queueId: 480 });
  await game(seatsAt({ puuid: "p-ace" }, { puuid: "p-ahri-blind", championId: "Ahri", position: "MIDDLE" }), { owners: [ace], queueId: 430 });
  await game(seatsAt({ puuid: "p-ace" }, { puuid: "p-ahri-old-patch", championId: "Ahri", position: "MIDDLE" }), { owners: [ace], version: "16.20.1.1" });
  await game(seatsAt({ puuid: "p-ace" }, { puuid: "", championId: "Ahri", position: "MIDDLE", removed: true }), { owners: [ace] });
  // A game no member played (a record stored some other way): never counted.
  await game(seatsAt({ puuid: "p-stranger" }, { puuid: "p-ahri-stranger", championId: "Ahri", position: "MIDDLE" }), { owners: [] });
}, 120_000);

afterAll(async () => {
  await handle?.close();
});

const read = (ranks: SkillRanks | null = RANKS) => readBuildCounts(handle.db, { champion: "Ahri", patches: ["16.22", "16.21"], items: ITEMS, ranks });
const count = (rows: Awaited<ReturnType<typeof read>>, dim: string, value?: string) => rows.filter((r) => r.dim === dim && (value === undefined || r.value === value)).reduce((s, r) => s + r.n, 0);

describe("the build counts", () => {
  it("count every player on the champion in the team's draft games, both teams and both spellings of a position, nothing else", async () => {
    const rows = await read();
    expect(count(rows, "games")).toBe(22);
    expect(new Set(rows.filter((r) => r.dim === "games").map((r) => `${r.patch} ${r.lane}`))).toEqual(new Set(["16.22 MIDDLE"]));
    expect(rows.find((r) => r.dim === "games")).toMatchObject({ n: 22, w: 11, nm: 2 });
    expect(count(rows, "queue", "420")).toBe(22);
    // One game has no timeline.
    expect(count(rows, "timeline")).toBe(21);
    expect(count(rows, "runes", "8200:8229,8226,8210,8237|8300:8304,8347")).toBe(22);
    expect(count(rows, "shards", "5008,5008,5011")).toBe(22);
    expect(count(rows, "spells", "4,14")).toBe(22);
  });

  it("read the items and skills with the domain's rules; a timeline with an unknown item leaves that game's items out", async () => {
    const rows = await read();
    const start = startingSet([[1000, 1056], [1200, 2003], [1400, 2003], [30_000, 2003]], [[40_000, 2003]]).join(",");
    expect(start).toBe("1056,2003,2003");
    // 21 timelines, one with an unknown item: 20 games with known items; a first-minute sale taken out.
    expect(count(rows, "start")).toBe(20);
    expect(count(rows, "start", "1056,2003,2003")).toBe(20);
    expect(count(rows, "boots", "3020")).toBe(20);
    expect(count(rows, "core", "6655>3157>3089")).toBe(20);
    expect(count(rows, "fourth", "3089,3157,6655|3135")).toBe(20);
    expect(count(rows, "fifth")).toBe(0);
    const skills = skillMaxOrder(QEW, RANKS)!;
    expect(count(rows, "skills", `${skills.order.join("")}|${skills.first.join("")}`)).toBe(20);
    const other = skillMaxOrder([3, 1, 2, 3, 3, 4, 3, 1, 3, 1, 4, 1, 1], RANKS)!;
    expect(count(rows, "skills", `${other.order.join("")}|${other.first.join("")}`)).toBe(1);
    expect(other.order).toEqual(["E", "Q", "W"]);
  });

  it("read each ability's own last rank, and no skill order without the ranks", async () => {
    // With six ranks to each basic ability, QEW (Q at five points) maxes nothing yet.
    const six = await read({ 1: 6, 2: 6, 3: 6, 4: 3 });
    expect(count(six, "skills")).toBe(0);
    expect(skillMaxOrder(QEW, { 1: 6, 2: 6, 3: 6, 4: 3 })).toBeNull();
    expect(count(await read(null), "skills")).toBe(0);
  });

  it("send only totals: no PUUID, name or match id, in a few KB", async () => {
    const rows = await read();
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/p-ace|p-ahri|OC1_|#OCE/);
    expect(Object.keys(rows[0]!).sort()).toEqual(["dim", "lane", "n", "nm", "patch", "value", "w"]);
    // The answer as Postgres sends it: one row, one value (its estimated bytes on the wire).
    expect(resultBytes([{ rows: text }]).bytes).toBeLessThan(4_000);
  });

  it("find the champion's records through the champions' index, so a computation never unpacks every record", async () => {
    const plan = await handle.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      const result = await tx.execute(sql`EXPLAIN SELECT d.match_id FROM match_details d WHERE jsonb_path_query_array(d.participants, '$[*].championId') ?| ARRAY[${"Ahri"}]::text[]`);
      return ((result as { rows?: unknown[] }).rows ?? (result as unknown as unknown[])) as Array<Record<string, string>>;
    });
    expect(plan.map((row) => Object.values(row)[0]).join("\n")).toContain("match_details_champions_idx");
    // The statement's own condition is that expression, word for word.
    expect(readFileSync(join(__dirname, "..", "..", "src", "server", "champion-builds", "query.ts"), "utf8")).toContain("jsonb_path_query_array(d.participants, '$[*].championId') ?| ARRAY[${input.champion}]::text[]");
  });
});

describe("the builds section", () => {
  const input = { championId: "Ahri", championName: "Ahri", ranks: RANKS };

  it("is only for accounts that may see teammates' statistics", async () => {
    expect(await loadChampionBuilds(handle.db, null, input)).toBeNull();
    expect(await loadChampionBuilds(handle.db, noStats(), input)).toBeNull();
    expect(await loadChampionBuilds(handle.db, personal(), input)).toBeNull();
    expect(await loadChampionBuilds(handle.db, member(), input)).not.toBeNull();
  });

  it("shows the champion's builds on the current patch with its icons and names, the role from Riot's position", async () => {
    const view = await loadChampionBuilds(handle.db, member(), input);
    expect(view?.status).toBe("shown");
    if (view?.status !== "shown") return;
    expect(view.currentPatch).toBe("26.22");
    expect(view.roles).toEqual([{ role: "MID", games: 22 }]);
    const mid = view.builds.MID!;
    expect(mid).toMatchObject({ games: 22, teamGames: 2, timelineGames: 21, patches: ["26.22"], widened: false, queues: [420] });
    expect(mid.runes.state === "shown" && mid.runes.standard.value.keystone).toEqual({ url: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/Sorcery/ArcaneComet/ArcaneComet.png", name: "Arcane Comet" });
    // A rune the stored names lack: named plainly, no URL (a stand-in), never dropped.
    expect(mid.runes.state === "shown" && mid.runes.standard.value.primary[0]).toEqual({ url: "", name: "Rune 8226" });
    expect(mid.spells.state === "shown" && mid.spells.standard.value.map((s) => s.name)).toEqual(["Flash", "Ignite"]);
    expect(mid.core.state === "shown" && mid.core.standard.value.map((i) => i.name)).toEqual(["Luden's Echo", "Zhonya's Hourglass", "Rabadon's Deathcap"]);
    expect(mid.boots.state === "shown" && mid.boots.standard.value).toMatchObject({ name: "Sorcerer's Shoes" });
    expect(mid.full?.items.map((i) => i.name)).toEqual(["Luden's Echo", "Zhonya's Hourglass", "Rabadon's Deathcap", "Void Staff"]);
    expect(JSON.stringify(view)).not.toMatch(/p-ace|p-ahri|OC1_|#OCE/);
  });

  it("says honestly when a champion has too few games", async () => {
    expect(await loadChampionBuilds(handle.db, member(), { championId: "Jinx", championName: "Jinx", ranks: RANKS })).toEqual({ status: "few", championName: "Jinx", currentPatch: "26.22", games: 0, role: null });
  });
});
