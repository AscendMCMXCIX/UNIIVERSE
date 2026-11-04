import { PageHeader } from "@/components/ui/page-header";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getBranding } from "@/server/repositories/branding";
import { BrandingPanel } from "@/components/settings/branding-panel";

export const dynamic = "force-dynamic";

export default async function AdminBrandingPage() {
  await requirePageAccess("manage-branding");
  const db = await getAppDb();
  const branding = await getBranding(db);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Platform Settings" title="Branding" description="The app and team names, logo, backgrounds and colours. Check the result under Previews." />
      <BrandingPanel branding={branding} isOwner />
    </div>
  );
}
