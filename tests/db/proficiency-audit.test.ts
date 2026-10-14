import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory, accountMastery } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { runJob } from "@/server/jobs";

/* The proficiency audit compares the previous and current model on stored data and writes nothing. */

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const db = handle.db;
  const team = await getOrCreateTeam(db);
  const p = await createPlayer(db, team.id, { displayName: "Secret Name", primaryRole: "TOP", primaryPool: ["Gwen", "Riven"], secondaryRole: "JUNGLE", secondaryPool: ["Gwen"] });
  const account = await addAccount(db, { ownerType: "player", playerId: p.id, riotId: "Secret#OCE", platform: "oc1" });
  const recent = new Date(Date.now() - 2 * 86_400_000);
  await db.insert(accountChampionHistory).values([
    { accountId: account.id, championId: "Gwen", role: "TOP", queueGroup: "solo", patch: "16.20", games: 100, wins: 55, lastPlayedAt: recent },
    { accountId: account.id, championId: "Riven", role: "TOP", queueGroup: "solo", patch: "16.20", games: 2, wins: 2, lastPlayedAt: recent },
  ]);
  await db.insert(accountMastery).values({ accountId: account.id, championId: "Gwen", points: 300_000, level: 7, lastPlayedAt: recent });
});
afterAll(async () => {
  await handle.close();
});

const counts = async () => {
  const r = await handle.db.execute(sql`SELECT (SELECT count(*) FROM account_champion_history) AS h, (SELECT count(*) FROM account_mastery) AS m, (SELECT count(*) FROM players) AS p`);
  return ((r as { rows?: unknown[] }).rows ?? r) as unknown[];
};

describe("proficiency audit", () => {
  it("shows the old and new rating per champion and role, flags the edge cases and changes nothing", async () => {
    const before = await counts();
    const result = await runJob(handle.db, "proficiency-audit", "cli");
    expect(result.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a loose JSON report
    const s = result.summary as Record<string, any>;
    expect(s.evaluated).toBe(3); // Gwen top, Gwen jungle (pool), Riven top
    // Gwen in the Jungle, all experience in Top: a Main before, Familiar now.
    expect(s.changedExamples).toEqual(expect.arrayContaining([expect.objectContaining({ champion: "Gwen", role: "JUNGLE", before: expect.stringMatching(/^core /), after: expect.stringMatching(/^comfortable /) })]));
    // Two wins from two games: flagged, and only "Few games".
    expect(s.byCase.smallSampleHighWinRate[0]).toMatchObject({ champion: "Riven", after: expect.stringMatching(/^moderate /) });
    // Players are anonymous.
    expect(JSON.stringify(s)).not.toMatch(/Secret/);
    expect(await counts()).toEqual(before);
  });
});
