import Link from "next/link";
import { getSession, hasPermission } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { PlayerEditor } from "@/components/team/player-editor";
import { ChangePasswordPanel } from "@/components/settings/change-password-panel";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/** A teammate's own profile: roles, pools, Riot accounts, password. */
export default async function MePage() {
  const session = await getSession();
  const db = await getAppDb();
  const [team, champions] = await Promise.all([getOrCreateTeam(db), listChampions(db)]);
  const player = session?.playerId ? await getPlayer(db, session.playerId) : null;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {player ? (
        <PlayerEditor player={player} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} limits={team.poolLimits} canDelete={false} selfService={!hasPermission(session, "manage-players")} />
      ) : (
        <Panel>
          <PanelHeader title="MY PROFILE" />
          <PanelBody className="text-sm text-fg-muted">
            Your account is not linked to a player profile yet. {hasPermission(session, "manage-users") ? <>Link one under <Link href="/settings" className="text-accent">Settings → Team members</Link>.</> : "Ask the owner to link your account to your player profile."}
          </PanelBody>
        </Panel>
      )}
      {session?.userId && session.email ? <ChangePasswordPanel /> : null}
    </div>
  );
}
