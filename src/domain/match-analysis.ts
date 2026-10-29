import { MAX_VALID_DURATION_S, MIN_VALID_DURATION_S, gameRole, type GameRole, type SeasonGame } from "./season-stats";
import { valueAt, type PlayerSeries } from "./matchups";

/*
  MATCH ANALYSIS: what one game says once it is set beside something comparable. Plain
  comparisons only, never a score: no figure is weighted against another, nothing is called good
  or bad, and every comparison says what it was made against and how many games that was.

  - Against the player's own usual: the same figure in their previous games of the same role and
    queue group (ranked games are never compared with normal or fast games, whose pace and economy
    differ), at most BASELINE_GAMES of them, newest first. A game is only compared once there are
    BASELINE_MIN such games; "best" (the game's figure is higher than every one of them) needs
    BEST_MIN, so it stays rare enough to mean something.
  - In the lane: the player and the enemy in the same recorded position at exact moments (10:00,
    15:00), read between the timeline's frames as Matchups does (domain/matchups valueAt).
  - Across the game: the gold of one team minus the other's at every frame, only when the timeline
    holds all ten players (a missing player would skew it).
*/

/** Queues whose games are compared with each other. Swiftplay and Quickplay run a faster economy than draft games. */
export type QueueGroup = "ranked" | "normal" | "fast" | "clash" | "other";

export function queueGroup(queueId: number | null | undefined): QueueGroup {
  switch (queueId) {
    case 420:
    case 440:
      return "ranked";
    case 400:
    case 430:
      return "normal";
    case 480:
    case 490:
      return "fast";
    case 700:
      return "clash";
    default:
      return "other";
  }
}

export const QUEUE_GROUP_WORDS: Record<QueueGroup, string> = { ranked: "ranked", normal: "normal", fast: "Swiftplay and Quickplay", clash: "Clash", other: "" };

export type FigureKey = "kda" | "csPerMin" | "damagePerMin" | "visionPerMin";

export interface FigureInfo {
  label: string;
  /** How the value is written: ratio and per-minute figures with decimals, damage as a count. */
  digits: number;
  /** Supports are not compared on CS. */
  forSupport: boolean;
}

export const FIGURES: Record<FigureKey, FigureInfo> = {
  kda: { label: "KDA", digits: 2, forSupport: true },
  csPerMin: { label: "CS/min", digits: 1, forSupport: false },
  damagePerMin: { label: "Damage/min", digits: 0, forSupport: true },
  visionPerMin: { label: "Vision/min", digits: 2, forSupport: true },
};

export const FIGURE_ORDER: FigureKey[] = ["kda", "damagePerMin", "csPerMin", "visionPerMin"];

/** At most this many earlier games make the comparison (the newest ones). */
export const BASELINE_GAMES = 50;
/** Fewer comparable games than this: no comparison at all. */
export const BASELINE_MIN = 10;
/** "Best of your last N" needs at least this many games, so it stays rare (about one game in N per figure). */
export const BEST_MIN = 20;

const minutesOf = (g: Pick<SeasonGame, "gameDuration">): number | null => {
  const s = g.gameDuration;
  return typeof s === "number" && s >= MIN_VALID_DURATION_S && s <= MAX_VALID_DURATION_S ? s / 60 : null;
};

/** One game's figure, or null when the game does not carry it (or its length is not valid). */
export function figureOf(g: Pick<SeasonGame, "kills" | "deaths" | "assists" | "cs" | "damage" | "visionScore" | "gameDuration">, key: FigureKey): number | null {
  if (key === "kda") {
    const { kills: k, deaths: d, assists: a } = g;
    if (typeof k !== "number" || typeof d !== "number" || typeof a !== "number" || k < 0) return null;
    return (k + a) / Math.max(1, d);
  }
  const minutes = minutesOf(g);
  if (minutes === null) return null;
  const v = key === "csPerMin" ? g.cs : key === "damagePerMin" ? g.damage : g.visionScore;
  return typeof v === "number" && v >= 0 ? v / minutes : null;
}

export interface FigureComparison {
  key: FigureKey;
  label: string;
  value: number;
  /** Share of the earlier games with a lower value (a tie counts half): 0.8 = higher than 80% of them. */
  percentile: number;
  /** The middle value of the earlier games. */
  median: number;
  /** The highest value among the earlier games. */
  top: number;
  /** Earlier games behind this figure. */
  games: number;
  /** Higher than every one of at least BEST_MIN earlier games. */
  best: boolean;
}

export interface PersonalComparison {
  role: GameRole;
  group: QueueGroup;
  figures: FigureComparison[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * The game beside the player's previous games of the same role and queue group (newest first, at
 * most BASELINE_GAMES; the game itself and later games never count). Null when the game has no
 * recorded role, or fewer than BASELINE_MIN earlier games carry a figure.
 */
export function personalComparison(target: SeasonGame, history: readonly SeasonGame[]): PersonalComparison | null {
  const role = gameRole(target);
  const group = queueGroup(target.queueId);
  if (!role || group === "other") return null;
  const earlier = history
    .filter((g) => g.matchId !== target.matchId && g.gameCreation < target.gameCreation && gameRole(g) === role && queueGroup(g.queueId) === group)
    .sort((a, b) => b.gameCreation - a.gameCreation || (a.matchId < b.matchId ? 1 : -1));
  // One game per match, however many of the player's accounts stored it.
  const seen = new Set<string>();
  const sample = earlier.filter((g) => !seen.has(g.matchId) && (seen.add(g.matchId), true)).slice(0, BASELINE_GAMES);
  const figures: FigureComparison[] = [];
  for (const key of FIGURE_ORDER) {
    if (role === "SUPPORT" && !FIGURES[key].forSupport) continue;
    const value = figureOf(target, key);
    if (value === null) continue;
    const values = sample.map((g) => figureOf(g, key)).filter((v): v is number => v !== null);
    if (values.length < BASELINE_MIN) continue;
    const below = values.filter((v) => v < value).length;
    const ties = values.filter((v) => v === value).length;
    figures.push({ key, label: FIGURES[key].label, value, percentile: (below + ties / 2) / values.length, median: median(values), top: Math.max(...values), games: values.length, best: values.length >= BEST_MIN && below === values.length });
  }
  return figures.length ? { role, group, figures } : null;
}

/**
 * The one figure worth naming on a match card, if any: a figure higher than every one of the
 * earlier games (the largest margin over the earlier best when several are). Null otherwise: most
 * games have none, and that is the point.
 */
export function standoutOf(comparison: PersonalComparison | null): FigureComparison | null {
  const best = comparison?.figures.filter((f) => f.best) ?? [];
  const margin = (f: FigureComparison) => (f.top > 0 ? (f.value - f.top) / f.top : f.value);
  return best.length ? [...best].sort((a, b) => margin(b) - margin(a))[0]! : null;
}

/** Riot's positions (and the older role names some records carry) as one lane, in lane order. */
export const LANE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
const LANE_NAMES: Record<string, (typeof LANE_ORDER)[number]> = { TOP: "TOP", JUNGLE: "JUNGLE", MIDDLE: "MIDDLE", MID: "MIDDLE", BOTTOM: "BOTTOM", ADC: "BOTTOM", UTILITY: "UTILITY", SUPPORT: "UTILITY" };

export function laneOf(position: string | null | undefined): (typeof LANE_ORDER)[number] | null {
  return position ? (LANE_NAMES[position] ?? null) : null;
}

/**
 * The lane opponent: the one enemy recorded in the same position (positions are Riot's reading of
 * where each player spent the game). Null when the player's position is not recorded, or when
 * none or several enemies share it: then there is no reliable opponent, and none is guessed.
 */
export function laneOpponentOf(parts: ReadonlyArray<{ teamId: number; position: string | null; removed?: boolean }>, meSlot: number): number | null {
  const me = parts[meSlot];
  const lane = laneOf(me?.position);
  if (!me || !lane) return null;
  const same = parts.flatMap((p, i) => (p.teamId !== me.teamId && !p.removed && laneOf(p.position) === lane ? [i] : []));
  return same.length === 1 ? same[0]! : null;
}

/** The minutes the lane is compared at (the early lane and its usual end). */
export const LANE_MINUTES = [10, 15] as const;

export interface LaneMoment {
  minute: number;
  /** Null when the game had ended before this minute, or the frames do not cover it. */
  you: { gold: number; xp: number; cs: number } | null;
  opponent: { gold: number; xp: number; cs: number } | null;
}

/** The player and the lane opponent at exact moments, read between the frames (never by frame number). */
export function laneMoments(t: readonly number[], you: PlayerSeries, opponent: PlayerSeries, minutes: readonly number[]): LaneMoment[] {
  const at = (s: PlayerSeries, ms: number) => {
    const gold = valueAt(t, s.g, ms);
    const xp = valueAt(t, s.x, ms);
    const cs = valueAt(t, s.c, ms);
    return gold === null || xp === null || cs === null ? null : { gold: Math.round(gold), xp: Math.round(xp), cs: Math.round(cs) };
  };
  return minutes.map((minute) => ({ minute, you: at(you, minute * 60_000), opponent: at(opponent, minute * 60_000) }));
}

export interface GoldPoint {
  /** Minutes into the game (the frame's own time). */
  minute: number;
  /** The player's team's gold minus the other team's. */
  diff: number;
}

/**
 * The gold difference between the two teams at every frame, from the player's side. Null unless the
 * frames hold all five players of each team: a missing player would make the gap look larger than
 * it was.
 */
export function teamGoldDifference(t: readonly number[], series: ReadonlyArray<{ teamId: number; g: readonly number[] }>, ownTeam: number): GoldPoint[] | null {
  const own = series.filter((s) => s.teamId === ownTeam);
  const enemy = series.filter((s) => s.teamId !== ownTeam);
  if (own.length !== 5 || enemy.length !== 5 || !t.length || series.some((s) => s.g.length !== t.length)) return null;
  return t.map((ms, i) => ({ minute: ms / 60_000, diff: own.reduce((n, s) => n + s.g[i]!, 0) - enemy.reduce((n, s) => n + s.g[i]!, 0) }));
}

/** A gap smaller than this is not called a lead when lead changes are counted (about a kill and an assist's worth). */
export const LEAD_MIN = 1000;

export interface GoldStory {
  /** The player's team's largest lead, and when; null when it never had more gold. */
  lead: GoldPoint | null;
  /** The largest deficit, and when; null when it never had less. */
  deficit: GoldPoint | null;
  /** The difference at the last frame. */
  final: GoldPoint;
  /**
   * When the other team took over a lead of at least LEAD_MIN (either way). The first lead of the
   * game is not a change; a gap that narrows without the other team reaching LEAD_MIN is not one.
   */
  changes: Array<{ minute: number; to: "ahead" | "behind" }>;
}

/** What the gold curve shows, in figures only: the extremes, the end and the lead changes. No cause is read into it. */
export function goldStory(points: readonly GoldPoint[]): GoldStory | null {
  if (!points.length) return null;
  let lead: GoldPoint | null = null;
  let deficit: GoldPoint | null = null;
  const changes: GoldStory["changes"] = [];
  let side: "ahead" | "behind" | null = null;
  for (const p of points) {
    if (p.diff > 0 && (!lead || p.diff > lead.diff)) lead = p;
    if (p.diff < 0 && (!deficit || p.diff < deficit.diff)) deficit = p;
    if (Math.abs(p.diff) < LEAD_MIN) continue;
    const now = p.diff > 0 ? "ahead" : "behind";
    if (side && now !== side) changes.push({ minute: p.minute, to: now });
    side = now;
  }
  return { lead, deficit, final: points[points.length - 1]!, changes };
}

/** A player's place among a group by a figure (1 = highest), or null without the figure; ties share the place. */
export function placeOf<T>(group: readonly T[], target: T, get: (x: T) => number | null): number | null {
  const mine = get(target);
  if (mine === null) return null;
  return 1 + group.filter((x) => x !== target && (get(x) ?? -Infinity) > mine).length;
}
