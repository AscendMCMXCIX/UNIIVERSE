import { getSession, hasPermission } from "@/server/auth/session";
import { defaultPlatform } from "@/server/auth/signup";
import { getAppDb } from "@/server/bootstrap";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { PlayerEditor } from "@/components/team/player-editor";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { ChangePasswordPanel } from "@/components/settings/change-password-panel";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";

export const dynamic = "force-dynamic";

/** A teammate's own profile: roles, pools, Riot accounts, password. */
export default async function MePage() {
  const session = await getSession();
  const db = await getAppDb();
  const [team, champions] = await Promise.all([getOrCreateTeam(db), listChampions(db)]);
  const player = session?.playerId ? await getPlayer(db, session.playerId) : null;
  const accounts = player ? await listAccountsForPlayer(db, player.id) : [];
  const platform = defaultPlatform();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {session?.userId && !session.hasPassword ? <ChangePasswordPanel hasPassword={false} /> : null}
      {player ? (
        <>
          <PlayerEditor player={player} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} limits={team.poolLimits} canDelete={false} selfService={!hasPermission(session, "manage-players")} />
          <RiotAccountsPanel playerId={player.id} accounts={accounts} riotConfigured={!!process.env.RIOT_API_KEY} defaultPlatform={platform} />
        </>
      ) : session?.userId ? (
        <CompleteProfileForm defaultPlatform={platform} />
      ) : null}
      {session?.userId && session.hasPassword ? <ChangePasswordPanel hasPassword /> : null}
    </div>
  );
}
