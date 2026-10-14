"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { ROLES, type Role } from "@/domain/roles";
import { validateAssignment } from "@/domain/roster";
import type { RecommendationResult } from "@/domain/engine";
import type { Playbook } from "@/domain/playbook";
import { getAppDb } from "@/server/bootstrap";
import { canControlDraft, NotAuthorizedError, requirePermission, requireTeamMember, type Session } from "@/server/auth/session";
import { applyDraftActionCore, undoDraftActionCore } from "@/server/live/apply";
import { archiveCompletedDraft } from "@/server/matches/archive";
import { abandonDraft, deleteUnfinishedDraft } from "@/server/drafts/unfinished";
import { playbookForDraft, recommendForDraft, whyNotForDraft } from "@/server/engine/service";
import { parseOverrides, type DraftOverrides, type WhyNotComparison } from "@/domain/engine";
import { eligibleChampions } from "@/domain/roster";
import { getCurrentPatch } from "@/server/repositories/champions";
import { applyRoleSwap, cloneDraftAsTheorycraft, createDraft, getDraft, lastSeriesEnemyPlayers, lineupToProfiles, setDraftEnemySlot, setDraftSide, updateDraftMeta, type DraftRecord } from "@/server/repositories/drafts";
import { BUILTIN_FORMATS } from "@/domain/draft";
import { COMPETITION_MODE_INFO, isCompetitionMode, seriesAllowed, type CompetitionMode } from "@/domain/competition";
import { isSeriesLength } from "@/domain/series";
import { canStartGame, createSeries } from "@/server/series/repository";
import type { EnemyPlayerNames } from "@/server/db/schema";
import { rememberLineupUse } from "@/server/repositories/team";
import { getActiveLineupProfiles, getOrCreateTeam } from "@/server/repositories/team";
import { log, Timings, timed } from "@/server/observability/log";
import { createRiotClient } from "@/server/riot/api/client";
import { enemyRiotIds, kickoffEnemyScouting, listEnemyScouting, scoutDraftEnemies, verifyEnemy, type EnemyCheck, type EnemyScoutingView } from "@/server/scouting/session";


/** The draft's creator, or an admin: the only people who may change it (checked on every action). */
async function requireDraftControl(draftId: string): Promise<{ session: Session; draft: DraftRecord }> {
  const session = await requireTeamMember();
  const db = await getAppDb();
  const draft = await getDraft(db, draftId);
  if (!draft) throw new NotAuthorizedError("Draft not found.");
  if (!canControlDraft(session, draft)) throw new NotAuthorizedError("Only the player who created this draft (or an admin) can change it.");
  return { session, draft };
}

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
  /** Our side when already known; left out, it is chosen when pick/ban begins. */
  side?: "blue" | "red" | null;
  unavailableChampionIds?: string[];
  mode?: CompetitionMode;
  formatId?: string;
  isTheorycraft?: boolean;
  eventName?: string;
  /** Start a best-of series of this length (3 or 5) with this draft as game 1. */
  seriesBestOf?: number | null;
  /** Draft rules for a new series: standard or Fearless. */
  draftRules?: "standard" | "fearless";
  /** Start the next game of an existing series (mode, event and opponent are inherited). */
  seriesId?: string | null;
  enemyPlayers?: EnemyPlayerNames;
}

export async function createDraftAction(input: CreateDraftInput): Promise<Result<{ id: string }>> {
  try {
    const session = await requirePermission("create-draft");
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
      if (!canControlDraft(session, { createdByUserId: next.series.createdByUserId })) return { ok: false, error: "Only the player who started this series (or an admin) can start its next game." };
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
      const created = await createSeries(db, team.id, { mode, bestOf: input.seriesBestOf, eventName: input.eventName ?? "", opponentName: input.opponentName, createdByUserId: session.userId, draftRules: input.draftRules === "fearless" ? "fearless" : "standard" });
      seriesId = created.id;
    }
    const requestedFormat = input.formatId && modeInfo.formatSelectable ? input.formatId : modeInfo.defaultFormatId;
    // Predefined templates only; drafts saved with an older custom format keep it embedded.
    if (!BUILTIN_FORMATS[requestedFormat]) return { ok: false, error: `Unknown draft format "${requestedFormat}".` };
    const draft = await createDraft(db, team.id, {
      opponentName: inherited ? inherited.opponentName || input.opponentName : input.opponentName,
      side: input.side ?? "blue",
      sideConfirmed: !!input.side,
      patch,
      players: lineup.players,
      assignment: lineup.assignment,
      unavailableChampionIds: input.unavailableChampionIds ?? [],
      mode,
      formatId: requestedFormat,
      format: null,
      isTheorycraft: input.isTheorycraft ?? false,
      eventName: inherited ? inherited.eventName : (input.eventName?.trim() ?? ""),
      seriesId,
      gameNumber,
      // The next game of a series starts with the previous game's enemy roster (editable while scouting).
      enemyPlayers: input.enemyPlayers ? cleanEnemyPlayers(input.enemyPlayers) : seriesId && gameNumber > 1 ? await lastSeriesEnemyPlayers(db, seriesId) : {},
      createdByUserId: session.userId,
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
  // Callable from a browser too (this is a server-action module): team workspace only.
  await requireTeamMember();
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
    const session = await timed("auth", () => requireTeamMember(), { collector: t });
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
    const session = await requireTeamMember();
    const db = await getAppDb();
    const outcome = await undoDraftActionCore(db, draftId, { session, expectedVersion });
    if (!outcome.ok) return outcome;
    revalidatePath("/draft");
    return { ok: true, data: { draft: outcome.draft, recommendation: outcome.recommendation, playbook: null } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function reloadDraftRoomAction(draftId: string): Promise<DraftRoomPayload | null> {
  await requireTeamMember();
  return loadDraftRoom(draftId);
}

export async function applyRoleSwapAction(draftId: string, assignments: Record<Role, string>, reason: string): Promise<Result<DraftRoomPayload>> {
  try {
    const { draft } = await requireDraftControl(draftId);
    const db = await getAppDb();
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
    await requireDraftControl(draftId);
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
    await requireTeamMember();
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
    const { draft } = await requireDraftControl(draftId);
    const db = await getAppDb();
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

/** Clones the draft (state so far) as a theorycraft copy anyone may explore: the copy belongs to whoever made it. */
export async function cloneDraftAsTheorycraftAction(draftId: string): Promise<Result<{ id: string }>> {
  try {
    const session = await requirePermission("create-draft");
    const db = await getAppDb();
    const clone = await cloneDraftAsTheorycraft(db, draftId, session.userId);
    if (!clone) return { ok: false, error: "Draft not found." };
    revalidatePath("/draft");
    return { ok: true, data: { id: clone.id } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Abandons an unfinished draft (creator or admin): it leaves the Draft page and no longer counts in its series. */
export async function abandonDraftAction(draftId: string): Promise<Result<null>> {
  try {
    await requireDraftControl(draftId);
    const db = await getAppDb();
    await abandonDraft(db, draftId);
    revalidatePath("/draft");
    revalidatePath("/matches");
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Deletes an unfinished or abandoned draft permanently (creator or admin). Finished drafts are managed from Matches. */
export async function deleteDraftAction(draftId: string): Promise<Result<null>> {
  try {
    await requireDraftControl(draftId);
    const db = await getAppDb();
    await deleteUnfinishedDraft(db, draftId);
    revalidatePath("/draft");
    revalidatePath("/matches");
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Re-run the Riot lookup for the enemy Riot IDs on this draft (bounded; never blocks the draft). */
export async function rescoutEnemiesAction(draftId: string): Promise<Result<{ scouted: number; reused: number; pending: number; unresolved: number }>> {
  try {
    const { draft } = await requireDraftControl(draftId);
    const db = await getAppDb();
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

/** Picks our side as pick/ban begins (or corrects it before the first action). */
export async function setDraftSideAction(draftId: string, side: "blue" | "red"): Promise<Result<null>> {
  try {
    if (side !== "blue" && side !== "red") return { ok: false, error: "Choose Blue or Red." };
    const { draft } = await requireDraftControl(draftId);
    if (draft.status !== "in_progress") return { ok: false, error: "This draft is no longer in progress." };
    const db = await getAppDb();
    await setDraftSide(db, draftId, side);
    globalThis.__uniiverseRecommendationCache = undefined;
    revalidatePath(`/draft/${draftId}`);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * The scouting page: stores one enemy entry (slot 1–5, any order) and verifies it at once. A
 * verified player's recent games are then collected in the background for that slot only; the
 * page polls getEnemyScoutingAction for the result. Editable until the first ban or pick.
 */
export async function setEnemyPlayerAction(draftId: string, slot: number, value: string): Promise<Result<{ check: EnemyCheck; scouting: EnemyScoutingView[] }>> {
  try {
    const role = ROLES[slot];
    if (!role) return { ok: false, error: "Unknown enemy slot." };
    const { draft } = await requireDraftControl(draftId);
    if (draft.actions.length > 0) return { ok: false, error: "Enemy players are set before the first ban or pick." };
    const db = await getAppDb();
    await setDraftEnemySlot(db, draftId, role, value);
    const client = createRiotClient();
    const check = await verifyEnemy(db, draftId, role, client);
    if (check.status === "verified") after(() => kickoffEnemyScouting(db, draftId, client, { currentPatch: draft.patch, onlyRoles: [role], maxMatchesPerEnemy: 12 }));
    return { ok: true, data: { check, scouting: await listEnemyScouting(db, draftId) } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Current scouting state of a draft's enemy players (the scouting page polls it while data arrives). */
export async function getEnemyScoutingAction(draftId: string): Promise<EnemyScoutingView[]> {
  await requireTeamMember();
  const db = await getAppDb();
  return listEnemyScouting(db, draftId);
}

