import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { draftActions, draftRoleSwaps, drafts, type LineupSnapshotPlayer } from "@/server/db/schema";
import { draftSteps, type DraftAction, type DraftFormat, type DraftState, type DraftStep, type Side } from "@/domain/draft";
import type { CompetitionMode } from "@/domain/competition";
import type { Role } from "@/domain/roles";
import type { PlayerProfile } from "@/domain/roster";

export interface DraftRecord {
  id: string;
  teamId: string;
  opponentName: string;
  side: Side;
  patch: string;
  status: "in_progress" | "completed" | "abandoned";
  mode: CompetitionMode;
  formatId: string;
  format: DraftFormat | null;
  isTheorycraft: boolean;
  eventName: string;
  opponentTeamId: string | null;
  version: number;
  controllerUserId: string | null;
  overrides: Record<string, unknown>;
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
    formatId: record.formatId,
    format: record.format,
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
  input: {
    opponentName: string;
    side: Side;
    patch: string;
    players: PlayerProfile[];
    assignment: Record<Role, string>;
    unavailableChampionIds?: string[];
    notes?: string;
    mode?: CompetitionMode;
    formatId?: string;
    format?: DraftFormat | null;
    isTheorycraft?: boolean;
    eventName?: string;
    opponentTeamId?: string | null;
    controllerUserId?: string | null;
  },
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
      mode: input.mode ?? "tournament",
      formatId: input.formatId ?? (input.format?.id ?? "tournament"),
      formatSpec: input.format ? (input.format as unknown as Record<string, unknown>) : null,
      isTheorycraft: input.isTheorycraft ?? false,
      eventName: input.eventName ?? "",
      opponentTeamId: input.opponentTeamId ?? null,
      controllerUserId: input.controllerUserId ?? null,
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
    mode: row.mode,
    formatId: row.formatId,
    format: (row.formatSpec as unknown as DraftFormat | null) ?? null,
    isTheorycraft: row.isTheorycraft,
    eventName: row.eventName,
    opponentTeamId: row.opponentTeamId,
    version: row.version,
    controllerUserId: row.controllerUserId,
    overrides: row.overrides,
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
      mode: row.mode,
      isTheorycraft: row.isTheorycraft,
      eventName: row.eventName,
      opponentTeamId: row.opponentTeamId,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      ourPicks: actions.filter((a) => a.type === "pick" && a.side === row.side && a.championId).map((a) => a.championId!),
      enemyPicks: actions.filter((a) => a.type === "pick" && a.side !== row.side && a.championId).map((a) => a.championId!),
      progress: actions.length,
    });
  }
  return out;
}

export async function appendDraftAction(db: Db, draftId: string, action: DraftAction, side: Side, recommendationSnapshot: Record<string, unknown> | null, steps: readonly DraftStep[]) {
  const step = steps[action.index]!;
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
  await bumpDraftVersion(db, draftId);
}

/** Every mutation bumps the version so live viewers and optimistic concurrency can detect change. */
export async function bumpDraftVersion(db: Db, draftId: string) {
  await db.update(drafts).set({ version: sql`${drafts.version} + 1`, updatedAt: new Date() }).where(eq(drafts.id, draftId));
}

export async function getDraftVersion(db: Db, draftId: string): Promise<number | null> {
  const [row] = await db.select({ version: drafts.version }).from(drafts).where(eq(drafts.id, draftId));
  return row?.version ?? null;
}

export async function removeLastDraftAction(db: Db, draftId: string) {
  const [last] = await db.select().from(draftActions).where(eq(draftActions.draftId, draftId)).orderBy(desc(draftActions.sequenceIndex)).limit(1);
  if (!last) return;
  await db.delete(draftActions).where(and(eq(draftActions.draftId, draftId), eq(draftActions.sequenceIndex, last.sequenceIndex)));
  await db.update(drafts).set({ status: "in_progress", completedAt: null, finalAnalysis: null, version: sql`${drafts.version} + 1`, updatedAt: new Date() }).where(eq(drafts.id, draftId));
}

export async function applyRoleSwap(db: Db, draftId: string, assignments: Record<Role, string>, afterSequenceIndex: number, reason: string) {
  await db.insert(draftRoleSwaps).values({ draftId, afterSequenceIndex, assignments, reason });
  await db.update(drafts).set({ currentAssignments: assignments, version: sql`${drafts.version} + 1`, updatedAt: new Date() }).where(eq(drafts.id, draftId));
}

export async function completeDraft(db: Db, draftId: string, finalAnalysis: Record<string, unknown>) {
  await db.update(drafts).set({ status: "completed", completedAt: new Date(), finalAnalysis, version: sql`${drafts.version} + 1`, updatedAt: new Date() }).where(eq(drafts.id, draftId));
}

export async function updateDraftMeta(
  db: Db,
  draftId: string,
  patch: Partial<{ opponentName: string; notes: string; status: "in_progress" | "completed" | "abandoned"; unavailableChampionIds: string[]; controllerUserId: string | null; overrides: Record<string, unknown>; eventName: string; opponentTeamId: string | null }>,
) {
  await db.update(drafts).set({ ...patch, version: sql`${drafts.version} + 1`, updatedAt: new Date() }).where(eq(drafts.id, draftId));
}

export async function deleteDraft(db: Db, draftId: string) {
  await db.delete(drafts).where(eq(drafts.id, draftId));
}

/**
 * Clones a draft as a theorycraft copy: same lineup snapshot, assignment, mode, format, side,
 * opponent and every action so far, so alternatives can be explored without touching the original.
 */
export async function cloneDraftAsTheorycraft(db: Db, draftId: string): Promise<DraftRecord | null> {
  const source = await getDraft(db, draftId);
  if (!source) return null;
  const [row] = await db
    .insert(drafts)
    .values({
      teamId: source.teamId,
      opponentName: source.opponentName,
      side: source.side,
      patch: source.patch,
      lineupSnapshot: source.lineup,
      initialAssignments: source.initialAssignments,
      currentAssignments: source.currentAssignments,
      unavailableChampionIds: source.unavailableChampionIds,
      notes: source.notes,
      mode: source.mode,
      formatId: source.formatId,
      formatSpec: source.format ? (source.format as unknown as Record<string, unknown>) : null,
      isTheorycraft: true,
      eventName: source.eventName ? `${source.eventName} (theorycraft)` : "theorycraft",
      opponentTeamId: source.opponentTeamId,
      overrides: source.overrides,
    })
    .returning({ id: drafts.id });
  const id = row!.id;
  if (source.actions.length) {
    await db.insert(draftActions).values(
      source.actions.map((a) => {
        const step = draftSteps({ side: source.side, formatId: source.formatId, format: source.format })[a.index]!;
        return { draftId: id, sequenceIndex: a.index, type: step.type, side: step.side, championId: a.championId, playerId: a.playerId ?? null, role: a.role ?? null, recommendationSnapshot: null };
      }),
    );
  }
  return getDraft(db, id);
}
