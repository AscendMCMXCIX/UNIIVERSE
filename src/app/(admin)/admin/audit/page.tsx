import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { queryAudit } from "@/server/audit/log";
import { auditQueryFor, readAuditFilters } from "@/server/audit/filters";
import { listUsers } from "@/server/repositories/users";
import { PageHeader } from "@/components/ui/page-header";
import { AuditLog } from "@/components/admin/audit-log";

export const dynamic = "force-dynamic";

const PAGE = 50;

/**
 * Audit Logs: every recorded admin and security action, newest first, 50 at a time with Load older,
 * filtered by category, person and dates. The record is written by the server actions after a
 * change succeeds, is only ever added to, and never holds a password, a token, a key or a count of
 * sign-in sessions.
 */
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess("manage-users", "manage-branding", "manage-data");
  const filters = readAuditFilters(await searchParams);
  const db = await getAppDb();
  const [rows, accounts] = await Promise.all([auditQueryFor(db, filters).then((q) => queryAudit(db, { ...q, limit: PAGE + 1 })), listUsers(db)]);
  const people = accounts.map((u) => ({ id: u.id, name: u.playerName ?? u.displayName ?? u.username })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin Mode" title="Audit Logs" description="Who changed accounts, access, passwords, settings or jobs, newest first. Passwords and keys are never recorded." />
      <AuditLog key={JSON.stringify(filters)} entries={rows.slice(0, PAGE)} more={rows.length > PAGE} filters={filters} people={people} />
    </div>
  );
}
