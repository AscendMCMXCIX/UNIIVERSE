import Link from "next/link";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getBranding } from "@/server/repositories/branding";
import { BrandingPanel } from "@/components/settings/branding-panel";
import { WS_COLUMN } from "@/components/ui/workspace-classes";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/**
 * Admin Mode → Platform Settings → Branding. On a desktop window a sectioned workspace (docs/RESPONSIVE.md,
 * "One-screen desktop pages", Branding): the section is in the address (?section=, read here so the
 * first paint shows it), and the Public team page is its last section.
 */
export default async function AdminBrandingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess("manage-branding");
  const db = await getAppDb();
  const branding = await getBranding(db);
  const section = (await searchParams).section;
  return (
    <div className={cn("space-y-5", WS_COLUMN)}>
      <PageHeader admin sectionNamed eyebrow="Platform Settings" title="Branding" description="The app and team names, logo, backgrounds and colours. Check the result under Previews." />
      <BrandingPanel
        branding={branding}
        canEdit
        section={typeof section === "string" ? section : null}
        publicPage={
          // The public team page has no switch (it is always on); the old /admin/public-access address lands here, inside Admin Mode.
          <Panel id="brand-public" data-testid="brand-public">
            <PanelHeader title="Public team page" subtitle="Always on, for anyone with the link: the team name and look, the lineup's and substitutes' cards and the links each player shows publicly; never usernames, Riot IDs or settings. Ranks and statistics only where the deployment allows Riot data on public pages." />
            <PanelBody>
              <Link href="/public" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-sm text-accent underline-offset-2 hover:underline">
                Open the public team page
              </Link>
            </PanelBody>
          </Panel>
        }
      />
    </div>
  );
}
