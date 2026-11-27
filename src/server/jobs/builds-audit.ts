import { defineJob, type JobContext } from "./registry";
import type { JobOutcome } from "@/server/ops/refresh-status";
import { getCurrentPatch, listPatchesDesc } from "@/server/repositories/champions";
import { loadLookupPage } from "@/server/champion-lookup/view";
import { countChampionBuilds, iconResolver, skillRanksOf } from "@/server/champion-builds/load";
import { readBuildCandidates } from "@/server/champion-builds/query";
import { probeText, sealProbe } from "@/server/champion-builds/probe";
import { championBuildsViews, previousPatch, type PatchWindow } from "@/domain/champion-builds";
import { auditChampion, auditedChampions, auditTotals, buildCandidates, probeChampions, type ChampionAudit } from "@/domain/champion-builds-audit";

/*
  The builds audit (docs/LIVE_VALIDATION.md, "The builds audit"; docs/CHAMPION_INTEL.md): a
  read-only check, run by the Production check before its live check and by hand from Data jobs or
  Admin, that the builds the page shows on production keep every rule (domain/champion-builds-audit
  R1–R10), re-derived from the raw counts:
  - which champion-role-queues have builds on the current patch window (one statement, a few KB);
  - for the champions with the most games and a few more in turn by the day (at most 6), the same
    counts the page reads, through the same cached path and key (countChampionBuilds), so a run warms
    the page's own cache entries rather than counting twice, and the views the page would draw;
  - the rules checked against those counts; violations as labels only (c1/MID/solo/core:performer).
  Its answer is counts only: no champion's name (the probe of the two champions the Production check
  opens is sealed under CRON_SECRET, server/champion-builds/probe.ts), no player, no match. `ok` is
  false on any violation, so the jobs endpoint answers 500 and the Production check fails.
  Cost: the candidates statement (tens of ms, a few KB), up to six counting statements that the page's
  own cache then holds for six hours (50–300 ms and 5–30 KB each, none when already cached), about a
  second of function time.
*/

/** At most this many champions a run: the most played, then others in turn by the day. */
const TOP = 3;
const ROTATING = 3;

export async function runBuildsAudit(ctx: Pick<JobContext, "db" | "log">, options: { now?: Date; secret?: string } = {}): Promise<JobOutcome> {
  const db = ctx.db;
  const current = await getCurrentPatch(db);
  if (!current || current.isFixture) {
    ctx.log("builds-audit: no current patch from Data Dragon; nothing to audit");
    return { ok: true, summary: { window: null, candidates: 0, audited: 0, violations: [], probeSealed: null } };
  }
  const previous = previousPatch(current.patch, await listPatchesDesc(db));
  const window: PatchWindow = { current: current.patch, previous };
  const patches = previous ? [current.patch, previous] : [current.patch];
  const candidates = buildCandidates(await readBuildCandidates(db, patches), window);
  const day = Math.floor((options.now ?? new Date()).getTime() / 86_400_000);
  const champions = auditedChampions(candidates, day, TOP, ROTATING);
  const audits: ChampionAudit[] = [];
  const skipped = { noAbilities: 0 };
  for (const [i, championId] of champions.entries()) {
    const label = `c${i + 1}`;
    // The champion as the page reads it: its stored abilities give the skill ranks of the cache key.
    const page = await loadLookupPage(db, { champion: championId });
    const champion = page.lookup;
    if (!champion?.abilities) {
      // The page shows no builds without the stored abilities either.
      skipped.noAbilities += 1;
      continue;
    }
    const counted = await countChampionBuilds(db, { championId: champion.champion.id, ranks: skillRanksOf(champion.abilities) });
    if (!counted) continue;
    const views = championBuildsViews(champion.champion.name, counted.rows, counted.window, iconResolver(counted.assets));
    audits.push(auditChampion(label, counted.rows, counted.window, views, candidates.filter((c) => c.champion === championId)));
  }
  const total = auditTotals(audits);
  const probe = probeChampions(candidates.filter((c) => champions.includes(c.champion)));
  const secret = options.secret ?? process.env.CRON_SECRET;
  const summary = {
    window: { current: current.patch, previous },
    candidates: candidates.length,
    audited: audits.length,
    skipped,
    roles: total.roles,
    parts: total.parts,
    performers: total.performers,
    widenedRoles: total.widenedRoles,
    queues: total.queues,
    violations: total.violations.slice(0, 50),
    violationCount: total.violations.length,
    probe: probe.length,
    probeSealed: sealProbe(probeText(probe), secret),
  };
  ctx.log(`builds-audit: ${candidates.length} champion-role-queues with builds, ${audits.length} champions audited, ${total.violations.length} violations`);
  return { ok: total.violations.length === 0, summary, ...(total.violations.length ? { error: `${total.violations.length} builds rule violations` } : {}) };
}

defineJob({
  key: "builds-audit",
  kind: "check",
  description:
    "Read-only: re-checks Champion Intel's builds on the current patch window against every rule (queues never pooled, thresholds, the 99% highest-win-rate rule, value forms) from the raw counts, for the champions with builds; warms the page's cache. Counts and anonymous labels only. Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  cost: "A few KB, and up to six builds counts the page then reuses for six hours.",
  run: (ctx) => runBuildsAudit(ctx),
});
