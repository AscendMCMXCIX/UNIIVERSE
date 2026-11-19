import { defineJob } from "./registry";
import { recomputeLaneOpponents } from "@/server/accounts/lane-opponents";

/**
 * The by-hand repair of the stored lane opponents (server/accounts/lane-opponents.ts): every
 * player's stored game whose opponent differs from the one lane opponent rule gets the rule's,
 * from the game's stored record. A setup (repair) job: the Owner's from Admin, or the session's
 * through Data jobs with CRON_SECRET; run only when data-audit's `laneOpponents.disagree` is above
 * 0. Derived data only: no Riot request, no source data changed, safe to run again. Counts only.
 */
defineJob({
  key: "lane-opponent-recompute",
  kind: "setup",
  confirm: { title: "Repair the stored lane opponents", effect: "Sets each stored game's lane opponent again from the game's own record, by the one lane opponent rule, where the two differ: derived data only, no Riot request, safe to run again.", phrase: "RECOMPUTE" },
  description: "One-off repair, by hand: sets each player's stored game's lane opponent again from the game's stored record, by the one lane opponent rule (one enemy and nobody else on the player's side in the position), where the two differ; a game with an erased player, or whose record lacks the player's place, is left as it is. Derived data only: no Riot request, no source data changed, safe to run again. Counts only.",
  defaultIntervalMinutes: null,
  run: async (ctx) => {
    const summary = await recomputeLaneOpponents(ctx.db);
    ctx.log(`lane-opponent-recompute: ${summary.rows} games read, ${summary.disagree.total} differed from the rule, ${summary.changed.total} changed (${summary.changed.missing} opponent added, ${summary.changed.unclear} now unclear, ${summary.changed.other} another), ${summary.skipped} changed meanwhile, ${summary.leftAsStored} left as stored`);
    return { ok: true, summary: { ...summary } };
  },
});
