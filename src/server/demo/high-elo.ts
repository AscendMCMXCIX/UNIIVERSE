import type { Db } from "@/server/db/types";
import { miHighCounts } from "@/server/db/schema";
import { getCurrentPatch } from "@/server/repositories/champions";
import { countDeltas, type CountDelta, type HighEloObservation } from "@/domain/matchup-intel/high-elo/counts";
import { observationWeight } from "@/domain/matchup-intel/high-elo/sample";
import type { PrepLane } from "@/domain/matchup-intel/prep";
import { RIOT_REGIONS, type RiotRegion } from "@/domain/riot-platforms";

/*
  The in-memory demo's high-elo counts (test data only, never on a deployment: bootstrap seeds them
  only outside Postgres), made the way the sampler makes them: synthetic observations, weighted by
  the sampling's own rule and added up by countDeltas, so the page's section, its thresholds and its
  regions can be tested while the real collection is switched off. Riven in Top has enough games for
  every line, against Darius too; Ambessa has too few for a result, and Gwen none in Southeast Asia.
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

const pick = <T,>(r: () => number, choices: ReadonlyArray<readonly [T, number]>): T => {
  let u = r() * choices.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of choices) if ((u -= w) < 0) return v;
  return choices[choices.length - 1]![0];
};

interface DemoCell {
  role: PrepLane;
  champion: string;
  /** Observations per region. */
  games: Partial<Record<RiotRegion, number>>;
  opponents: ReadonlyArray<readonly [string, number]>;
  winRate: number;
}

const CELLS: DemoCell[] = [
  { role: "TOP", champion: "Riven", games: { americas: 160, europe: 240, asia: 180, sea: 60 }, opponents: [["Darius", 0.3], ["Renekton", 0.2], ["Garen", 0.2], ["Mordekaiser", 0.3]], winRate: 0.51 },
  { role: "TOP", champion: "Ambessa", games: { europe: 12, asia: 8 }, opponents: [["Renekton", 1]], winRate: 0.5 },
  { role: "TOP", champion: "Gwen", games: { americas: 40, europe: 50, asia: 30 }, opponents: [["Ornn", 0.6], ["Darius", 0.4]], winRate: 0.49 },
];

/** Master+ players per server in the demo's model, by region (one server each). */
const POPULATION: Record<RiotRegion, number> = { americas: 1_900, europe: 4_600, asia: 3_800, sea: 1_200 };

export function demoHighEloDeltas(patch: string): CountDelta[] {
  const out: CountDelta[] = [];
  const r = rng(26_23);
  for (const cell of CELLS) {
    for (const region of RIOT_REGIONS) {
      const n = cell.games[region] ?? 0;
      const observations: HighEloObservation[] = [];
      for (let i = 0; i < n; i += 1) {
        const inGame = 1 + Math.floor(r() * 4);
        observations.push({
          role: cell.role,
          champion: cell.champion,
          opponent: r() < 0.85 ? pick(r, cell.opponents) : null,
          win: r() < cell.winRate,
          choices: {
            ks: pick(r, [["8010", 0.62], ["8437", 0.24], ["8230", 0.14]] as const),
            spells: pick(r, [["4,12", 0.7], ["4,14", 0.3]] as const),
            start: pick(r, [["1055,2003", 0.8], ["1054,2003", 0.2]] as const),
            item1: pick(r, [["6692", 0.55], ["3071", 0.3], ["6610", 0.15]] as const),
            skills: pick(r, [["QEW", 0.6], ["QWE", 0.4]] as const),
            max: pick(r, [["QE", 0.75], ["QW", 0.25]] as const),
          },
          end: 480_000 + Math.floor(r() * 420_000),
          weight: observationWeight({ population: POPULATION[region], inGame, sampled: 6, found: 10, fetched: 8, coverage: 1 }),
        });
      }
      out.push(...countDeltas(observations, patch, region));
    }
  }
  return out;
}

/** Seeds the demo's counts at its current patch, once (a second start adds nothing). */
export async function seedDemoHighElo(db: Db): Promise<void> {
  const current = await getCurrentPatch(db);
  if (!current) return;
  const rows = demoHighEloDeltas(current.patch);
  for (let i = 0; i < rows.length; i += 500) await db.insert(miHighCounts).values(rows.slice(i, i + 500)).onConflictDoNothing();
}
