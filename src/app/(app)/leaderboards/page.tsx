import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { loadLeaderboardData, membersDataStatus } from "@/server/leaderboards/service";
import { buildLeaderboardView, parseFilters } from "@/server/leaderboards/view";
import { buildRecentLeaderboardView, opensRecentFormPreview, parseLeaderboardTab, RECENT_FORM_PREVIEW } from "@/server/leaderboards/recent-view";
import { Leaderboards } from "@/components/leaderboards/leaderboards";
import { RecentLeaderboards } from "@/components/leaderboards/recent-leaderboards";
import { teamFreshness } from "@/server/ops/freshness";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";

export const dynamic = "force-dynamic";

/**
 * TEAM LEADERBOARDS: team members compared on their own Riot games. Teammates' statistics, so
 * the same right as a teammate's season figures (personal-use accounts without the team never
 * hold it; the check runs here on the server, not only in the navigation).
 *
 * The proposed boards (Recent form, Records & achievements: docs/LEADERBOARDS_MODEL.md) await the
 * owner's approval of their rules. Until then administrators can open them on live data with
 * ?preview=recent-form; for everyone else the address opens today's boards, whatever it says.
 */
export default async function LeaderboardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const db = await getAppDb();
  const [team, session] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-teammate-stats")]);
  const [data, champions, version, params] = await Promise.all([loadLeaderboardData(db, team.id), listChampions(db), teamFreshness(db), searchParams]);
  const portraits = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  if (opensRecentFormPreview(session, params)) {
    const request = parseLeaderboardTab(params);
    const view = buildRecentLeaderboardView(data, request, session.playerId, { keep: { preview: RECENT_FORM_PREVIEW } });
    return (
      <>
        <FreshnessWatcher scope={{ kind: "team" }} version={version} />
        <RecentLeaderboards view={view} status={membersDataStatus(data)} champions={portraits} preview />
      </>
    );
  }
  const filters = parseFilters(params, data);
  const view = buildLeaderboardView(data, filters, session.playerId);
  return (
    <>
      <FreshnessWatcher scope={{ kind: "team" }} version={version} />
      <Leaderboards view={view} status={membersDataStatus(data)} champions={portraits} />
    </>
  );
}
