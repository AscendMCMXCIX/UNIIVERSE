import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { canEdit, getSession, isOwner } from "@/server/auth/session";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { PlayerEditor } from "@/components/team/player-editor";

export const dynamic = "force-dynamic";

export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!canEdit(session)) redirect("/team");
  const db = await getAppDb();
  const [team, champions, player] = await Promise.all([getOrCreateTeam(db), listChampions(db), getPlayer(db, id)]);
  if (!player) notFound();
  return <PlayerEditor player={player} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} limits={team.poolLimits} canDelete={isOwner(session)} />;
}
