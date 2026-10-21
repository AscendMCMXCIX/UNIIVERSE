import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listChampions } from "@/server/repositories/champions";
import { publicRiotDataAllowed } from "@/server/public/access";
import { loadPublicLeaderboardData } from "@/server/public/leaderboards";
import { buildLeaderboardView, parseFilters } from "@/server/leaderboards/view";
import { Leaderboards } from "@/components/leaderboards/leaderboards";

export const dynamic = "force-dynamic";

/**
 * The public Leaderboards: the members' boards among the players the public Team page shows, by
 * display name, linking to no profile. Riot data, so it exists only where the deployment allows
 * Riot data on the public pages (a Production key whose registration describes them); otherwise
 * the address is not found.
 */
export default async function PublicLeaderboardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!publicRiotDataAllowed()) notFound();
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const [data, champions] = await Promise.all([loadPublicLeaderboardData(db, team.id), listChampions(db)]);
  const view = buildLeaderboardView(data, parseFilters(await searchParams, data), null, { basePath: "/public/leaderboards", profiles: false });
  return <Leaderboards view={view} champions={Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]))} />;
}
