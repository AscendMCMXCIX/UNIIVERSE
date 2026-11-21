import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { accountMatches, matchDetails, matchTimelines, patches, players, staticDigests, type MatchParticipantDetail } from "@/server/db/schema";
import { backfillMatchPrep } from "@/server/matchup-intel/prep-store";
import { loadMatchupEvidence } from "@/server/matchup-intel/evidence";
import { riotChangesOf } from "@/server/matchup-intel/digests";
import { invalidateAllCaches } from "@/server/observability/cache";
import { patchSortKey } from "@/domain/patch";
import type { Session } from "@/server/auth/permissions";
import type { ChampionChoice, Role } from "@/domain/matchup-intel/types";

/*
  PLAN S7's acceptance (§6 rows 3.9l and 3.9m), on demo-like rows: stored records and timelines,
  turned into evidence rows by prep-backfill, read by the page's own query.
  - The jungle's objective line: dragons, voidgrubs and heralds before 15:00, the share the
    viewer's team took as Jungle against the chosen enemy jungler, at n >= 3.
  - The bot lane's pairwise lines in a 2v2: the combination, and each pair (with the ally, against
    each enemy) counted on its own, the ally, vs and vs2 filters in SQL; "This 2v2: too few games"
    when the four together have fewer than 3.
  The counting rules hold in both: a remake or a game without a result never counts, and a
  personal-use or archived profile's games are never in the team's lines.
*/

let handle: DbHandle;
let db: Db;
const ids: Record<string, string> = {};
const accounts: Record<string, string> = {};
const CURRENT = "16.22";
const DAY = 86_400_000;
const LANES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

/** Ten participants, blue 0–4 and red 5–9 in lane order; the member at `meSlot`, the champions by slot. */
function record(me: string, meSlot: number, champions: Record<number, string>, win: boolean): MatchParticipantDetail[] {
  return Array.from({ length: 10 }, (_, i) => {
    const lane = LANES[i % 5]!;
    return {
      puuid: i === meSlot ? me : `${me}-x${i}`,
      name: null,
      teamId: i < 5 ? 100 : 200,
      championId: champions[i] ?? `Filler${i}`,
      championKey: 0,
      champLevel: 14,
      position: lane,
      teamPosition: lane,
      individualPosition: lane,
      win: i < 5 ? win : !win,
      kills: 1,
      deaths: 1,
      assists: 1,
      cs: 100,
      gold: 9000,
      damage: 9000,
      damageTaken: 9000,
      vision: 10,
      wardsPlaced: 5,
      items: null,
      spells: [4, 7],
      runes: { keystone: 8010, primary: 8000, secondary: 8400, primaryPerks: [8010, 9111, 9104, 8299], secondaryPerks: [8446, 8451] },
    };
  });
}

let gameNo = 0;
/** One stored game of `who` at `meSlot` (blue), with its timeline; `objectives` as [taken by blue, taken by red] before 15:00. */
async function game(who: string, meSlot: number, champions: Record<number, string>, options: { win?: boolean | null; duration?: number; objectives?: [number, number] } = {}) {
  const matchId = `OC1_L${gameNo++}`;
  const puuid = `${who}-puuid`;
  const win = options.win === undefined ? true : options.win;
  const duration = options.duration ?? 1800;
  const created = Date.now() - gameNo * DAY;
  await db.insert(accountMatches).values({ accountId: accounts[who]!, matchId, gameCreation: created, queueId: 420, championId: champions[meSlot]!, role: LANES[meSlot]!, win, enemyChampionId: champions[meSlot + 5] ?? null, patch: CURRENT, gameDuration: duration, teamId: 100 });
  await db.insert(matchDetails).values({ matchId, platform: "oc1", queueId: 420, gameCreation: created, gameDuration: duration, gameVersion: `${CURRENT}.1`, teams: [], participants: record(puuid, meSlot, champions, win ?? true) });
  const [blue, red] = options.objectives ?? [0, 0];
  const kinds = ["dragon", "grubs", "herald"] as const;
  const objectives = [...Array.from({ length: blue }, (_, i) => ({ t: 300_000 + i * 60_000, team: 100, kind: kinds[i % 3]! })), ...Array.from({ length: red }, (_, i) => ({ t: 320_000 + i * 60_000, team: 200, kind: kinds[i % 3]! })), { t: 1_000_000, team: 100, kind: "dragon" as const }];
  await db.insert(matchTimelines).values({ matchId, platform: "oc1", participants: [{ puuid, purchases: [[10_000, 1055]] as Array<[number, number]>, skills: [1, 3, 2, 1, 1, 4] }], frames: null, events: { objectives } });
  return matchId;
}

const session = (who: string, options: { capabilities?: Session["capabilities"] } = {}): Session => ({ userId: "u", role: "player", label: who, playerId: ids[who]!, username: null, hasPassword: true, mustChangePassword: false, setupComplete: true, ...(options.capabilities ? { capabilities: options.capabilities } : {}) } as Session);
const champ = (id: string): ChampionChoice => ({ id, name: id, title: "", portrait: "" });
const ROSTER = ["Lillia", "Kindred", "Jinx", "Lulu", "Nami", "Caitlyn", "Ezreal", "Lux"].map(champ);
const evidence = (s: Session, role: Role, you: string, slots: { enemy?: string; ally?: string; enemy2?: string }) =>
  loadMatchupEvidence(db, s, { role, you: champ(you), enemy: slots.enemy ? champ(slots.enemy) : null, ally: slots.ally ? champ(slots.ally) : null, enemy2: slots.enemy2 ? champ(slots.enemy2) : null }, ROSTER);
const section = async (s: Session, role: Role, you: string, slots: Parameters<typeof evidence>[3], scope: "own" | "team") => (await evidence(s, role, you, slots))!.sections.find((x) => x.scope === scope)!;
const line = (sec: { lines: Array<{ key: string }> }, key: string) => sec.lines.find((l) => l.key === key) as { values: string; sample: string; label: string } | undefined;

/** The jungle pair, the bot lane's four (blue: the member's side) by slot. */
const JUNGLE = { 1: "Lillia", 6: "Kindred" };
const BOT = (ally: string, vs: string, vs2: string) => ({ 3: "Jinx", 4: ally, 8: vs, 9: vs2 });

beforeAll(async () => {
  handle = await testDb();
  db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values({ id: CURRENT, ddragonVersion: `${CURRENT}.1`, isCurrent: true, sortKey: patchSortKey(CURRENT) }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: true } });
  const team = await getOrCreateTeam(db);
  for (const name of ["viewer", "mate", "solo", "gone"]) {
    ids[name] = (await createPlayer(db, team.id, { displayName: name, primaryRole: "JUNGLE", primaryPool: ["Lillia"] })).id;
    accounts[name] = (await addAccount(db, { ownerType: "player", playerId: ids[name]!, riotId: `${name}#OCE`, platform: "oc1", puuid: `${name}-puuid` })).id;
  }
  // A personal-use profile and an archived one: never in anyone else's team lines.
  await db.update(players).set({ teamMember: false }).where(eq(players.id, ids.solo!));
  await db.update(players).set({ archivedAt: new Date() }).where(eq(players.id, ids.gone!));

  // The jungle: the viewer's four counted games as Lillia against Kindred, 6 of 9 early objectives
  // (one more dragon after 15:00 in each, never counted); a remake and a game without a result, each
  // with 3 of 3, never counted.
  for (const objectives of [[2, 1], [1, 1], [3, 0], [0, 1]] as Array<[number, number]>) await game("viewer", 1, JUNGLE, { objectives });
  await game("viewer", 1, JUNGLE, { objectives: [3, 0], duration: 200 });
  await game("viewer", 1, JUNGLE, { objectives: [3, 0], win: null });
  // A teammate's three (2 of 6), and three each of the personal-use and archived profiles' (all theirs).
  for (let i = 0; i < 3; i++) await game("mate", 1, JUNGLE, { objectives: i === 0 ? [2, 0] : [0, 2] });
  for (const who of ["solo", "gone"]) for (let i = 0; i < 3; i++) await game(who, 1, JUNGLE, { objectives: [3, 0] });

  // The bot lane: the viewer as ADC (Jinx). With Lulu against Caitlyn and Lux: 3 (2 won). With Lulu
  // against Ezreal and Lux: 2. With Nami against Caitlyn and Lux: 1. A remake and a game without a
  // result of the four, never counted.
  for (const win of [true, true, false]) await game("viewer", 3, BOT("Lulu", "Caitlyn", "Lux"), { win });
  for (let i = 0; i < 2; i++) await game("viewer", 3, BOT("Lulu", "Ezreal", "Lux"));
  await game("viewer", 3, BOT("Nami", "Caitlyn", "Lux"), { win: false });
  await game("viewer", 3, BOT("Lulu", "Caitlyn", "Lux"), { duration: 200 });
  await game("viewer", 3, BOT("Lulu", "Caitlyn", "Lux"), { win: null });
  // The team: a teammate's three of the four; the personal-use and archived profiles' three each.
  for (let i = 0; i < 3; i++) await game("mate", 3, BOT("Lulu", "Caitlyn", "Lux"));
  for (const who of ["solo", "gone"]) for (let i = 0; i < 3; i++) await game(who, 3, BOT("Lulu", "Caitlyn", "Lux"));
  await backfillMatchPrep(db);
  invalidateAllCaches();
}, 120_000);
afterAll(async () => {
  await handle.close();
});

describe("the jungle's objective line (§3.9l)", () => {
  it("counts the early dragons, voidgrubs and heralds the viewer's team took against the chosen jungler, never a remake or a game without a result", async () => {
    const own = await section(session("viewer"), "jungle", "Lillia", { enemy: "Kindred" }, "own");
    expect(own.n).toBe(4);
    expect(line(own, "objectives")).toMatchObject({ label: "Dragons, voidgrubs and heralds before 15:00", values: "6 of 9 to Lillia's team", sample: "4 games · patch 26.22 · Solo/Duo 4" });
  });

  it("in the team's lines: a teammate's games, never a personal-use or archived profile's", async () => {
    const team = await section(session("viewer"), "jungle", "Lillia", { enemy: "Kindred" }, "team");
    expect(team.n).toBe(3);
    expect(line(team, "objectives")).toMatchObject({ values: "2 of 6 to Lillia's team", sample: "3 games · patch 26.22 · Solo/Duo 3" });
  });

  it("only at n >= 3, and only with the enemy jungler chosen", async () => {
    // From the teammate's side, the viewer's four count; the other two profiles' never do.
    const mateTeam = await section(session("mate"), "jungle", "Lillia", { enemy: "Kindred" }, "team");
    expect(line(mateTeam, "objectives")?.values).toBe("6 of 9 to Lillia's team");
    // The personal-use profile's team: the viewer's and the teammate's (6 of 9 and 2 of 6), never the archived profile's 9 of 9.
    const solo = await section(session("solo"), "jungle", "Lillia", { enemy: "Kindred" }, "team");
    expect(line(solo, "objectives")?.values).toBe("8 of 15 to Lillia's team");
    // No enemy chosen: no objective line (it is about the chosen jungler).
    const none = await section(session("viewer"), "jungle", "Lillia", {}, "own");
    expect(line(none, "objectives")).toBeUndefined();
    // Fewer than three: no line, the section says why.
    await db.update(accountMatches).set({ win: null }).where(eq(accountMatches.accountId, accounts.mate!));
    invalidateAllCaches();
    const few = await section(session("viewer"), "jungle", "Lillia", { enemy: "Kindred" }, "team");
    expect(line(few, "objectives")).toBeUndefined();
    await db.update(accountMatches).set({ win: true }).where(eq(accountMatches.accountId, accounts.mate!));
    invalidateAllCaches();
  });
});

describe("the bot lane's pairwise lines in a 2v2 (§3.9m)", () => {
  it("the four together, and each pair on its own: with the ally, against the enemy ADC, against the enemy support", async () => {
    const own = await section(session("viewer"), "adc", "Jinx", { ally: "Lulu", enemy: "Caitlyn", enemy2: "Lux" }, "own");
    expect(line(own, "record")?.values).toBe("3 games, 2 won");
    expect(line(own, "with-ally")).toMatchObject({ label: "With Lulu", values: "5 games, 4 won" });
    expect(line(own, "vs-enemy")).toMatchObject({ label: "Against Caitlyn", values: "4 games, 2 won" });
    expect(line(own, "vs-enemy2")).toMatchObject({ label: "Against Lux", values: "6 games, 4 won" });
    expect(line(own, "four")).toBeUndefined();
  });

  it("filters by each chosen slot in SQL, and names the empty ones", async () => {
    const e = (await evidence(session("viewer"), "adc", "Jinx", { ally: "Lulu", enemy2: "Lux" }))!;
    expect(e.ignored).toEqual(["the enemy ADC"]);
    const own = e.sections.find((s) => s.scope === "own")!;
    expect(line(own, "record")?.values).toBe("5 games, 4 won");
    expect((await section(session("viewer"), "adc", "Jinx", { enemy: "Ezreal" }, "own")).n).toBe(2);
    expect((await section(session("viewer"), "adc", "Jinx", { enemy: "Caitlyn" }, "own")).n).toBe(4);
    expect((await section(session("viewer"), "adc", "Jinx", { ally: "Nami" }, "own")).n).toBe(1);
    const ezreal = await section(session("viewer"), "adc", "Jinx", { ally: "Lulu", enemy: "Ezreal" }, "own");
    expect(ezreal.n).toBe(2);
    expect(line(ezreal, "with-ally")?.values).toBe("5 games, 4 won");
  });

  it("the four with fewer than 3 games: 'This 2v2' says so beside the pairs that are counted", async () => {
    const own = await section(session("viewer"), "adc", "Jinx", { ally: "Nami", enemy: "Caitlyn", enemy2: "Lux" }, "own");
    expect(line(own, "record")).toBeUndefined();
    expect(line(own, "with-ally")).toBeUndefined();
    expect(line(own, "vs-enemy")?.values).toBe("4 games, 2 won");
    expect(line(own, "four")).toMatchObject({ label: "This 2v2", values: "too few games: fewer than 3 on patch 26.22" });
  });

  it("the team's lines: a teammate's games, never a personal-use or archived profile's; none without view-teammate-stats", async () => {
    const team = await section(session("viewer"), "adc", "Jinx", { ally: "Lulu", enemy: "Caitlyn", enemy2: "Lux" }, "team");
    expect(team.n).toBe(3);
    expect(line(team, "with-ally")?.values).toBe("3 games, 3 won");
    const restricted = await section(session("viewer", { capabilities: ["view-team", "view-players", "view-matches"] }), "adc", "Jinx", { ally: "Lulu" }, "team");
    expect(restricted).toMatchObject({ tier: null, n: 0, lines: [] });
  });
});

describe("'Riot changed this' reads the two newest patches recorded", () => {
  it("nothing with one patch recorded; a changed champion once two are; a key at one patch only is not a change", async () => {
    try {
      await db.insert(patches).values({ id: "16.21", ddragonVersion: "16.21.1", isCurrent: false, sortKey: patchSortKey("16.21") }).onConflictDoNothing();
      await db.insert(staticDigests).values([{ patch: "16.22", kind: "champion", key: "Jinx", hash: "a" }]);
      invalidateAllCaches();
      expect(await riotChangesOf(db, [{ kind: "champion", key: "Jinx" }])).toBeNull();
      await db.insert(staticDigests).values([
        { patch: "16.21", kind: "champion", key: "Jinx", hash: "b" },
        { patch: "16.21", kind: "champion", key: "Lulu", hash: "a" },
        { patch: "16.22", kind: "champion", key: "Lulu", hash: "a" },
        { patch: "16.22", kind: "item", key: "3020", hash: "new" },
        // A failed attempt's mark on a newer patch is not a recorded patch.
        { patch: "16.23", kind: "patch", key: "failed", hash: "" },
      ]);
      invalidateAllCaches();
      const changes = (await riotChangesOf(db, [{ kind: "champion", key: "Jinx" }, { kind: "champion", key: "Lulu" }, { kind: "item", key: "3020" }]))!;
      expect(changes.patch).toBe("26.22");
      expect([...changes.changed]).toEqual(["champion:Jinx"]);
    } finally {
      await db.delete(staticDigests);
      await db.delete(patches).where(eq(patches.id, "16.21"));
      invalidateAllCaches();
    }
  });

  it("nothing unless the two newest recorded are the page's current patch and the one before it (R11b review 1)", async () => {
    try {
      // Digests for 26.21 and 26.20 only, while the game is on 26.22: the label would date a change to the wrong patch.
      await db.insert(patches).values([{ id: "16.20", ddragonVersion: "16.20.1", isCurrent: false, sortKey: patchSortKey("16.20") }, { id: "16.21", ddragonVersion: "16.21.1", isCurrent: false, sortKey: patchSortKey("16.21") }]).onConflictDoNothing();
      await db.insert(staticDigests).values([
        { patch: "16.20", kind: "champion", key: "Jinx", hash: "a" },
        { patch: "16.21", kind: "champion", key: "Jinx", hash: "b" },
      ]);
      invalidateAllCaches();
      expect(await riotChangesOf(db, [{ kind: "champion", key: "Jinx" }])).toBeNull();
      // 26.22 and 26.20 recorded, 26.21 missed: not adjacent, so a change cannot be dated to 26.22.
      await db.delete(staticDigests).where(eq(staticDigests.patch, "16.21"));
      await db.insert(staticDigests).values({ patch: "16.22", kind: "champion", key: "Jinx", hash: "c" });
      invalidateAllCaches();
      expect(await riotChangesOf(db, [{ kind: "champion", key: "Jinx" }])).toBeNull();
      // With 26.21 recorded too, the change between 26.21 and 26.22 is labelled.
      await db.insert(staticDigests).values({ patch: "16.21", kind: "champion", key: "Jinx", hash: "b" });
      invalidateAllCaches();
      expect([...(await riotChangesOf(db, [{ kind: "champion", key: "Jinx" }]))!.changed]).toEqual(["champion:Jinx"]);
    } finally {
      await db.delete(staticDigests);
      await db.delete(patches).where(inArray(patches.id, ["16.20", "16.21"]));
      invalidateAllCaches();
    }
  });
});
