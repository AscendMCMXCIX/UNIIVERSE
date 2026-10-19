import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { permissionPresets, users } from "@/server/db/schema";
import { CAPABILITY_KEYS, sanitiseAccessGroups, sanitiseCapabilities, STANDARD_PLAYER, type AccessGroupKey, type Capability } from "@/server/auth/permissions";
import { getUser, UserError } from "./users";
import { guardLastAdmin, guardSelf } from "@/server/auth/account-admin";

/*
  Permission presets and per-user capability choices (Admin → People & Access). Only an owner
  calls these (the actions check "manage-users", which is never delegated). Owners themselves are
  never limited: presets and custom sets apply to players only.
*/

/** Built-in access levels backed by presets (migration 0014). */
export type LevelKey = "administrator" | "standard" | "restricted";
/** Selector order: Standard Player (the default), Team Manager (level key "administrator" since 0014; renamed by 0029), Restricted Player. */
const LEVEL_ORDER: Record<string, number> = { standard: 0, administrator: 1, restricted: 2 };

export interface PermissionPreset {
  id: string;
  name: string;
  description: string;
  capabilities: Capability[];
  isDefault: boolean;
  /** Built-in level this preset implements; null for presets an owner created. */
  levelKey: LevelKey | null;
  /** Players currently using this preset (the default preset counts players without one). */
  userCount: number;
}

export async function listPermissionPresets(db: Db): Promise<PermissionPreset[]> {
  const rows = await db.select().from(permissionPresets).orderBy(sql`${permissionPresets.isDefault} desc`, asc(permissionPresets.name));
  const counts = await db
    .select({ presetId: users.permissionPresetId, custom: sql<boolean>`${users.customCapabilities} is not null`, n: sql<number>`count(*)` })
    .from(users)
    .where(sql`${users.role} <> 'owner' and ${users.isActive}`)
    .groupBy(users.permissionPresetId, sql`${users.customCapabilities} is not null`);
  // Built-in levels first (Standard Player, Team Manager, Restricted Player), then the owner's own.
  const sorted = [...rows].sort((a, b) => (LEVEL_ORDER[a.levelKey ?? ""] ?? 9) - (LEVEL_ORDER[b.levelKey ?? ""] ?? 9) || a.name.localeCompare(b.name));
  return sorted.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    capabilities: sanitiseCapabilities(r.capabilities),
    isDefault: r.isDefault,
    levelKey: (r.levelKey as LevelKey | null) ?? null,
    userCount: counts.filter((c) => !c.custom && (c.presetId === r.id || (r.isDefault && c.presetId === null))).reduce((s, c) => s + Number(c.n), 0),
  }));
}

function cleanName(name: string): string {
  const value = name.trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 40) throw new UserError("Give the preset a name of 2–40 characters.");
  return value;
}

export async function savePermissionPreset(db: Db, input: { id?: string | null; name: string; description?: string; capabilities: string[] }): Promise<string> {
  const name = cleanName(input.name);
  const capabilities = sanitiseCapabilities(input.capabilities);
  const description = (input.description ?? "").trim().slice(0, 200);
  const [clash] = await db.select({ id: permissionPresets.id }).from(permissionPresets).where(sql`lower(${permissionPresets.name}) = lower(${name})`);
  if (clash && clash.id !== input.id) throw new UserError("A preset with that name already exists.");
  if (input.id) {
    const updated = await db.update(permissionPresets).set({ name, description, capabilities, updatedAt: new Date() }).where(eq(permissionPresets.id, input.id)).returning({ id: permissionPresets.id });
    if (updated.length === 0) throw new UserError("That preset no longer exists.");
    return input.id;
  }
  const [row] = await db.insert(permissionPresets).values({ name, description, capabilities, isDefault: false }).returning({ id: permissionPresets.id });
  return row!.id;
}

/** Deletes a preset; its players fall back to the default preset. The default preset cannot be deleted. */
export async function deletePermissionPreset(db: Db, id: string): Promise<void> {
  const [row] = await db.select().from(permissionPresets).where(eq(permissionPresets.id, id));
  if (!row) return;
  if (row.isDefault) throw new UserError("The default preset cannot be deleted; edit it instead.");
  if (row.levelKey) throw new UserError("Built-in access levels cannot be deleted; edit what they allow instead.");
  await db.delete(permissionPresets).where(eq(permissionPresets.id, id));
}

/**
 * Assigns a player's permissions: a preset (null = default) or a custom capability list. Owners
 * are refused: their access is their role, not a preset, so no permission edit can lock an
 * owner out.
 */
export async function setUserPermissions(db: Db, userId: string, choice: { presetId: string | null } | { custom: string[] }): Promise<void> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (!user) throw new UserError("Account not found.");
  if (user.role === "owner") throw new UserError("Admins always have full access; their permissions cannot be limited.");
  if ("custom" in choice) {
    await db.update(users).set({ customCapabilities: sanitiseCapabilities(choice.custom), updatedAt: new Date() }).where(eq(users.id, userId));
    return;
  }
  if (choice.presetId) {
    const [preset] = await db.select({ id: permissionPresets.id }).from(permissionPresets).where(eq(permissionPresets.id, choice.presetId));
    if (!preset) throw new UserError("That preset no longer exists.");
  }
  await db.update(users).set({ permissionPresetId: choice.presetId, customCapabilities: null, updatedAt: new Date() }).where(eq(users.id, userId));
}

export type AccessLevelChoice = { level: "owner" } | { level: "preset"; presetId: string } | { level: "custom"; capabilities: string[] };

/**
 * The one place an account's access level changes (Admin → People & Access, Owner only):
 * Owner, a preset level (Administrator, Standard Player, Restricted Player or one the owner made),
 * or Custom. Nobody can change their own level (no self-elevation, no locking yourself out), and
 * the last active Owner can never lose Owner access. Administrator is a preset of delegable
 * capabilities, so it can never reach the Owner-only operations (accounts, passwords, permissions).
 */
/** Why no account can be made an Owner from Admin Mode. */
export const ONE_OWNER = "There is one Owner account (the administrative account). Other accounts get access levels and groups instead.";

export async function setAccessLevel(db: Db, actorId: string | null, userId: string, choice: AccessLevelChoice): Promise<void> {
  const target = await getUser(db, userId);
  if (!target) throw new UserError("Account not found.");
  guardSelf(actorId, userId, "change the access level of");
  // There is one Owner, the administrative account: ownership is never handed to another account.
  if (choice.level === "owner") {
    if (target.role === "owner") return;
    throw new UserError(ONE_OWNER);
  }
  if (target.role === "owner") await guardLastAdmin(db, target, "remove Owner access from");
  let presetId: string | null = null;
  let custom: Capability[] | null = null;
  if (choice.level === "custom") custom = sanitiseCapabilities(choice.capabilities);
  else {
    const [preset] = await db.select({ id: permissionPresets.id, isDefault: permissionPresets.isDefault }).from(permissionPresets).where(eq(permissionPresets.id, choice.presetId));
    if (!preset) throw new UserError("That access level no longer exists.");
    presetId = preset.isDefault ? null : preset.id;
  }
  await db.update(users).set({ role: "player", permissionPresetId: presetId, customCapabilities: custom, updatedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Additional access groups for a player (Admin → People & Access, Owner only). They add a few
 * capabilities on top of the base level and never include the Owner-only ones. Nobody changes
 * their own groups (no self-elevation); owners need none (they already hold everything).
 */
export async function setAccessGroups(db: Db, actorId: string | null, userId: string, groups: readonly string[]): Promise<AccessGroupKey[]> {
  const target = await getUser(db, userId);
  if (!target) throw new UserError("Account not found.");
  guardSelf(actorId, userId, "change the additional access of");
  if (target.role === "owner") throw new UserError("Owners already have full access; additional groups do not apply.");
  const clean = sanitiseAccessGroups(groups);
  await db.update(users).set({ accessGroups: clean, updatedAt: new Date() }).where(eq(users.id, userId));
  return clean;
}

/** The default capabilities (default preset), for screens that describe a new account. */
export async function defaultCapabilities(db: Db): Promise<Capability[]> {
  const [row] = await db.select({ capabilities: permissionPresets.capabilities }).from(permissionPresets).where(eq(permissionPresets.isDefault, true));
  return row ? sanitiseCapabilities(row.capabilities) : [...STANDARD_PLAYER];
}

export { CAPABILITY_KEYS };
