import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";
import { DEFAULT_BRANDING, parseBranding, type Branding } from "@/domain/branding";
import { cachedFor, invalidateCache } from "@/server/observability/cache";

const KEY = "branding";

/** Read on every page (shell logo and names); cached per process for a minute, invalidated on save. */
export async function getBranding(db: Db): Promise<Branding> {
  return cachedFor("branding", 60_000, async () => {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
    return row ? parseBranding(row.value) : DEFAULT_BRANDING;
  }, db);
}

export async function saveBranding(db: Db, input: unknown): Promise<Branding> {
  const value = parseBranding(input);
  await db.insert(appSettings).values({ key: KEY, value, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  invalidateCache("branding");
  return value;
}
