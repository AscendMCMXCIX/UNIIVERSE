import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isNotNull, like } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import { matchDetails, patches, riotAccounts } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { seedDemoAccounts, seedDemoRoster } from "@/server/demo/seed";
import { applyDemoEncounters } from "@/server/demo/encounters-fixture";
import { applyDemoBuilds } from "@/server/demo/builds-fixture";
import { readBuildCounts } from "@/server/champion-builds/query";
import { iconResolver } from "@/server/champion-builds/load";
import { patchSortKey } from "@/domain/patch";
import { championBuildsView, itemClasses, type BuildItemInfo } from "@/domain/champion-builds";

/*
  The demo's builds (demo mode only, server/demo/builds-fixture): the same on every fresh demo,
  whatever its random player ids, and running it twice changes nothing; and the cases the browser
  tests read (e2e/champion-builds.spec.ts): Thresh with a most common build and one with a higher
  win rate, Nasus with one build, Leona in two roles with the previous patch added, and the
  champions Champion Intel's other specs open below the section's threshold.
*/

const fixture = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "ddragon-16.22.1-item-builds.json"), "utf8")) as { items: Record<string, BuildItemInfo> };
const ITEMS = itemClasses(fixture.items);

async function freshDemo(): Promise<DbHandle> {
  const handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  // The browser tests' patch (Data Dragon pinned at 16.22.1), and the one before it.
  await db.update(patches).set({ isCurrent: false });
  for (const [id, current] of [["16.22", true], ["16.21", false]] as const) await db.insert(patches).values({ id, ddragonVersion: `${id}.1`, isCurrent: current, sortKey: patchSortKey(id) }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: current } });
  await seedDemoRoster(db);
  await seedDemoAccounts(db);
  await applyDemoEncounters(db);
  await applyDemoBuilds(db);
  return handle;
}

const view = async (db: Db, champion: string) => championBuildsView(champion, await readBuildCounts(db, { champion, patches: ["16.22", "16.21"], items: ITEMS, ranks: { 1: 5, 2: 5, 3: 5, 4: 3 } }), { current: "16.22", previous: "16.21" }, iconResolver(null));

/** Every demo game's patch and the builds the fixture gives, by the game's place in the demo (never its random ids). */
async function placements(db: Db): Promise<string[]> {
  const rows = await db.select({ matchId: matchDetails.matchId, participants: matchDetails.participants, version: matchDetails.gameVersion }).from(matchDetails).where(like(matchDetails.matchId, "DEMO\\_%"));
  const members = new Set((await db.select({ puuid: riotAccounts.puuid }).from(riotAccounts).where(isNotNull(riotAccounts.puuid))).map((r) => r.puuid));
  return rows
    .map(({ matchId, participants, version }) => {
      const own = /^DEMO_([^_]+)_(\d+)$/.exec(matchId);
      const me = own ? participants.find((p) => p.puuid.startsWith(`demo-${own[1]}`)) : undefined;
      const game = me && own ? `${me.name} game ${own[2]}` : matchId;
      // The players the fixture rewrites (never a member's own, whose build the demo seeds).
      const member = (puuid: string) => members.has(puuid);
      const rewritten = (p: (typeof participants)[number]) => !member(p.puuid) && ((p.championId === "Thresh" && p.position === "SUPPORT") || (p.championId === "Nasus" && p.position === "TOP") || (p.championId === "Leona" && (p.position === "SUPPORT" || p.position === "ADC")));
      // Only in the games it moved: the others keep the demo's own (seeded) builds.
      const moved = version !== "16.20.1";
      const picks = participants.filter((p) => moved && rewritten(p)).map((p) => `${p.championId} ${p.position} ${p.runes?.keystone} ${p.items?.join(",")}`);
      return `${game}: ${version} ${picks.join(" | ")}`;
    })
    .sort();
}

describe("the demo's builds (demo mode only)", () => {
  let first: DbHandle;
  let second: DbHandle;
  beforeAll(async () => {
    first = await freshDemo();
    second = await freshDemo();
  }, 300_000);
  afterAll(async () => {
    await first?.close();
    await second?.close();
  });

  it("are placed the same way in every fresh demo, and running it again changes nothing", async () => {
    const a = await placements(first.db);
    expect(await placements(second.db)).toEqual(a);
    await applyDemoBuilds(first.db);
    expect(await placements(first.db)).toEqual(a);
  });

  it("give Thresh a most common build and a less common one that wins clearly more, from at least 20 games", async () => {
    const thresh = await view(first.db, "Thresh");
    expect(thresh.status).toBe("shown");
    if (thresh.status !== "shown") return;
    const b = thresh.builds.SUPPORT!;
    expect(b.patches).toEqual(["26.22"]);
    for (const part of [b.runes, b.boots, b.core]) {
      expect(part.state).toBe("shown");
      if (part.state !== "shown") continue;
      expect(part.performer).not.toBeNull();
      expect(part.performer!.games).toBeGreaterThanOrEqual(20);
      expect(part.standard.games).toBeGreaterThan(part.performer!.games);
      expect(part.performer!.winRate - part.standard.winRate).toBeGreaterThanOrEqual(0.02);
    }
    expect(b.full).not.toBeNull();
    expect(b.fullHighest).not.toBeNull();
  });

  it("give Nasus one build, Leona two roles on the previous patch too, and leave the other specs' champions short of the section", async () => {
    const nasus = await view(first.db, "Nasus");
    expect(nasus.status === "shown" && nasus.roles.map((r) => r.role)).toEqual(["TOP"]);
    if (nasus.status === "shown") for (const part of [nasus.builds.TOP!.runes, nasus.builds.TOP!.core, nasus.builds.TOP!.spells]) expect(part.state === "shown" && part.performer).toBeNull();
    const leona = await view(first.db, "Leona");
    expect(leona.status).toBe("shown");
    if (leona.status === "shown") {
      expect(leona.roles.map((r) => r.role)).toEqual(["SUPPORT", "ADC"]);
      expect(leona.builds.SUPPORT).toMatchObject({ patches: ["26.22", "26.21"], widened: true });
    }
    for (const champion of ["Ahri", "Jinx", "LeeSin", "Udyr", "Aphelios", "Teemo", "Jayce", "Nunu", "AurelionSol", "Heimerdinger", "Mordekaiser", "Darius", "Garen", "Lux", "DrMundo", "Caitlyn", "Riven", "RenataGlasc", "TwistedFate", "Fiddlesticks", "MonkeyKing"]) expect((await view(first.db, champion)).status, champion).toBe("few");
  });
});
