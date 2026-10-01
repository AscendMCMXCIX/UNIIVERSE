import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { draftActions, draftRoleSwaps, drafts, type LineupSnapshotPlayer } from "@/server/db/schema";
import { TOURNAMENT_SEQUENCE, type DraftAction, type DraftState, type Side } from "@/domain/draft";
import type { Role } from "@/domain/roles";
import type { PlayerProfile } from "@/domain/roster";

export interface DraftRecord {
  id: string;
  teamId: string;
  opponentName: string;
  side: Side;
  patch: string;
  status: "in_progress" | "completed" | "abandoned";
  lineup: LineupSnapshotPlayer[];
  initialAssignments: Record<Role, string>;
  currentAssignments: Record<Role, string>;
  unavailableChampionIds: string[];
  finalAnalysis: Record<string, unknown> | null;
  notes: string;
  createdAt: Date;
  completedAt: Date | null;
  actions: Array<DraftAction & { recommendationSnapshot: Record<string, unknown> | null }>;
  roleSwaps: Array<{ afterSequenceIndex: number; assignments: Record<Role, string>; reason: string }>;
}

export function toDraftState(record: DraftRecord): DraftState {
  return {
    side: record.side,
    actions: record.actions.map((a) => ({ index: a.index, championId: a.championId, playerId: a.playerId ?? null, role: a.role ?? null })),
    assignments: record.currentAssignments,
    unavailableChampionIds: record.unavailableChampionIds,
  };
}

export function lineupToProfiles(record: DraftRecord): PlayerProfile[] {
  return record.lineup.map((p) => ({ ...p }));
}

export async function createDraft(
  db: Db,
  teamId: string,
  input: { opponentName: string; side: Side; patch: string; players: PlayerProfile[]; assignment: Record<Role, string>; unavailableChampionIds?: string[]; notes?: string },
): Promise<DraftRecord> {
  const snapshot: LineupSnapshotPlayer[] = input.players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    group: p.group,
    primaryRole: p.primaryRole,
    secondaryRole: p.secondaryRole,
    primaryPool: [...p.primaryPool],
    secondaryPool: [...p.secondaryPool],
  }));
  const [row] = await db
    .insert(drafts)
    .values({
      teamId,
      opponentName: input.opponentName.trim(),
      side: input.side,
      patch: input.patch,
      lineupSnapshot: snapshot,
      initialAssignments: input.assignment,
      currentAssignments: input.assignment,
      unavailableChampionIds: input.unavailableChampionIds ?? [],
      notes: input.notes ?? "",
    })
    .returning({ id: drafts.id });
  return (await getDraft(db, row!.id))!;
}

export async function getDraft(db: Db, draftId: string): Promise<DraftRecord | null> {
  const [row] = await db.select().from(drafts).where(eq(drafts.id, draftId));
  if (!row) return null;
  const actions = await db.select().from(draftActions).where(eq(draftActions.draftId, draftId)).orderBy(asc(draftActions.sequenceIndex));
  const swaps = await db.select().from(draftRoleSwaps).where(eq(draftRoleSwaps.draftId, draftId)).orderBy(asc(draftRoleSwaps.id));
  return {
    id: row.id,
    teamId: row.teamId,
    opponentName: row.opponentName,
    side: row.side,
    patch: row.patch,
    status: row.status,
    lineup: row.lineupSnapshot,
    initialAssignments: row.initialAssignments,
    currentAssignments: row.currentAssignments,
    unavailableChampionIds: row.unavailableChampionIds,
    finalAnalysis: row.finalAnalysis ?? null,
    notes: row.notes,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    actions: actions.map((a) => ({ index: a.sequenceIndex, championId: a.championId, playerId: a.playerId, role: a.role, recommendationSnapshot: a.recommendationSnapshot ?? null })),
    roleSwaps: swaps.map((s) => ({ afterSequenceIndex: s.afterSequenceIndex, assignments: s.assignments, reason: s.reason })),
  };
}

export async function listDrafts(db: Db, teamId: string, limit = 50) {
  const rows = await db.select().from(drafts).where(eq(drafts.teamId, teamId)).orderBy(desc(drafts.createdAt)).limit(limit);
  const out = [];
  for (const row of rows) {
    const actions = await db.select({ sequenceIndex: draftActions.sequenceIndex, championId: draftActions.championId, side: draftActions.side, type: draftActions.type }).from(draftActions).where(eq(draftActions.draftId, row.id)).orderBy(asc(draftActions.sequenceIndex));
    out.push({
      id: row.id,
      opponentName: row.opponentName,
      side: row.side,
      patch: row.patch,
      status: row.status,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      ourPicks: actions.filter((a) => a.type === "pick" && a.side === row.side && a.championId).map((a) => a.championId!),
      enemyPicks: actions.filter((a) => a.type === "pick" && a.side !== row.side && a.championId).map((a) => a.championId!),
      progress: actions.length,
    });
  }
  return out;
}

export async function appendDraftAction(db: Db, draftId: string, action: DraftAction, side: Side, recommendationSnapshot: Record<string, unknown> | null) {
  const step = TOURNAMENT_SEQUENCE[action.index]!;
  await db
    .insert(draftActions)
    .values({
      draftId,
      sequenceIndex: action.index,
      type: step.type,
      side: step.side,
      championId: action.championId,
      playerId: step.side === side ? (action.playerId ?? null) : null,
      role: step.side === side ? (action.role ?? null) : null,
      recommendationSnapshot,
    })
    .onConflictDoNothing();
  await db.update(drafts).set({ updatedAt: new Date() }).where(eq(drafts.id, draftId));
}

export async function removeLastDraftAction(db: Db, draftId: string) {
  const [last] = await db.select().from(draftActions).where(eq(draftActions.draftId, draftId)).orderBy(desc(draftActions.sequenceIndex)).limit(1);
  if (!last) return;
  await db.delete(draftActions).where(and(eq(draftActions.draftId, draftId), eq(draftActions.sequenceIndex, last.sequenceIndex)));
  await db.update(drafts).set({ status: "in_progress", completedAt: null, finalAnalysis: null, updatedAt: new Date() }).where(eq(drafts.id, draftId));
}

export async function applyRoleSwap(db: Db, draftId: string, assignments: Record<Role, string>, afterSequenceIndex: number, reason: string) {
  await db.insert(draftRoleSwaps).values({ draftId, afterSequenceIndex, assignments, reason });
  await db.update(drafts).set({ currentAssignments: assignments, updatedAt: new Date() }).where(eq(drafts.id, draftId));
}

export async function completeDraft(db: Db, draftId: string, finalAnalysis: Record<string, unknown>) {
  await db.update(drafts).set({ status: "completed", completedAt: new Date(), finalAnalysis, updatedAt: new Date() }).where(eq(drafts.id, draftId));
}

export async function updateDraftMeta(db: Db, draftId: string, patch: Partial<{ opponentName: string; notes: string; status: "in_progress" | "completed" | "abandoned"; unavailableChampionIds: string[] }>) {
  await db.update(drafts).set({ ...patch, updatedAt: new Date() }).where(eq(drafts.id, draftId));
}

export async function deleteDraft(db: Db, draftId: string) {
  await db.delete(drafts).where(eq(drafts.id, draftId));
}
