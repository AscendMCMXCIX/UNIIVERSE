import type { Role } from "../roles";
import { ROLES } from "../roles";
import { TOURNAMENT_SEQUENCE, TOTAL_STEPS, type DraftStep, type Side, opposite } from "./sequence";

/**
 * A recorded draft action. `championId` is null when a ban was skipped (no champion banned).
 * For our own picks we also store which player and role the pick was intended for.
 */
export interface DraftAction {
  index: number;
  championId: string | null;
  /** Only meaningful for our picks. */
  playerId?: string | null;
  /** Only meaningful for our picks. */
  role?: Role | null;
}

export type Assignments = Record<Role, string>;

export interface DraftState {
  side: Side;
  actions: DraftAction[];
  /** Current player → role assignment (playerId per role). */
  assignments: Assignments;
  /** Champions unavailable for other reasons (e.g. fearless/series rules, disabled champions). */
  unavailableChampionIds?: string[];
}

export interface OurPick {
  index: number;
  championId: string;
  playerId: string | null;
  role: Role | null;
}

export interface EnemyPick {
  index: number;
  championId: string;
}

export interface DerivedDraft {
  side: Side;
  enemySide: Side;
  nextStep: DraftStep | null;
  isComplete: boolean;
  ourTurn: boolean;
  ourBans: Array<{ index: number; championId: string | null }>;
  enemyBans: Array<{ index: number; championId: string | null }>;
  ourPicks: OurPick[];
  enemyPicks: EnemyPick[];
  bannedChampionIds: Set<string>;
  pickedChampionIds: Set<string>;
  /** Everything that cannot be selected any more. */
  unavailableChampionIds: Set<string>;
  /** Roles we have already filled (according to the recorded intent). */
  filledRoles: Set<Role>;
  openRoles: Role[];
  /** Steps that remain (including the next one). */
  remaining: DraftStep[];
  ourRemainingPicks: number;
  enemyRemainingPicks: number;
  ourRemainingBans: number;
  enemyRemainingBans: number;
}

export function deriveDraft(state: DraftState): DerivedDraft {
  const byIndex = new Map<number, DraftAction>();
  for (const a of state.actions) byIndex.set(a.index, a);

  const enemySide = opposite(state.side);
  const ourBans: DerivedDraft["ourBans"] = [];
  const enemyBans: DerivedDraft["enemyBans"] = [];
  const ourPicks: OurPick[] = [];
  const enemyPicks: EnemyPick[] = [];
  const banned = new Set<string>();
  const picked = new Set<string>();

  let nextIndex: number | null = null;
  for (const step of TOURNAMENT_SEQUENCE) {
    const action = byIndex.get(step.index);
    if (!action) {
      nextIndex = step.index;
      break;
    }
    if (step.type === "ban") {
      const entry = { index: step.index, championId: action.championId };
      if (step.side === state.side) ourBans.push(entry);
      else enemyBans.push(entry);
      if (action.championId) banned.add(action.championId);
    } else if (action.championId) {
      picked.add(action.championId);
      if (step.side === state.side) {
        ourPicks.push({
          index: step.index,
          championId: action.championId,
          playerId: action.playerId ?? null,
          role: action.role ?? null,
        });
      } else {
        enemyPicks.push({ index: step.index, championId: action.championId });
      }
    }
  }

  const nextStep = nextIndex === null ? null : (TOURNAMENT_SEQUENCE[nextIndex] ?? null);
  const unavailable = new Set<string>([...banned, ...picked, ...(state.unavailableChampionIds ?? [])]);
  const filledRoles = new Set<Role>();
  for (const p of ourPicks) if (p.role) filledRoles.add(p.role);
  const openRoles = ROLES.filter((r) => !filledRoles.has(r));
  const remaining = nextIndex === null ? [] : TOURNAMENT_SEQUENCE.slice(nextIndex);

  const count = (side: Side, type: DraftStep["type"]) => remaining.filter((s) => s.side === side && s.type === type).length;

  return {
    side: state.side,
    enemySide,
    nextStep,
    isComplete: nextStep === null,
    ourTurn: nextStep !== null && nextStep.side === state.side,
    ourBans,
    enemyBans,
    ourPicks,
    enemyPicks,
    bannedChampionIds: banned,
    pickedChampionIds: picked,
    unavailableChampionIds: unavailable,
    filledRoles,
    openRoles,
    remaining,
    ourRemainingPicks: count(state.side, "pick"),
    enemyRemainingPicks: count(enemySide, "pick"),
    ourRemainingBans: count(state.side, "ban"),
    enemyRemainingBans: count(enemySide, "ban"),
  };
}

export interface ApplyActionInput {
  championId: string | null;
  playerId?: string | null;
  role?: Role | null;
}

export type ApplyResult = { ok: true; state: DraftState } | { ok: false; error: string };

/**
 * Apply the next action to the draft. Validates sequence position, availability and (for our picks)
 * that the intended player/role is consistent with the current assignment.
 */
export function applyAction(state: DraftState, input: ApplyActionInput): ApplyResult {
  const derived = deriveDraft(state);
  const step = derived.nextStep;
  if (!step) return { ok: false, error: "Draft is already complete." };

  if (step.type === "pick" && !input.championId) {
    return { ok: false, error: "A champion must be selected for a pick." };
  }
  if (input.championId && derived.unavailableChampionIds.has(input.championId)) {
    return { ok: false, error: "That champion is already banned or picked." };
  }

  const action: DraftAction = { index: step.index, championId: input.championId };
  if (step.type === "pick" && step.side === state.side) {
    const role = input.role ?? null;
    const playerId = input.playerId ?? (role ? state.assignments[role] : null) ?? null;
    if (role && derived.filledRoles.has(role)) {
      return { ok: false, error: `${role} is already filled on our side.` };
    }
    if (role && playerId && state.assignments[role] !== playerId) {
      return { ok: false, error: "Pick intent does not match the current role assignment." };
    }
    action.role = role;
    action.playerId = playerId;
  }

  return { ok: true, state: { ...state, actions: [...state.actions, action] } };
}

/** Remove the most recent action (undo). */
export function undoLastAction(state: DraftState): DraftState {
  if (state.actions.length === 0) return state;
  const maxIndex = Math.max(...state.actions.map((a) => a.index));
  return { ...state, actions: state.actions.filter((a) => a.index !== maxIndex) };
}

export function isDraftComplete(state: DraftState): boolean {
  return state.actions.length >= TOTAL_STEPS;
}
