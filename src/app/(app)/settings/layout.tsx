import { PageHeader } from "@/components/ui/page-header";

/** Settings: your account (picture, display name, username, password). Riot accounts live on My Profile → Riot Accounts. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" description="Your picture, display name, username and password." guide />
      {children}
    </div>
  );
}
