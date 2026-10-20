import { PageHeader } from "@/components/ui/page-header";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getBranding } from "@/server/repositories/branding";
import { getPublicSite } from "@/server/repositories/public-site";
import { BrandingPanel } from "@/components/settings/branding-panel";
import { PublicSitePanel } from "@/components/settings/public-site-panel";

export const dynamic = "force-dynamic";

export default async function AdminBrandingPage() {
  await requirePageAccess("manage-branding");
  const db = await getAppDb();
  const [branding, site] = await Promise.all([getBranding(db), getPublicSite(db)]);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Branding" description="The app and team names, logo, backgrounds and colours, and what the public page says. Check the result under Previews." />
      <BrandingPanel branding={branding} isOwner />
      <PublicSitePanel site={site} teamName={branding.teamName} />
    </div>
  );
}
