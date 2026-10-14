import Link from "next/link";
import type { ReactNode } from "react";
import type React from "react";
import { LogOut } from "lucide-react";
import { NavLinks } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { ViewSwitch } from "./view-switch";
import { Avatar } from "./ui/avatar";
import { timeAgo } from "@/lib/format";
import { backgroundStillSrc, brandThemeCss, logoSrc, logoStillSrc, type Branding } from "@/domain/branding";
import { BrandImage } from "./brand-image";

export const RIOT_LEGAL = "UNIIVERSE isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.";

export interface ShellStatus {
  patch: string | null;
  isFixture: boolean;
  isDemoStats: boolean;
  rankedUpdatedAt: Date | null;
  proUpdatedAt: Date | null;
  staticUpdatedAt: Date | null;
  /** Failing or stale data jobs: shown in Admin → Data & Riot and System Health, never in the global header. */
  warnings: string[];
  dbDescription: string;
  sessionLabel: string;
  canEdit: boolean;
  authMode: "open" | "accounts" | "setup" | "locked";
  role: "owner" | "coach" | "player" | null;
  /** May switch into Admin Mode: owners, and players granted an admin capability. */
  isAdmin: boolean;
  /** Admin Mode is active for this request. */
  adminMode: boolean;
  /** Player-View and Admin pages this account may open (paths; the pages check again). */
  allowedPlayerLinks: string[];
  allowedAdminLinks: string[];
  playerId: string | null;
  /** The signed-in person, for the account menu. */
  user: { name: string; avatarUrl: string | null; roleLabel: string } | null;
  /** Account from before automatic profiles: asks for Riot ID and role once (see /me). */
  needsProfile: boolean;
  /** Account created without a password: can only use this session until one is set. */
  needsPassword: boolean;
  /** Admin-created account that has not chosen roles, pools and a password yet. */
  needsSetup: boolean;
  branding: Branding;
}

/** One quiet line of data freshness at the foot of the navigation. */
function DataLine({ status }: { status: ShellStatus }) {
  return (
    <p className="truncate text-xs text-fg-subtle" title={`Ranked data ${status.isDemoStats ? "demo" : timeAgo(status.rankedUpdatedAt)} · Pro data ${timeAgo(status.proUpdatedAt)}`}>
      Patch {status.patch ?? "—"} · data {status.isDemoStats ? "demo" : timeAgo(status.rankedUpdatedAt)}
    </p>
  );
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
  const home = adminMode ? (status.allowedAdminLinks[0] ?? "/team") : (status.allowedPlayerLinks[0] ?? "/settings");
  const user = status.user;
  const themeCss = brandThemeCss(b);
  const backdrop = backgroundStillSrc(b);
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Branding colours: validated hex values only. */}
      {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
      {/* A custom background stays a faint, still layer behind the app (animation is for the sign-in page). */}
      {backdrop ? <div aria-hidden className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-[0.12]" style={{ backgroundImage: `url(${backdrop})` }} data-testid="brand-backdrop" /> : null}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-bg-elevated/80 backdrop-blur lg:flex" data-testid="sidebar">
        <Link href={home} className="flex items-center gap-3 px-5 pb-5 pt-6" title={b.teamName}>
          <BrandImage src={logoSrc(b)} still={logoStillSrc(b)} className="h-10 w-10 shrink-0 rounded-lg object-contain" />
          <span className="min-w-0">
            <span className="block truncate text-base font-bold tracking-[0.12em] text-fg">{b.shortName}</span>
            {adminMode ? <span className="block truncate text-xs font-semibold uppercase tracking-[0.2em] text-accent">Admin mode</span> : b.tagline ? <span className="block truncate text-xs text-fg-subtle">{b.tagline}</span> : null}
          </span>
        </Link>
        <NavLinks allowed={allowed} admin={adminMode} />
        {status.isAdmin ? (
          <div className="px-3 pt-4">
            <ViewSwitch adminMode={adminMode} />
          </div>
        ) : null}
        <div className="mt-auto space-y-3 px-3 pb-4 pt-6">
          {user ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface/60 p-2">
              <Link href="/settings" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 hover:bg-surface-2" title="Account settings">
                <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{user.name}</span>
                  <span className="block truncate text-xs text-fg-subtle">{user.roleLabel}</span>
                </span>
              </Link>
              {showSignOut ? (
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="grid h-9 w-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Sign out" title="Sign out">
                    <LogOut className="h-4 w-4" />
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
          <div className="px-2">
            <DataLine status={status} />
            <p className="mt-1 text-xs leading-snug text-fg-subtle/80" title={RIOT_LEGAL}>
              Not endorsed by Riot Games. <Link href="/settings#compliance" className="underline-offset-2 hover:underline">Details</Link>
            </p>
          </div>
        </div>
      </aside>
      <MobileNav
        logoSrc={logoSrc(b)}
        logoStill={logoStillSrc(b)}
        shortName={b.shortName}
        tagline={b.tagline}
        home={home}
        user={user}
        showSignOut={showSignOut}
        allowed={allowed}
        adminMode={adminMode}
        viewSwitch={status.isAdmin ? <ViewSwitch adminMode={adminMode} large /> : null}
        status={<DataLine status={status} />}
      />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 px-4 py-5 pb-tabbar sm:px-6 md:pb-6 lg:px-8 lg:py-7">
          <AccountNudges status={status} />
          {children}
        </main>
      </div>
    </div>
  );
}
