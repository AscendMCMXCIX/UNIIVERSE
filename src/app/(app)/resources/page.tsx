import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getResourceLibrary } from "@/server/resources/library";
import { visibleResources } from "@/domain/resources";
import { PageHeader } from "@/components/ui/page-header";
import { ResourcesView } from "@/components/resources/resources-view";

export const dynamic = "force-dynamic";

/**
 * RESOURCES (its own sidebar entry): the team's library of League of Legends sites, for every
 * signed-in account. Administrators keep it in Admin Mode → Platform Settings → Resources, which
 * checks the permission again; this Player Mode page has no management controls.
 */
export default async function ResourcesPage() {
  await requirePageAccess();
  const library = await getResourceLibrary(await getAppDb());
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-5">
      <PageHeader title="Resources" description="Useful League of Legends sites: news and patch notes, statistics and builds, ARAM, Arena and esports. Each opens in a new tab." guide />
      <ResourcesView entries={visibleResources(library)} />
    </div>
  );
}
