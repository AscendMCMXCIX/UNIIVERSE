import Link from "next/link";
import { CircleUserRound, Gamepad2, Link2, LogOut, ShieldCheck } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { describeAccess, getSession } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";
import { getUser, avatarUrl } from "@/server/repositories/users";
import { ChangePasswordPanel } from "@/components/settings/change-password-panel";
import { AccountPicture, DisplayNameEditor, SettingsIndex, UsernameEditor } from "@/components/settings/account-details";
import { currentDisplayName, loadSocialLinks } from "@/server/repositories/profile";
import { SocialLinksEditor } from "@/components/settings/social-links-editor";
import { riotLegal } from "@/components/app-shell";
import { getBranding } from "@/server/repositories/branding";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

/**
 * A quiet action in the account card: a line of text on a phone and in a window 480px tall or less
 * (a 44px target on a touch screen), a row of the card from md in a taller window.
 */
const ACTION = cn(
  "touch-target inline-flex min-h-6 items-center gap-1.5 text-sm text-fg-muted hover:text-fg",
  "md:not-short:flex md:not-short:min-h-9 md:not-short:w-full md:not-short:rounded-md md:not-short:px-2 md:not-short:hover:bg-surface-2 md:not-short:pointer-coarse:min-h-11",
);
const ACTION_ICON = "h-4 w-4 shrink-0 text-fg-subtle";

/*
  Where each part of the account card sits in its grid (two columns: the picture's, and the rest):
    phone (upright)       the picture beside who you are; Change and Remove; the help; the actions
                          (My Profile, Riot Accounts, the mode switch, Sign out) as one row of quiet
                          links; the index as chips;
    480px tall or less    the same, the actions right under who you are, so Sign out stays on the
                          first screen of a phone held sideways;
    from md, taller       the 80px picture with Change and Remove beside it; who you are; the help;
                          the index down the card; the actions as rows.
  The card's DOM order is the last one's (the keyboard's order on a desktop).
*/
const CARD_CELLS = {
  avatar: "col-start-1 row-start-1",
  identity: "col-start-2 row-start-1 md:not-short:col-span-2 md:not-short:col-start-1 md:not-short:row-start-2",
  buttons: "col-span-2 col-start-1 row-start-2 short:row-start-3 md:not-short:col-span-1 md:not-short:col-start-2 md:not-short:row-start-1 md:not-short:flex-col",
  help: "col-span-2 col-start-1 row-start-3 short:row-start-4 md:not-short:row-start-3",
  index: "col-span-2 col-start-1 row-start-5 md:not-short:row-start-4 md:not-short:border-t md:not-short:border-border md:not-short:pt-3",
  actions: "col-span-2 col-start-1 row-start-4 short:row-start-2 md:not-short:row-start-5 md:not-short:border-t md:not-short:border-border md:not-short:pt-3",
};

/**
 * Account settings for everyone: picture, display name, username, social links, password and
 * sign-out. The same page in both modes (/settings, and /admin/settings so an administrator need
 * not leave Admin Mode), 64rem wide; administration itself lives in Admin Mode. Administrators also
 * find the switch between the modes here; nobody else sees Admin Mode named.
 *
 * The account card leads (surface-lead): the picture with Change and Remove, the name, @username
 * and the role, the index of the sections (the one being read marked), My Profile and Riot
 * Accounts, the mode switch and Sign out. From sm it is a column of its own (15rem, 16rem from lg;
 * a phone held sideways is sm), sticky under the bar from md in a window taller than 480px; on a
 * phone, and in a window 480px tall or less, it is compact, its actions a row of quiet links and its
 * index a row of chips, so Sign out is on the first screen everywhere.
 * The sections follow: Name & username (side by side from xl, each field with its own Save), Social
 * links (members with a player profile), Password, then Riot's notice (#compliance).
 */
export async function AccountSettings({ mode }: { mode: "player" | "admin" }) {
  const session = await getSession();
  const db = await getAppDb();
  const user = session?.userId ? await getUser(db, session.userId) : null;
  const displayName = user ? await currentDisplayName(db, user) : "";
  const branding = await getBranding(db);
  const social = user?.playerId ? ((await loadSocialLinks(db, [user.playerId])).get(user.playerId) ?? null) : undefined;
  const profileLinks = !!session?.playerId && mode === "player";
  const sections = [...(user ? [{ id: "name", label: "Name" }] : []), ...(social !== undefined ? [{ id: "links", label: "Links" }] : []), ...(session?.userId ? [{ id: "password", label: "Password" }] : [])];
  return (
    <div className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-[15rem_minmax(0,1fr)] sm:grid-rows-[auto_1fr] sm:gap-x-5 sm:gap-y-4 md:gap-x-6 md:gap-y-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <PageHeader className="sm:col-start-2 sm:row-start-1" title="Settings" description="Your picture, display name, username and password." guide />

      <section aria-label="Your account" className="surface-lead grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 rounded-panel border border-border bg-surface p-3 sm:col-start-1 sm:row-span-2 sm:row-start-1 sm:self-start sm:p-4 md:not-short:sticky md:not-short:top-[calc(var(--bar-top)+1rem)] md:not-short:gap-y-3" data-testid="settings-account">
        {user ? (
          <AccountPicture name={displayName} src={avatarUrl(user.id, user.avatarVersion)} cells={CARD_CELLS}>
            <p className="text-lg font-semibold leading-tight text-fg [overflow-wrap:anywhere]" data-testid="settings-name">
              {displayName}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
              <span className="min-w-0 [overflow-wrap:anywhere]" data-testid="settings-username">
                @{user.username}
              </span>
              <Badge tone="neutral">{describeAccess({ role: user.role, isAdmin: user.isAdmin })}</Badge>
            </p>
          </AccountPicture>
        ) : null}
        {sections.length > 1 ? (
          <div className={CARD_CELLS.index}>
            <SettingsIndex items={sections} />
          </div>
        ) : null}
        <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 md:not-short:flex-col md:not-short:items-stretch md:not-short:gap-0.5", CARD_CELLS.actions)} data-testid="settings-actions">
          {profileLinks ? (
            <>
              <li>
                <Link href="/overview" className={ACTION}>
                  <CircleUserRound className={ACTION_ICON} aria-hidden /> My Profile
                </Link>
              </li>
              <li>
                <Link href="/overview/accounts" className={ACTION}>
                  <Link2 className={ACTION_ICON} aria-hidden /> Riot Accounts
                </Link>
              </li>
            </>
          ) : null}
          {/* Plain links to the switch route (never prefetched): it checks the account again. */}
          {isAdmin(session) ? (
            <li>
              {mode === "player" ? (
                <a href="/api/mode?to=admin" className={ACTION} data-testid="settings-mode-switch">
                  <ShieldCheck className={ACTION_ICON} aria-hidden /> Switch to Admin Mode
                </a>
              ) : (
                <a href="/api/mode?to=player" className={ACTION} data-testid="settings-mode-switch">
                  <Gamepad2 className={ACTION_ICON} aria-hidden /> Return to Player Mode
                </a>
              )}
            </li>
          ) : null}
          <li>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className={ACTION} data-testid="settings-sign-out">
                <LogOut className={ACTION_ICON} aria-hidden /> Sign out
              </button>
            </form>
          </li>
        </ul>
      </section>

      <div className="min-w-0 space-y-4 sm:col-start-2 sm:row-start-2 md:space-y-5">
        {user ? (
          <Panel id="name" className="lg:scroll-mt-6">
            <PanelHeader title="Name & username" />
            <PanelBody className="grid gap-4 xl:grid-cols-2 xl:gap-5">
              <DisplayNameEditor displayName={displayName} />
              <UsernameEditor username={user.username} />
            </PanelBody>
          </Panel>
        ) : null}
        {social !== undefined ? (
          <Panel id="links" className="lg:scroll-mt-6">
            <PanelHeader title="Social links" />
            <PanelBody>
              <SocialLinksEditor initial={social} titled={false} />
            </PanelBody>
          </Panel>
        ) : null}
        {session?.userId ? <ChangePasswordPanel hasPassword={session.hasPassword} className="lg:scroll-mt-6" /> : null}
        <p id="compliance" className="text-xs leading-snug text-fg-subtle sm:leading-relaxed lg:scroll-mt-6">
          {riotLegal(branding.productName)}{" "}
          <Link href="/privacy" className="text-accent underline-offset-2 hover:underline" data-testid="settings-privacy-link">
            Privacy: what this app stores about you, and how to ask for it to be corrected or removed
          </Link>
        </p>
      </div>
    </div>
  );
}
