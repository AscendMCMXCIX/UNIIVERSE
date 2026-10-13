import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { canEditPlayer, getSession, hasPermission } from "@/server/auth/session";
import { defaultPlatform } from "@/server/auth/signup";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { PlayerEditor } from "@/components/team/player-editor";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { PlayerDataPanel } from "@/components/team/player-data-panel";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { getPlayerDataReport } from "@/server/proficiency/provenance";

export const dynamic = "force-dynamic";

export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!canEditPlayer(session, id)) redirect("/team");
  const db = await getAppDb();
  const [team, champions, player] = await Promise.all([getOrCreateTeam(db), listChampions(db), getPlayer(db, id)]);
  if (!player) notFound();
  const riotConfigured = !!process.env.RIOT_API_KEY;
  const [accounts, report] = await Promise.all([listAccountsForPlayer(db, player.id), getPlayerDataReport(db, player, { riotConfigured })]);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const admin = hasPermission(session, "manage-players");
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PlayerEditor player={player} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} limits={team.poolLimits} canDelete={hasPermission(session, "manage-team")} selfService={!admin} />
      <RiotAccountsPanel playerId={player.id} accounts={accounts} riotConfigured={riotConfigured} defaultPlatform={defaultPlatform()} />
      <PlayerDataPanel report={report} championsById={championsById} admin={admin} playerName={player.displayName} selfView={session?.playerId === player.id} />
    </div>
  );
}
