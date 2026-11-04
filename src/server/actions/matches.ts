"use server";

import { publicErrorMessage } from "@/server/errors";
import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { hasPermission, NotAuthorizedError, requireTeamMember } from "@/server/auth/session";
import { addTeamBookmark, getTeamBookmark, playerHasGame, removeTeamBookmark } from "@/server/matches/links";
import { loadPlayedTogether } from "@/server/matches/played-together";
import { getOrCreateTeam } from "@/server/repositories/team";

type Result<T> = { ok: true; data: T; message?: string } | { ok: false; error: string };

const RIOT_MATCH_ID = /^[A-Z0-9]+_\d+$/i;

/**
 * Bookmarks a Riot game for the team, or removes the bookmark.
 * - A game played together: any member who can see Played Together may bookmark it (the game must
 *   be one of the team's games played together); its creator or a match manager removes it.
 * - A member's own game (`share`): only that member shares it, from their own stored games, and
 *   only they or a match manager remove it. Nobody else can share another player's game.
 */
export async function setTeamBookmarkAction(riotMatchId: string, on: boolean, opts: { share?: boolean } = {}): Promise<Result<{ bookmarked: boolean }>> {
  try {
    const session = await requireTeamMember();
    const id = riotMatchId.trim();
    if (!RIOT_MATCH_ID.test(id)) return { ok: false, error: "Not a Riot match ID." };
    const db = await getAppDb();
    const team = await getOrCreateTeam(db);
    const existing = await getTeamBookmark(db, team.id, id);
    if (!on) {
      if (!existing) return { ok: true, data: { bookmarked: false } };
      const mine = existing.playerId ? existing.playerId === session.playerId : !!session.userId && existing.createdByUserId === session.userId;
      if (!mine && !hasPermission(session, "manage-matches")) throw new NotAuthorizedError(existing.playerId ? "Only the player who shared this game (or a match manager) can remove it." : "Only the member who bookmarked this game (or a match manager) can remove it.");
      await removeTeamBookmark(db, team.id, id);
    } else if (!existing) {
      if (opts.share) {
        if (!session.playerId || !(await playerHasGame(db, session.playerId, id))) throw new NotAuthorizedError("You can only share your own games.");
        await addTeamBookmark(db, { teamId: team.id, riotMatchId: id, playerId: session.playerId, createdByUserId: session.userId });
      } else {
        if (!hasPermission(session, "view-teammate-stats")) throw new NotAuthorizedError();
        const together = await loadPlayedTogether(db, team.id);
        if (!together.games.some((g) => g.matchId.toUpperCase() === id.toUpperCase())) return { ok: false, error: "Only games played together can be bookmarked here. Share your own games from your Match History." };
        await addTeamBookmark(db, { teamId: team.id, riotMatchId: id, playerId: null, createdByUserId: session.userId });
      }
    }
    revalidatePath("/matches");
    return { ok: true, data: { bookmarked: on } };
  } catch (err) {
    return { ok: false, error: publicErrorMessage(err) };
  }
}
