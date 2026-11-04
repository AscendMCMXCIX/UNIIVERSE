import { AccountSettings } from "@/components/settings/account-settings";
import { requirePageAccess } from "@/server/auth/page-access";

export const dynamic = "force-dynamic";

/** Account settings in Player Mode (Admin Mode has the same page at /admin/settings). */
export default async function SettingsPage() {
  await requirePageAccess();
  return <AccountSettings mode="player" />;
}
