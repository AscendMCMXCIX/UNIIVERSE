"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAppDb } from "@/server/bootstrap";
import { canControlDraft, hasPermission, NotAuthorizedError, requireOwner, requireSession } from "@/server/auth/session";
import { createMatchFromDraft, deleteMatch, getMatch, updateMatch } from "@/server/matches/repository";
import { getDraft } from "@/server/repositories/drafts";
import { deriveDraft } from "@/domain/draft";
import { toDraftState } from "@/server/repositories/drafts";
import { createRiotClient, RiotApiError } from "@/server/riot/api/client";
import { ROLES } from "@/domain/roles";

type Result<T> = { ok: true; data: T; message?: string } | { ok: false; error: string };

const updateSchema = z.object({
  result: z.enum(["win", "loss", "cancelled"]).nullable().optional(),
  durationSeconds: z.number().int().min(0).max(6 * 3600).nullable().optional(),
  riotMatchId: z.string().trim().max(64).nullable().optional(),
  notes: z.string().max(5000).optional(),
  vodUrl: z.string().trim().max(500).optional(),
  playedAt: z.string().datetime().optional(),
  eventName: z.string().trim().max(120).optional(),
  opponentName: z.string().trim().max(60).optional(),
  enemyPlayers: z.record(z.enum(ROLES), z.string().trim().max(40)).optional(),
});

/** Records optional facts about a match. These are archive fields and never change recommendations. */

/** A match record belongs to the draft it came from: its creator (or an admin) may edit it. Records without a draft are admin-only. */
async function requireMatchControl(matchId: string): Promise<void> {
  const session = await requireSession();
  if (hasPermission(session, "manage-matches")) return;
  const db = await getAppDb();
  const match = await getMatch(db, matchId);
  const draft = match?.draftId ? await getDraft(db, match.draftId) : null;
  if (!draft || !canControlDraft(session, draft)) throw new NotAuthorizedError("Only the player who created this game's draft (or an admin) can edit its record.");
}

export async function updateMatchAction(matchId: string, input: z.infer<typeof updateSchema>): Promise<Result<null>> {
  try {
    await requireMatchControl(matchId);
    const parsed = updateSchema.parse(input);
    const db = await getAppDb();
    if (!(await getMatch(db, matchId))) return { ok: false, error: "Match not found." };
    await updateMatch(db, matchId, { ...parsed, playedAt: parsed.playedAt ? new Date(parsed.playedAt) : undefined, riotMatchId: parsed.riotMatchId === "" ? null : parsed.riotMatchId });
    revalidatePath(`/matches/${matchId}`);
    revalidatePath("/matches");
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Links a Riot match ID. When a Riot API key is configured the result, duration and a compact
 * summary are fetched; otherwise (or when Riot cannot be reached) the ID is stored and the user
 * is told that nothing was verified.
 */
export async function linkRiotMatchAction(matchId: string, riotMatchId: string): Promise<Result<{ fetched: boolean }>> {
  try {
    await requireMatchControl(matchId);
    const db = await getAppDb();
    const match = await getMatch(db, matchId);
    if (!match) return { ok: false, error: "Match not found." };
    const id = riotMatchId.trim();
    if (!/^[A-Z0-9]+_\d+$/i.test(id)) return { ok: false, error: "A Riot match ID looks like EUW1_7012345678 (platform, underscore, number)." };
    await updateMatch(db, matchId, { riotMatchId: id });
    const client = createRiotClient();
    if (!client) {
      revalidatePath(`/matches/${matchId}`);
      return { ok: true, data: { fetched: false }, message: "Match ID saved. No Riot API key is configured, so the result was not fetched." };
    }
    try {
      const platform = id.split("_")[0]!.toLowerCase();
      const riot = await client.match(platform, id);
      const ourTeamId = match.side === "blue" ? 100 : 200;
      const team = riot.info.teams.find((t) => t.teamId === ourTeamId);
      const result = team ? (team.win ? "win" : "loss") : null;
      const riotInfo = {
        gameCreation: riot.info.gameCreation,
        gameVersion: riot.info.gameVersion,
        queueId: riot.info.queueId,
        participants: riot.info.participants.map((p) => ({ teamId: p.teamId, championName: p.championName ?? String(p.championId), position: p.teamPosition, kills: p.kills, deaths: p.deaths, assists: p.assists, win: p.win })),
      };
      await updateMatch(db, matchId, { result, durationSeconds: riot.info.gameDuration, riotInfo, playedAt: new Date(riot.info.gameCreation) });
      revalidatePath(`/matches/${matchId}`);
      revalidatePath("/matches");
      return { ok: true, data: { fetched: true }, message: `Fetched from Riot: ${result ?? "unknown result"}, ${Math.round(riot.info.gameDuration / 60)} minutes.` };
    } catch (err) {
      const why = err instanceof RiotApiError ? `Riot responded ${err.status}` : (err as Error).message;
      revalidatePath(`/matches/${matchId}`);
      return { ok: true, data: { fetched: false }, message: `Match ID saved, but the result could not be fetched (${why}). Enter it by hand if you like.` };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Saves a completed theorycraft draft as a match record (theorycraft never archives automatically). */
export async function saveDraftAsMatchAction(draftId: string): Promise<Result<{ matchId: string }>> {
  try {
    const session = await requireSession();
    const db = await getAppDb();
    const draft = await getDraft(db, draftId);
    if (!draft) return { ok: false, error: "Draft not found." };
    if (!canControlDraft(session, draft)) return { ok: false, error: "Only the player who created this draft (or an admin) can save it as a match." };
    if (!deriveDraft(toDraftState(draft)).isComplete) return { ok: false, error: "Finish the draft before saving it as a match." };
    const matchId = await createMatchFromDraft(db, draft);
    revalidatePath("/matches");
    return { ok: true, data: { matchId } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Owner only: removes the archived record. The draft itself is untouched. */
export async function deleteMatchAction(matchId: string): Promise<void> {
  await requireOwner();
  const db = await getAppDb();
  await deleteMatch(db, matchId);
  revalidatePath("/matches");
  redirect("/matches");
}
