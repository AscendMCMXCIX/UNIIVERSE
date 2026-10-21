import { AccountSettings } from "@/components/settings/account-settings";

export const dynamic = "force-dynamic";

/** Account settings in Player Mode (Admin Mode has the same page at /admin/settings). */
export default function SettingsPage() {
  return <AccountSettings mode="player" />;
}
