"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ROLES, type Role } from "@/domain/roles";
import { validateAssignment } from "@/domain/roster";
import type { RecommendationResult } from "@/domain/engine";
import type { Playbook } from "@/domain/playbook";
import { getAppDb } from "@/server/bootstrap";
import { requireEditor, requireSession } from "@/server/auth/session";
import { applyDraftActionCore, undoDraftActionCore } from "@/server/live/apply";
import { canHandoff, canHoldControl, canTakeControl } from "@/server/live/control";
import { setController } from "@/server/live/draft-live";
import { archiveCompletedDraft } from "@/server/matches/archive";
import { invalidateRecommendationCache, playbookForDraft, recommendForDraft, whyNotForDraft } from "@/server/engine/service";
import { parseOverrides, type DraftOverrides, type WhyNotComparison } from "@/domain/engine";
import { eligibleChampions } from "@/domain/roster";
import { getCurrentPatch } from "@/server/repositories/champions";
import { applyRoleSwap, cloneDraftAsTheorycraft, createDraft, deleteDraft, getDraft, lineupToProfiles, updateDraftMeta, type DraftRecord } from "@/server/repositories/drafts";
import { BUILTIN_FORMATS } from "@/domain/draft";
import { COMPETITION_MODE_INFO, isCompetitionMode, seriesAllowed, type CompetitionMode } from "@/domain/competition";
import { isSeriesLength } from "@/domain/series";
import { canStartGame, createSeries } from "@/server/series/repository";
import type { EnemyPlayerNames } from "@/server/db/schema";
import { getCustomFormats } from "@/server/repositories/formats";
import { rememberLineupUse } from "@/server/repositories/team";
import { getActiveLineupProfiles, getOrCreateTeam } from "@/server/repositories/team";
import { log, Timings, timed } from "@/server/observability/log";
import { createRiotClient } from "@/server/riot/api/client";
import { enemyRiotIds, kickoffEnemyScouting, listEnemyScouting, scoutDraftEnemies, type EnemyScoutingView } from "@/server/scouting/session";

export interface DraftRoomPayload {
  draft: DraftRecord;
  recommendation: RecommendationResult;
  playbook: Playbook | null;
  /** Status of the enemy Riot ID lookups for this draft (absent on action results; the room keeps the last known). */
  scouting?: EnemyScoutingView[];
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
  /** Start a best-of series of this length (3 or 5) with this draft as game 1. */
  seriesBestOf?: number | null;
  /** Start the next game of an existing series (mode, event and opponent are inherited). */
  seriesId?: string | null;
  enemyPlayers?: EnemyPlayerNames;
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

    // Series context: either the next game of an existing series or a brand-new series.
    let seriesId: string | null = null;
    let gameNumber = 1;
    let inherited: { mode: CompetitionMode; eventName: string; opponentName: string } | null = null;
    if (input.seriesId) {
      const next = await canStartGame(db, input.seriesId);
      if (!next.ok) return { ok: false, error: next.error };
      if (next.series.teamId !== team.id) return { ok: false, error: "Series not found." };
      seriesId = next.series.id;
      gameNumber = next.gameNumber;
      inherited = { mode: next.series.mode, eventName: next.series.eventName, opponentName: next.series.opponentName };
    }
    const mode: CompetitionMode = inherited ? inherited.mode : isCompetitionMode(input.mode) ? input.mode : "tournament";
    const modeInfo = COMPETITION_MODE_INFO[mode];
    if (!seriesId && input.seriesBestOf && input.seriesBestOf > 1) {
      if (input.isTheorycraft) return { ok: false, error: "A theorycraft draft cannot start a series." };
      if (!isSeriesLength(input.seriesBestOf)) return { ok: false, error: "A series is a single game, best of 3 or best of 5." };
      if (!seriesAllowed(mode)) return { ok: false, error: `${modeInfo.label} games are played one at a time.` };
      const created = await createSeries(db, team.id, { mode, bestOf: input.seriesBestOf, eventName: input.eventName ?? "", opponentName: input.opponentName });
      seriesId = created.id;
    }
    const requestedFormat = input.formatId && modeInfo.formatSelectable ? input.formatId : modeInfo.defaultFormatId;
    const customFormats = await getCustomFormats(db);
    const inlineFormat = customFormats.find((f) => f.id === requestedFormat) ?? null;
    if (!inlineFormat && !BUILTIN_FORMATS[requestedFormat]) return { ok: false, error: `Unknown draft format "${requestedFormat}".` };
    const draft = await createDraft(db, team.id, {
      opponentName: inherited ? inherited.opponentName || input.opponentName : input.opponentName,
      side: input.side,
      patch,
      players: lineup.players,
      assignment: lineup.assignment,
      unavailableChampionIds: input.unavailableChampionIds ?? [],
      mode,
      formatId: requestedFormat,
      format: inlineFormat,
      isTheorycraft: input.isTheorycraft ?? false,
      eventName: inherited ? inherited.eventName : (input.eventName?.trim() ?? ""),
      seriesId,
      gameNumber,
      enemyPlayers: cleanEnemyPlayers(input.enemyPlayers),
    });
    await rememberLineupUse(db, team.id);
    // Enemy Riot IDs are scouted after the response is sent; the draft never waits for Riot.
    if (enemyRiotIds(draft.enemyPlayers).length > 0) after(() => kickoffEnemyScouting(db, draft.id, createRiotClient(), { currentPatch: patch }));
    revalidatePath("/draft");
    revalidatePath("/matches");
    return { ok: true, data: { id: draft.id } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function loadDraftRoom(draftId: string): Promise<DraftRoomPayload | null> {
  const t = new Timings();
  const db = await timed("db", () => getAppDb(), { collector: t });
  const draft = await timed("draft", () => getDraft(db, draftId), { collector: t });
  if (!draft) return null;
  const recommendation = await timed("engine", () => recommendForDraft(db, draft), { collector: t });
  const playbook = recommendation.kind === "complete" ? await timed("playbook", () => playbookForDraft(db, draft), { collector: t }) : null;
  const scouting = enemyRiotIds(draft.enemyPlayers).length > 0 ? await listEnemyScouting(db, draftId) : [];
  t.report("draft.room.load", { draftId, kind: recommendation.kind, computeMs: recommendation.computeMs });
  return { draft, recommendation, playbook, scouting };
}

const actionSchema = z.object({
  championId: z.string().min(1).nullable(),
  role: z.enum(ROLES).nullable().optional(),
  playerId: z.string().nullable().optional(),
});

export type ApplyResult = { ok: true; data: DraftRoomPayload } | { ok: false; error: string; conflict?: boolean };

export async function applyDraftAction(draftId: string, input: z.infer<typeof actionSchema>, expectedVersion?: number | null): Promise<ApplyResult> {
  const t = new Timings();
  try {
    const session = await timed("auth", () => requireSession(), { collector: t });
    const parsed = actionSchema.parse(input);
    const db = await timed("db", () => getAppDb(), { collector: t });
    const outcome = await timed("apply", () => applyDraftActionCore(db, draftId, parsed, { session, expectedVersion, onComplete: archiveCompletedDraft }), { collector: t });
    if (!outcome.ok) {
      log("info", "draft.action.rejected", { draftId, reason: outcome.error, conflict: !!outcome.conflict });
      return outcome;
    }
    revalidatePath("/draft");
    t.report("draft.action", { draftId, step: outcome.draft.actions.length, computeMs: outcome.recommendation.computeMs }, Number(process.env.UNIIVERSE_SLOW_ACTION_MS ?? 800));
    return { ok: true, data: { draft: outcome.draft, recommendation: outcome.recommendation, playbook: outcome.playbook } };
  } catch (err) {
    log("error", "draft.action.failed", { draftId, error: err, timings: t.summary() });
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
    return { ok: true, data: { draft: outcome.draft, recommendation: outcome.recommendation, playbook: null } };
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
    if (!canHandoff(session, draft)) return { ok: false, error: "Only the controller, an Admin or a Draft Lead can hand off control." };
    if (toUserId) {
      const { getUser } = await import("@/server/repositories/users");
      const target = await getUser(db, toUserId);
      if (!target || !canHoldControl(target)) return { ok: false, error: "Control can only be handed to an Admin or a Draft Lead." };
    }
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
  return (await listUsers(db)).filter((u) => canHoldControl(u)).map((u) => ({ id: u.id, label: u.displayName, role: u.role === "player" ? "draft lead" : u.role }));
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
    return { ok: true, data: { draft: updated, recommendation, playbook: null } };
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

/** "Why not X?" — compares the recommendation with another champion for the next pick. */
export async function whyNotAction(draftId: string, championId: string, role?: Role | null): Promise<Result<WhyNotComparison>> {
  try {
    await requireSession();
    const db = await getAppDb();
    const draft = await getDraft(db, draftId);
    if (!draft) return { ok: false, error: "Draft not found." };
    const comparison = await whyNotForDraft(db, draft, { championId, role: role ?? null });
    if (comparison) return { ok: true, data: comparison };
    // Explain why it is not comparable: not our pick, or not a legal option for any open role.
    const players = lineupToProfiles(draft);
    const legalRoles = ROLES.filter((r) => {
      const player = players.find((p) => p.id === draft.currentAssignments[r]);
      return player && eligibleChampions(player, r, { unavailableChampionIds: new Set(draft.unavailableChampionIds) }).includes(championId);
    });
    if (legalRoles.length === 0) return { ok: false, error: "Not a legal option: no assigned player has this champion in their pool for an open role (the player constraint is hard)." };
    return { ok: false, error: "No comparison available right now (it is not our pick, or the champion is already unavailable)." };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Coach/strategy overrides for one draft: stored under overrides.coach, applied as soft tilts. */
export async function setDraftOverridesAction(draftId: string, input: DraftOverrides | null): Promise<Result<DraftRoomPayload>> {
  try {
    await requireEditor();
    const db = await getAppDb();
    const draft = await getDraft(db, draftId);
    if (!draft) return { ok: false, error: "Draft not found." };
    const coach = parseOverrides(input);
    await updateDraftMeta(db, draftId, { overrides: { ...draft.overrides, coach: coach ?? {} } });
    const updated = (await getDraft(db, draftId))!;
    const recommendation = await recommendForDraft(db, updated);
    const playbook = recommendation.kind === "complete" ? await playbookForDraft(db, updated) : null;
    return { ok: true, data: { draft: updated, recommendation, playbook } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Clones the draft (state so far) as a theorycraft copy to explore alternatives. */
export async function cloneDraftAsTheorycraftAction(draftId: string): Promise<Result<{ id: string }>> {
  try {
    await requireEditor();
    const db = await getAppDb();
    const clone = await cloneDraftAsTheorycraft(db, draftId);
    if (!clone) return { ok: false, error: "Draft not found." };
    revalidatePath("/draft");
    return { ok: true, data: { id: clone.id } };
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

/** Optional enemy player names by role for this game; they travel into the match record. */
export async function setEnemyPlayersAction(draftId: string, names: EnemyPlayerNames): Promise<Result<null>> {
  try {
    await requireEditor();
    const db = await getAppDb();
    const cleaned = cleanEnemyPlayers(names);
    await updateDraftMeta(db, draftId, { enemyPlayers: cleaned });
    invalidateRecommendationCache();
    after(() => kickoffEnemyScouting(db, draftId, createRiotClient()));
    revalidatePath(`/draft/${draftId}`);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Re-run the Riot lookup for the enemy Riot IDs on this draft (bounded; never blocks the draft). */
export async function rescoutEnemiesAction(draftId: string): Promise<Result<{ scouted: number; reused: number; pending: number; unresolved: number }>> {
  try {
    await requireEditor();
    const db = await getAppDb();
    const draft = await getDraft(db, draftId);
    if (!draft) return { ok: false, error: "Draft not found." };
    const client = createRiotClient();
    const summary = await scoutDraftEnemies(db, draftId, { client, deadlineMs: 20_000, currentPatch: draft.patch });
    revalidatePath(`/draft/${draftId}`);
    return { ok: true, data: summary };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function cleanEnemyPlayers(names: EnemyPlayerNames | undefined): EnemyPlayerNames {
  const out: EnemyPlayerNames = {};
  for (const role of ROLES) {
    const v = (names?.[role] ?? "").toString().trim().slice(0, 40);
    if (v) out[role] = v;
  }
  return out;
}
