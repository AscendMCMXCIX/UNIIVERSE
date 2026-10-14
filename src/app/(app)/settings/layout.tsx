import { PageHeader } from "@/components/ui/page-header";

/** Settings: your account (picture, username, password). Riot accounts live on My Profile → Riot Accounts. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" description="Your picture, username and password." />
      {children}
    </div>
  );
}
