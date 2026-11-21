import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { listAccountViews } from "@/server/auth/account-admin";
import { listAudit } from "@/server/audit/log";
import { loadNeedsYou } from "@/server/admin/needs-you";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { StatLine, StatStrip, StatTile } from "@/components/ui/stat-strip";
import { AuditList } from "@/components/admin/audit-list";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/**
 * ADMIN MODE's start page (the overhaul's S9c): one "Needs you" card first (expired temporary
 * passwords, unfinished setups, Riot accounts needing attention, failing jobs, the LP schedule
 * turned off and jobs set to 0, with who and when), then the account counts as one strip, then
 * recent activity in sentences. The sidebar already lists the sections, so the page does not.
 * Reads a few small tables only (no statistics).
 */
export default async function AdminDashboardPage() {
  await requirePageAccess("manage-users", "manage-branding", "manage-data");
  const db = await getAppDb();
  const [accounts, activity] = await Promise.all([listAccountViews(db), listAudit(db, 6)]);
  const needs = await loadNeedsYou(db, accounts);
  const active = accounts.filter((a) => a.isActive);
  const waiting = active.filter((a) => !a.setupComplete || a.password.state === "temporary" || a.password.state === "expired" || a.password.state === "none").length;
  const admins = active.filter((a) => a.role === "owner" || a.isAdmin).length;
  return (
    <div className="space-y-5" data-testid="admin-dashboard">
      <PageHeader admin eyebrow="Admin Mode" title="Dashboard" description="What needs you, then the platform at a glance." />
      <Panel data-testid="needs-you">
        <PanelHeader title="Needs you" subtitle={needs.length ? `${needs.length} thing${needs.length === 1 ? "" : "s"} to look at` : undefined} />
        <PanelBody>
          {needs.length ? (
            <ul className="divide-y divide-border">
              {needs.map((n) => (
                <li key={n.key} data-testid="needs-you-item" data-need={n.key.replace(/-.*$/, "")}>
                  <Link href={n.href} className="flex min-h-11 items-center gap-3 py-2 text-sm text-fg hover:text-accent">
                    <AlertTriangle className={cn("h-4 w-4 shrink-0", n.tone === "bad" ? "text-bad" : "text-warn")} aria-hidden />
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{n.text}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-fg-muted" data-testid="needs-you-none">
              <CheckCircle2 className="h-4 w-4 text-good" aria-hidden /> Nothing needs you right now.
            </p>
          )}
        </PanelBody>
      </Panel>
      <StatStrip label="Accounts" testId="dashboard-accounts">
        <StatLine>
          <StatTile lead value={active.length} label="active accounts" testId="dashboard-accounts-active" />
          <StatTile value={waiting} label="awaiting first sign-in" testId="dashboard-waiting" />
        </StatLine>
        <StatLine>
          <StatTile value={admins} label={admins === 1 ? "administrator" : "administrators"} testId="dashboard-admins" />
          <StatTile value={accounts.length - active.length} label="deactivated" testId="dashboard-inactive" />
        </StatLine>
      </StatStrip>
      <Panel data-testid="dashboard-activity">
        <PanelHeader
          title="Recent admin activity"
          actions={
            <Link href="/admin/audit" className="touch-target inline-flex min-h-6 items-center gap-1 text-sm text-accent hover:underline">
              Audit Logs <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          }
        />
        <PanelBody>
          <AuditList entries={activity} />
        </PanelBody>
      </Panel>
    </div>
  );
}
