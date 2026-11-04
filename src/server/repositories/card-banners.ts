import { eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { playerCardBanners, players } from "@/server/db/schema";
import { sniffImage } from "@/server/images";
import { cardBannerUrl as bannerUrl } from "@/domain/card-style";
import { UserError } from "./users";
import { invalidateCache } from "@/server/observability/cache";

/*
  Optional card banners (Player Card Studio). The browser crops and resizes the picture to a
  landscape image (at most 1600×800, WebP or JPEG) before sending it; the server checks the
  real type from the bytes, the size and the dimensions, and stores it in the database next to
  avatars. Served to signed-in members only, with a versioned URL.
*/

export const BANNER_MAX_BYTES = 450 * 1024;
export const BANNER_MIN_WIDTH = 320;
export const BANNER_MAX_SIDE = 2000;
const BANNER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export { bannerUrl };

export async function setCardBanner(db: Db, playerId: string, data: Buffer): Promise<number> {
  if (data.length > BANNER_MAX_BYTES) throw new UserError("That banner is too large (450 KB at most after resizing).");
  const info = sniffImage(data);
  if (!info || !BANNER_TYPES.has(info.type)) throw new UserError("Use a PNG, JPEG or WebP picture.");
  if (info.width < BANNER_MIN_WIDTH || info.height < 120 || info.width > BANNER_MAX_SIDE || info.height > BANNER_MAX_SIDE) throw new UserError("Use a picture at least 320 pixels wide (2000 at most on each side).");
  if (info.width < info.height) throw new UserError("Banners are landscape: use a picture wider than it is tall.");
  const now = new Date();
  await db.insert(playerCardBanners).values({ playerId, contentType: info.type, data, updatedAt: now }).onConflictDoUpdate({ target: playerCardBanners.playerId, set: { contentType: info.type, data, updatedAt: now } });
  const version = Math.floor(now.getTime() / 1000);
  await db.update(players).set({ cardBannerVersion: version }).where(eq(players.id, playerId));
  invalidateCache(`public-image:banner:${playerId}`);
  return version;
}

export async function removeCardBanner(db: Db, playerId: string): Promise<void> {
  await db.delete(playerCardBanners).where(eq(playerCardBanners.playerId, playerId));
  await db.update(players).set({ cardBannerVersion: null }).where(eq(players.id, playerId));
  invalidateCache(`public-image:banner:${playerId}`);
}

export async function getCardBanner(db: Db, playerId: string): Promise<{ contentType: string; data: Buffer } | null> {
  // base64 is a third larger than the image; bytea's hex text would be twice as large.
  const [row] = await db.select({ contentType: playerCardBanners.contentType, data: sql<string>`encode(${playerCardBanners.data}, 'base64')` }).from(playerCardBanners).where(eq(playerCardBanners.playerId, playerId));
  return row ? { contentType: row.contentType, data: Buffer.from(row.data, "base64") } : null;
}

/** playerId → banner URL for every player with a banner. */
export async function bannerUrlsByPlayer(db: Db): Promise<Record<string, string>> {
  const rows = await db.select({ id: players.id, version: players.cardBannerVersion }).from(players).where(isNotNull(players.cardBannerVersion));
  return Object.fromEntries(rows.map((r) => [r.id, bannerUrl(r.id, r.version)!]));
}
