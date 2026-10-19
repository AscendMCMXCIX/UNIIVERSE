import Link from "next/link";
import type { ReactNode } from "react";
import type React from "react";
import { NavLinks } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { AccountMenu } from "./account-menu";
import { AccountGuard } from "./account-guard";
import { logoSrc, logoStillSrc, type Branding } from "@/domain/branding";
import { SiteBackdrop } from "./site-backdrop";
import { BrandMark } from "./brand-mark";
import { CollapsibleSidebar } from "./collapsible-sidebar";
import { BrandNamesProvider } from "./brand-names";
import { SectionTabs } from "./section-tabs";
import { cn } from "@/lib/cn";

/** Text that fades while the desktop sidebar is collapsed to its icon column. */
const SIDEBAR_FADE = "transition-[opacity,visibility] duration-150 group-data-[collapsed=true]/sidebar:opacity-0 group-data-[collapsed=true]/sidebar:duration-75";

/** Riot's required notice, naming the app as the install calls itself (Admin → Branding). */
export const riotLegal = (productName: string) =>
  `${productName} isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.`;

export interface ShellStatus {
  patch: string | null;
  isFixture: boolean;
  staticUpdatedAt: Date | null;
  /** Failing or stale data jobs: shown in Admin → Riot Data and System Health, never in the global header. */
  warnings: string[];
  dbDescription: string;
  sessionLabel: string;
  authMode: "open" | "accounts" | "setup" | "locked";
  role: "owner" | "coach" | "player" | null;
  /** The Owner account: it works in Admin Mode only. */
  isAdmin: boolean;
  /** Admin Mode is active for this request. */
  adminMode: boolean;
  /** Player-View and Admin pages this account may open (paths; the pages check again). */
  allowedPlayerLinks: string[];
  allowedAdminLinks: string[];
  playerId: string | null;
  /** The signed-in person, for the account menu. */
  user: { name: string; username?: string | null; avatarUrl: string | null; roleLabel: string } | null;
  /** Other accounts this browser is signed in to (switch from the account menu). */
  otherAccounts: Array<{ userId: string; name: string; avatarUrl: string | null; roleLabel: string }>;
  /** Room to sign in to one more account on this browser. */
  canAddAccount: boolean;
  /** The active account's fingerprint (see AccountGuard); null when there is no account. */
  identity: string | null;
  /** Account from before automatic profiles: asks for Riot ID and role once (see /me). */
  needsProfile: boolean;
  /** Account created without a password: can only use this session until one is set. */
  needsPassword: boolean;
  /** Admin-created account that has not chosen roles, pools and a password yet. */
  needsSetup: boolean;
  branding: Branding;
  /** Desktop sidebar collapsed to icons (remembered in a cookie). */
  sidebarCollapsed?: boolean;
  /** Navigation groups the person closed (remembered in a cookie). */
  navClosed?: string[];
}

/** One quiet line at the foot of the navigation: the current patch. */
function DataLine({ status }: { status: ShellStatus }) {
  return <p className="truncate text-xs text-fg-subtle">Patch {status.patch ?? "—"}</p>;
}

/** Things only this person can fix about their own account: an action card at the top of the page, not a header error. */
function AccountNudges({ status }: { status: ShellStatus }) {
  const items: Array<{ href: string; text: string }> = [];
  if (status.needsProfile) items.push({ href: "/me", text: "Complete your player profile: add your Riot ID and main role." });
  if (status.needsPassword) items.push({ href: "/settings#password", text: "Your account has no password yet. Set one so you can sign in again." });
  if (items.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className="flex items-center justify-between gap-3 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-fg hover:bg-warn/15">
          <span>{i.text}</span>
          <span className="shrink-0 text-warn">Fix it →</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Application layout. Desktop (lg+): a sidebar that stays put while the page scrolls (it scrolls
 * on its own if it is ever taller than the window). Below lg: a top bar with a drawer, and on
 * phones a bottom tab bar. Problems with data jobs never appear here: they belong to the Admin
 * pages; toasts carry short-lived messages.
 */
export function AppShell({ status, children }: { status: ShellStatus; children: ReactNode }) {
  const b = status.branding;
  const showSignOut = status.authMode === "accounts";
  const adminMode = status.adminMode && status.isAdmin;
  const allowed = adminMode ? status.allowedAdminLinks : status.allowedPlayerLinks;
  const home = adminMode ? (status.allowedAdminLinks[0] ?? "/settings") : (status.allowedPlayerLinks[0] ?? "/settings");
  const user = status.user;
  return (
    <BrandNamesProvider names={b}>
      <div className="flex min-h-dvh flex-col lg:flex-row">
        <SiteBackdrop branding={b} />
        <AccountGuard identity={status.identity} />
        <CollapsibleSidebar
          initialCollapsed={!!status.sidebarCollapsed}
          brand={
            <Link href={home} className="flex min-w-0 items-center gap-3 rounded-lg" title={b.teamName}>
              <BrandMark src={logoSrc(b)} still={logoStillSrc(b)} name={b.shortName} className="h-10 w-10 text-lg" />
              <span className={cn("min-w-0", SIDEBAR_FADE)}>
                <span className="block truncate text-base font-bold tracking-[0.12em] text-fg">{b.shortName}</span>
                {adminMode ? <span className="block truncate text-xs font-semibold uppercase tracking-[0.2em] text-accent">Admin mode</span> : b.tagline ? <span className="block truncate text-xs text-fg-subtle">{b.tagline}</span> : null}
              </span>
            </Link>
          }
          footer={
            <>
              {user ? <AccountMenu user={user} showSignOut={showSignOut} others={status.otherAccounts} canAdd={status.canAddAccount} /> : null}
              <div className={cn("px-2", SIDEBAR_FADE)}>
                <DataLine status={status} />
                <p className="mt-1 text-xs leading-snug text-fg-subtle" title={riotLegal(b.productName)}>
                  Not endorsed by Riot Games. <Link href="/settings#compliance" className="underline-offset-2 hover:underline">Details</Link>
                </p>
              </div>
            </>
          }
        >
          <NavLinks allowed={allowed} admin={adminMode} initialClosed={status.navClosed} />
        </CollapsibleSidebar>
        <MobileNav
          logoSrc={logoSrc(b)}
          logoStill={logoStillSrc(b)}
          shortName={b.shortName}
          tagline={b.tagline}
          home={home}
          user={user}
          hasPlayer={!!status.playerId}
          showSignOut={showSignOut}
          otherAccounts={status.otherAccounts}
          canAddAccount={status.canAddAccount}
          allowed={allowed}
          adminMode={adminMode}
          navClosed={status.navClosed}
          status={<DataLine status={status} />}
        />
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Team Overview's lineup is centred in the height left under the section tabs: on that page
              only, main is a column its content can grow into (every other page is unchanged). */}
          <main className="min-w-0 flex-1 px-4 py-5 pb-tabbar sm:px-6 md:pb-6 lg:px-8 lg:py-7 lg:has-[[data-testid=lineup-frame]]:flex lg:has-[[data-testid=lineup-frame]]:flex-col">
            <AccountNudges status={status} />
            <SectionTabs allowed={allowed} admin={adminMode} team={{ name: b.teamName, logo: logoSrc(b), logoStill: logoStillSrc(b) }} />
            {children}
          </main>
        </div>
      </div>
    </BrandNamesProvider>
  );
}
