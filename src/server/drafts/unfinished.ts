import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { matches } from "@/server/db/schema";
import { deriveDraft } from "@/domain/draft";
import { completeDraft, deleteDraft, getDraft, listDrafts, toDraftState, updateDraftMeta, type DraftRecord } from "@/server/repositories/drafts";
import { recommendForDraft, playbookForDraft } from "@/server/engine/service";
import { createMatchFromDraft } from "@/server/matches/repository";
import { refreshSeriesScore } from "@/server/series/repository";
import { log } from "@/server/observability/log";

/*
  Unfinished drafts (the Draft page's "needs action" list). Root causes of the stuck drafts seen
  in production, and what happens now:
    - a draft whose last action was stored but whose completion step failed (engine or archive
      error) kept status "in_progress" with every action entered: it refused further actions
      ("Draft is complete") yet stayed listed. It is now repaired: completed, and archived as a
      match like any finished draft;
    - abandoned drafts had no way out of the list and counted as a started series game, which
      could block the next game; they now leave the list and the series count;
    - there was no control to abandon or delete; the creator (or an admin) now has both;
    - old unfinished drafts silently disappeared after three days but stayed in the database;
      every unfinished draft is now listed until finished, abandoned or deleted.
*/

export class DraftManageError extends Error {}

/** Completes a draft whose actions are all entered but whose status was never updated. Returns true if repaired. */
export async function repairFinishedDraft(db: Db, draft: DraftRecord): Promise<boolean> {
  if (draft.status !== "in_progress" || !deriveDraft(toDraftState(draft)).isComplete) return false;
  let analysis: Record<string, unknown> = { repaired: true };
  try {
    const recommendation = await recommendForDraft(db, draft);
    if (recommendation.kind === "complete") analysis = { playbook: await playbookForDraft(db, draft), evaluation: recommendation.bestFitEvaluation, repaired: true };
  } catch (err) {
    log("warn", "draft.repair.analysis-failed", { draftId: draft.id, error: (err as Error).message });
  }
  await completeDraft(db, draft.id, analysis);
  if (!draft.isTheorycraft) {
    const done = (await getDraft(db, draft.id))!;
    await createMatchFromDraft(db, done).catch((err: Error) => log("warn", "draft.repair.archive-failed", { draftId: draft.id, error: err.message }));
  }
  log("info", "draft.repaired", { draftId: draft.id });
  return true;
}

export interface UnfinishedDraft {
  id: string;
  mode: DraftRecord["mode"];
  opponentName: string;
  side: DraftRecord["side"];
  isTheorycraft: boolean;
  seriesId: string | null;
  gameNumber: number;
  createdAt: Date;
  createdByUserId: string | null;
  /** Actions entered / total steps of the draft's format. */
  progress: number;
  steps: number;
  ourPicks: string[];
}

/** Every unfinished draft of the team, newest first; finished-but-stuck ones are repaired on the way. */
export async function listUnfinishedDrafts(db: Db, teamId: string, limit = 12): Promise<UnfinishedDraft[]> {
  const rows = (await listDrafts(db, teamId, 200)).filter((d) => d.status === "in_progress");
  const out: UnfinishedDraft[] = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    const draft = await getDraft(db, row.id);
    if (!draft) continue;
    if (await repairFinishedDraft(db, draft)) continue;
    const derived = deriveDraft(toDraftState(draft));
    out.push({ id: row.id, mode: row.mode, opponentName: row.opponentName, side: row.side, isTheorycraft: row.isTheorycraft, seriesId: row.seriesId, gameNumber: row.gameNumber, createdAt: row.createdAt, createdByUserId: row.createdByUserId, progress: draft.actions.length, steps: derived.steps.length, ourPicks: row.ourPicks });
  }
  return out;
}

/** Abandons an unfinished draft: it leaves the list and no longer counts as a started series game. */
export async function abandonDraft(db: Db, draftId: string): Promise<void> {
  const draft = await getDraft(db, draftId);
  if (!draft) throw new DraftManageError("Draft not found.");
  if (draft.status === "completed") throw new DraftManageError("This draft is finished; it lives in Matches.");
  await updateDraftMeta(db, draftId, { status: "abandoned" });
}

/**
 * Deletes a draft permanently. Only unfinished or abandoned drafts: a finished draft with a match
 * record is history (archive or delete it from Matches). The series score is recomputed.
 */
export async function deleteUnfinishedDraft(db: Db, draftId: string): Promise<void> {
  const draft = await getDraft(db, draftId);
  if (!draft) throw new DraftManageError("Draft not found.");
  const [match] = await db.select({ id: matches.id }).from(matches).where(eq(matches.draftId, draftId));
  if (draft.status === "completed" || match) throw new DraftManageError("This draft is finished and saved as a match; manage it from Matches.");
  await deleteDraft(db, draftId);
  if (draft.seriesId) await refreshSeriesScore(db, draft.seriesId);
}
