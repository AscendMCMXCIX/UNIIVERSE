import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";
import { BUILTIN_FORMATS, validateFormat, type DraftFormat } from "@/domain/draft";

const KEY = "draft_formats";

/** Custom draft formats defined in Settings (built-in formats are code-defined). */
export async function getCustomFormats(db: Db): Promise<DraftFormat[]> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY));
  const list = Array.isArray(row?.value) ? (row!.value as DraftFormat[]) : [];
  return list.filter((f) => validateFormat(f).length === 0);
}

export async function saveCustomFormats(db: Db, formats: DraftFormat[]): Promise<void> {
  for (const f of formats) {
    const errors = validateFormat(f);
    if (errors.length) throw new Error(`${f.name || f.id}: ${errors.join(" ")}`);
    if (BUILTIN_FORMATS[f.id]) throw new Error(`"${f.id}" is a built-in format id.`);
  }
  await db.insert(appSettings).values({ key: KEY, value: formats, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value: formats, updatedAt: new Date() } });
}

export async function listAllFormats(db: Db): Promise<DraftFormat[]> {
  return [...Object.values(BUILTIN_FORMATS), ...(await getCustomFormats(db))];
}
