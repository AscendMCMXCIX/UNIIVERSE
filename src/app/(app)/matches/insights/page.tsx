import { redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { hasPermission } from "@/server/auth/session";
import { getOrCreateTeam } from "@/server/repositories/team";
import { loadTeamInsights } from "@/server/matches/team-insights";
import { TEAM_INSIGHTS_AUDIENCE, buildTeamInsightsPage, canOpenTeamInsights } from "@/server/matches/team-insights-view";
import { TeamInsights } from "@/components/matches/team-insights";
import { teamFreshness } from "@/server/ops/freshness";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";

export const dynamic = "force-dynamic";

/**
 * Team → Matches → Insights (docs/TEAM_INSIGHTS.md): what the team's own games say about playing
 * together, and which of it is more than chance. Teammates' results, so the same rights as Played
 * Together (team matches and teammates' statistics), checked here on the server. While it is a
 * preview only administrators open it; anyone else is sent to Team → Matches.
 */
export default async function TeamInsightsPage() {
  const session = await requirePageAccess("view-matches");
  if (!hasPermission(session, "view-teammate-stats") || !canOpenTeamInsights(session)) redirect("/matches");
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const [view, version] = await Promise.all([loadTeamInsights(db, team.id), teamFreshness(db)]);
  return (
    <>
      <FreshnessWatcher scope={{ kind: "team" }} version={version} />
      <TeamInsights view={buildTeamInsightsPage(view)} preview={TEAM_INSIGHTS_AUDIENCE === "admins"} />
    </>
  );
}
