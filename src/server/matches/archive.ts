import type { Db } from "@/server/db/types";
import type { RecommendationResult } from "@/domain/engine";
import type { DraftRecord } from "@/server/repositories/drafts";

/**
 * Creates the archived match record when a real (non-theorycraft) draft completes.
 * Implemented fully in the match-history phase; kept as the single hook point here.
 */
export async function archiveCompletedDraft(draft: DraftRecord, recommendation: RecommendationResult): Promise<void> {
  const { createMatchFromDraft } = await import("@/server/matches/repository");
  const { getAppDb } = await import("@/server/bootstrap");
  const db: Db = await getAppDb();
  await createMatchFromDraft(db, draft, recommendation);
}
