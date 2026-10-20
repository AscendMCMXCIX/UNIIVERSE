import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listChampions } from "@/server/repositories/champions";
import { loadPublicTeam } from "@/server/public/team";
import { TeamRoster } from "@/components/team/team-roster";

export const dynamic = "force-dynamic";

/** The public Team Overview: the same lineup cards as the team's own page, built from the public allowlist only. */
export default async function PublicTeamPage() {
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const [view, champions] = await Promise.all([loadPublicTeam(db, team.id), listChampions(db)]);
  return (
    <div className="flex w-full flex-col lg:flex-1">
      <TeamRoster team={view.team} slots={view.slots} complete={view.complete} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }))} canManageLineup={false} canViewPlayers={false} editablePlayerIds={[]} viewerPlayerId={null} guest={{ profileBase: null }} />
    </div>
  );
}
