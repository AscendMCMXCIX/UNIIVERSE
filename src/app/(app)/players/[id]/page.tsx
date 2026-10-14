import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { canEditPlayer, getSession } from "@/server/auth/session";
import { canManageRiotAccounts } from "@/server/auth/permissions";
import { defaultPlatform } from "@/server/auth/signup";
import { getOrCreateTeam, getPlayer, profileVersion } from "@/server/repositories/team";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { loadPickerChampions } from "@/server/champions/picker";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/**
 * Profile tab: roles and champion pools, edited right here by the player (or an admin) with
 * autosave, read-only for everyone else; and the linked Riot accounts.
 */
export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getAppDb();
  const [session, team, player, champions, accounts] = await Promise.all([getSession(), getOrCreateTeam(db), getPlayer(db, id), loadPickerChampions(db), listAccountsForPlayer(db, id)]);
  if (!player) notFound();
  const editable = canEditPlayer(session, player.id);
  const self = session?.playerId === player.id;
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="Roles & champion pools" subtitle={`Only pool champions are ever recommended for ${self ? "you" : player.displayName}.${editable ? " Changes save automatically." : ""}`} />
        <PanelBody>
          <ProfileEditor
            playerId={player.id}
            initial={{ primaryRole: player.primaryRole, secondaryRole: player.secondaryRole, primaryPool: player.primaryPool, secondaryPool: player.secondaryPool }}
            version={profileVersion(player)}
            champions={champions}
            limits={team.poolLimits}
            editable={editable}
          />
        </PanelBody>
      </Panel>
      <RiotAccountsPanel playerId={player.id} accounts={accounts} riotConfigured={!!process.env.RIOT_API_KEY} defaultPlatform={defaultPlatform()} editable={canManageRiotAccounts(session, player.id)} title="Riot accounts" />
    </div>
  );
}
