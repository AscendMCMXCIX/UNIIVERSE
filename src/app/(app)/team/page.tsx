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

export const dynamic = "force-dynamic";

/** TEAM: the current main lineup as an esports roster. Everyone else is under Players; settings under Admin. */
export default async function TeamPage() {
  const db = await getAppDb();
  const [team, session] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-team")]);
  // Statistics follow the profile's rule (own always, teammates with "view teammates' statistics"),
  // enforced in the loader so hidden figures never reach the browser.
  const [roster, branding] = await Promise.all([getTeamRosterForViewer(db, team.id, session), getBranding(db)]);
  const editablePlayerIds = roster.slots.map((s) => s.player?.id).filter((id): id is string => !!id && canEditPlayer(session, id));
  // Card Studio (your own card's brush) chooses art from the full champion list; pools are edited on the profile.
  const champions = editablePlayerIds.length > 0 ? await loadPickerChampions(db) : (await listChampions(db)).map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }));
  return (
    <div className="mx-auto w-full max-w-[var(--content-wide)]">
      <TeamRoster team={{ name: branding.teamName, shortName: branding.shortName, logo: logoSrc(branding), logoStill: logoStillSrc(branding) }} slots={roster.slots} complete={roster.complete} champions={champions} canManageLineup={hasPermission(session, "manage-lineup")} canCreateDraft={hasPermission(session, "create-draft")} canViewPlayers={hasPermission(session, "view-players")} editablePlayerIds={editablePlayerIds} viewerPlayerId={session.playerId} />
    </div>
  );
}
