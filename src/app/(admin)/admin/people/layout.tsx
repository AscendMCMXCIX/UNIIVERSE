import { PageHeader } from "@/components/ui/page-header";

/**
 * Users & Permissions: everyone's account, roster place and access (Accounts), what each access
 * level and group allows (Access levels), and personal data. Its pages are the section tabs above
 * the header (SectionTabs; on phones the top bar's second row), as Team's and Platform Settings' are.
 */
export default function PeopleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <PageHeader admin sectionNamed eyebrow="Admin Mode" title="Users & Permissions" description="Everyone with an account: their status, team membership, access and administrator access, and their personal data." />
      {children}
    </div>
  );
}
