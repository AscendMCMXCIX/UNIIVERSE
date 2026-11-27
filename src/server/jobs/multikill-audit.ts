import { defineJob } from "./registry";
import { runMultikillAudit } from "@/server/leaderboards/multikill-audit";

/**
 * Read-only multikill fairness check (docs/TEAM_LEADERBOARDS.md, "Fairness evaluation, 27 Nov 2026"):
 * the production score against the alternative models on the stored season games, with the
 * decision rule's outcome. Run by hand only (Data jobs `multikill-audit`, or Admin's "Run check");
 * never scheduled. Its answer holds anonymous aggregates only: no name, id, PUUID, match id, and no
 * member's score or place. Changes nothing.
 */
defineJob({
  key: "multikill-audit",
  kind: "check",
  cost: "Reads the season's stored games and the players' multikill counters once (about 1.5 MB from the database): run it when you need its answer.",
  description:
    "Read-only: the multikill score against alternative models on the stored season games (role-, champion- and opportunity-adjusted, empirical-Bayes, the member's own games), with how far members' games differ, a lane-opponent placebo, split-half reliability, a bootstrap of first place and the decision rule's outcome. Anonymous aggregates only. Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const { summary } = await runMultikillAudit(ctx.db);
    ctx.log(`multikill-audit: ${summary.scope.membersRanked} ranked members · ${summary.scope.comparisonGames} comparison games · outcome ${summary.decision.outcome}`);
    const problem = !summary.scope.ready ? `not compared: ${summary.scope.reason}` : !summary.m0MatchesProduction ? "the audit's M0 differs from the production score" : null;
    return { ok: true, degraded: !!problem, ...(problem ? { error: problem } : {}), summary };
  },
});
