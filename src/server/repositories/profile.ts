import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { displayNameProblem, normaliseDisplayName } from "@/domain/display-name";
import { readSocialLinks, type SocialLinks } from "@/domain/social-links";
import type { Db } from "@/server/db/types";
import { players, userAvatars, users } from "@/server/db/schema";
import { sniffImage } from "@/server/images";
import { getUser, updateUser, UserError } from "./users";

/*
  Self-service account details: display name, username and profile picture. The display name is
  what everyone sees (Team, Players, profiles, cards, Leaderboards, Matches); the username is only
  what one signs in with. Each changes on its own: renaming one never touches the other. Usernames
  stay unique case-insensitively; display names need not be. Both keep the same account and player
  rows, so the password, sessions, profile, Riot accounts and statistics are untouched.
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
  return { username: fresh.username };
}

/**
 * The visible name, on the account and its player profile together (the account menu reads the
 * first, every team page the second), so they never disagree. The username does not change.
 */
export async function setDisplayName(db: Db, userId: string, next: string): Promise<{ displayName: string }> {
  const problem = displayNameProblem(next);
  if (problem) throw new UserError(`Display name: ${problem}`);
  const displayName = normaliseDisplayName(next);
  return db.transaction(async (tx) => {
    const user = await getUser(tx, userId);
    if (!user) throw new UserError("Account not found.");
    const now = new Date();
    await tx.update(users).set({ displayName, updatedAt: now }).where(eq(users.id, userId));
    if (user.playerId) await tx.update(players).set({ displayName, updatedAt: now }).where(eq(players.id, user.playerId));
    return { displayName };
  });
}

/*
  Social links are read only here and only for the server to filter (visibleSocialLinks: only links
  switched on to "Show publicly"): the stored value, with links their owner keeps to themselves, is
  never part of PlayerRecord, which pages send to the browser.
*/

/** Each player's stored links, read through readSocialLinks (one switch per link; a row in the old shape is read safely), for the owner's own Settings or for the server to filter for a page. */
export async function loadSocialLinks(db: Db, playerIds: readonly string[]): Promise<Map<string, SocialLinks>> {
  if (playerIds.length === 0) return new Map();
  const rows = await db.select({ id: players.id, links: players.socialLinks }).from(players).where(and(inArray(players.id, [...new Set(playerIds)]), isNotNull(players.socialLinks)));
  const out = new Map<string, SocialLinks>();
  for (const r of rows) {
    const links = readSocialLinks(r.links);
    if (links) out.set(r.id, links);
  }
  return out;
}

/** A member's own YouTube, Twitch and Discord, each with "Show publicly" (already checked: domain/social-links); null clears them. */
export async function setSocialLinks(db: Db, playerId: string, links: SocialLinks | null): Promise<void> {
  await db.update(players).set({ socialLinks: links, updatedAt: new Date() }).where(eq(players.id, playerId));
}

/** The name a member currently shows: their player profile's (what teammates see), else the account's. */
export async function currentDisplayName(db: Db, user: { displayName: string; playerId: string | null }): Promise<string> {
  if (!user.playerId) return user.displayName;
  const [row] = await db.select({ name: players.displayName }).from(players).where(eq(players.id, user.playerId));
  return row?.name ?? user.displayName;
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
  // base64 is a third larger than the image; bytea's hex text would be twice as large.
  const [row] = await db.select({ contentType: userAvatars.contentType, data: sql<string>`encode(${userAvatars.data}, 'base64')` }).from(userAvatars).where(eq(userAvatars.userId, userId));
  return row ? { contentType: row.contentType, data: Buffer.from(row.data, "base64") } : null;
}

/** playerId → picture URL for every player whose account has a picture (for directories and the team view). */
export async function avatarUrlsByPlayer(db: Db): Promise<Record<string, string>> {
  const rows = await db.select({ id: users.id, playerId: users.playerId, version: users.avatarVersion }).from(users).where(sql`${users.playerId} is not null and ${users.avatarVersion} is not null`);
  return Object.fromEntries(rows.map((r) => [r.playerId!, `/api/avatars/${r.id}?v=${r.version}`]));
}
