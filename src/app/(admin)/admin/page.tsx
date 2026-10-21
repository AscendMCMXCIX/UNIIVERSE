import Link from "next/link";
import { Activity, ArrowRight, ClipboardList, Database, SlidersHorizontal, UserCog, type LucideIcon } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { listAccountViews } from "@/server/auth/account-admin";
import { listAudit } from "@/server/audit/log";
import { loadSystemStatus } from "@/server/ops/system-status";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { StatusCards } from "@/components/admin/status-cards";
import { AuditList } from "@/components/admin/audit-list";

export const dynamic = "force-dynamic";

/** The other five sections of Admin Mode, each with what it is for. */
const SECTIONS: Array<{ href: string; label: string; description: string; icon: LucideIcon }> = [
  { href: "/admin/people", label: "Users & Permissions", description: "Create accounts, issue temporary passwords, set access levels and administrators.", icon: UserCog },
  { href: "/admin/branding", label: "Platform Settings", description: "The team's name, logo, colours and backgrounds, and how each page looks.", icon: SlidersHorizontal },
  { href: "/admin/data", label: "Data & Integrations", description: "Riot data: linked accounts, syncing and the Riot API connection.", icon: Database },
  { href: "/admin/system", label: "System Health", description: "Website, database and background jobs, with the evidence behind each.", icon: Activity },
  { href: "/admin/audit", label: "Audit Logs", description: "Who changed what, and when.", icon: ClipboardList },
];

/**
 * ADMIN MODE's start page: the state of accounts, the system and recent admin activity at a
 * glance, and the way into each section. Reads a few small tables only (no statistics).
 */
export default async function AdminDashboardPage() {
  await requirePageAccess("manage-users", "manage-branding", "manage-data");
  const db = await getAppDb();
  const [accounts, { items: status }, activity] = await Promise.all([listAccountViews(db), loadSystemStatus(db), listAudit(db, 6)]);
  const active = accounts.filter((a) => a.isActive);
  const tiles = [
    { key: "accounts", label: "Active accounts", value: active.length, note: `${accounts.length} in all` },
    { key: "waiting", label: "Awaiting first sign-in", value: active.filter((a) => !a.setupComplete || a.password.state === "temporary" || a.password.state === "expired" || a.password.state === "none").length, note: "temporary password or setup to finish" },
    { key: "admins", label: "Administrators", value: active.filter((a) => a.role === "owner" || a.isAdmin).length, note: "the Owner included" },
    { key: "inactive", label: "Deactivated", value: accounts.length - active.length, note: "cannot sign in" },
  ];
  const attention = status.filter((s) => s.label !== "Healthy");
  return (
    <div className="space-y-5" data-testid="admin-dashboard">
      <PageHeader eyebrow="Admin Mode" title="Dashboard" description="The state of the platform at a glance." />
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="dashboard-accounts">
        {tiles.map((t) => (
          <li key={t.key} className="rounded-panel border border-border bg-surface p-4" data-tile={t.key}>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">{t.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-fg" data-testid={`dashboard-${t.key}`}>
              {t.value}
            </div>
            <div className="mt-0.5 text-xs text-fg-subtle">{t.note}</div>
          </li>
        ))}
      </ul>
      <section className="space-y-3" aria-labelledby="dashboard-status">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dashboard-status" className="text-base font-semibold">
            System status
          </h2>
          <span className="text-sm text-fg-muted">{attention.length ? `${attention.length} need${attention.length === 1 ? "s" : ""} a look` : "Everything checked is healthy"}</span>
        </div>
        <StatusCards items={status} testId="dashboard-status" />
      </section>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
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
        <nav aria-label="Admin sections" className="grid content-start gap-2">
          {SECTIONS.map(({ href, label, description, icon: Icon }) => (
            <Link key={href} href={href} className="group flex items-start gap-3 rounded-panel border border-border bg-surface p-3 transition-colors hover:border-border-strong hover:bg-surface-2" data-testid="dashboard-section">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg">{label}</span>
                <span className="block text-sm text-fg-muted">{description}</span>
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
