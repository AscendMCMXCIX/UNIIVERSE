import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { canEditPlayer, getSession, hasPermission } from "@/server/auth/session";
import { defaultPlatform } from "@/server/auth/signup";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { PlayerEditor } from "@/components/team/player-editor";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { PlayerDataPanel } from "@/components/team/player-data-panel";
import { ErrorBoundary } from "@/components/error-boundary";
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
  const [accounts, report] = await Promise.all([listAccountsForPlayer(db, player.id), getPlayerDataReport(db, player, { riotConfigured }).catch((err: Error) => { console.error(JSON.stringify({ level: "error", event: "player.report.failed", error: err.message })); return null; })]);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const admin = hasPermission(session, "manage-players");
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PlayerEditor player={player} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} limits={team.poolLimits} canDelete={hasPermission(session, "manage-team")} selfService={!admin} />
      <RiotAccountsPanel playerId={player.id} accounts={accounts} riotConfigured={riotConfigured} defaultPlatform={defaultPlatform()} />
      {report ? (
        <ErrorBoundary label="Riot data">
          <PlayerDataPanel report={report} championsById={championsById} admin={admin} playerName={player.displayName} selfView={session?.playerId === player.id} />
        </ErrorBoundary>
      ) : (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">Riot data could not be loaded right now; the rest of the profile works. It has been logged.</p>
      )}
    </div>
  );
}
