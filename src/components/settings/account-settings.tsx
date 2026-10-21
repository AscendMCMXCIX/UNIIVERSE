import Link from "next/link";
import { Gamepad2, LogOut, ShieldCheck } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { describeAccess, getSession } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";
import { getUser, avatarUrl } from "@/server/repositories/users";
import { ChangePasswordPanel } from "@/components/settings/change-password-panel";
import { AvatarEditor, DisplayNameEditor, UsernameEditor } from "@/components/settings/account-details";
import { currentDisplayName, loadSocialLinks } from "@/server/repositories/profile";
import { SocialLinksEditor } from "@/components/settings/social-links-editor";
import { riotLegal } from "@/components/app-shell";
import { getBranding } from "@/server/repositories/branding";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

/**
 * Account settings for everyone: picture, display name, username, password and sign-out. The same
 * page in both modes (/settings, and /admin/settings so an administrator need not leave Admin
 * Mode); administration itself lives in Admin Mode. Administrators also find the switch between
 * the modes here; nobody else sees Admin Mode named.
 */
export async function AccountSettings({ mode }: { mode: "player" | "admin" }) {
  const session = await getSession();
  const db = await getAppDb();
  const user = session?.userId ? await getUser(db, session.userId) : null;
  const displayName = user ? await currentDisplayName(db, user) : "";
  const branding = await getBranding(db);
  return (
    <div className="space-y-5">
      {user ? (
        <Panel>
          <PanelHeader title="Profile" subtitle="How teammates see you." actions={<Badge tone={user.role === "owner" || user.isAdmin ? "accent" : "neutral"}>{describeAccess({ role: user.role, isAdmin: user.isAdmin })}</Badge>} />
          <PanelBody className="space-y-5">
            <AvatarEditor name={displayName} src={avatarUrl(user.id, user.avatarVersion)} />
            <DisplayNameEditor displayName={displayName} />
            <UsernameEditor username={user.username} />
            {user.playerId ? <SocialLinksEditor initial={(await loadSocialLinks(db, [user.playerId])).get(user.playerId) ?? null} /> : null}
          </PanelBody>
        </Panel>
      ) : null}
      {session?.userId ? <ChangePasswordPanel hasPassword={session.hasPassword} /> : null}
      <Panel>
        <PanelBody className="flex flex-wrap items-center gap-3">
          {session?.playerId && mode === "player" ? (
            <>
              <Link href="/overview" className="touch-target inline-flex min-h-6 items-center text-sm text-accent hover:underline">
                My Profile →
              </Link>
              <Link href="/overview/accounts" className="touch-target inline-flex min-h-6 items-center text-sm text-accent hover:underline">
                Riot Accounts →
              </Link>
            </>
          ) : null}
          {/* Plain links to the switch route (never prefetched): it checks the account again. */}
          {isAdmin(session) && mode === "player" ? (
            <a href="/api/mode?to=admin" className="touch-target inline-flex min-h-6 items-center gap-1.5 text-sm text-accent hover:underline" data-testid="settings-mode-switch">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Switch to Admin Mode →
            </a>
          ) : null}
          {isAdmin(session) && mode === "admin" ? (
            <a href="/api/mode?to=player" className="touch-target inline-flex min-h-6 items-center gap-1.5 text-sm text-accent hover:underline" data-testid="settings-mode-switch">
              <Gamepad2 className="h-4 w-4" aria-hidden /> Return to Player Mode →
            </a>
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
        {riotLegal(branding.productName)}{" "}
        <Link href="/privacy" className="text-accent underline-offset-2 hover:underline" data-testid="settings-privacy-link">
          What this app stores about you
        </Link>
      </p>
    </div>
  );
}
