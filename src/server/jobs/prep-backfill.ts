import { defineJob } from "./registry";
import { backfillMatchPrep, prepPending } from "@/server/matchup-intel/prep-store";

/**
 * The by-hand fill of Matchup Intel's evidence rows (server/matchup-intel/prep-store.ts): each
 * member's stored rift game without a row gets one, made from its stored record and timeline, at
 * most 1,000 games a run, newest first. A setup (repair) job: the Owner's from Admin, or the
 * session's through Data jobs with CRON_SECRET, one run a day until `remaining` is 0, each counted
 * first (docs/HOSTING_USAGE.md, "prep-backfill": about 5 MB of database egress a full run).
 * It also makes again a row whose starting set still counts first-minute sales (made from a timeline
 * that keeps them before the starting set took them out: prep-store.ts, STALE_START).
 * Derived data only: no Riot request, nothing else replaced (a second run writes nothing), and everything
 * it writes can be made again from match_details and match_timelines. Counts only.
 */
defineJob({
  key: "prep-backfill",
  kind: "setup",
  confirm: { title: "Fill Matchup Intel's evidence from stored games", effect: "Reads up to 1,000 members' stored games (their records and timelines) and inserts what each says about runes, spells, items and skill order: derived data only, no Riot request, insert only, safe to run again.", phrase: "BACKFILL" },
  description: "One-off fill, by hand: inserts Matchup Intel's evidence row for each member's stored rift game without one (rune page, spells, starting items, first shop visit, first completed items, skill order, early objectives for junglers, the lane's end), made from the game's stored record and timeline, at most 1,000 games a run, newest first; it also makes again a row whose starting items still count items sold in the first minute. Derived data only: no Riot request, safe to run again. Counts only.",
  defaultIntervalMinutes: null,
  run: async (ctx) => {
    const before = await prepPending(ctx.db);
    const run = await backfillMatchPrep(ctx.db, { deadline: ctx.startedAt + ctx.budgetMs });
    ctx.log(`prep-backfill: ${before} games waiting; ${run.read} read, ${run.inserted} inserted (${run.withTimeline} with a timeline, ${run.unnamed} whose record does not name the member); ${run.remaining} still waiting`);
    return { ok: true, summary: { before, ...run } };
  },
});
