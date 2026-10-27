import { and, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { developmentObjectives, developmentPlans, rankedBlocks, rankedGames } from "@/server/db/schema";
import { isActiveStatus, needsRevisit, suggestStatus, type StatusSuggestion } from "@/domain/development/objectives";
import { PATTERN_WINDOW_DAYS, reviewPatterns, type ExecutionTrend, type ReviewPatterns } from "@/domain/development/reviews";
import { LATE_GAME_DAYS, summariseSession, type SessionLp, type SessionSummary } from "@/domain/development/sessions";
import type { GameFigures } from "@/domain/development/measures";
import { getActiveBlock, getBlock, listBlocks, toGame, type RankedBlockView, type RankedGameView } from "@/server/ranked/repository";
import { blockLabel } from "@/domain/ranked-improvement";
import { associateQuietly } from "./association";
import { gameFigures, objectiveEvidence, objectiveExecution, type ObjectiveEvidence } from "./evidence";
import { listObjectives, listPlanHistory, sessionsNeedingConfirmation, type ObjectiveView, type PlanHistoryItem, type PlanView } from "./repository";
import { sessionLpChange } from "./ranks";

/*
  What Ranked Development's three areas read. Each page first lets newly synced games join their
  session (stored rows only, idempotent), then reads only the owner's own rows, a bounded number
  at a time: a session's games, a page of sessions, the newest reviews.
*/

const DAY = 86_400_000;

export interface SessionGame extends RankedGameView {
  /** The game's own figures from the synced match (null for a game typed in by hand). */
  figures: GameFigures | null;
}

export interface SessionDetail {
  session: RankedBlockView;
  objective: Pick<ObjectiveView, "id" | "title" | "category" | "customCategory" | "measure"> | null;
  plan: PlanView | null;
  games: SessionGame[];
  summary: SessionSummary;
  lp: SessionLp;
  /** Labels of the other sessions a game here also fits ("Session 4"), for the player's confirmation. */
  alternatives: Record<string, string>;
}

async function planById(db: Db, ownerPlayerId: string, planId: string | null): Promise<PlanView | null> {
  if (!planId) return null;
  const [p] = await db.select().from(developmentPlans).where(and(eq(developmentPlans.id, planId), eq(developmentPlans.playerId, ownerPlayerId)));
  return p ? { id: p.id, objectiveId: p.objectiveId, ifText: p.ifText, thenText: p.thenText, templateKey: p.templateKey, retiredAt: p.retiredAt, createdAt: p.createdAt } : null;
}

async function objectiveBrief(db: Db, ownerPlayerId: string, objectiveId: string | null): Promise<SessionDetail["objective"]> {
  if (!objectiveId) return null;
  const [o] = await db.select({ id: developmentObjectives.id, title: developmentObjectives.title, category: developmentObjectives.category, customCategory: developmentObjectives.customCategory, measure: developmentObjectives.measure }).from(developmentObjectives).where(and(eq(developmentObjectives.id, objectiveId), eq(developmentObjectives.playerId, ownerPlayerId)));
  return o ? { ...o, measure: (o.measure as ObjectiveView["measure"]) ?? null } : null;
}

/** One session with its games (and their figures), its objective and plan, its summary and LP change. */
export async function loadSession(db: Db, ownerPlayerId: string, sessionId: string): Promise<SessionDetail | null> {
  const detail = await getBlock(db, ownerPlayerId, sessionId);
  if (!detail) return null;
  const { block, games } = detail;
  const [objective, plan, figures] = await Promise.all([objectiveBrief(db, ownerPlayerId, block.objectiveId), planById(db, ownerPlayerId, block.planId), gameFigures(db, ownerPlayerId, games.map((g) => g.riotMatchId).filter((m): m is string => !!m))]);
  const summary = summariseSession(
    games.map((g) => ({ championId: g.championId, result: g.result, reviewStatus: g.reviewStatus, execution: g.execution, wentWell: g.wentWell, wentWrong: g.wentWrong, learning: g.learning, adjustment: g.adjustment, playedAt: g.playedAt.getTime() })),
    objective?.category ?? null,
  );
  const lp = await sessionLpChange(db, { startedAt: block.startedAt, accountId: block.accountId, startRank: block.startRank }, games.map((g) => ({ accountId: g.accountId })));
  const otherIds = [...new Set(games.filter((g) => g.needsConfirmation && g.alternativeBlockId).map((g) => g.alternativeBlockId!))];
  const others = otherIds.length ? await db.select({ id: rankedBlocks.id, number: rankedBlocks.number }).from(rankedBlocks).where(and(eq(rankedBlocks.playerId, ownerPlayerId), inArray(rankedBlocks.id, otherIds))) : [];
  return { session: block, objective, plan, games: games.map((g) => ({ ...g, figures: g.riotMatchId ? (figures.get(g.riotMatchId) ?? null) : null })), summary, lp, alternatives: Object.fromEntries(others.map((o) => [o.id, blockLabel(o.number)])) };
}

export interface PendingReview extends SessionGame {
  sessionLabel: number;
  objectiveTitle: string | null;
}

/** Games waiting for their review, newest first (the running session and those that ended recently). */
export async function pendingReviews(db: Db, ownerPlayerId: string, now: Date, limit = 5): Promise<PendingReview[]> {
  const since = new Date(now.getTime() - LATE_GAME_DAYS * DAY);
  const rows = await db
    .select({ game: rankedGames, number: rankedBlocks.number, objectiveTitle: developmentObjectives.title })
    .from(rankedGames)
    .innerJoin(rankedBlocks, eq(rankedBlocks.id, rankedGames.blockId))
    .leftJoin(developmentObjectives, eq(developmentObjectives.id, rankedGames.objectiveId))
    .where(and(eq(rankedGames.playerId, ownerPlayerId), eq(rankedGames.reviewStatus, "pending"), or(eq(rankedBlocks.status, "active"), gte(rankedBlocks.completedAt, since))))
    .orderBy(desc(rankedGames.playedAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const figures = await gameFigures(db, ownerPlayerId, rows.map((r) => r.game.riotMatchId).filter((m): m is string => !!m));
  return rows.map((r) => {
    const g = toGame(r.game);
    return { ...g, figures: g.riotMatchId ? (figures.get(g.riotMatchId) ?? null) : null, sessionLabel: r.number, objectiveTitle: r.objectiveTitle };
  });
}

export interface ReviewedGame {
  id: string;
  blockId: string;
  sessionNumber: number;
  championId: string;
  result: "win" | "loss";
  playedAt: Date;
  execution: number | null;
  wentWell: string | null;
  wentWrong: string | null;
  learning: string;
  adjustment: string;
  objectiveTitle: string | null;
}

export async function recentReviews(db: Db, ownerPlayerId: string, limit = 5): Promise<ReviewedGame[]> {
  const rows = await db
    .select({ id: rankedGames.id, blockId: rankedGames.blockId, sessionNumber: rankedBlocks.number, championId: rankedGames.championId, result: rankedGames.result, playedAt: rankedGames.playedAt, execution: rankedGames.execution, wentWell: rankedGames.wentWell, wentWrong: rankedGames.wentWrong, learning: rankedGames.learning, adjustment: rankedGames.adjustment, objectiveTitle: developmentObjectives.title })
    .from(rankedGames)
    .innerJoin(rankedBlocks, eq(rankedBlocks.id, rankedGames.blockId))
    .leftJoin(developmentObjectives, eq(developmentObjectives.id, rankedGames.objectiveId))
    .where(and(eq(rankedGames.playerId, ownerPlayerId), eq(rankedGames.reviewStatus, "done"), isNotNull(rankedGames.reviewedAt)))
    .orderBy(desc(rankedGames.reviewedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, result: r.result === "win" ? "win" : "loss" }));
}

export interface ObjectiveProgress {
  objective: ObjectiveView;
  evidence: ObjectiveEvidence | null;
  execution: ExecutionTrend;
  suggestion: StatusSuggestion | null;
  revisit: "not-practised" | "statistic" | null;
}

async function progressOf(db: Db, ownerPlayerId: string, objective: ObjectiveView, now: Date): Promise<ObjectiveProgress> {
  const [evidence, execution] = await Promise.all([objectiveEvidence(db, ownerPlayerId, objective), objectiveExecution(db, ownerPlayerId, objective.id)]);
  const trend = evidence?.result.state === "compared" ? evidence.result.trend : null;
  return {
    objective,
    evidence,
    execution,
    suggestion: suggestStatus({ status: objective.status, sessions: objective.sessions, hasMeasure: !!objective.measure }, execution.recent, trend),
    revisit: needsRevisit(objective, trend, now.getTime()),
  };
}

export interface OverviewData {
  primary: ObjectiveProgress | null;
  /** Every objective still being worked on (primary first): the choices a session can start with. */
  library: ObjectiveView[];
  /** Other objectives still being worked on (learning priorities). */
  others: ObjectiveView[];
  active: SessionDetail | null;
  /** The latest finished session when none is running (its summary stays visible). */
  last: SessionDetail | null;
  pending: PendingReview[];
  reviews: ReviewedGame[];
  /** Games that fit two sessions, waiting for the player's word (and the first session holding one). */
  confirmations: { games: number; sessionId: string | null };
  /** Areas named again and again in recent reviews that no active objective covers. */
  uncovered: ReviewPatterns["hardest"];
}

export async function loadOverview(db: Db, ownerPlayerId: string, now: Date = new Date()): Promise<OverviewData> {
  await associateQuietly(db, ownerPlayerId);
  const [objectives, activeBlock, pending, reviews, confirmations, patterns] = await Promise.all([
    listObjectives(db, ownerPlayerId),
    getActiveBlock(db, ownerPlayerId),
    pendingReviews(db, ownerPlayerId, now),
    recentReviews(db, ownerPlayerId),
    sessionsNeedingConfirmation(db, ownerPlayerId),
    loadPatterns(db, ownerPlayerId, now),
  ]);
  const primaryObjective = objectives.find((o) => o.isPrimary) ?? null;
  const [primary, active, last] = await Promise.all([
    primaryObjective ? progressOf(db, ownerPlayerId, primaryObjective, now) : Promise.resolve(null),
    activeBlock ? loadSession(db, ownerPlayerId, activeBlock.id) : Promise.resolve(null),
    activeBlock ? Promise.resolve(null) : listBlocks(db, ownerPlayerId, { limit: 1 }).then((b) => (b[0] ? loadSession(db, ownerPlayerId, b[0].id) : null)),
  ]);
  const covered = new Set(objectives.filter((o) => isActiveStatus(o.status)).map((o) => o.category));
  return {
    primary,
    library: objectives.filter((o) => isActiveStatus(o.status)),
    others: objectives.filter((o) => !o.isPrimary && isActiveStatus(o.status)).slice(0, 3),
    active,
    last,
    pending,
    reviews,
    confirmations,
    uncovered: patterns.hardest.filter((h) => !covered.has(h.key)),
  };
}

/** Areas named in the last PATTERN_WINDOW_DAYS of reviews (self-reported). */
export async function loadPatterns(db: Db, ownerPlayerId: string, now: Date = new Date()): Promise<ReviewPatterns> {
  const since = new Date(now.getTime() - PATTERN_WINDOW_DAYS * DAY);
  const rows = await db
    .select({ wentWell: rankedGames.wentWell, wentWrong: rankedGames.wentWrong })
    .from(rankedGames)
    .where(and(eq(rankedGames.playerId, ownerPlayerId), eq(rankedGames.reviewStatus, "done"), gte(rankedGames.reviewedAt, since)))
    .limit(500);
  return reviewPatterns(rows);
}

export interface SessionListItem extends RankedBlockView {
  reviews: { done: number; pending: number };
  execution: { rated: number; followed: number };
}

/** A page of sessions, newest first, each with its review counts and self-reported follow-through. */
export async function listSessions(db: Db, ownerPlayerId: string, options: { limit: number; offset: number; status?: "active" | "completed" }): Promise<SessionListItem[]> {
  const blocks = await listBlocks(db, ownerPlayerId, options);
  if (blocks.length === 0) return [];
  const rows = await db
    .select({
      id: rankedGames.blockId,
      done: sql<number>`count(*) filter (where ${rankedGames.reviewStatus} = 'done')`,
      pending: sql<number>`count(*) filter (where ${rankedGames.reviewStatus} = 'pending')`,
      rated: sql<number>`count(*) filter (where ${rankedGames.reviewStatus} = 'done' and ${rankedGames.execution} is not null)`,
      followed: sql<number>`count(*) filter (where ${rankedGames.reviewStatus} = 'done' and ${rankedGames.execution} >= 2)`,
    })
    .from(rankedGames)
    .where(and(eq(rankedGames.playerId, ownerPlayerId), inArray(rankedGames.blockId, blocks.map((b) => b.id))))
    .groupBy(rankedGames.blockId);
  const by = new Map(rows.map((r) => [r.id, r]));
  return blocks.map((b) => {
    const r = by.get(b.id);
    return { ...b, reviews: { done: Number(r?.done ?? 0), pending: Number(r?.pending ?? 0) }, execution: { rated: Number(r?.rated ?? 0), followed: Number(r?.followed ?? 0) } };
  });
}

export interface DevelopmentData {
  objectives: ObjectiveProgress[];
  plans: PlanHistoryItem[];
  patterns: ReviewPatterns;
}

/** The Development area: every objective with its evidence and follow-through, the plan history, the patterns. */
export async function loadDevelopment(db: Db, ownerPlayerId: string, now: Date = new Date()): Promise<DevelopmentData> {
  await associateQuietly(db, ownerPlayerId);
  const [objectives, plans, patterns] = await Promise.all([listObjectives(db, ownerPlayerId), listPlanHistory(db, ownerPlayerId), loadPatterns(db, ownerPlayerId, now)]);
  const progress = await Promise.all(objectives.map((o) => progressOf(db, ownerPlayerId, o, now)));
  return { objectives: progress, plans, patterns };
}

/** The games played with each objective most recently, for the Development area's review history. */
export async function objectiveReviewHistory(db: Db, ownerPlayerId: string, objectiveId: string, limit = 10): Promise<ReviewedGame[]> {
  const rows = await db
    .select({ id: rankedGames.id, blockId: rankedGames.blockId, sessionNumber: rankedBlocks.number, championId: rankedGames.championId, result: rankedGames.result, playedAt: rankedGames.playedAt, execution: rankedGames.execution, wentWell: rankedGames.wentWell, wentWrong: rankedGames.wentWrong, learning: rankedGames.learning, adjustment: rankedGames.adjustment, objectiveTitle: developmentObjectives.title })
    .from(rankedGames)
    .innerJoin(rankedBlocks, eq(rankedBlocks.id, rankedGames.blockId))
    .leftJoin(developmentObjectives, eq(developmentObjectives.id, rankedGames.objectiveId))
    .where(and(eq(rankedGames.playerId, ownerPlayerId), eq(rankedGames.objectiveId, objectiveId), eq(rankedGames.reviewStatus, "done")))
    .orderBy(desc(rankedGames.reviewedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, result: r.result === "win" ? "win" : "loss" }));
}

