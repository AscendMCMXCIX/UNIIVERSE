import type { Role } from "@/domain/roles";
import type { ObjectiveCategory } from "./categories";

/*
  Statistics an objective can be followed with: figures Riot records in every game (the account
  sync stores them) or in a game's timeline (stored when the timeline backfill or a match window
  fetches it). Each says what it shows and what it cannot show, because a number never proves on
  its own that a habit changed: tracking the enemy jungler, choosing when to recall or preparing
  an objective have no reliable statistic at all, and those objectives rely on the player's own
  reviews. A missing figure stays missing: it is never counted as zero.
*/

export const MEASURE_KEYS = ["deaths", "early-deaths", "cs-per-min", "cs-at-10", "vision-per-min", "control-wards", "kill-participation"] as const;
export type MeasureKey = (typeof MEASURE_KEYS)[number];

/** Laning-phase deaths are counted up to this point of the game. */
export const EARLY_GAME_MS = 14 * 60_000;
/** CS is read at this point from the timeline's frames. */
export const CS_CHECKPOINT_MS = 10 * 60_000;

export interface MeasureDefinition {
  label: string;
  short: string;
  /** Which way is the better direction for this figure. */
  better: "lower" | "higher";
  decimals: number;
  /** "%" for a share, empty otherwise. */
  suffix: "" | "%";
  /** Differences smaller than this are "about the same", however the spread falls. */
  minDifference: number;
  /** Every stored game has it ("game"), or only games whose timeline is stored ("timeline"). */
  source: "game" | "timeline";
  /** Roles whose games it does not describe (CS for supports). */
  notFor?: readonly Role[];
  shows: string;
  cannotShow: string;
}

export const MEASURES: Record<MeasureKey, MeasureDefinition> = {
  deaths: {
    label: "Deaths per game",
    short: "Deaths",
    better: "lower",
    decimals: 1,
    suffix: "",
    minDifference: 0.5,
    source: "game",
    shows: "How many times you died in a game.",
    cannotShow: "Whether a death was a mistake, a fair trade or caused by someone else.",
  },
  "early-deaths": {
    label: "Deaths before 14:00",
    short: "Early deaths",
    better: "lower",
    decimals: 1,
    suffix: "",
    minDifference: 0.3,
    source: "timeline",
    shows: "Deaths in the laning phase, read from the game's timeline.",
    cannotShow: "Why you died. Games whose timeline is not stored yet are left out.",
  },
  "cs-per-min": {
    label: "CS per minute",
    short: "CS/min",
    better: "higher",
    decimals: 1,
    suffix: "",
    minDifference: 0.3,
    source: "game",
    notFor: ["SUPPORT"],
    shows: "Minions and monsters killed per minute of the game.",
    cannotShow: "Your wave decisions on their own: CS also depends on the champion, the lane and how the game went.",
  },
  "cs-at-10": {
    label: "CS at 10:00",
    short: "CS at 10",
    better: "higher",
    decimals: 0,
    suffix: "",
    minDifference: 4,
    source: "timeline",
    notFor: ["SUPPORT"],
    shows: "Minions and monsters killed by the tenth minute, read from the game's timeline.",
    cannotShow: "Lane pressure or the opponent you faced. Games whose timeline is not stored yet are left out.",
  },
  "vision-per-min": {
    label: "Vision score per minute",
    short: "Vision/min",
    better: "higher",
    decimals: 2,
    suffix: "",
    minDifference: 0.1,
    source: "game",
    shows: "Riot's vision score (wards placed and cleared, and the vision they gave) per minute.",
    cannotShow: "Whether the wards were in the right places at the right time.",
  },
  "control-wards": {
    label: "Control Wards bought",
    short: "Control Wards",
    better: "higher",
    decimals: 1,
    suffix: "",
    minDifference: 0.5,
    source: "game",
    shows: "Control Wards bought in a game.",
    cannotShow: "Where they were placed or how long they lasted. Older games without this figure are left out.",
  },
  "kill-participation": {
    label: "Kill participation",
    short: "Kill participation",
    better: "higher",
    decimals: 0,
    suffix: "%",
    minDifference: 5,
    source: "game",
    shows: "The share of your team's kills you took part in.",
    cannotShow: "Whether joining those fights was the right call.",
  },
};

export function isMeasure(value: unknown): value is MeasureKey {
  return typeof value === "string" && (MEASURE_KEYS as readonly string[]).includes(value);
}

/**
 * The statistics worth offering for an area: "direct" when the figure follows the habit itself,
 * "related" when it only moves with it (early deaths for jungle awareness). Areas with no honest
 * statistic offer none: the player's reviews are the evidence there.
 */
const SUGGESTED: Partial<Record<ObjectiveCategory, Array<{ measure: MeasureKey; relation: "direct" | "related" }>>> = {
  laning: [
    { measure: "early-deaths", relation: "direct" },
    { measure: "cs-at-10", relation: "direct" },
    { measure: "deaths", relation: "related" },
  ],
  "wave-management": [
    { measure: "cs-per-min", relation: "direct" },
    { measure: "cs-at-10", relation: "direct" },
  ],
  trading: [{ measure: "early-deaths", relation: "related" }],
  "jungle-awareness": [{ measure: "early-deaths", relation: "related" }],
  vision: [
    { measure: "vision-per-min", relation: "direct" },
    { measure: "control-wards", relation: "direct" },
  ],
  "map-awareness": [{ measure: "deaths", relation: "related" }],
  rotations: [{ measure: "kill-participation", relation: "related" }],
  "side-lane": [{ measure: "deaths", relation: "related" }],
  teamfighting: [
    { measure: "kill-participation", relation: "related" },
    { measure: "deaths", relation: "related" },
  ],
  positioning: [{ measure: "deaths", relation: "related" }],
  "decision-making": [{ measure: "deaths", relation: "related" }],
};

export function suggestedMeasures(category: string | null | undefined, role: Role | null | undefined): Array<{ measure: MeasureKey; relation: "direct" | "related" }> {
  const list = SUGGESTED[category as ObjectiveCategory] ?? [];
  return list.filter((s) => !role || !MEASURES[s.measure].notFor?.includes(role));
}

/** How a statistic relates to an area: "direct", "related", or null when it is not one of the area's suggestions. */
export function measureRelation(category: string | null | undefined, measure: MeasureKey): "direct" | "related" | null {
  return (SUGGESTED[category as ObjectiveCategory] ?? []).find((s) => s.measure === measure)?.relation ?? null;
}

/** One stored Solo/Duo game as the statistics read it. Null means not recorded. */
export interface MeasuredGame {
  matchId: string;
  playedAt: number;
  role: Role | null;
  championId: string;
  win: boolean;
  durationSec: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  visionScore: number | null;
  teamKills: number | null;
  controlWards: number | null;
  /** From the timeline's frames; null without a timeline or for a game shorter than ten minutes. */
  csAt10: number | null;
  /** From the timeline's kill events; null without a timeline or one stored before deaths were kept. */
  earlyDeaths: number | null;
}

/** Remakes and games cut short say nothing about a habit. */
export const MIN_MEASURED_GAME_SEC = 15 * 60;

/** The figure for one game, or null when the game does not have it. */
export function measureValue(key: MeasureKey, g: MeasuredGame): number | null {
  const minutes = g.durationSec && g.durationSec >= MIN_MEASURED_GAME_SEC ? g.durationSec / 60 : null;
  switch (key) {
    case "deaths":
      return g.deaths;
    case "early-deaths":
      return g.earlyDeaths;
    case "cs-per-min":
      return g.cs !== null && minutes ? g.cs / minutes : null;
    case "cs-at-10":
      return g.csAt10;
    case "vision-per-min":
      return g.visionScore !== null && minutes ? g.visionScore / minutes : null;
    case "control-wards":
      return g.controlWards;
    case "kill-participation":
      return g.teamKills && g.kills !== null && g.assists !== null ? Math.min(100, ((g.kills + g.assists) / g.teamKills) * 100) : null;
  }
}

/** Deaths before the end of the laning phase, from a player's death times (ms into the game). */
export function earlyDeathsOf(deathTimes: readonly number[] | null | undefined): number | null {
  if (!deathTimes) return null;
  return deathTimes.filter((t) => t < EARLY_GAME_MS).length;
}
