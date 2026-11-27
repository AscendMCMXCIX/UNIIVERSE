import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { matchDetails, matchTimelines, patches, type MatchParticipantDetail, type MatchTimelineParticipant } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { seedDemoAccounts, seedDemoRoster } from "@/server/demo/seed";
import { applyDemoEncounters } from "@/server/demo/encounters-fixture";
import { applyDemoBuilds } from "@/server/demo/builds-fixture";
import { readBuildCounts } from "@/server/champion-builds/query";
import { patchSortKey } from "@/domain/patch";
import { MAX_VALID_DURATION_S, MIN_VALID_DURATION_S } from "@/domain/season-stats";
import { BUILD_QUEUES, itemClasses, type BuildItemInfo, type SkillRanks } from "@/domain/champion-builds";
import { laneOf, observeBuild } from "@/domain/champion-builds-observe";

/*
  One rule set for the builds' two sources (docs/HIGH_ELO_EVIDENCE.md, "One rule set"): the team's
  counts are made inside the database (server/champion-builds/query.ts), the high-elo counts in
  TypeScript from games that are never stored (domain/champion-builds-observe.ts observeBuild).
  Over every demo record and timeline, observeBuild added up must equal the statement's answer,
  value by value, queue by queue: a change to one rule fails here until the other follows.
*/

const fixture = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "ddragon-16.22.1-item-builds.json"), "utf8")) as { items: Record<string, BuildItemInfo> };
const ITEMS = itemClasses(fixture.items);
const RANKS: SkillRanks = { 1: 5, 2: 5, 3: 5, 4: 3 };
const WINDOW = ["16.22", "16.21"];
let handle: DbHandle;

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
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

/** The statement's rule for which records count, written again: draft queues, a full game, a current team member's game, on the window. */
async function counted(champion: string): Promise<Map<string, { n: number; w: number }>> {
  const db = handle.db;
  const result = await db.execute(sql`SELECT DISTINCT am.match_id FROM account_matches am JOIN riot_accounts ra ON ra.id = am.account_id AND ra.owner_type = 'player' JOIN players pl ON pl.id = ra.player_id AND pl.team_member AND pl.archived_at IS NULL`);
  const members = new Set((((result as { rows?: unknown[] }).rows ?? result) as Array<{ match_id: string }>).map((r) => r.match_id));
  const records = await db.select({ matchId: matchDetails.matchId, queueId: matchDetails.queueId, duration: matchDetails.gameDuration, version: matchDetails.gameVersion, participants: matchDetails.participants }).from(matchDetails);
  const timelines = new Map((await db.select({ matchId: matchTimelines.matchId, participants: matchTimelines.participants }).from(matchTimelines)).map((t) => [t.matchId, t.participants as MatchTimelineParticipant[]]));
  const out = new Map<string, { n: number; w: number }>();
  const add = (key: string, win: boolean) => {
    const c = out.get(key) ?? { n: 0, w: 0 };
    c.n += 1;
    if (win) c.w += 1;
    out.set(key, c);
  };
  for (const r of records) {
    if (!members.has(r.matchId) || !(BUILD_QUEUES as readonly number[]).includes(r.queueId ?? -1)) continue;
    if (!(r.duration >= MIN_VALID_DURATION_S && r.duration <= MAX_VALID_DURATION_S)) continue;
    const m = /^(\d+)\.(\d+)/.exec(r.version ?? "");
    const patch = m ? `${Number(m[1])}.${Number(m[2])}` : null;
    if (!patch || !WINDOW.includes(patch)) continue;
    for (const p of r.participants as MatchParticipantDetail[]) {
      const lane = laneOf(p.position);
      if (p.championId !== champion || p.removed || !lane) continue;
      const tl = p.puuid ? (timelines.get(r.matchId)?.find((t) => t.puuid === p.puuid) ?? null) : null;
      const values = observeBuild(p, tl, ITEMS, RANKS);
      add(`games|${patch}|${lane}|${r.queueId}|`, p.win);
      for (const [dim, value] of Object.entries(values)) add(`${dim}|${patch}|${lane}|${r.queueId}|${value}`, p.win);
    }
  }
  return out;
}

describe("observeBuild against the builds statement", () => {
  for (const champion of ["Thresh", "Leona", "Nasus", "Ahri", "Jinx"]) {
    it(`gives exactly the statement's counts for ${champion}, value by value and queue by queue`, async () => {
      const rows = await readBuildCounts(handle.db, { champion, patches: WINDOW, items: ITEMS, ranks: RANKS });
      const fromSql = new Map(rows.map((r) => [`${r.dim}|${r.patch}|${r.lane}|${r.queue}|${r.value}`, { n: r.n, w: r.w }]));
      const fromTs = await counted(champion);
      expect(fromSql.size).toBeGreaterThan(0);
      expect(Object.fromEntries([...fromTs].sort())).toEqual(Object.fromEntries([...fromSql].sort()));
    });
  }
});
