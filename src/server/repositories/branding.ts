import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings, brandAssets } from "@/server/db/schema";
import { BRAND_ASSET_KINDS, brandingSettings, DEFAULT_BRANDING, parseBranding, type BrandAssetKind, type BrandAssetMeta, type Branding } from "@/domain/branding";
import { cachedFor, invalidateCache } from "@/server/observability/cache";

const KEY = "branding";
export type BrandAssetRow = `${BrandAssetKind}` | `${BrandAssetKind}-static`;

/** Which images exist (no image data): enough to build their URLs. */
async function loadAssetMeta(db: Db): Promise<Branding["assets"]> {
  const rows = await db.select({ kind: brandAssets.kind, animated: brandAssets.animated, updatedAt: brandAssets.updatedAt }).from(brandAssets);
  const meta = (kind: BrandAssetKind): BrandAssetMeta | null => {
    const main = rows.find((r) => r.kind === kind);
    if (!main) return null;
    return { version: main.updatedAt.getTime(), animated: main.animated, hasStatic: rows.some((r) => r.kind === `${kind}-static`) };
  };
  return { logo: meta("logo"), background: meta("background"), appBackground: meta("appBackground") };
}

/** Read on every page (shell logo, names, colours); cached per process for a minute, invalidated on change. */
export async function getBranding(db: Db): Promise<Branding> {
  return cachedFor(
    "branding",
    60_000,
    async () => {
      const [[row], assets] = await Promise.all([db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY)), loadAssetMeta(db)]);
      return row ? parseBranding(row.value, assets) : { ...DEFAULT_BRANDING, assets };
    },
    db,
  );
}

/** Saves names and colours (images are separate). */
export async function saveBranding(db: Db, input: unknown): Promise<Branding> {
  const value = brandingSettings(parseBranding(input));
  await db.insert(appSettings).values({ key: KEY, value, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  invalidateCache("branding");
  return getBranding(db);
}

/** Stores an image (and its still first frame when it is animated), replacing what was there. */
export async function setBrandAsset(db: Db, kind: BrandAssetKind, image: { contentType: string; data: Buffer; width: number | null; height: number | null; animated: boolean }, still: { contentType: string; data: Buffer; width: number | null; height: number | null } | null): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const rows: Array<typeof brandAssets.$inferInsert & { kind: string }> = [{ kind, contentType: image.contentType, data: image.data, width: image.width, height: image.height, animated: image.animated, updatedAt: now }];
    if (still) rows.push({ kind: `${kind}-static`, contentType: still.contentType, data: still.data, width: still.width, height: still.height, animated: false, updatedAt: now });
    else await tx.delete(brandAssets).where(eq(brandAssets.kind, `${kind}-static`));
    for (const row of rows) {
      await tx
        .insert(brandAssets)
        .values(row)
        .onConflictDoUpdate({ target: brandAssets.kind, set: { contentType: row.contentType, data: row.data, width: row.width ?? null, height: row.height ?? null, animated: row.animated ?? false, updatedAt: now } });
    }
  });
  invalidateCache("branding");
}

export async function removeBrandAsset(db: Db, kind: BrandAssetKind): Promise<void> {
  await db.delete(brandAssets).where(inArray(brandAssets.kind, [kind, `${kind}-static`]));
  invalidateCache("branding");
}

export async function getBrandAsset(db: Db, kind: BrandAssetRow): Promise<{ contentType: string; data: Buffer } | null> {
  const [row] = await db.select({ contentType: brandAssets.contentType, data: brandAssets.data }).from(brandAssets).where(eq(brandAssets.kind, kind));
  if (row) return row;
  // A still frame falls back to the image itself (a GIF shows its first frame where it cannot animate).
  if (kind.endsWith("-static")) return getBrandAsset(db, kind.replace("-static", "") as BrandAssetRow);
  return null;
}

export const isBrandAssetRow = (v: string): v is BrandAssetRow => BRAND_ASSET_KINDS.some((k) => v === k || v === `${k}-static`);
