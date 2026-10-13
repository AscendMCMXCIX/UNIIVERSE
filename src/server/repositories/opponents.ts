import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { matches } from "@/server/db/schema";

/**
 * Opponents are just a label on each game now. The opponent_teams / opponent_players tables
 * from the retired scouting feature stay in the database (never dropped) but nothing writes
 * to them any more.
 */

/** Previous saved matches against the same opponent label (case-insensitive), reference only. */
export async function previousMeetings(db: Db, teamId: string, opponentName: string, limit = 20) {
  const needle = opponentName.trim();
  if (!needle) return [];
  return db
    .select()
    .from(matches)
    .where(and(eq(matches.teamId, teamId), isNull(matches.archivedAt), sql`lower(${matches.opponentName}) = lower(${needle})`))
    .orderBy(desc(matches.playedAt))
    .limit(limit);
}
