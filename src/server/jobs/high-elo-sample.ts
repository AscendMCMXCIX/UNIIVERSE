import { randomUUID } from "node:crypto";
import { defineJob, type JobContext } from "./registry";
import type { JobOutcome } from "@/server/ops/refresh-status";
import { champions } from "@/server/db/schema";
import { loadRiotBuildData } from "@/server/riot/static/assets";
import { itemClasses, type SkillRanks } from "@/domain/champion-builds";
import type { RiotRegion } from "@/domain/riot-platforms";
import { abilityRanks } from "@/server/champion-builds/high-elo/ranks";
import { keptPatches } from "@/server/champion-builds/high-elo/store";
import { highEloGate, type HighEloOff } from "@/server/champion-builds/high-elo/switch";
import { runHighEloSlice, type SamplerClient } from "@/server/champion-builds/high-elo/sampler";
import { samplerClientFor } from "@/server/champion-builds/high-elo/sampler-client";

/*
  The high-elo sampling for Champion Intel's builds (docs/HIGH_ELO_EVIDENCE.md): one slice, the four
  regions in parallel, at most 60 s and 120 Riot requests, adding counts of Master+ players' Ranked
  Solo/Duo builds. PREPARED AND SWITCHED OFF: without both keys and a Riot key (switch.ts
  highEloGate) it makes no Riot request, writes nothing and returns at once, and the tick never runs
  it (no interval). An interval set in Admin cannot make it collect: the gate is read on every run,
  and the slice checks it again before it makes any client. Counts only in its summary: servers,
  hosts and Riot's statuses, never a player, a game or a route (sampler.ts failureReason).
  Its own reads, each slice (docs/HIGH_ELO_EVIDENCE.md, "Budgets"): the roster's keys, the item
  data (cached 10 minutes), the abilities' ranks only (ranks.ts: about 7 KB, not the records'
  0.6 MB), the patches, the cursors, the populations, the day's games, the team's accounts and the
  table's size.
*/

export interface HighEloRunDeps {
  /** The gate (defaults to the environment's and the code's keys). */
  gate?: { on: boolean; off: readonly HighEloOff[] };
  /** The client for a region (defaults to samplerClientFor: none in this build). */
  clientFor?: (region: RiotRegion, deadline: number) => SamplerClient | null;
  now?: number;
}

export async function runHighEloSample(ctx: Pick<JobContext, "db" | "log" | "startedAt" | "budgetMs">, deps: HighEloRunDeps = {}): Promise<JobOutcome> {
  const gate = deps.gate ?? highEloGate();
  if (!gate.on) {
    ctx.log(`high-elo-sample: off (${gate.off.join(", ")}); no Riot request made, nothing written`);
    return { ok: true, summary: { collection: "off", off: gate.off } };
  }
  const deadline = ctx.startedAt + ctx.budgetMs;
  const keep = await keptPatches(ctx.db);
  const roster = await ctx.db.select({ key: champions.key, id: champions.id }).from(champions);
  const keyToId = new Map(roster.map((c) => [c.key, c.id]));
  const items = itemClasses((await loadRiotBuildData(ctx.db).catch(() => null))?.itemInfo ?? {});
  // Each champion's ability ranks, for the skill order (the page's own rule), read as ranks only.
  const ranks = await abilityRanks(ctx.db);
  const ranksOf = (champion: string): SkillRanks | null => ranks.get(champion) ?? null;
  const clientFor = deps.clientFor ?? samplerClientFor;
  const run = await runHighEloSlice(ctx.db, { gate, clientFor: (region) => clientFor(region, deadline), now: deps.now ?? Date.now(), seed: randomUUID(), keyToId, items, ranksOf, keep });
  const failed = run.regions.filter((r) => r.outcome === "failed");
  ctx.log(`high-elo-sample: ${run.games} games, ${run.observations} Master+ players' games observed, ${run.cpuMs} ms of CPU, ${run.oldCountsDeleted} rows of older patches deleted; ${run.regions.map((r) => `${r.region} ${r.outcome}`).join(", ")}`);
  return { ok: failed.length < run.regions.length, degraded: failed.length > 0, summary: { collection: "on", keep, ...run } };
}

defineJob({
  key: "high-elo-sample",
  kind: "refresh",
  description:
    "Champion Intel's Master+ builds: one slice of sampling across Riot's four regions (a server per region in proportion to its Master+ players, a few of their players, a few of their latest Ranked Solo/Duo games), at most 60 s and 120 requests, adding only counts: no player, game or Riot ID is stored. Switched off until Riot's registration describes it and the owner switches it on (docs/HIGH_ELO_EVIDENCE.md): then it makes no request and writes nothing.",
  defaultIntervalMinutes: highEloGate().on ? 120 : null,
  run: (ctx) => runHighEloSample(ctx),
});
