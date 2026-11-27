import { clearLocalCaches, invalidateCache } from "@/server/observability/cache";
import { invalidatePublicTeam } from "@/server/public/team";
import { forgetChampionBuilds } from "@/server/champion-builds/load";
import { forgetLaneMatchups } from "@/server/matchup/lane-evidence";
import { forgetMatchupQueue } from "@/server/matchup/queue";

/*
  What an erasure (or re-applying the records) clears on this server instance, so that no cache
  here keeps the person: the team and shell facts, the public page and leaderboards, the bytes of
  the public pictures and banners, and every module's own results (clearLocalCaches); and Champion
  Intel's build totals, Matchup Intel's lane games and its curation queue in Next's data cache,
  shared by every instance (forgetChampionBuilds, forgetLaneMatchups, forgetMatchupQueue). Other
  instances follow within their cache times. One list for the administrator's actions and the
  jobs that re-apply the records (the integrity job's daily pass among them), so they cannot
  drift apart.
*/
export function clearCachesAfterErasure(): void {
  invalidateCache("team");
  invalidateCache("shell-facts");
  invalidateCache("public-image");
  invalidatePublicTeam();
  clearLocalCaches();
  forgetChampionBuilds();
  forgetLaneMatchups();
  forgetMatchupQueue();
}
