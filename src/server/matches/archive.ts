import type { Db } from "@/server/db/types";
import type { RecommendationResult } from "@/domain/engine";
import type { DraftRecord } from "@/server/repositories/drafts";
import { createMatchFromDraft } from "@/server/matches/repository";

/**
 * Creates the archived match record when a real (non-theorycraft) draft completes.
 * Archive only: nothing here feeds back into recommendations.
 */
export async function archiveCompletedDraft(db: Db, draft: DraftRecord, _recommendation: RecommendationResult): Promise<void> {
  await createMatchFromDraft(db, draft);
}
