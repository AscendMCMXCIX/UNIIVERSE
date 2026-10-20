import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";
import { parsePublicSite, type PublicSite } from "@/domain/public-site";
import { cachedFor, invalidateCache } from "@/server/observability/cache";

const KEY = "public_site";

/** The public page's words (domain/public-site): one small settings row, cached per process for a minute and dropped on change. */
export async function getPublicSite(db: Db): Promise<PublicSite> {
  return cachedFor(
    "public-site",
    60_000,
    async () => {
      const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
      return parsePublicSite(row?.value);
    },
    db,
  );
}

/** Stores already-validated settings (validatePublicSite). */
export async function savePublicSite(db: Db, site: PublicSite): Promise<PublicSite> {
  const value = parsePublicSite(site);
  await db.insert(appSettings).values({ key: KEY, value, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  invalidateCache("public-site");
  return getPublicSite(db);
}
