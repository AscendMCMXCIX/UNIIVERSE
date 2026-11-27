import type { Db } from "@/server/db/types";
import { highEloCounts } from "@/server/db/schema";
import { getCurrentPatch } from "@/server/repositories/champions";
import { countDeltas, type CountDelta, type HighEloObservation } from "@/domain/high-elo/counts";
import { observationWeight } from "@/domain/high-elo/sample";
import type { BuildLane } from "@/domain/champion-builds";
import { RIOT_REGIONS, type RiotRegion } from "@/domain/riot-platforms";

/*
  The in-memory demo's Master+ counts (test data only, never on a deployment: bootstrap seeds them
  only on the in-memory demo, and the page shows them only with the browser tests' cookie,
  server/champion-builds/high-elo/switch.ts), made the way the sampler makes them: synthetic
  observations with the builds' own values, weighted by the sampling's own rule and added up by
  countDeltas. So the "Highest win rate" view, its marks and its full build, a role choice between
  two roles, and the empty and too-few states can be tested while the real collection is switched
  off (the team's sample sizes rarely give an honest "Highest win rate": docs/CHAMPION_INTEL.md).
  - Thresh in support: a most common build and a less common one that won clearly more (runes,
    boots and core items), and the items bought fourth and fifth after each core.
  - Leona in support and in the bot lane: two roles.
  - Nasus in top: too few once weighted ("Not enough Master+ games").
  - Every other champion: none counted.
*/

/** A small seeded generator, so the demo's counts are the same on every start. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoBuild {
  runes: string;
  shards: string;
  spells: string;
  skills: string;
  start: string;
  boots: string;
  /** Completed items in order (the first three the core). */
  items: number[];
}

const THRESH_COMMON: DemoBuild = { runes: "8400:8439,8463,8473,8242|8300:8304,8347", shards: "5007,5008,5001", spells: "4,14", skills: "QEW|QWE", start: "2003,2003,3865", boots: "3158", items: [3190, 3107, 3109, 3222, 3050] };
const THRESH_WINNING: DemoBuild = { runes: "8400:8465,8463,8473,8242|8300:8304,8347", shards: "5007,5008,5001", spells: "4,14", skills: "QEW|QWE", start: "2003,2003,3865", boots: "3047", items: [3190, 3050, 3109, 3107, 3222] };
const LEONA: DemoBuild = { runes: "8400:8439,8463,8473,8242|8300:8304,8347", shards: "5007,5008,5001", spells: "4,14", skills: "EQW|EQW", start: "2003,2003,3865", boots: "3047", items: [3190, 3109, 3050, 3075, 3143] };
const LEONA_BOT: DemoBuild = { runes: "8400:8439,8463,8473,8242|8100:8143,8135", shards: "5005,5008,5001", spells: "4,7", skills: "QEW|QEW", start: "1055,2003", boots: "3006", items: [3078, 3071, 3053, 3065, 3075] };
const NASUS: DemoBuild = { runes: "8000:8010,9111,9104,8299|8400:8444,8451", shards: "5005,5008,5001", spells: "4,12", skills: "QEW|QWE", start: "1054,2003", boots: "3047", items: [3078, 3065, 3075, 3742, 3143] };

/** A build's values as observeBuild writes them (domain/champion-builds-observe). */
function valuesOf(b: DemoBuild): HighEloObservation["values"] {
  const set = b.items.slice(0, 3).sort((x, y) => x - y).join(",");
  return { timeline: "", runes: b.runes, shards: b.shards, spells: b.spells, skills: b.skills, start: b.start, boots: b.boots, core: b.items.slice(0, 3).join(">"), fourth: `${set}|${b.items[3]}`, fifth: `${set}|${b.items[4]}` };
}

interface DemoCell {
  lane: BuildLane;
  champion: string;
  /** Observations per region. */
  games: Partial<Record<RiotRegion, number>>;
  /** The builds played, with their share and win rate. */
  builds: ReadonlyArray<{ build: DemoBuild; share: number; winRate: number }>;
}

const CELLS: DemoCell[] = [
  { lane: "UTILITY", champion: "Thresh", games: { americas: 220, europe: 330, asia: 250, sea: 80 }, builds: [{ build: THRESH_COMMON, share: 0.62, winRate: 0.48 }, { build: THRESH_WINNING, share: 0.38, winRate: 0.64 }] },
  { lane: "UTILITY", champion: "Leona", games: { americas: 120, europe: 160, asia: 110, sea: 30 }, builds: [{ build: LEONA, share: 1, winRate: 0.51 }] },
  { lane: "BOTTOM", champion: "Leona", games: { americas: 50, europe: 70, asia: 40, sea: 10 }, builds: [{ build: LEONA_BOT, share: 1, winRate: 0.49 }] },
  { lane: "TOP", champion: "Nasus", games: { europe: 14, asia: 10 }, builds: [{ build: NASUS, share: 1, winRate: 0.52 }] },
];

/** Master+ players per server in the demo's model, by region (one server each). */
const POPULATION: Record<RiotRegion, number> = { americas: 1_900, europe: 4_600, asia: 3_800, sea: 1_200 };

/** The demo's count rows at `patch` (internal "16.22"). */
export function demoHighEloDeltas(patch: string): CountDelta[] {
  const out: CountDelta[] = [];
  const r = rng(26_22);
  for (const cell of CELLS) {
    for (const region of RIOT_REGIONS) {
      const n = cell.games[region] ?? 0;
      const observations: HighEloObservation[] = [];
      for (let i = 0; i < n; i += 1) {
        const inGame = 1 + Math.floor(r() * 4);
        let u = r();
        const pick = cell.builds.find((b) => (u -= b.share) < 0) ?? cell.builds[cell.builds.length - 1]!;
        observations.push({ lane: cell.lane, champion: cell.champion, win: r() < pick.winRate, values: valuesOf(pick.build), weight: observationWeight({ population: POPULATION[region], inGame, sampled: 6, found: 10, fetched: 8, coverage: 1 }) });
      }
      out.push(...countDeltas(observations, patch, region));
    }
  }
  return out;
}

/** Seeds the demo's counts at its current patch, once (a second start adds nothing). */
export async function seedDemoHighElo(db: Db): Promise<void> {
  const current = await getCurrentPatch(db);
  if (!current || current.isFixture) return;
  const rows = demoHighEloDeltas(current.patch);
  for (let i = 0; i < rows.length; i += 500) await db.insert(highEloCounts).values(rows.slice(i, i + 500)).onConflictDoNothing();
}
