import { getAppDb } from "@/server/bootstrap";
import { canEditPlayer, hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { getTeamRoster } from "@/server/team/roster";
import { loadPickerChampions } from "@/server/champions/picker";
import { TeamRoster } from "@/components/team/team-roster";

export const dynamic = "force-dynamic";

/** TEAM: the current main lineup as an esports roster. Everyone else is under Players; settings under Admin. */
export default async function TeamPage() {
  const db = await getAppDb();
  const [team, session] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-team")]);
  const roster = await getTeamRoster(db, team.id);
  const editablePlayerIds = roster.slots.map((s) => s.player?.id).filter((id): id is string => !!id && canEditPlayer(session, id));
  // The full selector data is only needed when this viewer can edit someone's champions here.
  const champions = editablePlayerIds.length > 0 ? await loadPickerChampions(db) : (await listChampions(db)).map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }));
  return (
    <div className="mx-auto flex w-full max-w-[120rem] flex-col lg:min-h-[calc(100dvh-3.5rem)]">
      <TeamRoster slots={roster.slots} complete={roster.complete} champions={champions} canManageLineup={hasPermission(session, "manage-lineup")} editablePlayerIds={editablePlayerIds} viewerPlayerId={session.playerId} />
    </div>
  );
}
