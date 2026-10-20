import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { describeAccess, getSession } from "@/server/auth/session";
import { canUseAdminArea } from "@/server/auth/permissions";
import { getUser, avatarUrl } from "@/server/repositories/users";
import { ChangePasswordPanel } from "@/components/settings/change-password-panel";
import { AvatarEditor, DisplayNameEditor, UsernameEditor } from "@/components/settings/account-details";
import { currentDisplayName } from "@/server/repositories/profile";
import { riotLegal } from "@/components/app-shell";
import { getBranding } from "@/server/repositories/branding";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { firstAdminPath } from "@/lib/nav";
import { BrowserAccountsPanel } from "@/components/settings/browser-accounts-panel";
import { listOtherAccounts } from "@/server/auth/browser-accounts";
import { MAX_REMEMBERED } from "@/server/auth/account-jar";

export const dynamic = "force-dynamic";

/** Account settings for everyone: picture, display name, username, password and sign-out. Administration lives in Admin Mode. */
export default async function SettingsPage() {
  const session = await getSession();
  const db = await getAppDb();
  const user = session?.userId ? await getUser(db, session.userId) : null;
  const others = user ? await listOtherAccounts(db, user.id) : [];
  const displayName = user ? await currentDisplayName(db, user) : "";
  const branding = await getBranding(db);
  return (
    <div className="space-y-5">
      {user ? (
        <Panel>
          <PanelHeader title="Profile" subtitle="How teammates see you." actions={<Badge tone={user.role === "owner" ? "accent" : "neutral"}>{describeAccess({ role: user.role })}</Badge>} />
          <PanelBody className="space-y-5">
            <AvatarEditor name={displayName} src={avatarUrl(user.id, user.avatarVersion)} />
            <DisplayNameEditor displayName={displayName} />
            <UsernameEditor username={user.username} />
          </PanelBody>
        </Panel>
      ) : null}
      {session?.userId ? <ChangePasswordPanel hasPassword={session.hasPassword} /> : null}
      {user ? <BrowserAccountsPanel current={{ userId: user.id, name: displayName, username: user.username, avatarUrl: avatarUrl(user.id, user.avatarVersion), roleLabel: describeAccess({ role: user.role }) }} others={others} max={MAX_REMEMBERED} /> : null}
      <Panel>
        <PanelBody className="flex flex-wrap items-center gap-3">
          {session?.playerId && !canUseAdminArea(session) ? (
            <>
              <Link href="/overview" className="text-sm text-accent hover:underline">
                My Profile →
              </Link>
              <Link href="/overview/accounts" className="text-sm text-accent hover:underline">
                Riot Accounts →
              </Link>
            </>
          ) : null}
          {canUseAdminArea(session) ? (
            <Link href={firstAdminPath(session)} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
              <ShieldCheck className="h-4 w-4" /> Admin area →
            </Link>
          ) : null}
          <span className="flex-1" />
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg md:min-h-9">
              <LogOut className="h-4 w-4" /> {others.length && user ? `Sign out of ${user.username}` : "Sign out"}
            </button>
          </form>
          {others.length ? (
            <form action="/api/auth/logout?all=1" method="post">
              <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg md:min-h-9">
                <LogOut className="h-4 w-4" /> Sign out of all accounts
              </button>
            </form>
          ) : null}
        </PanelBody>
      </Panel>
      <p id="compliance" className="text-xs leading-relaxed text-fg-subtle">
        {riotLegal(branding.productName)}{" "}
        <Link href="/privacy" className="text-accent underline-offset-2 hover:underline" data-testid="settings-privacy-link">
          What this app stores about you
        </Link>
      </p>
    </div>
  );
}
