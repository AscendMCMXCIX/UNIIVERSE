import { defineJob } from "./registry";
import { clearLocalCaches, invalidateCache } from "@/server/observability/cache";
import { invalidatePublicTeam } from "@/server/public/team";
import { reconcileErasures } from "@/server/privacy/reconcile";

defineJob({
  key: "erasure-reconcile",
  description: "Re-applies every personal-data erasure record to the whole database: after restoring a backup made before an erasure, import the records first (docs/BACKUPS.md). By hand only.",
  defaultIntervalMinutes: null,
  run: async (ctx) => {
    const result = await reconcileErasures(ctx.db, { mode: "full" });
    ctx.log(`${result.records} erasure record(s) applied: ${result.people} account(s) or profile(s) and ${result.traces} set(s) of traces found again and removed`);
    if (result.people || result.traces) {
      invalidateCache("team");
      invalidateCache("shell-facts");
      invalidatePublicTeam();
      clearLocalCaches();
    }
    const unusable = result.unusable ? `${result.unusable} erasure record(s) were made under another UNIIVERSE_AUTH_SECRET and cannot be applied.` : undefined;
    return { ok: true, degraded: !!unusable, error: unusable, summary: { ...result } };
  },
});
