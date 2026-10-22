import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";
import { clashScoutEnabled } from "@/server/clash/access";
import { liveMasteryEnabled, standInMode } from "@/server/clash/candidate-riot";
import { listChampions } from "@/server/repositories/champions";
import { OPGG_PLATFORMS } from "@/domain/opgg";
import { PageHeader } from "@/components/ui/page-header";
import { ClashLab } from "@/components/clash/lab/clash-lab";

export const dynamic = "force-dynamic";

export const metadata = { title: "Clash Scout Testing Lab" };

/**
 * CLASH SCOUT TESTING LAB (/clash/lab): tests of opponent identification without a tournament or a
 * screenshot, on the same engine as Clash Scout. The Owner and administrators only: anyone else is
 * told the page does not exist. Nothing a test holds is stored.
 */
export default async function ClashLabPage() {
  if (!clashScoutEnabled()) notFound();
  const session = await getSession();
  if (!session || !isAdmin(session)) notFound();
  const db = await getAppDb();
  const champions = await listChampions(db);
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-6">
      <PageHeader
        eyebrow="Clash Scout · Testing Lab"
        title="Testing Lab"
        description="Try the real identification engine on opponents you type or on blind tests built from accounts UNIIVERSE already knows. A test environment: nothing here is a scout, nothing is saved, and the page forgets a test when you leave it."
      />
      <ClashLab
        champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }))}
        platforms={[...OPGG_PLATFORMS]}
        defaultPlatform="oc1"
        standIn={standInMode()}
        liveMastery={liveMasteryEnabled()}
      />
    </div>
  );
}
