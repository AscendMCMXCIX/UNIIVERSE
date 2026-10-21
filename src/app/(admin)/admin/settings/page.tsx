import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/settings/account-settings";
import { getSession } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";

export const dynamic = "force-dynamic";

/**
 * Account settings without leaving Admin Mode (the same page as Player Mode's /settings). Checked
 * here as well as in the Admin Mode layout, like every Admin Mode page: anyone who is not an
 * administrator has this page in Player Mode.
 */
export default async function AdminSettingsPage() {
  if (!isAdmin(await getSession())) redirect("/settings");
  return <AccountSettings mode="admin" />;
}
