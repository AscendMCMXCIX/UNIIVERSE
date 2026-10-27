import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { developmentObjectives, developmentPlans, rankedBlocks, rankedGames } from "@/server/db/schema";
import { cleanObjective, isObjectiveStatus, type ObjectiveInput, type ObjectiveStatus } from "@/domain/development/objectives";
import { cleanPlan, templateByKey } from "@/domain/development/plans";
import { cleanReview, type ReviewInput } from "@/domain/development/reviews";
import { isMeasure, type MeasureKey } from "@/domain/development/measures";
import type { Role } from "@/domain/roles";
import { applyCompletionRule } from "@/server/ranked/repository";

/*
  Ranked Development's library: objectives, If–Then plans and game reviews. Like the journal,
  every function takes the OWNER's player id first and filters by it, so a wrong id simply finds
  nothing; the actions layer derives the owner from the signed-in session, never from input.
*/

export class DevelopmentError extends Error {}

export interface PlanView {
  id: string;
  objectiveId: string | null;
  ifText: string;
  thenText: string;
  templateKey: string | null;
  retiredAt: Date | null;
  createdAt: Date;
}

export interface ObjectiveView {
  id: string;
  title: string;
  detail: string;
  category: string;
  customCategory: string | null;
  role: Role | null;
  championIds: string[];
  status: ObjectiveStatus;
  isPrimary: boolean;
  measure: MeasureKey | null;
  identifiedAt: Date;
  statusChangedAt: Date;
  source: string;
  plan: PlanView | null;
  /** Reviews done for games played for it. */
  reviews: number;
  sessions: number;
  /** The latest session or game played for it. */
  lastPractisedAt: Date | null;
}

const planView = (r: typeof developmentPlans.$inferSelect): PlanView => ({ id: r.id, objectiveId: r.objectiveId, ifText: r.ifText, thenText: r.thenText, templateKey: r.templateKey, retiredAt: r.retiredAt, createdAt: r.createdAt });

/** Every objective of the owner (primary first, then active, then maintained), with its current plan and how much it was practised. */
export async function listObjectives(db: Db, ownerPlayerId: string, only?: string[]): Promise<ObjectiveView[]> {
  if (only && only.length === 0) return [];
  const where = only ? and(eq(developmentObjectives.playerId, ownerPlayerId), inArray(developmentObjectives.id, only)) : eq(developmentObjectives.playerId, ownerPlayerId);
  const rows = await db.select().from(developmentObjectives).where(where);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const planIds = rows.map((r) => r.planId).filter((id): id is string => !!id);
  const [plans, games, sessions] = await Promise.all([
    planIds.length ? db.select().from(developmentPlans).where(and(eq(developmentPlans.playerId, ownerPlayerId), inArray(developmentPlans.id, planIds))) : Promise.resolve([]),
    db
      .select({ id: rankedGames.objectiveId, reviews: sql<number>`count(*) filter (where ${rankedGames.reviewStatus} = 'done')`, last: sql<string | null>`max(${rankedGames.playedAt})` })
      .from(rankedGames)
      .where(and(eq(rankedGames.playerId, ownerPlayerId), inArray(rankedGames.objectiveId, ids)))
      .groupBy(rankedGames.objectiveId),
    db
      .select({ id: rankedBlocks.objectiveId, sessions: sql<number>`count(*)`, last: sql<string | null>`max(coalesce(${rankedBlocks.lastActivityAt}, ${rankedBlocks.completedAt}, ${rankedBlocks.startedAt}))` })
      .from(rankedBlocks)
      .where(and(eq(rankedBlocks.playerId, ownerPlayerId), inArray(rankedBlocks.objectiveId, ids)))
      .groupBy(rankedBlocks.objectiveId),
  ]);
  const planById = new Map(plans.map((p) => [p.id, planView(p)]));
  const gamesBy = new Map(games.map((g) => [g.id, g]));
  const sessionsBy = new Map(sessions.map((s) => [s.id, s]));
  const latest = (...dates: Array<string | null | undefined>) => {
    const t = Math.max(...dates.map((d) => (d ? new Date(d).getTime() : 0)));
    return t > 0 ? new Date(t) : null;
  };
  const order = (o: { isPrimary: boolean; status: string }) => (o.isPrimary ? 0 : o.status === "maintaining" ? 2 : 1);
  return rows
    .map((r): ObjectiveView => ({
      id: r.id,
      title: r.title,
      detail: r.detail,
      category: r.category,
      customCategory: r.customCategory,
      role: r.role,
      championIds: r.championIds ?? [],
      status: isObjectiveStatus(r.status) ? r.status : "identified",
      isPrimary: r.isPrimary,
      measure: isMeasure(r.measure) ? r.measure : null,
      identifiedAt: r.identifiedAt,
      statusChangedAt: r.statusChangedAt,
      source: r.source,
      plan: r.planId ? (planById.get(r.planId) ?? null) : null,
      reviews: Number(gamesBy.get(r.id)?.reviews ?? 0),
      sessions: Number(sessionsBy.get(r.id)?.sessions ?? 0),
      lastPractisedAt: latest(gamesBy.get(r.id)?.last, sessionsBy.get(r.id)?.last),
    }))
    .sort((a, b) => order(a) - order(b) || b.statusChangedAt.getTime() - a.statusChangedAt.getTime());
}

export async function getObjective(db: Db, ownerPlayerId: string, objectiveId: string): Promise<ObjectiveView | null> {
  return (await listObjectives(db, ownerPlayerId, [objectiveId]))[0] ?? null;
}

async function ownObjective(db: Db, ownerPlayerId: string, objectiveId: string) {
  const [row] = await db.select().from(developmentObjectives).where(and(eq(developmentObjectives.id, objectiveId), eq(developmentObjectives.playerId, ownerPlayerId)));
  if (!row) throw new DevelopmentError("Objective not found.");
  return row;
}

/** Makes one objective the primary one (unsetting any other); an objective not yet practised moves to Practising. */
async function makePrimary(db: Db, ownerPlayerId: string, objectiveId: string, status: string): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(developmentObjectives).set({ isPrimary: false, updatedAt: now }).where(and(eq(developmentObjectives.playerId, ownerPlayerId), eq(developmentObjectives.isPrimary, true), ne(developmentObjectives.id, objectiveId)));
    const reopen = status === "identified" || status === "maintaining";
    await tx
      .update(developmentObjectives)
      .set({ isPrimary: true, updatedAt: now, ...(reopen ? { status: "practising", statusChangedAt: now } : {}) })
      .where(and(eq(developmentObjectives.id, objectiveId), eq(developmentObjectives.playerId, ownerPlayerId)));
  });
}

export interface NewObjective extends ObjectiveInput {
  /** Make it the primary objective (the first objective always is). */
  makePrimary?: boolean;
  plan?: { ifText: string; thenText: string; templateKey?: string | null } | null;
}

export async function createObjective(db: Db, ownerPlayerId: string, input: NewObjective): Promise<ObjectiveView> {
  const clean = cleanObjective(input);
  if (!clean.ok) throw new DevelopmentError(clean.error);
  const plan = input.plan ? cleanPlan(input.plan) : null;
  if (plan && !plan.ok) throw new DevelopmentError(plan.error);
  const [primary] = await db.select({ id: developmentObjectives.id }).from(developmentObjectives).where(and(eq(developmentObjectives.playerId, ownerPlayerId), eq(developmentObjectives.isPrimary, true)));
  const asPrimary = input.makePrimary === true || !primary;
  const [row] = await db
    .insert(developmentObjectives)
    .values({ playerId: ownerPlayerId, ...clean.value, status: asPrimary ? "practising" : "identified" })
    .returning();
  if (asPrimary) await makePrimary(db, ownerPlayerId, row!.id, "practising");
  if (plan?.ok) await savePlan(db, ownerPlayerId, row!.id, { ...plan.value, templateKey: input.plan?.templateKey ?? null });
  return (await getObjective(db, ownerPlayerId, row!.id))!;
}

export async function updateObjective(db: Db, ownerPlayerId: string, objectiveId: string, input: ObjectiveInput): Promise<ObjectiveView> {
  await ownObjective(db, ownerPlayerId, objectiveId);
  const clean = cleanObjective(input);
  if (!clean.ok) throw new DevelopmentError(clean.error);
  await db.update(developmentObjectives).set({ ...clean.value, updatedAt: new Date() }).where(and(eq(developmentObjectives.id, objectiveId), eq(developmentObjectives.playerId, ownerPlayerId)));
  // The session in progress shows the objective's current title.
  await db.update(rankedBlocks).set({ focus: clean.value.title, updatedAt: new Date() }).where(and(eq(rankedBlocks.playerId, ownerPlayerId), eq(rankedBlocks.objectiveId, objectiveId), eq(rankedBlocks.status, "active")));
  return (await getObjective(db, ownerPlayerId, objectiveId))!;
}

/**
 * Moves an objective along Identified → Practising → Improving → Maintaining, or back (a reopened
 * skill). Always the player's decision. A maintained objective stops being the primary one.
 */
export async function setObjectiveStatus(db: Db, ownerPlayerId: string, objectiveId: string, status: string): Promise<ObjectiveView> {
  if (!isObjectiveStatus(status)) throw new DevelopmentError("Unknown progress step.");
  const row = await ownObjective(db, ownerPlayerId, objectiveId);
  if (row.status !== status) {
    const now = new Date();
    await db
      .update(developmentObjectives)
      .set({ status, statusChangedAt: now, updatedAt: now, ...(status === "maintaining" ? { isPrimary: false } : {}) })
      .where(and(eq(developmentObjectives.id, objectiveId), eq(developmentObjectives.playerId, ownerPlayerId)));
  }
  return (await getObjective(db, ownerPlayerId, objectiveId))!;
}

/** The objective sessions start with from now on; the session in progress keeps the one it started with. */
export async function setPrimaryObjective(db: Db, ownerPlayerId: string, objectiveId: string): Promise<ObjectiveView> {
  const row = await ownObjective(db, ownerPlayerId, objectiveId);
  await makePrimary(db, ownerPlayerId, objectiveId, row.status);
  return (await getObjective(db, ownerPlayerId, objectiveId))!;
}

/**
 * Removes an objective from the library. Its sessions, games and reviews stay (they keep the title
 * they were played with); its plans stay in the plan history without an objective.
 */
export async function deleteObjective(db: Db, ownerPlayerId: string, objectiveId: string): Promise<{ title: string }> {
  const row = await ownObjective(db, ownerPlayerId, objectiveId);
  await db.delete(developmentObjectives).where(and(eq(developmentObjectives.id, objectiveId), eq(developmentObjectives.playerId, ownerPlayerId)));
  return { title: row.title };
}

/**
 * Sets an objective's If–Then plan. A plan no finished session was played with is edited in place;
 * otherwise the old wording is kept in history (retired) and a new version takes its place. The
 * session in progress for the objective follows the new plan.
 */
export async function savePlan(db: Db, ownerPlayerId: string, objectiveId: string, input: { ifText: string; thenText: string; templateKey?: string | null }): Promise<PlanView> {
  const objective = await ownObjective(db, ownerPlayerId, objectiveId);
  const clean = cleanPlan(input);
  if (!clean.ok) throw new DevelopmentError(clean.error);
  const templateKey = templateByKey(input.templateKey)?.key ?? null;
  const now = new Date();
  return db.transaction(async (tx) => {
    const [current] = objective.planId ? await tx.select().from(developmentPlans).where(and(eq(developmentPlans.id, objective.planId), eq(developmentPlans.playerId, ownerPlayerId))) : [];
    if (current && current.ifText === clean.value.ifText && current.thenText === clean.value.thenText) return planView(current);
    const [used] = current ? await tx.select({ id: rankedBlocks.id }).from(rankedBlocks).where(and(eq(rankedBlocks.playerId, ownerPlayerId), eq(rankedBlocks.planId, current.id), eq(rankedBlocks.status, "completed"))).limit(1) : [];
    let plan: typeof developmentPlans.$inferSelect;
    if (current && !used) {
      [plan] = (await tx.update(developmentPlans).set({ ...clean.value, templateKey: templateKey ?? current.templateKey, updatedAt: now }).where(eq(developmentPlans.id, current.id)).returning()) as [typeof developmentPlans.$inferSelect];
    } else {
      if (current) await tx.update(developmentPlans).set({ retiredAt: now, updatedAt: now }).where(eq(developmentPlans.id, current.id));
      [plan] = (await tx.insert(developmentPlans).values({ playerId: ownerPlayerId, objectiveId, ...clean.value, templateKey }).returning()) as [typeof developmentPlans.$inferSelect];
      await tx.update(developmentObjectives).set({ planId: plan.id, updatedAt: now }).where(eq(developmentObjectives.id, objectiveId));
    }
    await tx.update(rankedBlocks).set({ planId: plan.id, updatedAt: now }).where(and(eq(rankedBlocks.playerId, ownerPlayerId), eq(rankedBlocks.objectiveId, objectiveId), eq(rankedBlocks.status, "active")));
    return planView(plan);
  });
}

/** Uses an earlier plan (from any objective) as an objective's current plan. */
export async function reusePlan(db: Db, ownerPlayerId: string, planId: string, objectiveId: string): Promise<PlanView> {
  const [source] = await db.select().from(developmentPlans).where(and(eq(developmentPlans.id, planId), eq(developmentPlans.playerId, ownerPlayerId)));
  if (!source) throw new DevelopmentError("Plan not found.");
  return savePlan(db, ownerPlayerId, objectiveId, { ifText: source.ifText, thenText: source.thenText, templateKey: source.templateKey });
}

/** Puts a plan away: it stays in history; an objective using it is left without a current plan. */
export async function retirePlan(db: Db, ownerPlayerId: string, planId: string): Promise<void> {
  const now = new Date();
  const updated = await db.update(developmentPlans).set({ retiredAt: now, updatedAt: now }).where(and(eq(developmentPlans.id, planId), eq(developmentPlans.playerId, ownerPlayerId))).returning({ id: developmentPlans.id });
  if (!updated.length) throw new DevelopmentError("Plan not found.");
  await db.update(developmentObjectives).set({ planId: null, updatedAt: now }).where(and(eq(developmentObjectives.playerId, ownerPlayerId), eq(developmentObjectives.planId, planId)));
}

export interface PlanHistoryItem extends PlanView {
  objectiveTitle: string | null;
  current: boolean;
  /** Sessions played with this exact wording. */
  sessions: number;
}

/** Every plan the owner has written, newest first, with the objective it belongs to and its use. */
export async function listPlanHistory(db: Db, ownerPlayerId: string, limit = 50): Promise<PlanHistoryItem[]> {
  const rows = await db
    .select({ plan: developmentPlans, objectiveTitle: developmentObjectives.title, currentPlan: developmentObjectives.planId })
    .from(developmentPlans)
    .leftJoin(developmentObjectives, eq(developmentObjectives.id, developmentPlans.objectiveId))
    .where(eq(developmentPlans.playerId, ownerPlayerId))
    .orderBy(desc(developmentPlans.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const uses = await db
    .select({ id: rankedBlocks.planId, n: sql<number>`count(*)` })
    .from(rankedBlocks)
    .where(and(eq(rankedBlocks.playerId, ownerPlayerId), inArray(rankedBlocks.planId, rows.map((r) => r.plan.id))))
    .groupBy(rankedBlocks.planId);
  const usesBy = new Map(uses.map((u) => [u.id, Number(u.n)]));
  return rows.map((r) => ({ ...planView(r.plan), objectiveTitle: r.objectiveTitle, current: r.currentPlan === r.plan.id, sessions: usesBy.get(r.plan.id) ?? 0 }));
}

/** Saves (or rewrites) a game's review. One review per game: it lives on the game itself. */
export async function saveReview(db: Db, ownerPlayerId: string, gameId: string, input: ReviewInput): Promise<void> {
  const clean = cleanReview(input);
  if (!clean.ok) throw new DevelopmentError(clean.error);
  const updated = await db
    .update(rankedGames)
    .set({ ...clean.value, reviewStatus: "done", reviewedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(rankedGames.id, gameId), eq(rankedGames.playerId, ownerPlayerId)))
    .returning({ id: rankedGames.id });
  if (!updated.length) throw new DevelopmentError("Game not found.");
}

/** Skips a game's review without penalty (a game already reviewed keeps its review). */
export async function skipReview(db: Db, ownerPlayerId: string, gameId: string): Promise<void> {
  const [row] = await db.select({ status: rankedGames.reviewStatus }).from(rankedGames).where(and(eq(rankedGames.id, gameId), eq(rankedGames.playerId, ownerPlayerId)));
  if (!row) throw new DevelopmentError("Game not found.");
  if (row.status === "done") return;
  await db.update(rankedGames).set({ reviewStatus: "skipped", updatedAt: new Date() }).where(and(eq(rankedGames.id, gameId), eq(rankedGames.playerId, ownerPlayerId)));
}

/**
 * Settles a game that fitted two sessions: keep it where it is, or move it to the other one (its
 * objective follows, and both sessions' completion rules are applied again).
 */
export async function resolveGameSession(db: Db, ownerPlayerId: string, gameId: string, move: boolean): Promise<void> {
  const [game] = await db.select().from(rankedGames).where(and(eq(rankedGames.id, gameId), eq(rankedGames.playerId, ownerPlayerId)));
  if (!game) throw new DevelopmentError("Game not found.");
  const from = game.blockId;
  let to = from;
  if (move && game.alternativeBlockId) {
    const [target] = await db.select({ id: rankedBlocks.id, objectiveId: rankedBlocks.objectiveId }).from(rankedBlocks).where(and(eq(rankedBlocks.id, game.alternativeBlockId), eq(rankedBlocks.playerId, ownerPlayerId)));
    if (target) {
      to = target.id;
      await db.update(rankedGames).set({ blockId: target.id, objectiveId: target.objectiveId, updatedAt: new Date() }).where(eq(rankedGames.id, game.id));
    }
  }
  await db.update(rankedGames).set({ needsConfirmation: false, alternativeBlockId: null, updatedAt: new Date() }).where(eq(rankedGames.id, game.id));
  if (to !== from) {
    await applyCompletionRule(db, ownerPlayerId, from);
    await applyCompletionRule(db, ownerPlayerId, to);
  }
}

/** Changes the objective of the session in progress (its games waiting for a review follow it). */
export async function setSessionObjective(db: Db, ownerPlayerId: string, sessionId: string, objectiveId: string): Promise<void> {
  const objective = await ownObjective(db, ownerPlayerId, objectiveId);
  const [session] = await db.select({ id: rankedBlocks.id, status: rankedBlocks.status }).from(rankedBlocks).where(and(eq(rankedBlocks.id, sessionId), eq(rankedBlocks.playerId, ownerPlayerId)));
  if (!session) throw new DevelopmentError("Session not found.");
  if (session.status !== "active") throw new DevelopmentError("Only the session in progress can change its objective.");
  const now = new Date();
  await db.update(rankedBlocks).set({ objectiveId: objective.id, planId: objective.planId, focus: objective.title, featuredChampionId: objective.championIds[0] ?? null, updatedAt: now }).where(eq(rankedBlocks.id, session.id));
  await db.update(rankedGames).set({ objectiveId: objective.id, updatedAt: now }).where(and(eq(rankedGames.blockId, session.id), eq(rankedGames.playerId, ownerPlayerId), eq(rankedGames.reviewStatus, "pending")));
}

/** Writes the player's closing note on a session (any session of theirs). */
export async function saveSessionNote(db: Db, ownerPlayerId: string, sessionId: string, note: string): Promise<void> {
  const clean = String(note ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const updated = await db.update(rankedBlocks).set({ closingNote: clean, updatedAt: new Date() }).where(and(eq(rankedBlocks.id, sessionId), eq(rankedBlocks.playerId, ownerPlayerId))).returning({ id: rankedBlocks.id });
  if (!updated.length) throw new DevelopmentError("Session not found.");
}

/** How many of the owner's games wait for the player to say which session they belong to, and the first such session. */
export async function sessionsNeedingConfirmation(db: Db, ownerPlayerId: string): Promise<{ games: number; sessionId: string | null }> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`, first: sql<string | null>`(array_agg(${rankedGames.blockId} ORDER BY ${rankedGames.playedAt}))[1]` })
    .from(rankedGames)
    .where(and(eq(rankedGames.playerId, ownerPlayerId), eq(rankedGames.needsConfirmation, true), isNotNull(rankedGames.alternativeBlockId)));
  return { games: Number(row?.n ?? 0), sessionId: row?.first ?? null };
}
