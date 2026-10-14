import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getSession } from "@/server/auth/session";
import { listAccountViews } from "@/server/auth/account-admin";
import { UsersPanel } from "@/components/admin/users-panel";
import { listPermissionPresets } from "@/server/repositories/permissions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requirePageAccess("manage-users");
  const db = await getAppDb();
  const [session, accounts, presets] = await Promise.all([getSession(), listAccountViews(db), listPermissionPresets(db)]);
  return <UsersPanel accounts={accounts} currentUserId={session?.userId ?? null} presets={presets} />;
}
