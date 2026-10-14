import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { permissionPresets, users } from "@/server/db/schema";
import { CAPABILITY_KEYS, sanitiseCapabilities, STANDARD_PLAYER, type Capability } from "@/server/auth/permissions";
import { UserError } from "./users";

/*
  Permission presets and per-user capability choices (Admin → Users & Permissions). Only an owner
  calls these (the actions check "manage-users", which is never delegated). Owners themselves are
  never limited: presets and custom sets apply to players only.
*/

export interface PermissionPreset {
  id: string;
  name: string;
  description: string;
  capabilities: Capability[];
  isDefault: boolean;
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
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    capabilities: sanitiseCapabilities(r.capabilities),
    isDefault: r.isDefault,
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

/** The default capabilities (default preset), for screens that describe a new account. */
export async function defaultCapabilities(db: Db): Promise<Capability[]> {
  const [row] = await db.select({ capabilities: permissionPresets.capabilities }).from(permissionPresets).where(eq(permissionPresets.isDefault, true));
  return row ? sanitiseCapabilities(row.capabilities) : [...STANDARD_PLAYER];
}

export { CAPABILITY_KEYS };
