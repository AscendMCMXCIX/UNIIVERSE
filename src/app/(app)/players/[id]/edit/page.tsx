import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { canEditPlayer, getSession, hasPermission } from "@/server/auth/session";
import { defaultPlatform } from "@/server/auth/signup";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { PlayerEditor } from "@/components/team/player-editor";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";

export const dynamic = "force-dynamic";

/** Roles, champion pools, notes and Riot accounts: the profile's owner and admins only (checked here and again in every action). */
export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!canEditPlayer(session, id)) redirect(`/players/${id}`);
  const db = await getAppDb();
  const [team, champions, player] = await Promise.all([getOrCreateTeam(db), listChampions(db), getPlayer(db, id)]);
  if (!player) notFound();
  const accounts = await listAccountsForPlayer(db, player.id);
  const admin = hasPermission(session, "manage-players");
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href={`/players/${player.id}`} className="inline-block text-xs text-fg-muted hover:text-fg">
        ← Back to {session?.playerId === player.id ? "my profile" : `${player.displayName}'s profile`}
      </Link>
      <div id="pools">
        <PlayerEditor player={player} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} limits={team.poolLimits} canDelete={hasPermission(session, "manage-team")} selfService={!admin} />
      </div>
      <div id="riot-accounts">
        <RiotAccountsPanel playerId={player.id} accounts={accounts} riotConfigured={!!process.env.RIOT_API_KEY} defaultPlatform={defaultPlatform()} />
      </div>
    </div>
  );
}
