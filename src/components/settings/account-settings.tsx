import Link from "next/link";
import { OnThisDevice } from "@/components/settings/on-this-device";
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

const ACTION_ICON = "h-4 w-4 shrink-0 text-fg-subtle";

/**
 * The account card's actions: My Profile and Riot Accounts (Player Mode, with a player profile), the
 * switch between the modes (administrators) and Sign out. Two copies, one shown at a time, each
 * where it is drawn in the card's reading order (the other is display: none, so neither the keyboard
 * nor a screen reader meets it):
 *   "quiet"   on a phone and in a window 480px tall or less: a row of quiet links right under who you
 *             are, 44px targets on a touch screen; wrapped lines are 12px apart (as the base had), so a
 *             link's touch area stops short of the link drawn above or below it;
 *   "rows"    from md in a taller window: rows at the card's end, after its index.
 */
function AccountActions({ variant, profileLinks, modeSwitch }: { variant: "quiet" | "rows"; profileLinks: boolean; modeSwitch: "player" | "admin" | null }) {
  const item = variant === "quiet" ? "touch-target inline-flex min-h-6 items-center gap-1.5 text-sm text-fg-muted hover:text-fg" : "flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg pointer-coarse:min-h-11";
  return (
    <ul
      className={variant === "quiet" ? "col-span-2 flex flex-wrap items-center gap-x-3 gap-y-3 md:not-short:hidden" : "col-span-2 hidden flex-col gap-0.5 border-t border-border pt-3 md:not-short:flex"}
      data-testid="settings-actions"
    >
      {profileLinks ? (
        <>
          <li>
            <Link href="/overview" className={item}>
              <CircleUserRound className={ACTION_ICON} aria-hidden /> My Profile
            </Link>
          </li>
          <li>
            <Link href="/overview/accounts" className={item}>
              <Link2 className={ACTION_ICON} aria-hidden /> Riot Accounts
            </Link>
          </li>
        </>
      ) : null}
      {/* Plain links to the switch route (never prefetched): it checks the account again. */}
      {modeSwitch ? (
        <li>
          {modeSwitch === "player" ? (
            <a href="/api/mode?to=admin" className={item} data-testid="settings-mode-switch">
              <ShieldCheck className={ACTION_ICON} aria-hidden /> Switch to Admin Mode
            </a>
          ) : (
            <a href="/api/mode?to=player" className={item} data-testid="settings-mode-switch">
              <Gamepad2 className={ACTION_ICON} aria-hidden /> Return to Player Mode
            </a>
          )}
        </li>
      ) : null}
      <li>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className={item} data-testid="settings-sign-out">
            <LogOut className={ACTION_ICON} aria-hidden /> Sign out
          </button>
        </form>
      </li>
    </ul>
  );
}

/**
 * Account settings for everyone: picture, display name, username, social links, password and
 * sign-out. The same page in both modes (/settings, and /admin/settings so an administrator need
 * not leave Admin Mode), 64rem wide; administration itself lives in Admin Mode. Administrators also
 * find the switch between the modes here; nobody else sees Admin Mode named.
 *
 * The account card leads (surface-lead), drawn in its reading order at every size: the picture
 * and who you are (the name, @username and the role: beside the picture on a phone and in a window
 * 480px tall or less, under it from md in a taller window and at a larger text size, AccountPicture);
 * on a phone and in a window 480px tall or less, its actions as a row of quiet links (My Profile,
 * Riot Accounts, the mode switch, Sign out), so Sign out is on the first screen; Change and Remove;
 * what the picture is for; the index of the sections (SectionIndex: chips there, a list from md in a
 * taller window); from md in a taller window the actions as rows at the end. From sm the card is a
 * column of its own (15rem, 16rem from lg; a phone held sideways is sm), sticky under the bar from md
 * in a window taller than 480px.
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
  const modeSwitch = isAdmin(session) ? mode : null;
  const sections = [...(user ? [{ id: "name", label: "Name" }] : []), ...(social !== undefined ? [{ id: "links", label: "Links" }] : []), ...(session?.userId ? [{ id: "password", label: "Password" }] : []), { id: "device", label: "This device" }];
  return (
    // Two columns only where the page has room for them in rem (36rem: at the usual size from sm, as
    // before), and the account column at most 40% of it: at 175–200% text on a tablet or desktop the
    // 15–16rem column left the panels too little room (a sideways scroll, Release 7's report), and
    // beside a 16rem sidebar the page is about 12rem at 1024 × 200%. With less, one column, as a phone's.
    <div className="@container/settings">
      <div className="grid max-w-5xl gap-3 sm:@min-[36rem]/settings:grid-cols-[min(15rem,40%)_minmax(0,1fr)] sm:@min-[36rem]/settings:grid-rows-[auto_1fr] sm:gap-x-5 sm:gap-y-4 md:gap-x-6 md:gap-y-5 lg:@min-[36rem]/settings:grid-cols-[min(16rem,40%)_minmax(0,1fr)]">
      <PageHeader className="sm:@min-[36rem]/settings:col-start-2 sm:@min-[36rem]/settings:row-start-1 lg:@min-[36rem]/settings:col-span-2 lg:@min-[36rem]/settings:col-start-1" title="Settings" description="Your picture, display name, username and password." guide />

      <section aria-label="Your account" className="surface-lead @container grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-panel border border-border bg-surface p-3 sm:@min-[36rem]/settings:col-start-1 sm:@min-[36rem]/settings:row-span-2 sm:@min-[36rem]/settings:row-start-1 sm:@min-[36rem]/settings:self-start lg:@min-[36rem]/settings:row-span-1 lg:@min-[36rem]/settings:row-start-2 sm:p-4 md:not-short:@min-[36rem]/settings:sticky md:not-short:@min-[36rem]/settings:top-[calc(var(--bar-top)+1rem)]" data-testid="settings-account">
        {user ? (
          <AccountPicture name={displayName} seed={user.id} src={avatarUrl(user.id, user.avatarVersion)} afterIdentity={<AccountActions variant="quiet" profileLinks={profileLinks} modeSwitch={modeSwitch} />}>
            <p className="text-lg font-semibold leading-tight text-fg [overflow-wrap:anywhere]" data-testid="settings-name">
              {displayName}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
              <span className="min-w-0 [overflow-wrap:anywhere]" data-testid="settings-username">
                @{user.username}
              </span>
              <span className="shrink-0" data-testid="settings-role">
                <Badge tone="neutral">{describeAccess({ role: user.role, isAdmin: user.isAdmin })}</Badge>
              </span>
            </p>
          </AccountPicture>
        ) : (
          <AccountActions variant="quiet" profileLinks={profileLinks} modeSwitch={modeSwitch} />
        )}
        {sections.length > 1 ? (
          <div className="col-span-2 md:not-short:border-t md:not-short:border-border md:not-short:pt-3">
            <SettingsIndex items={sections} />
          </div>
        ) : null}
        <AccountActions variant="rows" profileLinks={profileLinks} modeSwitch={modeSwitch} />
      </section>

      <div className="min-w-0 space-y-4 sm:@min-[36rem]/settings:col-start-2 sm:@min-[36rem]/settings:row-start-2 md:space-y-5">
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
        {/* What this browser remembers, each with Clear (nothing here reaches the server). */}
        <Panel id="device" className="lg:scroll-mt-6">
          <PanelHeader title="On this device" />
          <PanelBody>
            <OnThisDevice />
          </PanelBody>
        </Panel>
        <p id="compliance" className="text-xs leading-snug text-fg-subtle sm:leading-relaxed lg:scroll-mt-6">
          {riotLegal(branding.productName)}{" "}
          <Link href="/privacy" className="text-accent underline-offset-2 hover:underline" data-testid="settings-privacy-link">
            Privacy: what this app stores about you, and how to ask for it to be corrected or removed
          </Link>
        </p>
      </div>
      </div>
    </div>
  );
}
