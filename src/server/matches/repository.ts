import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { matches } from "@/server/db/schema";
import { deriveDraft } from "@/domain/draft";
import type { RecommendationResult } from "@/domain/engine";
import { toDraftState, type DraftRecord } from "@/server/repositories/drafts";

/** Builds the archived match record from everything the draft already knows (idempotent per draft). */
export async function createMatchFromDraft(db: Db, draft: DraftRecord, _recommendation: RecommendationResult): Promise<string> {
  const [existing] = await db.select({ id: matches.id }).from(matches).where(eq(matches.draftId, draft.id));
  if (existing) return existing.id;
  const derived = deriveDraft(toDraftState(draft));
  const [row] = await db
    .insert(matches)
    .values({
      teamId: draft.teamId,
      draftId: draft.id,
      mode: draft.mode,
      eventName: draft.eventName,
      patch: draft.patch,
      side: draft.side,
      lineupSnapshot: draft.lineup,
      finalAssignments: draft.currentAssignments,
      ourBans: derived.ourBans.map((b) => b.championId),
      enemyBans: derived.enemyBans.map((b) => b.championId),
      ourPicks: derived.ourPicks.map((p) => ({ playerId: p.playerId, role: p.role, championId: p.championId, index: p.index })),
      enemyPicks: derived.enemyPicks.map((p) => ({ championId: p.championId, index: p.index })),
      opponentTeamId: draft.opponentTeamId,
      opponentName: draft.opponentName,
      playbook: (draft.finalAnalysis?.gamePlan as Record<string, unknown> | undefined) ?? null,
      playedAt: new Date(),
    })
    .returning({ id: matches.id });
  return row!.id;
}
