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
import { InstallAppEntry, InstallAppProvider } from "./install/install-app";
import { ModeSwitch } from "./mode-switch";
import { ScrollOnNavigate } from "./scroll-on-navigate";
import { ADMIN_HOME } from "@/lib/nav";
import { RAIL_FADE, SIDEBAR_RAIL_COLUMN } from "@/lib/sidebar";
import { cn } from "@/lib/cn";

/** Riot's required notice, naming the app as the install calls itself (Admin → Branding). */
export const riotLegal = (productName: string) =>
  `${productName} isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.`;

export interface ShellStatus {
  patch: string | null;
  isFixture: boolean;
  staticUpdatedAt: Date | null;
  /** Failing or stale data jobs: shown in Admin Mode (Data & Integrations, System Health), never in the global header. */
  warnings: string[];
  dbDescription: string;
  sessionLabel: string;
  authMode: "open" | "accounts" | "setup" | "locked";
  role: "owner" | "coach" | "player" | null;
  /** An administrator (the Owner included): the only accounts offered the switch between the modes. */
  isAdmin: boolean;
  /** This page is in Admin Mode (an /admin address; the server decides, see src/app/(admin)). */
  adminMode: boolean;
  /** Player-View and Admin pages this account may open (paths; the pages check again). */
  allowedPlayerLinks: string[];
  allowedAdminLinks: string[];
  playerId: string | null;
  /** The signed-in person, for the account menu. */
  user: { name: string; username?: string | null; avatarUrl: string | null; roleLabel: string } | null;
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
 * Application layout, for both modes. Desktop (lg+): a sidebar that stays put while the page
 * scrolls (it scrolls on its own if it is ever taller than the window). Below lg: a top bar with a
 * drawer, and on phones a bottom tab bar. Player Mode shows the player pages, Admin Mode only the
 * admin pages; administrators also get the switch between the two, apart from the pages, in the
 * sidebar and the drawer. Problems with data jobs never appear here: they belong to the Admin
 * pages; toasts carry short-lived messages.
 */
export function AppShell({ status, children }: { status: ShellStatus; children: ReactNode }) {
  const b = status.branding;
  const showSignOut = status.authMode === "accounts";
  const adminMode = status.adminMode && status.isAdmin;
  const allowed = adminMode ? status.allowedAdminLinks : status.allowedPlayerLinks;
  // Player Mode starts at the first page this account may open, but an account without a player
  // profile (the verification account, an administrator before their profile) never at /overview,
  // which has nothing of its own for it: Back from Settings then leads to Team, not to an empty Profile.
  const home = adminMode ? ADMIN_HOME : (status.allowedPlayerLinks.find((l) => l !== "/overview" || status.playerId) ?? "/settings");
  const user = status.user;
  return (
    <BrandNamesProvider names={b}>
      <InstallAppProvider>
        {/* The keyboard's first stop: straight to the page, past the frame's links. */}
        <a href="#content" className="sr-only rounded-md bg-chrome px-4 py-2 text-sm font-semibold text-fg shadow-lg focus:not-sr-only focus:fixed focus:left-3 focus:top-[max(0.75rem,env(safe-area-inset-top))] focus:z-[60]" data-testid="skip-link">
          Skip to content
        </a>
        <ScrollOnNavigate />
        <div className="flex min-h-dvh flex-col lg:flex-row">
          <SiteBackdrop branding={b} />
          <AccountGuard identity={status.identity} />
          <CollapsibleSidebar
            initialCollapsed={!!status.sidebarCollapsed}
            brand={
              // The logo is centred in the rail's width, so collapsed it sits on the icons' centre line
              // whatever its size. The link starts at the sidebar's edge: its focus ring is drawn
              // inside it, where the edge cannot clip it.
              // The logo sits on a plate (brand-plate, globals.css): a hairline of light around it and a
              // soft shadow under it, so any uploaded square, light or dark, reads as set into the frame.
              <Link href={home} className="group/brand flex min-h-12 min-w-0 items-center rounded-lg focus-visible:-outline-offset-2" title={b.teamName}>
                <span className={SIDEBAR_RAIL_COLUMN}>
                  <span className="brand-plate rounded-lg transition-transform duration-200 ease-emphasized group-hover/brand:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover/brand:scale-100">
                    <BrandMark src={logoSrc(b)} still={logoStillSrc(b)} name={b.shortName} className="h-10 w-10 text-lg" />
                  </span>
                </span>
                <span className={cn("min-w-0", RAIL_FADE)}>
                  <span className="block truncate text-base font-bold tracking-label text-fg">{b.shortName}</span>
                  {adminMode ? <span className="block truncate text-xs font-semibold uppercase tracking-label text-accent">Admin mode</span> : b.tagline ? <span className="block truncate text-xs text-fg-subtle">{b.tagline}</span> : null}
                </span>
              </Link>
            }
            footer={
              <>
                {status.isAdmin ? <ModeSwitch mode={adminMode ? "admin" : "player"} variant="sidebar" /> : null}
                {/* Beside the account menu, where Settings is. */}
                <InstallAppEntry variant="sidebar" />
                {user ? <AccountMenu user={user} showSignOut={showSignOut} adminMode={adminMode} /> : null}
                <div className={cn("px-2 pt-2", RAIL_FADE)}>
                  <DataLine status={status} />
                  <p className="mt-1 text-xs leading-snug text-fg-subtle" title={riotLegal(b.productName)}>
                    Not endorsed by Riot Games. <Link href={`${adminMode ? "/admin" : ""}/settings#compliance`} className="underline-offset-2 hover:underline">Details</Link>
                  </p>
                </div>
              </>
            }
          >
            <NavLinks allowed={allowed} admin={adminMode} />
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
            allowed={allowed}
            adminMode={adminMode}
            modeSwitch={status.isAdmin ? (adminMode ? "admin" : "player") : null}
            status={<DataLine status={status} />}
            legal={
              <p className="text-xs leading-snug text-fg-subtle" title={riotLegal(b.productName)}>
                Not endorsed by Riot Games.{" "}
                <Link href={`${adminMode ? "/admin" : ""}/settings#compliance`} className="touch-target underline underline-offset-2">
                  Details
                </Link>
              </p>
            }
          />
          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* Team Overview's lineup is centred in the height left under the section tabs: on that page
                only, main is a column its content can grow into (every other page is unchanged). */}
            {/* id and tabIndex: the skip link's target (focused without an outline: it is not a control). */}
            <main id="content" tabIndex={-1} className="min-w-0 flex-1 px-safe-4 py-5 pb-tabbar outline-none sm:px-safe-6 md:pb-6 lg:px-8 lg:py-7 lg:has-[[data-testid=lineup-frame]]:flex lg:has-[[data-testid=lineup-frame]]:flex-col">
              <AccountNudges status={status} />
              <SectionTabs allowed={allowed} team={{ name: b.teamName, logo: logoSrc(b), logoStill: logoStillSrc(b) }} />
              {children}
            </main>
          </div>
        </div>
      </InstallAppProvider>
    </BrandNamesProvider>
  );
}
