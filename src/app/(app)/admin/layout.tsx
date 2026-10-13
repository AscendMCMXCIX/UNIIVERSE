import { redirect } from "next/navigation";
import { getSession, isOwner } from "@/server/auth/session";
import { AdminNav } from "@/components/admin/admin-nav";

export const dynamic = "force-dynamic";

/** The Admin area: owner accounts only, checked on the server for every page beneath. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!isOwner(session)) redirect("/team");
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Admin</h1>
        <p className="text-sm text-fg-muted">Accounts, roster administration, competition settings, data and system health. Players never see this area.</p>
      </div>
      <AdminNav />
      {children}
    </div>
  );
}
