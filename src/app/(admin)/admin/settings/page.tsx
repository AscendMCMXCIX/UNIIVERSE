import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/settings/account-settings";
import { PageHeader } from "@/components/ui/page-header";
import { isAdmin } from "@/server/auth/permissions";
import { requirePageAccess } from "@/server/auth/page-access";

export const dynamic = "force-dynamic";

/**
 * Account settings without leaving Admin Mode (the same page as Player Mode's /settings, with the
 * same title, so the phone's top bar can name it). Checked here as well as in the Admin Mode
 * layout, like every Admin Mode page: anyone who is not an administrator has this page in Player
 * Mode.
 */
export default async function AdminSettingsPage() {
  if (!isAdmin(await requirePageAccess())) redirect("/settings");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" description="Your picture, display name, username and password." guide />
      <AccountSettings mode="admin" />
    </div>
  );
}
