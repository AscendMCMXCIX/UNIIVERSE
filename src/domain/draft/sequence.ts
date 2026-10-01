import type { Role } from "../roles";

/**
 * Tournament draft sequence.
 *
 * Standard LoL tournament draft (used in Clash, LCS/LEC/LCK and other organised play):
 *
 *   Ban phase 1 : B R B R B R
 *   Pick phase 1: B RR BB R
 *   Ban phase 2 : R B R B
 *   Pick phase 2: R BB R
 *
 * Every step is modelled explicitly so the engine always knows whose turn it is, whether the
 * current step is part of a consecutive two-pick window, and what remains before our next turn.
 */
export type Side = "blue" | "red";
export type ActionType = "ban" | "pick";
export type DraftPhase = "ban1" | "pick1" | "ban2" | "pick2";

export interface DraftStep {
  /** 0-based position in the 20-step sequence. */
  index: number;
  phase: DraftPhase;
  type: ActionType;
  side: Side;
  /** Pick/ban ordinal for this side, e.g. B1..B5 / R1..R5. */
  ordinal: number;
  /** Number of consecutive steps this side owns in the window containing this step (1 or 2). */
  windowSize: 1 | 2;
  /** Position inside the window (0 = first, 1 = second). */
  windowPosition: 0 | 1;
  /** Index of the first step of the window containing this step. */
  windowStart: number;
}

const PATTERN: ReadonlyArray<readonly [DraftPhase, ActionType, Side]> = [
  ["ban1", "ban", "blue"],
  ["ban1", "ban", "red"],
  ["ban1", "ban", "blue"],
  ["ban1", "ban", "red"],
  ["ban1", "ban", "blue"],
  ["ban1", "ban", "red"],
  ["pick1", "pick", "blue"],
  ["pick1", "pick", "red"],
  ["pick1", "pick", "red"],
  ["pick1", "pick", "blue"],
  ["pick1", "pick", "blue"],
  ["pick1", "pick", "red"],
  ["ban2", "ban", "red"],
  ["ban2", "ban", "blue"],
  ["ban2", "ban", "red"],
  ["ban2", "ban", "blue"],
  ["pick2", "pick", "red"],
  ["pick2", "pick", "blue"],
  ["pick2", "pick", "blue"],
  ["pick2", "pick", "red"],
];

function buildSequence(): DraftStep[] {
  const steps: DraftStep[] = [];
  const ordinals: Record<ActionType, Record<Side, number>> = {
    ban: { blue: 0, red: 0 },
    pick: { blue: 0, red: 0 },
  };
  for (let i = 0; i < PATTERN.length; i++) {
    const [phase, type, side] = PATTERN[i]!;
    ordinals[type][side] += 1;
    const prev = PATTERN[i - 1];
    const next = PATTERN[i + 1];
    const sameAsPrev = prev !== undefined && prev[1] === type && prev[2] === side && prev[0] === phase;
    const sameAsNext = next !== undefined && next[1] === type && next[2] === side && next[0] === phase;
    // Only picks form consecutive windows in tournament draft (bans always alternate).
    const windowSize: 1 | 2 = type === "pick" && (sameAsPrev || sameAsNext) ? 2 : 1;
    const windowPosition: 0 | 1 = windowSize === 2 && sameAsPrev ? 1 : 0;
    steps.push({
      index: i,
      phase,
      type,
      side,
      ordinal: ordinals[type][side],
      windowSize,
      windowPosition,
      windowStart: windowPosition === 1 ? i - 1 : i,
    });
  }
  return steps;
}

export const TOURNAMENT_SEQUENCE: readonly DraftStep[] = Object.freeze(buildSequence());
export const TOTAL_STEPS = TOURNAMENT_SEQUENCE.length;
export const BANS_PER_SIDE = 5;
export const PICKS_PER_SIDE = 5;

export function stepAt(index: number): DraftStep | undefined {
  return TOURNAMENT_SEQUENCE[index];
}

export function opposite(side: Side): Side {
  return side === "blue" ? "red" : "blue";
}

export function stepLabel(step: DraftStep): string {
  const sideLetter = step.side === "blue" ? "B" : "R";
  return `${sideLetter}${step.ordinal}`;
}

export function phaseLabel(phase: DraftPhase): string {
  switch (phase) {
    case "ban1":
      return "Ban Phase 1";
    case "pick1":
      return "Pick Phase 1";
    case "ban2":
      return "Ban Phase 2";
    case "pick2":
      return "Pick Phase 2";
  }
}

/**
 * Steps still to come for a given side after (and excluding) the given index.
 */
export function remainingSteps(fromIndex: number, side?: Side): DraftStep[] {
  return TOURNAMENT_SEQUENCE.filter((s) => s.index >= fromIndex && (side === undefined || s.side === side));
}

/**
 * How many enemy actions of a given type happen between the current step and this side's next
 * pick. Used to estimate ban-risk and pick-denial for "pick now vs hold" decisions.
 */
export function enemyActionsBeforeNextPick(currentIndex: number, side: Side): { bans: number; picks: number; nextPickIndex: number | null } {
  const enemy = opposite(side);
  let bans = 0;
  let picks = 0;
  for (let i = currentIndex + 1; i < TOTAL_STEPS; i++) {
    const s = TOURNAMENT_SEQUENCE[i]!;
    if (s.side === side && s.type === "pick") {
      return { bans, picks, nextPickIndex: i };
    }
    if (s.side === enemy) {
      if (s.type === "ban") bans += 1;
      else picks += 1;
    }
  }
  return { bans, picks, nextPickIndex: null };
}

export type RoleSlot = Role;
