import Link from "next/link";
import type { ReactNode } from "react";
import type React from "react";
import { Badge } from "./ui/badge";
import { ADMIN_LINKS, NAV_LINKS, NavLinks } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { ViewSwitch } from "./view-switch";
import { timeAgo } from "@/lib/format";
import { lightenHex, logoSrc, type Branding } from "@/domain/branding";

export const RIOT_LEGAL = "UNIIVERSE isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.";

export interface ShellStatus {
  patch: string | null;
  isFixture: boolean;
  isDemoStats: boolean;
  rankedUpdatedAt: Date | null;
  proUpdatedAt: Date | null;
  staticUpdatedAt: Date | null;
  warnings: string[];
  dbDescription: string;
  sessionLabel: string;
  canEdit: boolean;
  authMode: "open" | "accounts" | "setup" | "locked";
  role: "owner" | "coach" | "player" | null;
  /** Owner / Admin account: may switch into Admin Mode. */
  isAdmin: boolean;
  /** Admin Mode is active for this request (owners only). */
  adminMode: boolean;
  playerId: string | null;
  /** Account from before automatic profiles: asks for Riot ID and role once (see /me). */
  needsProfile: boolean;
  /** Account created without a password: can only use this session until one is set. */
  needsPassword: boolean;
  /** Admin-created account that has not chosen roles, pools and a password yet. */
  needsSetup: boolean;
  branding: Branding;
}

function StatusRows({ status }: { status: ShellStatus }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span>Patch</span>
        <span className="font-mono text-fg-muted">{status.patch ?? "—"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span>Ranked data</span>
        <span className="text-fg-muted">{status.isDemoStats ? "demo" : timeAgo(status.rankedUpdatedAt)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span>Pro data</span>
        <span className="text-fg-muted">{timeAgo(status.proUpdatedAt)}</span>
      </div>
      <div className="truncate pt-1 text-fg-subtle" title={status.sessionLabel}>
        {status.sessionLabel}
        {status.role ? <span className="ml-1 text-fg-subtle">· {status.role}</span> : null}
      </div>
    </>
  );
}

/**
 * Layout: a fixed sidebar from lg up (unchanged desktop experience); below that a top bar with a
 * drawer, and on phones a bottom tab bar. The main column pads for the tab bar and safe areas.
 */
export function AppShell({ status, children }: { status: ShellStatus; children: ReactNode }) {
  const b = status.branding;
  const accentStyle = { ["--color-accent" as string]: b.accent, ["--color-accent-strong" as string]: lightenHex(b.accent, 0.2) } as React.CSSProperties;
  const showProfile = !!status.playerId || status.needsProfile;
  const showSignOut = status.authMode === "accounts";
  const adminMode = status.adminMode && status.isAdmin;
  const links = adminMode ? ADMIN_LINKS : NAV_LINKS;
  const viewSwitch = status.isAdmin ? <ViewSwitch adminMode={adminMode} large /> : null;
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row" style={accentStyle}>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-bg-elevated lg:flex">
        <Link href={adminMode ? "/admin/players" : "/team"} className="flex items-center gap-3 px-4 pb-4 pt-5" title={b.teamName}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc(b)} alt="" className="h-10 w-10 shrink-0 rounded-md object-contain" />
          <span className="min-w-0">
            <span className={adminMode ? "block truncate text-[10px] tracking-[0.28em] text-accent-strong" : "block truncate text-[10px] tracking-[0.28em] text-fg-subtle"}>{adminMode ? "ADMIN MODE" : (b.tagline || "DRAFT PLATFORM").toUpperCase()}</span>
            <span className="mt-0.5 block truncate text-base font-bold tracking-[0.14em] text-fg">{b.shortName}</span>
          </span>
        </Link>
        <NavLinks links={links} />
        {status.isAdmin ? <div className="px-3 pt-3"><ViewSwitch adminMode={adminMode} /></div> : null}
        <div className="mt-auto space-y-2 border-t border-border px-4 py-3 text-[11px] text-fg-subtle">
          <StatusRows status={status} />
          <div className="flex items-center gap-3">
            {showProfile ? (
              <Link href="/me" className="text-fg-subtle hover:text-fg">
                My profile
              </Link>
            ) : null}
            {showSignOut ? (
              <form action="/api/auth/logout" method="post">
                <button className="text-fg-subtle hover:text-fg" type="submit">
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
          <p className="pt-1 text-[10px] leading-snug text-fg-subtle/80" title={RIOT_LEGAL}>
            Not endorsed by Riot Games. <Link href="/settings#compliance" className="underline-offset-2 hover:underline">Details</Link>
          </p>
        </div>
      </aside>
      <MobileNav
        logoSrc={logoSrc(b)}
        shortName={b.shortName}
        tagline={b.tagline || "DRAFT PLATFORM"}
        showProfile={showProfile}
        showSignOut={showSignOut}
        links={links}
        adminMode={adminMode}
        viewSwitch={viewSwitch}
        status={
          <>
            <StatusRows status={status} />
            <p className="pt-1 text-[10px] leading-snug text-fg-subtle/80" title={RIOT_LEGAL}>
              Not endorsed by Riot Games. <Link href="/settings#compliance" className="underline-offset-2 hover:underline">Details</Link>
            </p>
          </>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {status.warnings.length > 0 || status.isDemoStats || status.isFixture || status.needsProfile || status.needsPassword || status.needsSetup ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-elevated px-4 py-1.5 text-xs sm:px-6">
            {status.needsSetup ? (
              <Link href="/welcome">
                <Badge tone="accent">Finish your setup: choose your roles, champions and password →</Badge>
              </Link>
            ) : null}
            {status.needsProfile ? (
              <Link href="/me">
                <Badge tone="accent">Complete your player profile: add your Riot ID and main role →</Badge>
              </Link>
            ) : null}
            {status.needsPassword ? (
              <Link href="/settings">
                <Badge tone="warn">Your account has no password yet: set one under Settings so you can sign in again →</Badge>
              </Link>
            ) : null}
            {status.isDemoStats ? <Badge tone="warn">DEMO STATISTICS — synthetic, not real games</Badge> : null}
            {status.isFixture ? <Badge tone="warn">Offline champion fixture — Data Dragon not yet reached</Badge> : null}
            {status.warnings.map((w) => (
              <Badge key={w} tone="bad">
                {w}
              </Badge>
            ))}
          </div>
        ) : null}
        <main className="min-w-0 flex-1 px-4 py-4 pb-tabbar sm:px-6 sm:py-5 md:pb-5">{children}</main>
      </div>
    </div>
  );
}
