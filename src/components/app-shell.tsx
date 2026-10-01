import Link from "next/link";
import type { ReactNode } from "react";
import type React from "react";
import { Badge } from "./ui/badge";
import { NavLinks } from "./nav-links";
import { timeAgo } from "@/lib/format";
import { lightenHex, type Branding } from "@/domain/branding";

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
  playerId: string | null;
  branding: Branding;
}

export function AppShell({ status, children }: { status: ShellStatus; children: ReactNode }) {
  const b = status.branding;
  const accentStyle = { ["--color-accent" as string]: b.accent, ["--color-accent-strong" as string]: lightenHex(b.accent, 0.2) } as React.CSSProperties;
  return (
    <div className="flex min-h-screen" style={accentStyle}>
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-bg-elevated">
        <Link href="/team" className="flex items-center gap-3 px-5 pb-4 pt-5" title={b.teamName}>
          {b.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoDataUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-contain" />
          ) : null}
          <span className="min-w-0">
            <span className="block truncate text-[10px] tracking-[0.35em] text-fg-subtle">{(b.tagline || "DRAFT PLATFORM").toUpperCase()}</span>
            <span className="mt-1 block truncate text-lg font-bold tracking-[0.2em] text-fg">{b.shortName}</span>
          </span>
        </Link>
        <NavLinks />
        <div className="mt-auto space-y-2 border-t border-border px-4 py-3 text-[11px] text-fg-subtle">
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
          <div className="flex items-center gap-3">
            {status.playerId ? (
              <Link href="/me" className="text-fg-subtle hover:text-fg">
                My profile
              </Link>
            ) : null}
            {status.authMode === "accounts" ? (
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
      <div className="flex min-w-0 flex-1 flex-col">
        {status.warnings.length > 0 || status.isDemoStats || status.isFixture ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-elevated px-6 py-1.5 text-xs">
            {status.isDemoStats ? <Badge tone="warn">DEMO STATISTICS — synthetic, not real games</Badge> : null}
            {status.isFixture ? <Badge tone="warn">Offline champion fixture — Data Dragon not yet reached</Badge> : null}
            {status.warnings.map((w) => (
              <Badge key={w} tone="bad">
                {w}
              </Badge>
            ))}
          </div>
        ) : null}
        <main className="min-w-0 flex-1 px-6 py-5">{children}</main>
      </div>
    </div>
  );
}
