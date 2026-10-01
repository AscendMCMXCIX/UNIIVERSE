import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";
import { DEFAULT_BRANDING, parseBranding, type Branding } from "@/domain/branding";

const KEY = "branding";

export async function getBranding(db: Db): Promise<Branding> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY));
  return row ? parseBranding(row.value) : DEFAULT_BRANDING;
}

export async function saveBranding(db: Db, input: unknown): Promise<Branding> {
  const value = parseBranding(input);
  await db.insert(appSettings).values({ key: KEY, value, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  return value;
}
