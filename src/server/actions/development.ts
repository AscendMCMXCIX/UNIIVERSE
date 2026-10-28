"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { getSession, NotAuthorizedError } from "@/server/auth/session";
import { journalOwnerFor } from "@/server/ranked/owner";
import { finishBlock, JournalError, startBlock, type RankedBlockView } from "@/server/ranked/repository";
import { isBlockTarget, isCompletionRule, type BlockTarget, type CompletionRule } from "@/domain/ranked-improvement";
import type { ObjectiveInput } from "@/domain/development/objectives";
import type { ReviewInput } from "@/domain/development/reviews";
import {
  createObjective,
  deleteObjective,
  DevelopmentError,
  resolveGameSession,
  retirePlan,
  reusePlan,
  saveReview,
  saveSessionNote,
  savePlan,
  setObjectiveStatus,
  setPrimaryObjective,
  setSessionObjective,
  skipReview,
  updateObjective,
  type NewObjective,
  type ObjectiveView,
  type PlanView,
} from "@/server/development/repository";

/*
  Ranked Development's actions. The owner always comes from the signed-in session (never from the
  request), so an action can only ever read or change the caller's own objectives, plans, sessions
  and reviews; another player's id simply finds nothing.
*/

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };
const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof DevelopmentError || err instanceof JournalError || err instanceof NotAuthorizedError ? err.message : "Something went wrong. Please try again." });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: unknown, what: string): string => {
  if (typeof value !== "string" || !UUID.test(value)) throw new DevelopmentError(`${what} not found.`);
  return value;
};

async function owner(): Promise<string> {
  return journalOwnerFor(await getSession());
}

function touch() {
  revalidatePath("/overview/development", "layout");
}

async function run<T>(fn: (playerId: string) => Promise<T>): Promise<Result<T>> {
  try {
    const playerId = await owner();
    const data = await fn(playerId);
    touch();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function createObjectiveAction(input: NewObjective): Promise<Result<ObjectiveView>> {
  return run(async (playerId) => createObjective(await getAppDb(), playerId, input));
}

export async function updateObjectiveAction(objectiveId: string, input: ObjectiveInput): Promise<Result<ObjectiveView>> {
  return run(async (playerId) => updateObjective(await getAppDb(), playerId, id(objectiveId, "Objective"), input));
}

export async function setObjectiveStatusAction(objectiveId: string, status: string): Promise<Result<ObjectiveView>> {
  return run(async (playerId) => setObjectiveStatus(await getAppDb(), playerId, id(objectiveId, "Objective"), status));
}

export async function setPrimaryObjectiveAction(objectiveId: string): Promise<Result<ObjectiveView>> {
  return run(async (playerId) => setPrimaryObjective(await getAppDb(), playerId, id(objectiveId, "Objective")));
}

export async function deleteObjectiveAction(objectiveId: string): Promise<Result<{ title: string }>> {
  return run(async (playerId) => deleteObjective(await getAppDb(), playerId, id(objectiveId, "Objective")));
}

export async function savePlanAction(objectiveId: string, plan: { ifText: string; thenText: string; templateKey?: string | null }): Promise<Result<PlanView>> {
  return run(async (playerId) => savePlan(await getAppDb(), playerId, id(objectiveId, "Objective"), plan));
}

export async function reusePlanAction(planId: string, objectiveId: string): Promise<Result<PlanView>> {
  return run(async (playerId) => reusePlan(await getAppDb(), playerId, id(planId, "Plan"), id(objectiveId, "Objective")));
}

export async function retirePlanAction(planId: string): Promise<Result> {
  return run(async (playerId) => {
    await retirePlan(await getAppDb(), playerId, id(planId, "Plan"));
    return null;
  });
}

/** Starts a session (or returns the one in progress): its objective, account and how it ends. */
export async function startSessionAction(input: { objectiveId?: string | null; accountId?: string | null; rule?: CompletionRule | null; target?: BlockTarget | null }): Promise<Result<RankedBlockView>> {
  return run(async (playerId) => {
    if (input.rule != null && !isCompletionRule(input.rule)) throw new DevelopmentError("Choose how the session ends.");
    if (input.target != null && !isBlockTarget(input.target)) throw new DevelopmentError("Choose a game target between 1 and 100, or none.");
    return startBlock(await getAppDb(), playerId, input.target ?? null, input.rule ?? null, { objectiveId: input.objectiveId ? id(input.objectiveId, "Objective") : null, accountId: input.accountId ? id(input.accountId, "Account") : null });
  });
}

export async function endSessionAction(sessionId: string, note?: string | null): Promise<Result<RankedBlockView>> {
  return run(async (playerId) => finishBlock(await getAppDb(), playerId, id(sessionId, "Session"), note ?? null));
}

export async function saveSessionNoteAction(sessionId: string, note: string): Promise<Result> {
  return run(async (playerId) => {
    await saveSessionNote(await getAppDb(), playerId, id(sessionId, "Session"), note);
    return null;
  });
}

export async function setSessionObjectiveAction(sessionId: string, objectiveId: string): Promise<Result> {
  return run(async (playerId) => {
    await setSessionObjective(await getAppDb(), playerId, id(sessionId, "Session"), id(objectiveId, "Objective"));
    return null;
  });
}

export async function saveReviewAction(gameId: string, review: ReviewInput): Promise<Result> {
  return run(async (playerId) => {
    await saveReview(await getAppDb(), playerId, id(gameId, "Game"), review);
    return null;
  });
}

export async function skipReviewAction(gameId: string): Promise<Result> {
  return run(async (playerId) => {
    await skipReview(await getAppDb(), playerId, id(gameId, "Game"));
    return null;
  });
}

/** Settles a game that fitted two sessions: keep it, or move it to the other session. */
export async function resolveGameSessionAction(gameId: string, move: boolean): Promise<Result> {
  return run(async (playerId) => {
    await resolveGameSession(await getAppDb(), playerId, id(gameId, "Game"), move === true);
    return null;
  });
}
