import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getResourceLibrary } from "@/server/resources/library";
import { visibleResources } from "@/domain/resources";
import { PageHeader } from "@/components/ui/page-header";
import { ResourcesView } from "@/components/resources/resources-view";

export const dynamic = "force-dynamic";

/**
 * RESOURCES, the Library (the sidebar's Resources entry, one page with no tabs; Champion Lookup is
 * an entry of its own): the team's library of League of Legends sites, for every signed-in account.
 * Administrators keep it in Admin Mode → Platform Settings → Resources, which checks the permission
 * again; this Player Mode page has no management controls.
 */
export default async function ResourcesPage() {
  await requirePageAccess();
  const library = await getResourceLibrary(await getAppDb());
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-5">
      {/* No description (Release 17's noise audit): the index under the search names the sections, and every link shows (and reads out) that it opens a new tab. */}
      <PageHeader title="Resources" />
      <ResourcesView entries={visibleResources(library)} />
    </div>
  );
}
