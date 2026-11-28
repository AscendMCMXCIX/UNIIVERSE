import { PageHeader } from "@/components/ui/page-header";
import { WS_COLUMN } from "@/components/ui/workspace-classes";
import { cn } from "@/lib/cn";

/**
 * Users & Permissions: everyone's account, roster place and access (Accounts), what each access
 * level and group allows (Access levels), and personal data. Its pages are the section tabs above
 * the header (SectionTabs; on phones the top bar's second row), as Team's and Platform Settings' are.
 */
export default function PeopleLayout({ children }: { children: React.ReactNode }) {
  return (
    // On a one-screen page a flex column the page's section fills (WS_COLUMN); in the workspace's short form (a window under
    // 46rem tall) the header's "Admin Mode" eyebrow gives its line back: the sidebar and the section tabs above already name it.
    <div className={cn("space-y-4 ws-short-host:[&>header_[data-eyebrow]]:hidden", WS_COLUMN)}>
      <PageHeader admin sectionNamed eyebrow="Admin Mode" title="Users & Permissions" />
      {children}
    </div>
  );
}
