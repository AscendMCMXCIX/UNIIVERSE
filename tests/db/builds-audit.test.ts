import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { patches } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { seedChampionAbilitiesFromFixture } from "@/server/riot/static/abilities";
import { seedDemoAccounts, seedDemoRoster } from "@/server/demo/seed";
import { applyDemoEncounters } from "@/server/demo/encounters-fixture";
import { applyDemoBuilds } from "@/server/demo/builds-fixture";
import { readBuildCandidates } from "@/server/champion-builds/query";
import { runBuildsAudit } from "@/server/jobs/builds-audit";
import { resultBytes } from "@/server/db/egress";
import { patchSortKey } from "@/domain/patch";
import { buildCandidates } from "@/domain/champion-builds-audit";
import { parseProbe, unsealProbe } from "../../scripts/builds-probe.mjs";

/*
  The builds audit on the demo's builds (server/jobs/builds-audit, server/demo/builds-fixture): the
  candidates statement finds the champion-role-queues with builds (Thresh, Leona and Nasus in Ranked
  Solo/Duo; Thresh's 18 Ranked Flex games too few), in a few KB with no player or match; the
  audit of the views the page draws finds no violation; its answer names no champion and no player,
  and its sealed probe opens to the two champions with the most Solo/Duo games. And with the page's
  counts held as Next's data cache holds them in production (for hours, while account sync stores
  games every 15 minutes): a game stored since is no violation, as the page is right about the
  counts it holds.
*/

// Next's data cache as production has it: the first reading of a champion's counts is served again (the test turns it on).
const pageCache = vi.hoisted(() => ({ on: false, held: new Map<string, unknown>(), noAbilities: new Set<string>() }));
// A champion whose abilities are not stored (a new champion on patch day): its page draws no builds.
vi.mock("@/server/champion-lookup/view", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/champion-lookup/view")>();
  return {
    ...real,
    loadLookupPage: async (...args: Parameters<typeof real.loadLookupPage>) => {
      const page = await real.loadLookupPage(...args);
      return page.lookup && pageCache.noAbilities.has(page.lookup.champion.id) ? { ...page, lookup: { ...page.lookup, abilities: null } } : page;
    },
  };
});
vi.mock("@/server/champion-builds/load", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/champion-builds/load")>();
  return {
    ...real,
    countChampionBuilds: async (...args: Parameters<typeof real.countChampionBuilds>) => {
      if (!pageCache.on) return real.countChampionBuilds(...args);
      const key = args[1].championId;
      if (!pageCache.held.has(key)) pageCache.held.set(key, await real.countChampionBuilds(...args));
      return pageCache.held.get(key) as Awaited<ReturnType<typeof real.countChampionBuilds>>;
    },
  };
});

let handle: DbHandle;

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  // The champions' stored abilities, as the demo has them (the page reads each one's skill ranks from them).
  await seedChampionAbilitiesFromFixture(db);
  await db.update(patches).set({ isCurrent: false });
  for (const [id, current] of [["16.22", true], ["16.21", false]] as const) await db.insert(patches).values({ id, ddragonVersion: `${id}.1`, isCurrent: current, sortKey: patchSortKey(id) }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: current } });
  await seedDemoRoster(db);
  await seedDemoAccounts(db);
  await applyDemoEncounters(db);
  await applyDemoBuilds(db);
}, 300_000);

afterAll(async () => {
  await handle?.close();
});

describe("the builds audit", () => {
  it("finds the champion-role-queues with builds on the window, each queue on its own, in a few KB of counts", async () => {
    const rows = await readBuildCandidates(handle.db, ["16.22", "16.21"]);
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/demo-|DEMO_|#/);
    expect(resultBytes([{ rows: text }]).bytes).toBeLessThan(3_000);
    // Only champion-role-queues with 20 games on the window leave the database.
    expect(rows.every((r) => r.n > 0)).toBe(true);
    const candidates = buildCandidates(rows, { current: "16.22", previous: "16.21" });
    expect(candidates.slice(0, 3).map((c) => `${c.champion} ${c.role} ${c.queue}`)).toEqual(["Thresh SUPPORT solo", "Leona SUPPORT solo", "Nasus TOP solo"]);
    expect(candidates.find((c) => c.champion === "Thresh" && c.queue === "flex")).toBeUndefined();
    // Thresh's 18 Ranked Flex games: too few on the window, so they never leave the database.
    expect(rows.some((r) => r.champion === "Thresh" && r.queue === 440)).toBe(false);
    expect(rows.filter((r) => r.champion === "Thresh" && r.queue === 420 && r.lane === "UTILITY").reduce((s, r) => s + r.n, 0)).toBe(50);
  });

  it("finds no violation on the demo's builds, names no champion or player, and seals the two champions the Production check opens", async () => {
    const logs: string[] = [];
    const outcome = await runBuildsAudit({ db: handle.db, log: (m) => logs.push(m) }, { now: new Date("2026-11-27T00:00:00Z"), secret: "a-cron-secret" });
    expect(outcome.error).toBeUndefined();
    expect(outcome.ok).toBe(true);
    const s = outcome.summary as Record<string, unknown>;
    expect(s.violations).toEqual([]);
    expect(s.audited).toBeGreaterThanOrEqual(3);
    expect(s.roles).toBeGreaterThanOrEqual(3);
    expect((s.queues as Record<string, number>)["420"]).toBeGreaterThan(0);
    // Counts and labels only: no champion's name, player, match or Riot ID in the answer or the log.
    const said = JSON.stringify(s) + logs.join("\n");
    expect(said).not.toMatch(/Thresh|Leona|Nasus|demo-|DEMO_|#[A-Z]{2,5}\b/);
    expect(parseProbe(unsealProbe(s.probeSealed as string, "a-cron-secret"))).toEqual([
      { champion: "Thresh", queue: "solo" },
      { champion: "Leona", queue: "solo" },
    ]);
  });

  it("holds the page's cached counts to themselves: a game stored after they were cached is counted as newer, never a violation", async () => {
    const db = handle.db;
    const run = () => runBuildsAudit({ db, log: () => {} }, { now: new Date("2026-11-27T00:00:00Z"), secret: "a-cron-secret" });
    // One of Thresh's Ranked Flex games, as Thresh's Ranked Solo/Duo support games are.
    const found = await db.execute(sql`SELECT match_id FROM match_details WHERE queue_id = 440 AND jsonb_path_query_array(participants, '$[*].championId') ?| ARRAY['Thresh']::text[] AND game_version LIKE '16.22%' ORDER BY match_id LIMIT 1`);
    const [moved] = ((found as unknown as { rows?: unknown[] }).rows ?? (found as unknown as unknown[])) as Array<{ match_id: string }>;
    expect(moved).toBeDefined();
    pageCache.on = true;
    try {
      // The page's counts cached (a member opened the page, or the last run warmed them).
      expect((await run()).ok).toBe(true);
      // Account sync stores a game since: the fresh candidates have 51 Solo/Duo support games for Thresh, the page's cached counts 50.
      await db.execute(sql`UPDATE match_details SET queue_id = 420 WHERE match_id = ${moved!.match_id}`);
      const fresh = buildCandidates(await readBuildCandidates(db, ["16.22", "16.21"]), { current: "16.22", previous: "16.21" });
      expect(fresh.find((c) => c.champion === "Thresh" && c.role === "SUPPORT" && c.queue === "solo")?.games).toBe(51);
      const outcome = await run();
      const s = outcome.summary as Record<string, unknown>;
      expect(s.violations).toEqual([]);
      expect(outcome.ok).toBe(true);
      expect(s.newerGames).toBe(1);
      // The probe opens what the page's counts show.
      expect(parseProbe(unsealProbe(s.probeSealed as string, "a-cron-secret"))).toEqual([
        { champion: "Thresh", queue: "solo" },
        { champion: "Leona", queue: "solo" },
      ]);
    } finally {
      pageCache.on = false;
      pageCache.held.clear();
      await db.execute(sql`UPDATE match_details SET queue_id = 440 WHERE match_id = ${moved!.match_id}`);
    }
  });

  it("probes only champions it audited: one skipped (no stored abilities, so no builds on its page) is never opened", async () => {
    pageCache.noAbilities.add("Leona");
    try {
      const outcome = await runBuildsAudit({ db: handle.db, log: () => {} }, { now: new Date("2026-11-27T00:00:00Z"), secret: "a-cron-secret" });
      const s = outcome.summary as Record<string, unknown>;
      expect(outcome.ok).toBe(true);
      expect(s.skipped).toEqual({ noAbilities: 1 });
      expect(parseProbe(unsealProbe(s.probeSealed as string, "a-cron-secret"))).toEqual([
        { champion: "Thresh", queue: "solo" },
        { champion: "Nasus", queue: "solo" },
      ]);
    } finally {
      pageCache.noAbilities.clear();
    }
  });
});
