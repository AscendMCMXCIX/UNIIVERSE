import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { listAudit } from "@/server/audit/log";
import { AUDIT_CATEGORIES, isAuditCategory } from "@/domain/audit";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody } from "@/components/ui/panel";
import { TabLinks } from "@/components/ui/tab-links";
import { AuditList } from "@/components/admin/audit-list";

export const dynamic = "force-dynamic";

const LIMIT = 200;

/**
 * Audit Logs: every recorded admin and security action, newest first (the last 200), all of them
 * or one category. The record is written by the server actions after a change succeeds, is only
 * ever added to, and never holds a password, a token or a key.
 */
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess("manage-users", "manage-branding", "manage-data");
  const sp = await searchParams;
  const category = isAuditCategory(sp.category) ? sp.category : null;
  const db = await getAppDb();
  const entries = await listAudit(db, LIMIT, category ? AUDIT_CATEGORIES[category].actions : undefined);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin Mode" title="Audit Logs" description={`Who changed accounts, access, passwords, settings or jobs, newest first (the last ${LIMIT}). Passwords and keys are never recorded.`} />
      <TabLinks
        label="Audit categories"
        testId="audit-categories"
        items={[
          { href: "/admin/audit", label: "All", active: !category, testId: "audit-category-all" },
          ...Object.entries(AUDIT_CATEGORIES).map(([key, c]) => ({ href: `/admin/audit?category=${key}`, label: c.label, active: category === key, testId: `audit-category-${key}` })),
        ]}
      />
      <Panel data-testid="admin-activity">
        <PanelBody>
          <AuditList entries={entries} empty={category ? "Nothing recorded in this category yet." : "Nothing recorded yet."} />
        </PanelBody>
      </Panel>
    </div>
  );
}
