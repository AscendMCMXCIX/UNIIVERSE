import Link from "next/link";
import { requirePageAccess } from "@/server/auth/page-access";
import { getAppDb } from "@/server/bootstrap";
import { readResourceLibrary } from "@/server/resources/library";
import { removedDefaults } from "@/domain/resources";
import { PageHeader } from "@/components/ui/page-header";
import { ResourcesManager } from "@/components/resources/resources-manager";

export const dynamic = "force-dynamic";

/** Admin Mode → Platform Settings → Resources: the library members see under Resources. */
export default async function AdminResourcesPage() {
  await requirePageAccess("manage-branding");
  // As stored now, not this server instance’s cached copy: an administrator acts on the current library.
  const library = await readResourceLibrary(await getAppDb());
  return (
    <div className="space-y-5">
      <PageHeader
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
      <ResourcesManager initial={{ entries: library.entries, removed: removedDefaults(library) }} />
    </div>
  );
}
