import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { canEditPlayer, getSession, hasPermission } from "@/server/auth/session";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { PlayerEditor } from "@/components/team/player-editor";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { listAccountsForPlayer } from "@/server/accounts/repository";

export const dynamic = "force-dynamic";

export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!canEditPlayer(session, id)) redirect("/team");
  const db = await getAppDb();
  const [team, champions, player] = await Promise.all([getOrCreateTeam(db), listChampions(db), getPlayer(db, id)]);
  if (!player) notFound();
  const accounts = await listAccountsForPlayer(db, player.id);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PlayerEditor player={player} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} limits={team.poolLimits} canDelete={hasPermission(session, "manage-team")} selfService={!hasPermission(session, "manage-players")} />
      <RiotAccountsPanel playerId={player.id} accounts={accounts} riotConfigured={!!process.env.RIOT_API_KEY} />
    </div>
  );
}
