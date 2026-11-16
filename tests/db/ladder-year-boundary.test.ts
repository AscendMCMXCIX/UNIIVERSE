import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { rankSnapshots, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { ladderChange, rankChangesFor } from "@/server/accounts/rank-history";

/*
  The 30-day ladder change (Match History's summary, Team's detail panel) across the turn of a
  year, on fixed dates: Riot's 2026 ladder runs into January until its reset, so a reading first
  seen in 2027 still counts, and after the reset there is no figure (a reset ends the ladder). The
  ranked year's bound, which Ranked progress's yearly view keeps, must not apply here.
*/

let handle: DbHandle;
let accountId: string;
let playerId: string;
const at = (iso: string) => new Date(iso);
const ms = (iso: string) => Date.parse(iso);

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  playerId = (await createPlayer(db, team.id, { displayName: "Year End", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: "YearEnd", tagLine: "OCE", platform: "oc1", puuid: "year-end-puuid", label: "main" }).returning({ id: riotAccounts.id });
  accountId = a!.id;
  await db.insert(rankSnapshots).values([
    { accountId, queue: "solo", tier: "GOLD", division: "I", leaguePoints: 10, wins: 30, losses: 30, capturedAt: at("2026-12-01T10:00:00Z"), confirmedAt: at("2026-12-20T09:00:00Z") },
    // One game later, confirmed into the new year: still Riot's 2026 ladder.
    { accountId, queue: "solo", tier: "GOLD", division: "I", leaguePoints: 30, wins: 31, losses: 30, capturedAt: at("2026-12-20T10:00:00Z"), confirmedAt: at("2027-01-02T10:00:00Z") },
    { accountId, queue: "solo", tier: "GOLD", division: "I", leaguePoints: 50, wins: 32, losses: 30, capturedAt: at("2027-01-02T11:00:00Z"), confirmedAt: at("2027-01-03T11:00:00Z") },
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("the 30-day ladder change at the turn of the year", () => {
  it("counts a reading first seen in January while Riot's ladder still runs", async () => {
    const now = ms("2027-01-03T12:00:00Z");
    const expected = { queue: "solo", days: 30, points: 40, from: "Gold I 10 LP", to: "Gold I 50 LP", since: null };
    expect(await ladderChange(handle.db, accountId, "solo", now)).toEqual(expected);
    expect((await rankChangesFor(handle.db, [{ id: playerId, queue: null }], now)).get(playerId)).toEqual(expected);
  });

  it("shows nothing after Riot's reset, never the last year's change", async () => {
    // Read again until the reset, then unranked.
    await handle.db.update(rankSnapshots).set({ confirmedAt: at("2027-01-07T10:00:00Z") }).where(eq(rankSnapshots.capturedAt, at("2027-01-02T11:00:00Z")));
    await handle.db.insert(rankSnapshots).values({ accountId, queue: "solo", tier: null, division: null, leaguePoints: null, wins: null, losses: null, capturedAt: at("2027-01-08T10:00:00Z"), confirmedAt: at("2027-01-10T10:00:00Z") });
    const now = ms("2027-01-10T12:00:00Z");
    expect(await ladderChange(handle.db, accountId, "solo", now)).toBeNull();
    expect((await rankChangesFor(handle.db, [{ id: playerId, queue: null }], now)).get(playerId)).toBeNull();
  });
});
