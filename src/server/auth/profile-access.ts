import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players } from "@/server/db/schema";
import { canOpenProfile, isAdmin, type Session } from "./permissions";

/** What a refused viewer is told about a personal-use profile: the same as about one that does not exist. */
export const PROFILE_NOT_FOUND = "Player not found.";

const PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * May this viewer open this player's profile and its data at all (canOpenProfile in
 * permissions.ts), from the stored membership: a personal-use profile is its own player's and the
 * administrators' only. A profile that does not exist is not openable, except by its own player
 * and administrators, who are answered without a query (the caller then finds it missing as before).
 * Capabilities are not checked here: every page and action checks its own as well.
 */
export async function mayOpenProfile(db: Db, session: Session | null, playerId: unknown): Promise<boolean> {
  if (!session || typeof playerId !== "string") return false;
  if ((!!session.playerId && session.playerId === playerId) || isAdmin(session)) return true;
  if (!PLAYER_ID.test(playerId)) return false;
  const [row] = await db.select({ teamMember: players.teamMember }).from(players).where(eq(players.id, playerId));
  return !!row && canOpenProfile(session, { id: playerId, teamMember: row.teamMember });
}
