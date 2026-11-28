import Link from "next/link";
import { cookies } from "next/headers";
import { requirePageAccess } from "@/server/auth/page-access";
import { rowsPerPageCap } from "@/server/demo/test-hooks";
import { getAppDb } from "@/server/bootstrap";
import { readResourceLibrary } from "@/server/resources/library";
import { removedDefaults } from "@/domain/resources";
import { PageHeader } from "@/components/ui/page-header";
import { ResourcesManager } from "@/components/resources/resources-manager";
import { WS_COLUMN } from "@/components/ui/workspace-classes";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/**
 * Admin Mode → Platform Settings → Resources: the library members see under Resources. On a desktop
 * window one paged list that fills the window (docs/RESPONSIVE.md, "One-screen desktop pages",
 * Resources); its filter is in the address (?section=), read here so the first paint shows it.
 */
export default async function AdminResourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess("manage-branding");
  const section = (await searchParams).section;
  // As stored now, not this server instance’s cached copy: an administrator acts on the current library.
  const library = await readResourceLibrary(await getAppDb());
  return (
    <div className={cn("space-y-5", WS_COLUMN)}>
      <PageHeader admin sectionNamed
        eyebrow="Platform Settings"
        title="Resources"
        description={
          <>
            The sites every member sees under{" "}
            <Link href="/resources" className="text-accent underline-offset-2 hover:underline">
              Resources
            </Link>
            . Add, edit, reorder, hide or remove them; each change is saved at once. Defaults you remove or hide stay that way through every update.
          </>
        }
      />
      <ResourcesManager initial={{ entries: library.entries, removed: removedDefaults(library) }} filter={typeof section === "string" ? section : null} cap={rowsPerPageCap(await cookies())} />
    </div>
  );
}
