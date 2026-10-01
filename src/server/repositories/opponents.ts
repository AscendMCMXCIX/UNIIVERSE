import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { opponentPlayers, opponentTeams } from "@/server/db/schema";

export async function listOpponentTeams(db: Db, teamId: string, options: { includeArchived?: boolean } = {}) {
  return db
    .select()
    .from(opponentTeams)
    .where(options.includeArchived ? eq(opponentTeams.teamId, teamId) : and(eq(opponentTeams.teamId, teamId), isNull(opponentTeams.archivedAt)))
    .orderBy(desc(opponentTeams.updatedAt));
}

export async function getOpponentTeam(db: Db, id: string) {
  const [team] = await db.select().from(opponentTeams).where(eq(opponentTeams.id, id));
  if (!team) return null;
  const players = await db.select().from(opponentPlayers).where(eq(opponentPlayers.opponentTeamId, id)).orderBy(asc(opponentPlayers.sortOrder), asc(opponentPlayers.createdAt));
  return { ...team, players };
}
