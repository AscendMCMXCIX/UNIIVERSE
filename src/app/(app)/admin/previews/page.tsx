import { requirePageAccess } from "@/server/auth/page-access";
import { PageHeader } from "@/components/ui/page-header";
import { PreviewStudio } from "@/components/admin/preview-studio";

export const dynamic = "force-dynamic";

/** Admin → Previews: the sign-in page and a new player's first-time setup, as people see them. */
export default async function AdminPreviewsPage() {
  await requirePageAccess("manage-branding");
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Previews" description="The sign-in page and a new player's first-time setup, exactly as people see them, with your current branding. Try them at any screen size; nothing you do here is saved." />
      <PreviewStudio />
    </div>
  );
}
