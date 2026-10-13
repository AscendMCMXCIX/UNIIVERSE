import Link from "next/link";
import { getAppDb } from "@/server/bootstrap";
import { describeAccess, getSession, isOwner } from "@/server/auth/session";
import { defaultPlatform } from "@/server/auth/signup";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { getPlayer } from "@/server/repositories/team";
import { ChangePasswordPanel } from "@/components/settings/change-password-panel";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { RIOT_LEGAL } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/** Settings for everyone: the account, its password, linked Riot accounts and sign-out. Administration lives in Admin Mode. */
export default async function SettingsPage() {
  const session = await getSession();
  const db = await getAppDb();
  const player = session?.playerId ? await getPlayer(db, session.playerId) : null;
  const accounts = player ? await listAccountsForPlayer(db, player.id) : [];
  const owner = isOwner(session);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-fg-muted">Your account and your linked Riot accounts.</p>
      </div>
      <Panel>
        <PanelHeader title="ACCOUNT" subtitle="How you sign in." />
        <PanelBody className="flex flex-wrap items-center gap-3 text-sm">
          <div>
            <div className="font-medium text-fg">{session?.label ?? "—"}</div>
            <div className="text-xs text-fg-subtle">@{session?.username ?? "—"}</div>
          </div>
          {session ? <Badge tone={session.role === "owner" ? "accent" : "neutral"}>{describeAccess({ role: session.role })}</Badge> : null}
          <span className="flex-1" />
          {player ? (
            <Link href={`/players/${player.id}`} className="text-xs text-accent hover:underline">
              My profile (roles and champion pools) →
            </Link>
          ) : null}
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="text-xs text-fg-muted hover:text-fg">
              Sign out
            </button>
          </form>
        </PanelBody>
      </Panel>
      {session?.userId ? <ChangePasswordPanel hasPassword={session.hasPassword} /> : null}
      {player ? <RiotAccountsPanel playerId={player.id} accounts={accounts} riotConfigured={!!process.env.RIOT_API_KEY} defaultPlatform={defaultPlatform()} /> : null}
      {owner ? (
        <Panel className="border-accent/40">
          <PanelHeader title="ADMINISTRATION" subtitle="Users and player accounts, competition settings, data and system health live in Admin Mode." />
          <PanelBody>
            <Link href="/admin/players" className="text-sm text-accent hover:underline">
              Open the Admin area →
            </Link>
          </PanelBody>
        </Panel>
      ) : null}
      <Panel id="compliance">
        <PanelHeader title="ABOUT RIOT DATA" subtitle="The notice Riot requires." />
        <PanelBody className="text-xs text-fg-muted">
          <p>{RIOT_LEGAL}</p>
        </PanelBody>
      </Panel>
    </div>
  );
}
