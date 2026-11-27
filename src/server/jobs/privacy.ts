import { defineJob } from "./registry";
import { clearCachesAfterErasure } from "@/server/privacy/after-erasure";
import { reconcileErasures } from "@/server/privacy/reconcile";
import { REAPPLY_PHRASE } from "@/domain/typed-confirmation";

defineJob({
  key: "erasure-reconcile",
  kind: "setup",
  confirm: { title: "Re-apply every erasure", effect: "Applies every personal-data erasure record to the whole database again, as after restoring a backup. Whatever it finds is erased for good.", phrase: REAPPLY_PHRASE },
  description: "Re-applies every personal-data erasure record to the whole database: after restoring a backup made before an erasure, import the records first (docs/BACKUPS.md). By hand only.",
  defaultIntervalMinutes: null,
  run: async (ctx) => {
    const result = await reconcileErasures(ctx.db, { mode: "full" });
    ctx.log(`${result.records} erasure record(s) applied: ${result.people} account(s) or profile(s) and ${result.traces} set(s) of traces found again and removed`);
    if (result.people || result.traces) clearCachesAfterErasure();
    const unusable = result.unusable ? `${result.unusable} erasure record(s) were made under another UNIIVERSE_AUTH_SECRET and cannot be applied.` : undefined;
    return { ok: true, degraded: !!unusable, error: unusable, summary: { ...result } };
  },
});

/*
  What erasure-reconcile would change, counted, changing nothing (Release 19; OD21 needs it before
  the owner decides whether the daily reconcile should cover more): the same reads as its full mode,
  every stored game and job log, and counts only. A check, run by hand.
*/
defineJob({
  key: "erasure-reconcile-count",
  kind: "check",
  cost: "Reads every stored game's players and every job log line naming an account: run it when you need its answer.",
  description: "Read-only: counts what re-applying every personal-data erasure record would change (accounts or profiles of erased people found again, and their traces in stored games, ranks and old logs), with the same reads as erasure-reconcile, changing nothing. Counts only.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const result = await reconcileErasures(ctx.db, { mode: "count" });
    ctx.log(`${result.records} erasure record(s) checked: ${result.people} account(s) or profile(s) and ${result.traces} set(s) of traces would be removed; nothing changed`);
    const unusable = result.unusable ? `${result.unusable} erasure record(s) were made under another UNIIVERSE_AUTH_SECRET and cannot be checked.` : undefined;
    return { ok: true, degraded: !!unusable, error: unusable, summary: { ...result, wouldRemove: { people: result.people, traces: result.traces }, changed: false } };
  },
});
