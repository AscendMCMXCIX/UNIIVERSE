"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ROLES, type Role } from "@/domain/roles";
import { validateAssignment } from "@/domain/roster";
import type { RecommendationResult } from "@/domain/engine";
import type { GamePlan } from "@/domain/gameplan";
import { getAppDb } from "@/server/bootstrap";
import { requireEditor, requireSession } from "@/server/auth/session";
import { applyDraftActionCore, undoDraftActionCore } from "@/server/live/apply";
import { canHandoff, canTakeControl } from "@/server/live/control";
import { setController } from "@/server/live/draft-live";
import { archiveCompletedDraft } from "@/server/matches/archive";
import { gamePlanForDraft, recommendForDraft } from "@/server/engine/service";
import { getCurrentPatch } from "@/server/repositories/champions";
import { applyRoleSwap, createDraft, deleteDraft, getDraft, lineupToProfiles, updateDraftMeta, type DraftRecord } from "@/server/repositories/drafts";
import { BUILTIN_FORMATS } from "@/domain/draft";
import { COMPETITION_MODE_INFO, isCompetitionMode, type CompetitionMode } from "@/domain/competition";
import { getCustomFormats } from "@/server/repositories/formats";
import { rememberLineupUse } from "@/server/repositories/team";
import { getActiveLineupProfiles, getOrCreateTeam } from "@/server/repositories/team";

export interface DraftRoomPayload {
  draft: DraftRecord;
  recommendation: RecommendationResult;
  gamePlan: GamePlan | null;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface CreateDraftInput {
  opponentName: string;
  side: "blue" | "red";
  unavailableChampionIds?: string[];
  mode?: CompetitionMode;
  formatId?: string;
  isTheorycraft?: boolean;
  eventName?: string;
  opponentTeamId?: string | null;
}

export async function createDraftAction(input: CreateDraftInput): Promise<Result<{ id: string }>> {
  try {
    await requireEditor();
    const db = await getAppDb();
    const team = await getOrCreateTeam(db);
    const lineup = await getActiveLineupProfiles(db, team.id);
    if (!lineup) return { ok: false, error: "Select five active players on the Team page before starting a draft." };
    const validation = validateAssignment(lineup.players, lineup.assignment);
    if (!validation.ok) return { ok: false, error: validation.errors.join(" ") };
    const patch = (await getCurrentPatch(db))?.patch ?? "unknown";
    const mode: CompetitionMode = isCompetitionMode(input.mode) ? input.mode : "tournament";
    const modeInfo = COMPETITION_MODE_INFO[mode];
    const requestedFormat = input.formatId && modeInfo.formatSelectable ? input.formatId : modeInfo.defaultFormatId;
    const customFormats = await getCustomFormats(db);
    const inlineFormat = customFormats.find((f) => f.id === requestedFormat) ?? null;
    if (!inlineFormat && !BUILTIN_FORMATS[requestedFormat]) return { ok: false, error: `Unknown draft format "${requestedFormat}".` };
    const draft = await createDraft(db, team.id, {
      opponentName: input.opponentName,
      side: input.side,
      patch,
      players: lineup.players,
      assignment: lineup.assignment,
      unavailableChampionIds: input.unavailableChampionIds ?? [],
      mode,
      formatId: requestedFormat,
      format: inlineFormat,
      isTheorycraft: input.isTheorycraft ?? false,
      eventName: input.eventName?.trim() ?? "",
      opponentTeamId: input.opponentTeamId ?? null,
    });
    await rememberLineupUse(db, team.id);
    revalidatePath("/draft");
    return { ok: true, data: { id: draft.id } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function loadDraftRoom(draftId: string): Promise<DraftRoomPayload | null> {
  const db = await getAppDb();
  const draft = await getDraft(db, draftId);
  if (!draft) return null;
  const recommendation = await recommendForDraft(db, draft);
  const gamePlan = recommendation.kind === "complete" ? await gamePlanForDraft(db, draft) : null;
  return { draft, recommendation, gamePlan };
}

const actionSchema = z.object({
  championId: z.string().min(1).nullable(),
  role: z.enum(ROLES).nullable().optional(),
  playerId: z.string().nullable().optional(),
});

export type ApplyResult = { ok: true; data: DraftRoomPayload } | { ok: false; error: string; conflict?: boolean };

export async function applyDraftAction(draftId: string, input: z.infer<typeof actionSchema>, expectedVersion?: number | null): Promise<ApplyResult> {
  try {
    const session = await requireSession();
    const parsed = actionSchema.parse(input);
    const db = await getAppDb();
    const outcome = await applyDraftActionCore(db, draftId, parsed, { session, expectedVersion, onComplete: archiveCompletedDraft });
    if (!outcome.ok) return outcome;
    revalidatePath("/draft");
    return { ok: true, data: { draft: outcome.draft, recommendation: outcome.recommendation, gamePlan: outcome.gamePlan } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function undoDraftAction(draftId: string, expectedVersion?: number | null): Promise<ApplyResult> {
  try {
    const session = await requireSession();
    const db = await getAppDb();
    const outcome = await undoDraftActionCore(db, draftId, { session, expectedVersion });
    if (!outcome.ok) return outcome;
    revalidatePath("/draft");
    return { ok: true, data: { draft: outcome.draft, recommendation: outcome.recommendation, gamePlan: null } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Take or hand off control of the draft entry. */
export async function takeControlAction(draftId: string): Promise<Result<null>> {
  try {
    const session = await requireSession();
    const db = await getAppDb();
    const draft = await getDraft(db, draftId);
    if (!draft) return { ok: false, error: "Draft not found." };
    if (!canTakeControl(draft, session)) return { ok: false, error: "You cannot take control of this draft." };
    await setController(db, draftId, session.userId);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function handoffControlAction(draftId: string, toUserId: string | null): Promise<Result<null>> {
  try {
    const session = await requireSession();
    const db = await getAppDb();
    const draft = await getDraft(db, draftId);
    if (!draft) return { ok: false, error: "Draft not found." };
    if (!canHandoff(session, draft)) return { ok: false, error: "Only the controller, a coach or the owner can hand off control." };
    await setController(db, draftId, toUserId);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function listHandoffCandidatesAction(): Promise<Array<{ id: string; label: string; role: string }>> {
  await requireSession();
  const db = await getAppDb();
  const { listUsers } = await import("@/server/repositories/users");
  return (await listUsers(db)).filter((u) => u.isActive).map((u) => ({ id: u.id, label: u.displayName, role: u.role }));
}

export async function reloadDraftRoomAction(draftId: string): Promise<DraftRoomPayload | null> {
  await requireSession();
  return loadDraftRoom(draftId);
}

export async function applyRoleSwapAction(draftId: string, assignments: Record<Role, string>, reason: string): Promise<Result<DraftRoomPayload>> {
  try {
    await requireEditor();
    const db = await getAppDb();
    const draft = await getDraft(db, draftId);
    if (!draft) return { ok: false, error: "Draft not found." };
    const players = lineupToProfiles(draft);
    const validation = validateAssignment(players, assignments);
    if (!validation.ok) return { ok: false, error: validation.errors.join(" ") };
    // Locked picks must stay with their players.
    for (const a of draft.actions) {
      if (a.role && a.playerId && assignments[a.role] !== a.playerId) return { ok: false, error: "Cannot move a player away from a role they have already locked a champion for." };
    }
    await applyRoleSwap(db, draftId, assignments, draft.actions.length - 1, reason);
    const updated = (await getDraft(db, draftId))!;
    const recommendation = await recommendForDraft(db, updated);
    return { ok: true, data: { draft: updated, recommendation, gamePlan: null } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function updateDraftMetaAction(draftId: string, input: { opponentName?: string; notes?: string; status?: "in_progress" | "completed" | "abandoned" }): Promise<Result<null>> {
  try {
    await requireEditor();
    const db = await getAppDb();
    await updateDraftMeta(db, draftId, input);
    revalidatePath("/draft");
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteDraftAction(draftId: string): Promise<void> {
  await requireEditor();
  const db = await getAppDb();
  await deleteDraft(db, draftId);
  revalidatePath("/draft");
  redirect("/draft");
}

export async function attachOpponentAction(draftId: string, opponentTeamId: string | null): Promise<Result<null>> {
  try {
    await requireEditor();
    const db = await getAppDb();
    const { getOpponentTeam } = await import("@/server/repositories/opponents");
    const opponent = opponentTeamId ? await getOpponentTeam(db, opponentTeamId) : null;
    await updateDraftMeta(db, draftId, { opponentTeamId: opponent?.id ?? null, opponentName: opponent?.name ?? undefined });
    revalidatePath(`/draft/${draftId}/prepare`);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
