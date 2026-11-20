import Link from "next/link";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
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
      <PageHeader admin sectionNamed eyebrow="Platform Settings" title="Branding" description="The app and team names, logo, backgrounds and colours. Check the result under Previews." />
      <BrandingPanel branding={branding} canEdit />
      {/* The public team page has no switch (it is always on); the old /admin/public-access address lands here, inside Admin Mode. */}
      <Panel id="brand-public" data-testid="brand-public">
        <PanelHeader title="Public team page" subtitle="Always on, for anyone with the link: the team name and look, and the lineup's cards (no usernames, Riot IDs or settings)." />
        <PanelBody>
          <Link href="/public" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-sm text-accent underline-offset-2 hover:underline">
            Open the public team page
          </Link>
        </PanelBody>
      </Panel>
    </div>
  );
}
