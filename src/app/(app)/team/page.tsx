import { getAppDb } from "@/server/bootstrap";
import { canEditPlayer, hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { getTeamRosterForViewer } from "@/server/team/roster";
import { loadPickerChampions } from "@/server/champions/picker";
import { TeamRoster } from "@/components/team/team-roster";
import { getBranding } from "@/server/repositories/branding";
import { logoSrc, logoStillSrc } from "@/domain/branding";
import { teamFreshness } from "@/server/ops/freshness";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";

export const dynamic = "force-dynamic";

/** TEAM: the current main lineup as an esports roster. Everyone else is under Players; settings under Admin. */
export default async function TeamPage() {
  const db = await getAppDb();
  const [team, session] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-team")]);
  // Statistics follow the profile's rule (own always, teammates with "view teammates' statistics"),
  // enforced in the loader so hidden figures never reach the browser.
  const [roster, branding, version] = await Promise.all([getTeamRosterForViewer(db, team.id, session), getBranding(db), teamFreshness(db)]);
  const editablePlayerIds = roster.slots.map((s) => s.player?.id).filter((id): id is string => !!id && canEditPlayer(session, id));
  // Card Studio (your own card's brush) chooses art from the full champion list; pools are edited on the profile.
  const champions = editablePlayerIds.length > 0 ? await loadPickerChampions(db) : (await listChampions(db)).map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }));
  return (
    <div className="mx-auto flex w-full max-w-[var(--content-wide)] flex-col lg:flex-1">
      {/* New games, ranks and lineup changes appear without a reload. */}
      <FreshnessWatcher scope={{ kind: "team" }} version={version} />
      <TeamRoster team={{ name: branding.teamName, shortName: branding.shortName, logo: logoSrc(branding), logoStill: logoStillSrc(branding) }} slots={roster.slots} complete={roster.complete} champions={champions} canManageLineup={hasPermission(session, "manage-lineup")} canViewPlayers={hasPermission(session, "view-players")} editablePlayerIds={editablePlayerIds} viewerPlayerId={session.playerId} />
    </div>
  );
}
