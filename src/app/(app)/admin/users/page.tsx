import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { listAccountViews } from "@/server/auth/account-admin";
import { UsersPanel } from "@/components/admin/users-panel";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const db = await getAppDb();
  const [session, accounts] = await Promise.all([getSession(), listAccountViews(db)]);
  return <UsersPanel accounts={accounts} currentUserId={session?.userId ?? null} />;
}
