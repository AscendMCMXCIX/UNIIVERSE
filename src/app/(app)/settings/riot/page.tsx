import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { canManageRiotAccounts } from "@/server/auth/permissions";
import { defaultPlatform } from "@/server/auth/signup";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { Panel, PanelBody } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/** Your linked Riot accounts: add, change, remove; statuses update by themselves. */
export default async function RiotSettingsPage() {
  const session = await getSession();
  if (!session?.playerId) {
    return (
      <Panel>
        <PanelBody className="text-sm text-fg-muted">This account has no player profile, so it has no Riot accounts to manage.</PanelBody>
      </Panel>
    );
  }
  const accounts = await listAccountsForPlayer(await getAppDb(), session.playerId);
  return <RiotAccountsPanel playerId={session.playerId} accounts={accounts} riotConfigured={!!process.env.RIOT_API_KEY} defaultPlatform={defaultPlatform()} editable={canManageRiotAccounts(session, session.playerId)} />;
}
