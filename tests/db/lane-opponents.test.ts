import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { makeSeason2026Current, testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { laneOpponentAudit, recomputeLaneOpponents } from "@/server/accounts/lane-opponents";
import { getPlayerMatchups } from "@/server/players/matchups";
import { runJob, listJobs } from "@/server/jobs";
import { accountMatches, matchDetails, type MatchParticipantDetail } from "@/server/db/schema";

/*
  The stored lane opponents against the one lane opponent rule (server/accounts/lane-opponents):
  data-audit counts them in the database (the rule read in SQL), and the by-hand repair
  lane-opponent-recompute sets the ones that differ with the rule itself (TypeScript). On every case
  the two must agree: after the repair the audit finds nothing left to change, and a second repair
  changes nothing. The records (the source data) are never touched.
*/

let handle: DbHandle;
let playerId: string;
let accountId: string;
const ME = "me-puuid";
const DAY = 86_400_000;

/** A seat in a stored record: `readings` [team, individual] for a record stored from 20 Nov 2026 on, none for an older one. */
function seat(puuid: string, teamId: number, championId: string, position: string | null, readings?: [string, string], removed = false): MatchParticipantDetail {
  if (removed) return { puuid: "", name: null, teamId, championId: null, championKey: 0, champLevel: null, position: null, win: teamId === 100, kills: 0, deaths: 0, assists: 0, cs: null, gold: null, damage: null, damageTaken: null, vision: null, wardsPlaced: null, items: null, spells: null, runes: null, removed: true };
  return { puuid, name: null, teamId, championId, championKey: 0, champLevel: 14, position, ...(readings ? { teamPosition: readings[0], individualPosition: readings[1] } : {}), win: teamId === 100, kills: 2, deaths: 2, assists: 2, cs: 150, gold: 9000, damage: 12000, damageTaken: 12000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null };
}
const n = (tp: string, ip: string): [string, string] => [tp, ip];

interface Case {
  stored: string | null;
  teamId?: number | null;
  parts: MatchParticipantDetail[];
  /** The rule's opponent once repaired; "left" when the row is left as stored. */
  expect: string | null | "left";
}
/** Gwen top on blue for the member in every game unless said otherwise. */
const CASES: Record<string, Case> = {
  // A record kept from 20 Nov 2026 on, one player per team position: agrees.
  CLEAR_NEW: { stored: "Darius", parts: [seat(ME, 100, "Gwen", "TOP", n("TOP", "TOP")), seat("a1", 100, "Ahri", "MIDDLE", n("MIDDLE", "MIDDLE")), seat("e1", 200, "Darius", "TOP", n("TOP", "TOP")), seat("e2", 200, "Lux", "MIDDLE", n("MIDDLE", "MIDDLE"))], expect: "Darius" },
  // An older record with two enemies in the merged position: the old fold took the first; unclear.
  STALE_OLD: { stored: "Darius", parts: [seat(ME, 100, "Gwen", "TOP"), seat("e1", 200, "Darius", "TOP"), seat("e2", 200, "Garen", "TOP")], expect: null },
  // An older record with one enemy in the position, stored without an opponent: the rule names one.
  MISSING_OLD: { stored: null, parts: [seat(ME, 100, "Gwen", "TOP"), seat("a1", 100, "Ahri", "MIDDLE"), seat("e1", 200, "Nasus", "TOP")], expect: "Nasus" },
  // Kept from 20 Nov on: one enemy has no team position and read top alone (merged TOP); the other holds top by team position.
  OTHER_NEW: { stored: "Sett", parts: [seat(ME, 100, "Gwen", "TOP", n("TOP", "TOP")), seat("e1", 200, "Sett", "TOP", n("", "TOP")), seat("e2", 200, "Jax", "TOP", n("TOP", "JUNGLE"))], expect: "Jax" },
  // Kept from 20 Nov on with no team positions: two enemies share the individual one; unclear.
  INDIVIDUAL_NEW: { stored: "Ahri", parts: [seat(ME, 100, "Gwen", "MIDDLE", n("", "MIDDLE")), seat("e1", 200, "Ahri", "MIDDLE", n("", "MIDDLE")), seat("e2", 200, "Lux", "MIDDLE", n("", "MIDDLE"))], expect: null },
  // A player in the game was erased: the record no longer holds what the opponent was chosen from.
  REMOVED: { stored: "Darius", parts: [seat(ME, 100, "Gwen", "TOP"), seat("e1", 200, "Darius", "TOP"), seat("x", 200, "", null, undefined, true), seat("e3", 200, "Garen", "TOP")], expect: "left" },
  // A record under an earlier Riot key (other ids): the member is found by champion on their side.
  EARLIER_KEY: { stored: "Renekton", teamId: 100, parts: [seat("old-id", 100, "Gwen", "TOP"), seat("e1", 200, "Renekton", "TOP")], expect: "Renekton" },
  // The same with no side known for the row: the member cannot be found, left as stored.
  EARLIER_KEY_NO_SIDE: { stored: "Renekton", teamId: null, parts: [seat("old-id", 100, "Gwen", "TOP"), seat("e1", 200, "Renekton", "TOP"), seat("e2", 200, "Garen", "TOP")], expect: "left" },
  // A teammate holds the member's position too: unclear.
  ALLY_TWICE: { stored: "Darius", parts: [seat(ME, 100, "Gwen", "TOP"), seat("a1", 100, "Garen", "TOP"), seat("e1", 200, "Darius", "TOP")], expect: null },
  // The role names the demo's records carry: MID is MIDDLE.
  ROLE_NAMES: { stored: "Zed", parts: [seat(ME, 100, "Gwen", "MID"), seat("a1", 100, "Ahri", null), seat("e1", 200, "Zed", "MIDDLE"), seat("e2", 200, "Lux", null)], expect: "Zed" },
};

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  await makeSeason2026Current(db);
  const team = await getOrCreateTeam(db);
  playerId = (await createPlayer(db, team.id, { displayName: "Laner", primaryRole: "TOP", primaryPool: ["Gwen"] })).id;
  accountId = (await addAccount(db, { ownerType: "player", playerId, riotId: "Laner#OCE", platform: "oc1", puuid: ME })).id;
  let age = 1;
  for (const [id, c] of Object.entries(CASES)) {
    const matchId = `OC1_${id}`;
    // Summarised when stored, as the sync does (a record under an earlier key was summarised under that key's ids).
    await db.insert(accountMatches).values({ accountId, matchId, gameCreation: Date.now() - age++ * DAY, queueId: 420, championId: "Gwen", role: "TOP", win: true, enemyChampionId: c.stored, patch: "16.20", gameDuration: 1700, teamId: c.teamId === undefined ? 100 : c.teamId, summarisedAt: new Date() });
    await db.insert(matchDetails).values({ matchId, platform: "oc1", queueId: 420, gameCreation: Date.now() - age * DAY, gameDuration: 1700, gameVersion: "16.20.1", teams: [], participants: c.parts });
  }
  // A game whose record Riot no longer serves (no players) is not counted at all.
  await db.insert(accountMatches).values({ accountId, matchId: "OC1_GONE", gameCreation: Date.now() - 40 * DAY, queueId: 420, championId: "Gwen", role: "TOP", win: true, enemyChampionId: "Nasus", patch: "16.20", gameDuration: 1700 });
  await db.insert(matchDetails).values({ matchId: "OC1_GONE", platform: null, queueId: 420, gameCreation: Date.now() - 40 * DAY, gameDuration: 1700, gameVersion: null, teams: [], participants: [] });
}, 60_000);
afterAll(async () => {
  await handle.close();
});

const storedOf = async () => Object.fromEntries((await handle.db.select({ matchId: accountMatches.matchId, enemy: accountMatches.enemyChampionId }).from(accountMatches).where(eq(accountMatches.accountId, accountId))).map((r) => [r.matchId, r.enemy]));

describe("the stored lane opponents against the rule", () => {
  it("are counted in the database: disagreeing by kind, unclear, left as stored, and with Riot's two positions kept", async () => {
    expect(await laneOpponentAudit(handle.db)).toEqual({
      rows: 10,
      sourcePositions: 3,
      leftAsStored: 2,
      unclear: 3,
      disagree: { total: 5, missing: 1, unclear: 3, other: 1 },
    });
  });

  it("are repaired by the rule itself, the same rows the audit counted, and nothing is left to change", async () => {
    const records = await handle.db.select().from(matchDetails).orderBy(asc(matchDetails.matchId));
    // Two rows a page, so the repair crosses pages.
    const r = await recomputeLaneOpponents(handle.db, { pageSize: 2 });
    expect(r).toMatchObject({ rows: 10, sourcePositions: 3, leftAsStored: 2, unclear: 3, disagree: { total: 5, missing: 1, unclear: 3, other: 1 }, changed: { total: 5, missing: 1, unclear: 3, other: 1 }, skipped: 0 });
    const stored = await storedOf();
    for (const [id, c] of Object.entries(CASES)) expect([id, stored[`OC1_${id}`]]).toEqual([id, c.expect === "left" ? c.stored : c.expect]);
    // The audit (the rule in SQL) agrees with the repair (the rule in TypeScript) on every row.
    expect((await laneOpponentAudit(handle.db)).disagree).toEqual({ total: 0, missing: 0, unclear: 0, other: 0 });
    // A second run changes nothing; the records themselves are untouched.
    expect((await recomputeLaneOpponents(handle.db)).changed.total).toBe(0);
    expect(await handle.db.select().from(matchDetails).orderBy(asc(matchDetails.matchId))).toEqual(records);
    expect(stored.OC1_GONE).toBe("Nasus");
  });

  it("leave the champion window's tally and its lane on the same games", async () => {
    const w = await getPlayerMatchups(handle.db, playerId, { account: null, mode: "all", champion: "Gwen", vs: null, role: "TOP", exact: true });
    const tallied = w.opponents.reduce((s, o) => s + o.games, 0);
    expect(w.lane!.games).toBe(tallied);
    // The two records under an earlier key (other ids) give no lane figures; every other game pairs with its stored opponent.
    expect(w.lane!.timelines.noDetails).toBe(2);
    // The games the rule finds unclear are in neither.
    expect(w.opponents.map((o) => o.championId).sort()).toEqual(["Darius", "Jax", "Nasus", "Renekton", "Renekton", "Zed"].filter((v, i, a) => a.indexOf(v) === i).sort());
  });
});

describe("the lane-opponent-recompute job", () => {
  it("is registered, by hand only, and answers counts only", async () => {
    const job = listJobs().find((j) => j.key === "lane-opponent-recompute");
    expect(job).toBeDefined();
    expect(job!.defaultIntervalMinutes).toBeNull();
    const result = await runJob(handle.db, "lane-opponent-recompute", "test");
    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({ rows: 10, changed: { total: 0 } });
    // Nothing about any player: no PUUID, Riot ID or match id in its answer.
    expect(JSON.stringify(result.summary)).not.toMatch(/me-puuid|old-id|OC1_|Laner/);
  });

  it("is in data-audit's answer as counts", async () => {
    const audit = await runJob(handle.db, "data-audit", "test");
    expect(audit.ok).toBe(true);
    expect((audit.summary as { laneOpponents: unknown }).laneOpponents).toEqual({ rows: 10, sourcePositions: 3, leftAsStored: 2, unclear: 3, disagree: { total: 0, missing: 0, unclear: 0, other: 0 } });
  });
});
