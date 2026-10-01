"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ROLES } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission, requirePermission, requirePlayerEditor } from "@/server/auth/session";
import { archivePlayer, createPlayer, deletePlayer, getOrCreateTeam, PlayerValidationError, setLineupSlot, setPlayerGroup, updatePlayer } from "@/server/repositories/team";

const playerSchema = z.object({
  displayName: z.string().min(1).max(40),
  riotId: z.string().max(60).optional().nullable(),
  primaryRole: z.enum(ROLES),
  secondaryRole: z.enum(ROLES).nullable().optional(),
  notes: z.string().max(2000).optional(),
  group: z.enum(["main", "other"]).optional(),
  primaryPool: z.array(z.string().min(1)).optional(),
  secondaryPool: z.array(z.string().min(1)).optional(),
});

export type PlayerFormInput = z.infer<typeof playerSchema>;
export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(err: unknown): ActionResult<never> {
  if (err instanceof PlayerValidationError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues.map((i) => i.message).join("; ") };
  return { ok: false, error: (err as Error).message ?? "Something went wrong." };
}

function touch() {
  revalidatePath("/team");
  revalidatePath("/players");
  revalidatePath("/draft");
  revalidatePath("/trends");
  revalidatePath("/me");
}

export async function currentSessionAction() {
  return getSession();
}

export async function createPlayerAction(input: PlayerFormInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("manage-players");
    const parsed = playerSchema.parse(input);
    const db = await getAppDb();
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, parsed, team.poolLimits);
    touch();
    return { ok: true, data: { id: player.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePlayerAction(playerId: string, input: PlayerFormInput): Promise<ActionResult> {
  try {
    const session = await requirePlayerEditor(playerId);
    const parsed = playerSchema.parse(input);
    const db = await getAppDb();
    const team = await getOrCreateTeam(db);
    // Players editing their own profile cannot move themselves between Main and Other.
    if (!hasPermission(session, "manage-players")) {
      const { getPlayer } = await import("@/server/repositories/team");
      const current = await getPlayer(db, playerId);
      if (!current) return { ok: false, error: "Player not found." };
      parsed.group = current.group;
    }
    await updatePlayer(db, playerId, parsed, team.poolLimits);
    touch();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setPlayerGroupAction(playerId: string, group: "main" | "other"): Promise<ActionResult> {
  try {
    await requirePermission("manage-players");
    const db = await getAppDb();
    await setPlayerGroup(db, playerId, group);
    touch();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function archivePlayerAction(playerId: string, archived: boolean): Promise<ActionResult> {
  try {
    await requirePermission("manage-players");
    const db = await getAppDb();
    await archivePlayer(db, playerId, archived);
    touch();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePlayerAction(playerId: string): Promise<ActionResult> {
  try {
    await requirePermission("manage-team");
    const db = await getAppDb();
    await deletePlayer(db, playerId);
    touch();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setLineupSlotAction(role: (typeof ROLES)[number], playerId: string | null): Promise<ActionResult> {
  try {
    await requirePermission("manage-players");
    const db = await getAppDb();
    const team = await getOrCreateTeam(db);
    await setLineupSlot(db, team.id, role, playerId);
    touch();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
