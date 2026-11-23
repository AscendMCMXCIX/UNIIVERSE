import { randomUUID } from "node:crypto";
import { defineJob } from "./registry";
import { champions } from "@/server/db/schema";
import { getCurrentPatch, listPatchesDesc } from "@/server/repositories/champions";
import { createRiotClient } from "@/server/riot/api/client";
import { loadRiotBuildData } from "@/server/riot/static/assets";
import { comparePatches } from "@/domain/patch";
import { HIGH_ELO_COLLECTION_ENABLED } from "@/server/matchup-intel/high-elo/switch";
import { HOST_SHARE, runHighEloSlice } from "@/server/matchup-intel/high-elo/sampler";

/**
 * Matchup Intel's high-elo sampling (docs/HIGH_ELO_EVIDENCE.md): one slice an hour in the tick, the
 * four regions in parallel, at most 60 s and 120 Riot requests, adding counts of Master+ players'
 * ranked Solo/Duo games. Switched off (HIGH_ELO_COLLECTION_ENABLED): then it makes no Riot request,
 * writes nothing and the tick never runs it. Counts only in its summary: servers and hosts, never a
 * player or a game.
 */
defineJob({
  key: "high-elo-sample",
  kind: "refresh",
  description:
    "Matchup Intel's high-elo statistics: one slice of sampling across Riot's four regions (a server per region in proportion to its Master+ players, a few of their players, a few of their latest ranked Solo/Duo games), at most 60 s and 120 requests, adding only counts: no player, game or Riot ID is stored. Switched off until Riot's registration describes it and the resource limits are verified (docs/HIGH_ELO_EVIDENCE.md).",
  defaultIntervalMinutes: HIGH_ELO_COLLECTION_ENABLED ? 60 : null,
  run: async (ctx) => {
    if (!HIGH_ELO_COLLECTION_ENABLED) {
      ctx.log("high-elo-sample: switched off; no Riot request made, nothing written");
      return { ok: true, summary: { collection: "off" } };
    }
    const deadline = ctx.startedAt + ctx.budgetMs;
    const current = await getCurrentPatch(ctx.db);
    const known = await listPatchesDesc(ctx.db);
    const previous = current ? (known.filter((p) => comparePatches(p, current.patch) < 0).sort((a, b) => comparePatches(b, a))[0] ?? null) : null;
    const keep = current ? [current.patch, ...(previous ? [previous] : [])] : [];
    const keyToId = new Map((await ctx.db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
    const items = (await loadRiotBuildData(ctx.db).catch(() => null))?.itemInfo ?? null;
    const run = await runHighEloSlice(ctx.db, {
      clientFor: (region) => createRiotClient({ limitShare: HOST_SHARE[region], deadline }),
      now: Date.now(),
      seed: randomUUID(),
      keyToId,
      items,
      keep,
    });
    const failed = run.regions.filter((r) => r.outcome === "failed");
    ctx.log(`high-elo-sample: ${run.games} games, ${run.observations} Master+ players' games observed, ${run.cpuMs} ms of CPU; ${run.regions.map((r) => `${r.region} ${r.outcome}`).join(", ")}`);
    return { ok: failed.length < run.regions.length, degraded: failed.length > 0, summary: { keep, ...run } };
  },
});
