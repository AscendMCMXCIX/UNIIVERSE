import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import { matchDetails } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { seedDemoAccounts, seedDemoRoster } from "@/server/demo/seed";
import { applyDemoEncounters } from "@/server/demo/encounters-fixture";
import { getCurrentLineup, getOrCreateTeam } from "@/server/repositories/team";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { currentSeason } from "@/server/accounts/sync";
import { loadEncounterPage } from "@/server/players/encounters";
import { encounterListChoice } from "@/domain/encounters";

/*
  The demo's recurring players (demo mode only, server/demo/encounters-fixture) land in the same
  games, on the same sides, every time a demo is seeded. Its player ids are random, and placements
  that followed the match ids (which carry them) changed with every seed: about one fresh demo in
  six left the Mid laner nobody met twice alongside, which the browser tests read
  (e2e/encounters.spec.ts).
*/

async function freshDemo(): Promise<DbHandle> {
  const handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  await seedDemoRoster(handle.db);
  await seedDemoAccounts(handle.db);
  await applyDemoEncounters(handle.db);
  return handle;
}

/** Each recurring player's place: the game (a member's by their name and its number), the player and the side. */
async function placements(db: Db): Promise<string[]> {
  const rows = await db.select({ matchId: matchDetails.matchId, participants: matchDetails.participants }).from(matchDetails).where(like(matchDetails.matchId, "DEMO\\_%"));
  return rows
    .flatMap(({ matchId, participants }) => {
      const own = /^DEMO_([^_]+)_(\d+)$/.exec(matchId);
      const me = own ? participants.find((p) => p.puuid.startsWith(`demo-${own[1]}`)) : undefined;
      const game = me && own ? `${me.name} game ${own[2]}` : matchId;
      return participants.filter((p) => p.puuid.startsWith("demo-regular-")).map((p) => `${game}: ${p.name} ${me ? (p.teamId === me.teamId ? "alongside" : "against") : `on team ${p.teamId}`}`);
    })
    .sort();
}

describe("the demo's recurring players (demo mode only)", () => {
  let first: DbHandle;
  let second: DbHandle;
  beforeAll(async () => {
    first = await freshDemo();
    second = await freshDemo();
  }, 240_000);
  afterAll(async () => {
    await first?.close();
    await second?.close();
  });

  it("are placed the same way in every fresh demo, whatever its random player ids", async () => {
    const [a, b] = [await placements(first.db), await placements(second.db)];
    expect(a.length).toBeGreaterThan(20);
    expect(b).toEqual(a);
  });

  it("give the Mid laner players met twice or more on each side, the lists the browser tests read", async () => {
    const db = first.db;
    const team = await getOrCreateTeam(db);
    const mid = (await getCurrentLineup(db, team.id)).slots.MID!;
    const scope = { accountIds: (await listAccountsForPlayer(db, mid)).map((a) => a.id), season: await currentSeason(db), mode: "all" as const };
    for (const rel of ["against", "alongside"] as const) {
      // The page's defaults: the current season, every game mode, met twice or more.
      const page = await loadEncounterPage(db, scope, encounterListChoice({ rel }));
      expect(page.list.length, rel).toBeGreaterThan(0);
    }
  });
});
