import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { describeAccess, getSession } from "@/server/auth/session";
import { canUseAdminArea } from "@/server/auth/permissions";
import { getUser, avatarUrl } from "@/server/repositories/users";
import { ChangePasswordPanel } from "@/components/settings/change-password-panel";
import { AvatarEditor, UsernameEditor } from "@/components/settings/account-details";
import { RIOT_LEGAL } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { firstAdminPath } from "@/lib/nav";

export const dynamic = "force-dynamic";

/** Account settings for everyone: picture, username, password and sign-out. Administration lives in Admin Mode. */
export default async function SettingsPage() {
  const session = await getSession();
  const db = await getAppDb();
  const user = session?.userId ? await getUser(db, session.userId) : null;
  return (
    <div className="space-y-5">
      {user ? (
        <Panel>
          <PanelHeader title="Profile" subtitle="How teammates see you." actions={<Badge tone={user.role === "owner" ? "accent" : "neutral"}>{describeAccess({ role: user.role })}</Badge>} />
          <PanelBody className="space-y-5">
            <AvatarEditor name={user.username} src={avatarUrl(user.id, user.avatarVersion)} />
            <UsernameEditor username={user.username} />
          </PanelBody>
        </Panel>
      ) : null}
      {session?.userId ? <ChangePasswordPanel hasPassword={session.hasPassword} /> : null}
      <Panel>
        <PanelBody className="flex flex-wrap items-center gap-3">
          {session?.playerId ? (
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
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </PanelBody>
      </Panel>
      <p id="compliance" className="text-xs leading-relaxed text-fg-subtle">
        {RIOT_LEGAL}
      </p>
    </div>
  );
}
