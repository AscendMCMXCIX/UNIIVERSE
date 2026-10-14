import { PageHeader } from "@/components/ui/page-header";
import { getSession, hasPermission } from "@/server/auth/session";
import { PeopleTabs } from "@/components/admin/people-tabs";

/** People & Access: everyone's account, roster place and access (Accounts), and what each access level and group allows (Access levels). */
export default async function PeopleLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Admin" title="Accounts & access" description="Everyone with a UNIIVERSE account: their status, team membership and access." />
      <PeopleTabs showAccess={hasPermission(session, "manage-users")} />
      {children}
    </div>
  );
}
