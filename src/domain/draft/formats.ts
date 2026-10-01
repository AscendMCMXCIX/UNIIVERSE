import type { ActionType, DraftPhase, DraftStep, Side } from "./sequence";

/**
 * Draft formats as data.
 *
 * Riot changes champion select from time to time and different competitions use different
 * rules, so the sequence is never hard-coded in the engine. A format is a list of phases; each
 * phase is either an alternating order string ("BRBRBR") or a simultaneous ban phase where both
 * teams ban at the same time and bans are revealed afterwards (Ranked Flex / Draft Pick).
 *
 * Simultaneous phases are modelled as "our bans first, then theirs" because that is the order in
 * which we actually learn them; the engine's pick timing is unaffected since every ban precedes
 * every pick in such formats.
 */
export interface DraftPhaseSpec {
  phase: DraftPhase;
  type: ActionType;
  /** Side order, e.g. "BRBRBR" or "BRRBBR". Ignored when `simultaneous` is set. */
  order?: string;
  /** Simultaneous bans: each side bans this many champions at the same time. */
  simultaneous?: { perSide: number };
}

export interface DraftFormat {
  id: string;
  name: string;
  description: string;
  phases: DraftPhaseSpec[];
  /** Whether enemy bans are hidden until the phase ends (true for simultaneous ban phases). */
  hiddenBans: boolean;
}

export const TOURNAMENT_FORMAT: DraftFormat = {
  id: "tournament",
  name: "Tournament draft",
  description: "Two ban phases, alternating bans, consecutive pick windows (Clash, organised play, tournaments).",
  phases: [
    { phase: "ban1", type: "ban", order: "BRBRBR" },
    { phase: "pick1", type: "pick", order: "BRRBBR" },
    { phase: "ban2", type: "ban", order: "RBRB" },
    { phase: "pick2", type: "pick", order: "RBBR" },
  ],
  hiddenBans: false,
};

export const RANKED_FLEX_FORMAT: DraftFormat = {
  id: "ranked-flex",
  name: "Ranked Flex / Draft Pick",
  description: "Both teams ban five champions simultaneously (revealed afterwards), then picks alternate 1-2-2-2-2-1.",
  phases: [
    { phase: "ban1", type: "ban", simultaneous: { perSide: 5 } },
    { phase: "pick1", type: "pick", order: "BRRBBRRBBR" },
  ],
  hiddenBans: true,
};

export const BUILTIN_FORMATS: Record<string, DraftFormat> = {
  [TOURNAMENT_FORMAT.id]: TOURNAMENT_FORMAT,
  [RANKED_FLEX_FORMAT.id]: RANKED_FLEX_FORMAT,
};

export const DEFAULT_FORMAT_ID = TOURNAMENT_FORMAT.id;

export class DraftFormatError extends Error {}

/** Validates a (possibly user-supplied) format specification. */
export function validateFormat(format: DraftFormat): string[] {
  const errors: string[] = [];
  if (!format.id || !/^[a-z0-9-]+$/.test(format.id)) errors.push("Format id must be lowercase letters, digits and dashes.");
  if (!format.name?.trim()) errors.push("Format needs a name.");
  if (!Array.isArray(format.phases) || format.phases.length === 0) errors.push("Format needs at least one phase.");
  let picks = { blue: 0, red: 0 };
  for (const p of format.phases ?? []) {
    if (!["ban1", "pick1", "ban2", "pick2"].includes(p.phase)) errors.push(`Unknown phase "${p.phase}".`);
    if (p.type !== "ban" && p.type !== "pick") errors.push(`Phase ${p.phase} has an invalid type.`);
    if (p.simultaneous) {
      if (p.type !== "ban") errors.push("Only ban phases can be simultaneous.");
      if (!(p.simultaneous.perSide >= 0 && p.simultaneous.perSide <= 10)) errors.push("Simultaneous bans per side must be 0–10.");
    } else if (!p.order || !/^[BR]+$/.test(p.order)) {
      errors.push(`Phase ${p.phase} needs an order string of B and R.`);
    } else if (p.type === "pick") {
      picks = { blue: picks.blue + (p.order.match(/B/g)?.length ?? 0), red: picks.red + (p.order.match(/R/g)?.length ?? 0) };
    }
  }
  if (picks.blue !== 5 || picks.red !== 5) errors.push(`Each side must pick exactly five champions (got blue ${picks.blue}, red ${picks.red}).`);
  return errors;
}

/**
 * Expands a format into concrete steps for a given "our side". Side only matters for
 * simultaneous phases (our bans are listed first).
 */
export function buildSteps(format: DraftFormat, ourSide: Side = "blue"): DraftStep[] {
  const pattern: Array<readonly [DraftPhase, ActionType, Side]> = [];
  for (const p of format.phases) {
    if (p.simultaneous) {
      const enemy: Side = ourSide === "blue" ? "red" : "blue";
      for (let i = 0; i < p.simultaneous.perSide; i++) pattern.push([p.phase, p.type, ourSide]);
      for (let i = 0; i < p.simultaneous.perSide; i++) pattern.push([p.phase, p.type, enemy]);
    } else {
      for (const ch of p.order ?? "") pattern.push([p.phase, p.type, ch === "B" ? "blue" : "red"]);
    }
  }
  const simultaneousPhases = new Set(format.phases.filter((p) => p.simultaneous).map((p) => p.phase));
  const steps: DraftStep[] = [];
  const ordinals: Record<ActionType, Record<Side, number>> = { ban: { blue: 0, red: 0 }, pick: { blue: 0, red: 0 } };
  for (let i = 0; i < pattern.length; i++) {
    const [phase, type, side] = pattern[i]!;
    ordinals[type][side] += 1;
    const prev = pattern[i - 1];
    const next = pattern[i + 1];
    const same = (o: typeof prev) => o !== undefined && o[1] === type && o[2] === side && o[0] === phase;
    // Only picks form consecutive windows; bans are always evaluated individually.
    const windowSize: 1 | 2 = type === "pick" && (same(prev) || same(next)) ? 2 : 1;
    const windowPosition: 0 | 1 = windowSize === 2 && same(prev) ? 1 : 0;
    steps.push({
      index: i,
      phase,
      type,
      side,
      ordinal: ordinals[type][side],
      windowSize,
      windowPosition,
      windowStart: windowPosition === 1 ? i - 1 : i,
      simultaneous: simultaneousPhases.has(phase),
    });
  }
  return steps;
}

const stepCache = new Map<string, readonly DraftStep[]>();

/** Steps for a format id (built-in) or an inline format, cached per side. */
export function stepsFor(format: DraftFormat | string, ourSide: Side = "blue"): readonly DraftStep[] {
  const f = typeof format === "string" ? BUILTIN_FORMATS[format] : format;
  if (!f) throw new DraftFormatError(`Unknown draft format "${String(format)}"`);
  const key = `${f.id}|${ourSide}|${JSON.stringify(f.phases)}`;
  const cached = stepCache.get(key);
  if (cached) return cached;
  const steps = Object.freeze(buildSteps(f, ourSide));
  stepCache.set(key, steps);
  return steps;
}

export function resolveFormat(formatId: string | undefined, inline?: DraftFormat | null): DraftFormat {
  if (inline) return inline;
  return BUILTIN_FORMATS[formatId ?? DEFAULT_FORMAT_ID] ?? TOURNAMENT_FORMAT;
}

/** Builds a custom format from a compact spec (used by Settings). */
export function customFormat(spec: { id: string; name: string; ban1?: string | number; pick1: string; ban2?: string; pick2?: string; description?: string }): DraftFormat {
  const phases: DraftPhaseSpec[] = [];
  if (typeof spec.ban1 === "number") phases.push({ phase: "ban1", type: "ban", simultaneous: { perSide: spec.ban1 } });
  else if (spec.ban1) phases.push({ phase: "ban1", type: "ban", order: spec.ban1.toUpperCase() });
  phases.push({ phase: "pick1", type: "pick", order: spec.pick1.toUpperCase() });
  if (spec.ban2) phases.push({ phase: "ban2", type: "ban", order: spec.ban2.toUpperCase() });
  if (spec.pick2) phases.push({ phase: "pick2", type: "pick", order: spec.pick2.toUpperCase() });
  const format: DraftFormat = { id: spec.id, name: spec.name, description: spec.description ?? "Custom format", phases, hiddenBans: typeof spec.ban1 === "number" };
  const errors = validateFormat(format);
  if (errors.length) throw new DraftFormatError(errors.join(" "));
  return format;
}
