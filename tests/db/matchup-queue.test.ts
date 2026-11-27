import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, players, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { readMeetCounts } from "@/server/matchup/queue";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  Matchup Intel's curation queue (docs/MATCHUP_INTEL.md, "Curation"): the members' lane opponents
  and pairings this season, ranked by games, each game once however many members' accounts hold it;
  remakes, non-draft queues, other seasons, personal-use and archived profiles left out.
*/

let handle: DbHandle;
let n = 0;

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const teamId = (await getOrCreateTeam(db)).id;
  const account = async (name: string, over: Partial<typeof players.$inferInsert> = {}) => {
    const playerId = (await createPlayer(db, teamId, { displayName: name, primaryRole: "TOP", primaryPool: ["Garen"] })).id;
    if (Object.keys(over).length) await db.update(players).set(over).where(sql`${players.id} = ${playerId}::uuid`);
    const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: name, tagLine: "OCE", platform: "oc1", puuid: `p-${name}`, label: "main" }).returning({ id: riotAccounts.id });
    return a!.id;
  };
  const [ace, bee, solo, old] = [await account("Ace"), await account("Bee"), await account("Solo", { teamMember: false }), await account("Old", { archivedAt: new Date() })];
  const row = async (accountIds: string[], over: Partial<typeof accountMatches.$inferInsert> = {}) => {
    const matchId = `OC1_${++n}`;
    for (const accountId of accountIds) await db.insert(accountMatches).values({ accountId, matchId, gameCreation: Date.UTC(2026, 10, 20) + n, queueId: 420, championId: "Garen", role: "TOP", win: true, enemyChampionId: "Darius", patch: "16.22", gameDuration: 1800, kills: 1, deaths: 1, assists: 1, cs: 100, damage: 1, visionScore: 1, ...over });
  };
  for (let i = 0; i < 5; i++) await row([ace]);
  // One game both members' accounts hold: it counts once.
  await row([ace, bee]);
  for (let i = 0; i < 3; i++) await row([bee], { championId: "Riven" });
  for (let i = 0; i < 2; i++) await row([ace], { enemyChampionId: "Sett", queueId: 440 });
  // Left out.
  await row([ace], { gameDuration: 200 });
  await row([ace], { queueId: 1700 });
  await row([ace], { patch: "15.24" });
  await row([ace], { win: null });
  await row([solo]);
  await row([old]);
});

afterAll(async () => {
  await handle?.close();
});

describe("the curation queue's counts", () => {
  it("rank the members' opponents and pairings by distinct games this season, champion names and counts only", async () => {
    const meets = await readMeetCounts(handle.db, 16);
    const opponents = meets.filter((m) => m.championId === null).map((m) => [m.role, m.opponentId, m.games]);
    expect(opponents).toEqual([["TOP", "Darius", 9], ["TOP", "Sett", 2]]);
    const pairs = meets.filter((m) => m.championId !== null).map((m) => [m.championId, m.opponentId, m.games]);
    expect(pairs).toEqual([["Garen", "Darius", 6], ["Riven", "Darius", 3], ["Garen", "Sett", 2]]);
    expect(JSON.stringify(meets)).not.toMatch(/Ace|Bee|p-|OC1_/);
  });
});
