import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { userAvatars } from "@/server/db/schema";
import { getAvatar } from "@/server/repositories/profile";

/*
  Profile pictures as served. A picture is stored as uploaded (up to 400 KB and 1024 px a side),
  and was read whole from the database by every browser that had not cached it yet: each fresh
  browser of a Production check run, at each width, read every member's picture again. On
  24 Nov 2026 that was 67.7 MB of the database's egress, over half the 120 MB daily budget
  (docs/HOSTING_USAGE.md, "25 Nov 2026").

  So the server serves a copy made for the screen, WebP at the largest size a picture is drawn,
  and keeps that copy in Next's data cache under the stored picture's own time of saving (to the
  millisecond, one small read per request): the database's bytes are read once per uploaded
  picture rather than once per browser. A new upload changes that time, and so the key, and a
  removed picture has no row, so neither can serve a stale picture. The stored
  original is never changed. Who may see a picture is still decided on every request, before this
  is called (the two routes).
*/

/** The largest a picture is drawn, in device pixels: 96 CSS pixels (the profile header's) on a 3× screen. */
export const AVATAR_SERVED_SIDE = 288;

/** How long a copy is kept without a request. A new version never reads an old copy, so this only bounds the cache's size. */
const KEEP_SECONDS = 30 * 24 * 60 * 60;

export interface ServedAvatar {
  contentType: string;
  data: Buffer;
}

/**
 * A copy of a stored picture for the screen: WebP, no larger than AVATAR_SERVED_SIDE. The original
 * itself where the copy would not be clearly smaller, or where it cannot be decoded (it was
 * validated on upload, so this is only a safeguard).
 */
export async function makeServedCopy(image: ServedAvatar): Promise<ServedAvatar> {
  try {
    // Loaded only when a copy is made (once per picture version), as the branding copies are.
    const { default: sharp } = await import("sharp");
    const data = await sharp(image.data, { limitInputPixels: 4_000_000 })
      .resize({ width: AVATAR_SERVED_SIDE, height: AVATAR_SERVED_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    return data.length < image.data.length * 0.9 ? { contentType: "image/webp", data } : image;
  } catch {
    return image;
  }
}

/**
 * The picture of `userId`, as served: its bytes read from the database and copied only the first
 * time this saved picture is asked for, then from the data cache. Null when there is no picture.
 */
export async function servedAvatar(db: Db, userId: string): Promise<ServedAvatar | null> {
  const [row] = await db.select({ savedAt: userAvatars.updatedAt }).from(userAvatars).where(eq(userAvatars.userId, userId));
  if (!row) return null;
  const copy = async () => {
    const stored = await getAvatar(db, userId);
    if (!stored) return null;
    const made = await makeServedCopy(stored);
    // The data cache keeps JSON, so the bytes travel as base64.
    return { contentType: made.contentType, base64: made.data.toString("base64") };
  };
  // The data cache exists only inside the Next server (NEXT_RUNTIME is set there); scripts and
  // tests that call a route directly make the copy each time.
  const load = process.env.NEXT_RUNTIME
    ? unstable_cache(copy, ["served-avatar", userId, String(new Date(row.savedAt).getTime()), String(AVATAR_SERVED_SIDE)], { revalidate: KEEP_SECONDS, tags: [`avatar:${userId}`] })
    : copy;
  const hit = await load();
  return hit ? { contentType: hit.contentType, data: Buffer.from(hit.base64, "base64") } : null;
}
