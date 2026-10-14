import type { Db } from "@/server/db/types";
import { applyAction, deriveDraft, type DraftState } from "@/domain/draft";
import type { Role } from "@/domain/roles";
import type { RecommendationResult } from "@/domain/engine";
import type { Session } from "@/server/auth/permissions";
import { playbookForDraft, recommendForDraft } from "@/server/engine/service";
import type { Playbook } from "@/domain/playbook";
import { appendDraftAction, completeDraft, getDraft, getDraftVersion, removeLastDraftAction, toDraftState, type DraftRecord } from "@/server/repositories/drafts";
import { assertCanEnterActions } from "./control";

export interface ApplyInput {
  championId: string | null;
  role?: Role | null;
  playerId?: string | null;
}

export interface ApplyOptions {
  session: Session | null;
  /** The draft version the client was looking at; a mismatch means someone else acted first. */
  expectedVersion?: number | null;
  /** Called when a non-theorycraft draft completes (match archiving). */
  onComplete?: (db: Db, draft: DraftRecord, recommendation: RecommendationResult) => Promise<void>;
}

export type ApplyOutcome = { ok: true; draft: DraftRecord; recommendation: RecommendationResult; playbook: Playbook | null } | { ok: false; error: string; conflict?: boolean };

/**
 * Applies the next draft action with controller and optimistic-concurrency checks.
 * Pure of Next.js request APIs so it can be tested directly.
 */
export async function applyDraftActionCore(db: Db, draftId: string, input: ApplyInput, options: ApplyOptions): Promise<ApplyOutcome> {
  const draft = await getDraft(db, draftId);
  if (!draft) return { ok: false, error: "Draft not found." };
  if (draft.status === "abandoned") return { ok: false, error: "This draft was abandoned." };
  const control = assertCanEnterActions(draft, options.session);
  if (!control.ok) return { ok: false, error: control.error };
  if (options.expectedVersion !== undefined && options.expectedVersion !== null && options.expectedVersion !== draft.version) {
    return { ok: false, conflict: true, error: "The draft changed since your screen was last updated. It has been refreshed; please check and try again." };
  }
  const state: DraftState = toDraftState(draft);
  const derived = deriveDraft(state);
  if (!derived.nextStep) {
    // Every action is in but the draft was never marked complete (an earlier completion step
    // failed): finish it now instead of leaving it stuck.
    if (draft.status === "in_progress") {
      const { repairFinishedDraft } = await import("@/server/drafts/unfinished");
      await repairFinishedDraft(db, draft);
    }
    return { ok: false, error: "Draft is complete." };
  }

  const before = await recommendForDraft(db, draft);
  const result = applyAction(state, { championId: input.championId, role: input.role ?? null, playerId: input.playerId ?? null });
  if (!result.ok) return { ok: false, error: result.error };
  const action = result.state.actions[result.state.actions.length - 1]!;

  // Re-check the version immediately before writing so two racing controllers cannot both win.
  const current = await getDraftVersion(db, draftId);
  if (current !== draft.version) return { ok: false, conflict: true, error: "Another action was entered at the same time. The draft has been refreshed." };
  await appendDraftAction(db, draftId, action, draft.side, summariseRecommendation(before), derived.steps);

  let updated = (await getDraft(db, draftId))!;
  const recommendation = await recommendForDraft(db, updated);
  let playbook: Playbook | null = null;
  if (recommendation.kind === "complete") {
    playbook = await playbookForDraft(db, updated);
    await completeDraft(db, draftId, { playbook, evaluation: recommendation.bestFitEvaluation });
    updated = (await getDraft(db, draftId))!;
    // Theorycraft drafts never create a match record automatically (they can be saved by hand).
    if (!updated.isTheorycraft && options.onComplete) await options.onComplete(db, updated, recommendation);
  }
  return { ok: true, draft: updated, recommendation, playbook };
}

export async function undoDraftActionCore(db: Db, draftId: string, options: Pick<ApplyOptions, "session" | "expectedVersion">): Promise<ApplyOutcome> {
  const draft = await getDraft(db, draftId);
  if (!draft) return { ok: false, error: "Draft not found." };
  const control = assertCanEnterActions(draft, options.session);
  if (!control.ok) return { ok: false, error: control.error };
  if (options.expectedVersion !== undefined && options.expectedVersion !== null && options.expectedVersion !== draft.version) {
    return { ok: false, conflict: true, error: "The draft changed since your screen was last updated." };
  }
  await removeLastDraftAction(db, draftId);
  const updated = (await getDraft(db, draftId))!;
  const recommendation = await recommendForDraft(db, updated);
  return { ok: true, draft: updated, recommendation, playbook: null };
}

export function summariseRecommendation(r: RecommendationResult): Record<string, unknown> {
  const pick = (p: unknown) => {
    if (!p || typeof p !== "object") return null;
    const x = p as { kind: string; championId?: string; playerId?: string; role?: string; why?: string[]; picks?: Array<{ championId: string; role: string; playerId: string }> };
    if (x.kind === "pair") return { kind: "pair", picks: x.picks?.map((y) => ({ championId: y.championId, role: y.role, playerId: y.playerId })), why: x.why };
    return { kind: x.kind, championId: x.championId, role: x.role, playerId: x.playerId, why: x.why };
  };
  return {
    kind: r.kind,
    primary: pick(r.primary),
    alternatives: r.alternatives.map(pick),
    roleSwap: r.roleSwap ? { to: r.roleSwap.to, improvement: r.roleSwap.improvement, why: r.roleSwap.why } : null,
    holds: r.holds,
    confidence: r.confidence,
    isDemo: r.stats.isDemo,
  };
}
