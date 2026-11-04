import { clearLocalCaches, invalidateCache } from "@/server/observability/cache";
import { invalidatePublicTeam } from "@/server/public/team";

/*
  What an erasure (or re-applying the records) clears on this server instance, so that no cache
  here keeps the person: the team and shell facts, the public page and leaderboards, the bytes of
  the public pictures and banners, and every module's own results (clearLocalCaches). Other
  instances follow within their cache times. One list for the administrator's actions and the
  job, so the two cannot drift apart.
*/
export function clearCachesAfterErasure(): void {
  invalidateCache("team");
  invalidateCache("shell-facts");
  invalidateCache("public-image");
  invalidatePublicTeam();
  clearLocalCaches();
}
