import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/ui/page-header";

/** Settings: your account (picture, username, password) and your Riot accounts, as two tabs. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" description="Your account and your linked Riot accounts." />
      <SettingsNav />
      {children}
    </div>
  );
}
