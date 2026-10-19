import { eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players, userAvatars, users } from "@/server/db/schema";
import { sniffImage } from "@/server/images";
import { getUser, updateUser, UserError } from "./users";

/*
  Self-service account details: username and profile picture. Usernames stay unique
  case-insensitively; changing one keeps the same account row, so the password, sessions, player
  profile, Riot accounts and statistics are untouched.
*/

/** Profile pictures: PNG, JPEG or WebP, at most 400 KB and 1024×1024 (the browser sends 256×256). */
export const AVATAR_MAX_BYTES = 400 * 1024;
export const AVATAR_MAX_SIDE = 1024;
const AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function changeUsername(db: Db, userId: string, next: string): Promise<{ username: string }> {
  const user = await getUser(db, userId);
  if (!user) throw new UserError("Account not found.");
  await updateUser(db, userId, { username: next });
  const fresh = (await getUser(db, userId))!;
  if (fresh.username === user.username) return { username: fresh.username };
  // The display name follows the username unless it was set to something else.
  const followed = user.displayName.toLowerCase() === user.username.toLowerCase();
  if (followed) await db.update(users).set({ displayName: fresh.username, updatedAt: new Date() }).where(eq(users.id, userId));
  if (user.playerId) {
    await db
      .update(players)
      .set({ displayName: fresh.username, updatedAt: new Date() })
      .where(sql`${players.id} = ${user.playerId} and (lower(${players.displayName}) = lower(${user.username}) or lower(${players.displayName}) = lower(${user.displayName}))`);
  }
  return { username: fresh.username };
}

export async function setAvatar(db: Db, userId: string, data: Buffer): Promise<number> {
  if (data.length > AVATAR_MAX_BYTES) throw new UserError("That picture is too large (400 KB at most).");
  const info = sniffImage(data);
  if (!info || !AVATAR_TYPES.has(info.type)) throw new UserError("Use a PNG, JPEG or WebP picture.");
  if (info.width < 16 || info.height < 16 || info.width > AVATAR_MAX_SIDE || info.height > AVATAR_MAX_SIDE) throw new UserError("Use a picture between 16 and 1024 pixels on each side.");
  const now = new Date();
  await db.insert(userAvatars).values({ userId, contentType: info.type, data, updatedAt: now }).onConflictDoUpdate({ target: userAvatars.userId, set: { contentType: info.type, data, updatedAt: now } });
  const version = Math.floor(now.getTime() / 1000);
  await db.update(users).set({ avatarVersion: version, updatedAt: now }).where(eq(users.id, userId));
  return version;
}

export async function removeAvatar(db: Db, userId: string): Promise<void> {
  await db.delete(userAvatars).where(eq(userAvatars.userId, userId));
  await db.update(users).set({ avatarVersion: null, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function getAvatar(db: Db, userId: string): Promise<{ contentType: string; data: Buffer } | null> {
  const [row] = await db.select({ contentType: userAvatars.contentType, data: userAvatars.data }).from(userAvatars).where(eq(userAvatars.userId, userId));
  return row ?? null;
}

/** playerId → picture URL for every player whose account has a picture (for directories and the team view). */
export async function avatarUrlsByPlayer(db: Db): Promise<Record<string, string>> {
  const rows = await db.select({ id: users.id, playerId: users.playerId, version: users.avatarVersion }).from(users).where(sql`${users.playerId} is not null and ${users.avatarVersion} is not null`);
  return Object.fromEntries(rows.map((r) => [r.playerId!, `/api/avatars/${r.id}?v=${r.version}`]));
}
