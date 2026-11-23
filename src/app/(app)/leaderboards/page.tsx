import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { loadLeaderboardData, membersDataStatus } from "@/server/leaderboards/service";
import { buildLeaderboardsView, parseLeaderboardsQuery, recordsSeason } from "@/server/leaderboards/recent-view";
import { loadMultikillBaseline } from "@/server/leaderboards/multikill-baseline";
import { LeaderboardsDashboard } from "@/components/leaderboards/leaderboards-dashboard";
import { teamFreshness } from "@/server/ops/freshness";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";

export const dynamic = "force-dynamic";

/**
 * TEAM LEADERBOARDS: team members compared on their own Riot games (docs/LEADERBOARDS_MODEL.md),
 * on one page: Recent form, each member's latest 20 Summoner's Rift games, and the season's records
 * and achievements, both built from the one load of the team's data (cached per team; no query of
 * their own), and the multikill score's comparison (one cached aggregate query, multikill-baseline). Teammates' statistics, so the same right as a teammate's season figures (personal-use
 * accounts without the team never hold it; the check runs here on the server, not only in the
 * navigation).
 */
export default async function LeaderboardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const db = await getAppDb();
  const [team, session] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-teammate-stats")]);
  const [data, champions, version, params] = await Promise.all([loadLeaderboardData(db, team.id), listChampions(db), teamFreshness(db), searchParams]);
  const query = parseLeaderboardsQuery(params);
  // The multikill score's comparison for the records' season (cached; aggregates of the other players in the same games).
  const multikillBaseline = await loadMultikillBaseline(db, team.id, data, recordsSeason(data, query));
  const view = buildLeaderboardsView(data, query, session.playerId, { multikillBaseline });
  return (
    <>
      <FreshnessWatcher scope={{ kind: "team" }} version={version} />
      <LeaderboardsDashboard view={view} peekable={data.players.filter((p) => p.primaryRole).map((p) => p.id)} status={membersDataStatus(data)} champions={Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]))} />
    </>
  );
}
