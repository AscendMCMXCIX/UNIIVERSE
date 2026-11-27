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
import { championBuildsViews, hasPerformer, itemClasses, otherQueueOffer, type BuildItemInfo } from "@/domain/champion-builds";

/*
  The demo's builds (demo mode only, server/demo/builds-fixture): the same on every fresh demo,
  whatever its random player ids, and running it twice changes nothing; and the cases the browser
  tests read (e2e/champion-builds.spec.ts), each queue on its own (D5): Thresh in Ranked Solo/Duo
  with a most common build and a less common one of 20 games and 16 wins that is never the
  "Highest win rate" (D6), and too few in Ranked Flex with Solo/Duo offered; Nasus with one build;
  Leona with the previous patch added; and the champions Champion Intel's other specs open below
  the section's threshold in every queue.
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

const counts = (db: Db, champion: string) => readBuildCounts(db, { champion, patches: ["16.22", "16.21"], items: ITEMS, ranks: { 1: 5, 2: 5, 3: 5, 4: 3 } });
const views = async (db: Db, champion: string) => championBuildsViews(champion, await counts(db, champion), { current: "16.22", previous: "16.21" }, iconResolver(null));
const view = async (db: Db, champion: string) => (await views(db, champion)).queues.solo;

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

  it("give Thresh in Ranked Solo/Duo a most common build and a less common one of 20 games and 16 wins that is never the highest win rate (D6)", async () => {
    const thresh = await view(first.db, "Thresh");
    expect(thresh.status).toBe("shown");
    if (thresh.status !== "shown") return;
    expect(thresh.queue).toBe("solo");
    const b = thresh.builds.SUPPORT!;
    expect(b.patches).toEqual(["26.22"]);
    expect(b.queue).toBe("solo");
    expect(thresh.roles.map((r) => r.role)).toEqual(["SUPPORT"]);
    // The less common rune page, keystone 8465: 20 games, 16 won, among the Solo/Duo counts.
    const rows = (await counts(first.db, "Thresh")).filter((r) => r.queue === 420 && r.dim === "runes" && r.value.startsWith("8400:8465,"));
    expect(rows.reduce((s, r) => s + r.n, 0)).toBe(20);
    expect(rows.reduce((s, r) => s + r.w, 0)).toBe(16);
    for (const part of [b.runes, b.boots, b.core]) {
      expect(part.state).toBe("shown");
      if (part.state === "shown") expect(part.performer).toBeNull();
    }
    expect(hasPerformer(b)).toBe(false);
    expect(b.full).not.toBeNull();
    expect(b.fullHighest).toBeNull();
  });

  it("count Thresh's Ranked Flex games on their own: too few, with Solo/Duo offered, never pooled", async () => {
    const all = await views(first.db, "Thresh");
    expect(all.queues.flex).toMatchObject({ status: "few", queue: "flex", games: 18, role: "SUPPORT" });
    const solo = all.queues.solo;
    expect(otherQueueOffer(all.queues, "flex", "SUPPORT")).toEqual({ queue: "solo", role: "SUPPORT", games: solo.status === "shown" ? solo.builds.SUPPORT!.games : -1 });
    // Every row carries one queue; the Solo/Duo view's games are Solo/Duo's alone.
    const rows = await counts(first.db, "Thresh");
    const games = (q: number) => rows.filter((r) => r.dim === "games" && r.queue === q && r.lane === "UTILITY" && r.patch === "16.22").reduce((s, r) => s + r.n, 0);
    expect(games(440)).toBe(18);
    expect(solo.status === "shown" && solo.builds.SUPPORT!.games).toBe(games(420));
    for (const q of ["draft", "clash"] as const) expect(all.queues[q].status).toBe("few");
  });

  it("give Nasus one build, Leona the previous patch too (one role in Solo/Duo), and leave the other specs' champions short of the section in every queue", async () => {
    const nasus = await view(first.db, "Nasus");
    expect(nasus.status === "shown" && nasus.roles.map((r) => r.role)).toEqual(["TOP"]);
    if (nasus.status === "shown") for (const part of [nasus.builds.TOP!.runes, nasus.builds.TOP!.core, nasus.builds.TOP!.spells]) expect(part.state === "shown" && part.performer).toBeNull();
    const leona = await view(first.db, "Leona");
    expect(leona.status).toBe("shown");
    if (leona.status === "shown") {
      expect(leona.roles.map((r) => r.role)).toEqual(["SUPPORT"]);
      expect(leona.builds.SUPPORT).toMatchObject({ patches: ["26.22", "26.21"], widened: true });
    }
    for (const champion of ["Ahri", "Jinx", "LeeSin", "Udyr", "Aphelios", "Teemo", "Jayce", "Nunu", "AurelionSol", "Heimerdinger", "Mordekaiser", "Darius", "Garen", "Lux", "DrMundo", "Caitlyn", "Riven", "RenataGlasc", "TwistedFate", "Fiddlesticks", "MonkeyKing"]) {
      const all = await views(first.db, champion);
      for (const q of ["solo", "flex", "draft", "clash"] as const) expect(all.queues[q].status, `${champion} ${q}`).toBe("few");
    }
  });
});
