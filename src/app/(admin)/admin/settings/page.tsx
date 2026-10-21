import { AccountSettings } from "@/components/settings/account-settings";

export const dynamic = "force-dynamic";

/** Account settings without leaving Admin Mode (the same page as Player Mode's /settings). */
export default function AdminSettingsPage() {
  return <AccountSettings mode="admin" />;
}
