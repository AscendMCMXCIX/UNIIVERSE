import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { getViewMode } from "@/server/auth/view-mode";
import { canUseAdminArea } from "@/server/auth/permissions";
import { ADMIN_LINKS, canOpen } from "@/lib/nav";
import { AdminNav } from "@/components/admin/admin-nav";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

/** The Admin area: owners and players granted an admin capability; every page beneath checks its own capability. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canUseAdminArea(session)) redirect("/team");
  const allowed = ADMIN_LINKS.filter((l) => canOpen(session, l)).map((l) => l.href);
  // In Admin Mode the sidebar lists these pages already; the tabs remain for phones and Player View.
  const adminMode = (await getViewMode(session)) === "admin";
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader eyebrow="Admin" title="Administration" description="People and their access, draft settings, Riot data, branding and system health." />
      <div className={adminMode ? "lg:hidden" : undefined}>
        <AdminNav allowed={allowed} />
      </div>
      {children}
    </div>
  );
}
