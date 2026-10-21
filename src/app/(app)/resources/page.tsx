import Link from "next/link";
import { Settings2 } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { hasPermission } from "@/server/auth/permissions";
import { getResourceLibrary } from "@/server/resources/library";
import { visibleResources } from "@/domain/resources";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { ResourcesView } from "@/components/resources/resources-view";

export const dynamic = "force-dynamic";

/**
 * RESOURCES (its own sidebar entry): the team's library of League of Legends sites, for every
 * signed-in account. Administrators keep it in Admin Mode → Platform Settings → Resources; the
 * link to it is shown to them only, and that page and its actions check the permission again.
 */
export default async function ResourcesPage() {
  const session = await requirePageAccess();
  const library = await getResourceLibrary(await getAppDb());
  const canManage = hasPermission(session, "manage-branding");
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-5">
      <PageHeader
        title="Resources"
        description="Useful League of Legends sites for every mode: news and patch notes, statistics, builds, esports and guides. Each opens in a new tab."
        actions={
          canManage ? (
            <Link href="/admin/resources" className={buttonClass("secondary", "sm")} data-testid="resources-manage">
              <Settings2 className="h-4 w-4" aria-hidden /> Manage resources
            </Link>
          ) : null
        }
      />
      <ResourcesView entries={visibleResources(library)} />
    </div>
  );
}
