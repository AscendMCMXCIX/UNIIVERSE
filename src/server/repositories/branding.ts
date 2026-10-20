import { eq, inArray, sql } from "drizzle-orm";
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

/** The web copy of an image row (server/branding/web-copy.ts), stored beside it. */
export const webCopyKind = (kind: BrandAssetRow) => `${kind}@web`;
const copiesOf = (kind: BrandAssetKind) => [webCopyKind(kind), webCopyKind(`${kind}-static`)];

/** Stores an image (and its still first frame when it is animated), replacing what was there. */
export async function setBrandAsset(db: Db, kind: BrandAssetKind, image: { contentType: string; data: Buffer; width: number | null; height: number | null; animated: boolean }, still: { contentType: string; data: Buffer; width: number | null; height: number | null } | null): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const rows: Array<typeof brandAssets.$inferInsert & { kind: string }> = [{ kind, contentType: image.contentType, data: image.data, width: image.width, height: image.height, animated: image.animated, updatedAt: now }];
    if (still) rows.push({ kind: `${kind}-static`, contentType: still.contentType, data: still.data, width: still.width, height: still.height, animated: false, updatedAt: now });
    else await tx.delete(brandAssets).where(eq(brandAssets.kind, `${kind}-static`));
    // Copies of the old image go with it; the new one's are made when it is first served.
    await tx.delete(brandAssets).where(inArray(brandAssets.kind, copiesOf(kind)));
    for (const row of rows) {
      await tx
        .insert(brandAssets)
        .values(row)
        .onConflictDoUpdate({ target: brandAssets.kind, set: { contentType: row.contentType, data: row.data, width: row.width ?? null, height: row.height ?? null, animated: row.animated ?? false, updatedAt: now } });
    }
  });
  assetMemory.delete(kind);
  assetMemory.delete(`${kind}-static`);
  invalidateCache("branding");
}

export async function removeBrandAsset(db: Db, kind: BrandAssetKind): Promise<void> {
  await db.delete(brandAssets).where(inArray(brandAssets.kind, [kind, `${kind}-static`, ...copiesOf(kind)]));
  assetMemory.delete(kind);
  assetMemory.delete(`${kind}-static`);
  invalidateCache("branding");
}

/*
  Branding images are the largest values the app reads (several MB each), and every production
  deployment empties the CDN's cache of them. So:
  - the image is served from its web copy when there is one (server/branding/web-copy.ts: WebP
    at the size it is drawn), which is read instead of the original;
  - an instance keeps the bytes it read, one version per kind, and answers a request for that
    version (the ?v= every URL built by the app carries) without asking the database again;
  - they travel as base64, a third larger than the image, instead of bytea's hex text, twice as
    large (docs/HOSTING_USAGE.md).
*/
export interface BrandAssetFile {
  contentType: string;
  data: Buffer;
  version: number;
  /** The image as uploaded, with no web copy yet (the route then has one made). */
  original: boolean;
  animated: boolean;
}

const assetMemory = new Map<BrandAssetRow, BrandAssetFile>();

export async function getBrandAsset(db: Db, kind: BrandAssetRow, version?: number | null): Promise<BrandAssetFile | null> {
  const kept = assetMemory.get(kind);
  if (kept && version != null && kept.version === version) return kept;
  // One row: the web copy made from the current original when there is one, else the original.
  // A copy of an older upload (its version differs) is never served.
  const copy = webCopyKind(kind);
  const [row] = await db
    .select({ kind: brandAssets.kind, contentType: brandAssets.contentType, data: sql<string>`encode(${brandAssets.data}, 'base64')`, updatedAt: brandAssets.updatedAt, animated: brandAssets.animated })
    .from(brandAssets)
    .where(sql`${brandAssets.kind} IN (${kind}, ${copy}) AND ${brandAssets.updatedAt} = (SELECT o.updated_at FROM brand_assets o WHERE o.kind = ${kind})`)
    .orderBy(sql`${brandAssets.kind} = ${copy} DESC`)
    .limit(1);
  if (row) {
    const asset = { contentType: row.contentType, data: Buffer.from(row.data, "base64"), version: row.updatedAt.getTime(), original: row.kind === kind, animated: row.animated };
    assetMemory.set(kind, asset);
    return asset;
  }
  // A still frame falls back to the image itself (a GIF shows its first frame where it cannot animate).
  if (kind.endsWith("-static")) return getBrandAsset(db, kind.replace("-static", "") as BrandAssetRow, version);
  return null;
}

/**
 * Stores the web copy of an image, provided the original is still the version it was made from
 * (a newer upload has its own copy made). Writes only: no image data is read back.
 */
export async function storeWebCopy(db: Db, kind: BrandAssetRow, version: number, copy: { contentType: string; data: Buffer; width: number; height: number; animated: boolean }): Promise<boolean> {
  const rows = await db.execute(sql`
    INSERT INTO brand_assets (kind, content_type, data, width, height, animated, updated_at)
    SELECT ${webCopyKind(kind)}, ${copy.contentType}, ${copy.data}, ${copy.width}, ${copy.height}, ${copy.animated}, o.updated_at
    FROM brand_assets o
    WHERE o.kind = ${kind} AND o.updated_at = ${new Date(version).toISOString()}::timestamptz
    ON CONFLICT (kind) DO UPDATE SET content_type = excluded.content_type, data = excluded.data, width = excluded.width, height = excluded.height, animated = excluded.animated, updated_at = excluded.updated_at
    RETURNING kind`);
  const stored = ((rows as { rows?: unknown[] }).rows ?? (rows as unknown[])).length > 0;
  if (stored) assetMemory.delete(kind);
  return stored;
}

export const isBrandAssetRow = (v: string): v is BrandAssetRow => BRAND_ASSET_KINDS.some((k) => v === k || v === `${k}-static`);
