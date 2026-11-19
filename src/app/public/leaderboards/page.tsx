import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listChampions } from "@/server/repositories/champions";
import { publicRiotDataAllowed } from "@/server/public/access";
import { loadPublicLeaderboardData } from "@/server/public/leaderboards";
import { buildLeaderboardsView, parseLeaderboardsQuery } from "@/server/leaderboards/recent-view";
import { LeaderboardsDashboard } from "@/components/leaderboards/leaderboards-dashboard";

export const dynamic = "force-dynamic";

/**
 * The public Leaderboards: the members' page (Recent form, the season's records and achievements)
 * among the players the public Team page shows, by display name, linking to no profile or game.
 * Riot data, so it exists only where the deployment allows Riot data on the public pages (a
 * Production key whose registration describes them); otherwise the address is not found.
 */
export default async function PublicLeaderboardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!publicRiotDataAllowed()) notFound();
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const [data, champions, params] = await Promise.all([loadPublicLeaderboardData(db, team.id), listChampions(db), searchParams]);
  const view = buildLeaderboardsView(data, parseLeaderboardsQuery(params), null, { basePath: "/public/leaderboards", profiles: false });
  return <LeaderboardsDashboard view={view} champions={Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]))} />;
}
