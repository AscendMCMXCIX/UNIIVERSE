import { PageHeader } from "@/components/ui/page-header";
import { getSession, hasPermission } from "@/server/auth/session";
import { PeopleTabs } from "@/components/admin/people-tabs";

/** Users & Permissions: everyone's account, roster place and access (Accounts), and what each access level and group allows (Access levels). */
export default async function PeopleLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Admin Mode" title="Users & Permissions" description="Everyone with an account: their status, team membership, access and administrator access, and their personal data." />
      <PeopleTabs showAccess={hasPermission(session, "manage-users")} />
      {children}
    </div>
  );
}
