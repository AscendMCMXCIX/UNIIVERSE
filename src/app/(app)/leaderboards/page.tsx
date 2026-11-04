import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { loadLeaderboardData, membersDataStatus } from "@/server/leaderboards/service";
import { buildRecentLeaderboardView, parseLeaderboardTab } from "@/server/leaderboards/recent-view";
import { RecentLeaderboards } from "@/components/leaderboards/recent-leaderboards";
import { teamFreshness } from "@/server/ops/freshness";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";

export const dynamic = "force-dynamic";

/**
 * TEAM LEADERBOARDS: team members compared on their own Riot games (docs/LEADERBOARDS_MODEL.md):
 * Recent form, each member's latest 20 Summoner's Rift games, and Records & achievements for the
 * season. Teammates' statistics, so the same right as a teammate's season figures (personal-use
 * accounts without the team never hold it; the check runs here on the server, not only in the
 * navigation).
 */
export default async function LeaderboardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const db = await getAppDb();
  const [team, session] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-teammate-stats")]);
  const [data, champions, version, params] = await Promise.all([loadLeaderboardData(db, team.id), listChampions(db), teamFreshness(db), searchParams]);
  const view = buildRecentLeaderboardView(data, parseLeaderboardTab(params), session.playerId);
  return (
    <>
      <FreshnessWatcher scope={{ kind: "team" }} version={version} />
      <RecentLeaderboards view={view} status={membersDataStatus(data)} champions={Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]))} />
    </>
  );
}
