import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "./ui/badge";
import { NavLinks } from "./nav-links";
import { timeAgo } from "@/lib/format";

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
  authMode: "open" | "password" | "locked";
}

export function AppShell({ status, children }: { status: ShellStatus; children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-bg-elevated">
        <Link href="/team" className="px-5 pb-4 pt-5">
          <div className="text-[10px] tracking-[0.35em] text-fg-subtle">DRAFT PLATFORM</div>
          <div className="mt-1 text-lg font-bold tracking-[0.2em] text-fg">UNIIVERSE</div>
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
          </div>
          {status.authMode === "password" ? (
            <form action="/api/auth/logout" method="post">
              <button className="text-fg-subtle hover:text-fg" type="submit">
                Sign out
              </button>
            </form>
          ) : null}
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
