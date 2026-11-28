import { requirePageAccess } from "@/server/auth/page-access";
import { PageHeader } from "@/components/ui/page-header";
import { PreviewStudio } from "@/components/admin/preview-studio";
import { WS_COLUMN } from "@/components/ui/workspace-classes";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/**
 * Admin Mode → Platform Settings → Previews: the sign-in page and a new player's first-time setup, as
 * people see them. On a desktop window a fitted canvas (docs/RESPONSIVE.md, "One-screen desktop
 * pages", Previews): the studio fills the window under the header, and the device is drawn whole in it.
 */
export default async function AdminPreviewsPage() {
  await requirePageAccess("manage-branding");
  return (
    <div className={cn("space-y-5", WS_COLUMN)}>
      <PageHeader admin sectionNamed eyebrow="Platform Settings" title="Previews" description="The sign-in page and a new player's first-time setup, exactly as people see them, with your current branding. Try them at any screen size; nothing you do here is saved." />
      <PreviewStudio />
    </div>
  );
}
