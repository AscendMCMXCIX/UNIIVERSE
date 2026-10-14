import type { Role } from "../roles";
import { shrinkRate } from "../stats";

/**
 * Player (or opponent) proficiency on a champion.
 *
 * Pool membership answers "can they play it?". Proficiency answers "how strongly should we prefer
 * it?" and is a modifier, never a gate: a configured champion stays legal even with no data.
 *
 * Evidence per champion comes from linked Riot accounts (deduplicated by PUUID upstream):
 * games per patch and queue, wins, last played, and champion mastery combined across accounts.
 * The model blends
 *   - familiarity: long-term volume (log-scaled games + mastery), which never decays to zero,
 *   - recency: games in the last ~30 and ~90 days,
 *   - role fit: share of games in the assigned role,
 *   - performance: the player's own win rate on the champion, shrunk towards their baseline,
 * into a 0–1 score with a confidence and a human tier. Mastery alone or win rate alone never
 * decides it: mastery is half a game per 6,000 points of volume, and win rate is 15% of the score
 * after shrinking towards the player's own baseline.
 *
 * Queues count differently (QUEUE_WEIGHTS): a Normal game is real practice on the champion and
 * counts as familiarity and recency, but at a little over half the weight of a ranked game, and
 * its result says less about competitive performance. Nothing is ignored.
 */

/**
 * Evidence weight of one game by queue group. Ranked Solo/Duo is the reference; Flex and Clash
 * are competitive but less consistent; Normal games (Draft, Quickplay, Swiftplay) show practice
 * and familiarity with less competitive pressure.
 */
export const QUEUE_WEIGHTS: Record<string, number> = { solo: 1, flex: 0.9, other: 0.85, normal: 0.6 };
export function queueWeight(group: string | undefined): number {
  return group ? (QUEUE_WEIGHTS[group] ?? 0.6) : 1;
}
export interface ChampionHistoryEvidence {
  championId: string;
  /** Role as recorded; "UNKNOWN" when the match data did not expose a position. */
  role: Role | "UNKNOWN";
  games: number;
  wins: number;
  /** Game creation time of the most recent game in this bucket. */
  lastPlayedAt: Date | null;
  /** 0 = current patch, 1 = previous, … (or null when unknown). */
  patchDistance: number | null;
  /** solo | flex | normal | other; omitted rows count as ranked Solo/Duo. */
  queueGroup?: string;
}

export interface MasteryEvidence {
  championId: string;
  /** Combined across the player's linked accounts (each account counted once). */
  points: number;
  /** Highest level on any linked account. */
  level: number;
  lastPlayedAt: Date | null;
  /** How many linked accounts contributed points. */
  accounts?: number;
}

export type ProficiencyTier = "core" | "strong" | "comfortable" | "moderate" | "rusty" | "unknown";

export interface ProficiencyEstimate {
  championId: string;
  role: Role;
  /** 0..1 preference strength; 0.5 is neutral (no information). */
  score: number;
  /** 0..1 how much evidence supports the score. */
  confidence: number;
  tier: ProficiencyTier;
  /** Games on record across the player's linked accounts (deduplicated upstream). */
  games: number;
  /** Games in the last ~30 days. */
  recentGames: number;
  /** Games on the current patch. */
  patchGames: number;
  /** Games in the assigned role. */
  roleGames: number;
  /** Ranked (Solo/Duo, Flex, Clash) and Normal games among `games`. */
  rankedGames: number;
  normalGames: number;
  roleShare: number;
  /** Champion mastery combined across the player's accounts, when known. */
  mastery: { points: number; level: number; accounts?: number } | null;
  /** Shrunk win rate relative to the player's baseline (0.5 = baseline). */
  performance: number;
  lastPlayedAt: Date | null;
  notes: string[];
}

/** Queue-weighted games needed for the top tiers (mastery alone never reaches them). */
export const MIN_GAMES_FOR_TIER = { core: 15, strong: 6 } as const;

export interface ProficiencyConfig {
  /** Games at which familiarity saturates. */
  familiaritySaturation: number;
  /** Mastery points equivalent to one game of familiarity. */
  masteryPointsPerGame: number;
  /** Recent windows in days. */
  recentDays: number;
  mediumDays: number;
  /** Pseudo-games for shrinking the player's champion win rate towards their baseline. */
  performancePrior: number;
  /** Minimum share of games in the assigned role before the role fit stops penalising. */
  roleShareTarget: number;
  /** Floor for the recency factor: a long-unplayed champion keeps this much of its familiarity. */
  recencyFloor: number;
}

export const DEFAULT_PROFICIENCY_CONFIG: ProficiencyConfig = {
  familiaritySaturation: 60,
  masteryPointsPerGame: 6000,
  recentDays: 30,
  mediumDays: 90,
  performancePrior: 25,
  roleShareTarget: 0.6,
  recencyFloor: 0.55,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function estimateProficiency(
  championId: string,
  role: Role,
  history: ChampionHistoryEvidence[],
  mastery: MasteryEvidence | null,
  options: { now?: Date; playerBaselineWinRate?: number; config?: Partial<ProficiencyConfig> } = {},
): ProficiencyEstimate {
  const cfg = { ...DEFAULT_PROFICIENCY_CONFIG, ...(options.config ?? {}) };
  const now = options.now ?? new Date();
  const baseline = options.playerBaselineWinRate ?? 0.5;
  const rows = history.filter((h) => h.championId === championId);
  const games = rows.reduce((s, r) => s + r.games, 0);
  const normalGames = rows.filter((r) => r.queueGroup === "normal").reduce((s, r) => s + r.games, 0);
  // Queue-weighted volume and results: what the familiarity, practice and performance parts use.
  const weighted = (r: ChampionHistoryEvidence) => r.games * queueWeight(r.queueGroup);
  const wGames = rows.reduce((s, r) => s + weighted(r), 0);
  const wWins = rows.reduce((s, r) => s + r.wins * queueWeight(r.queueGroup), 0);
  const roleGames = rows.filter((r) => r.role === role).reduce((s, r) => s + r.games, 0);
  const patchGames = rows.filter((r) => r.patchDistance === 0).reduce((s, r) => s + r.games, 0);
  const masteryInfo = mastery ? { points: mastery.points, level: mastery.level, accounts: mastery.accounts } : null;
  const knownRoleGames = rows.filter((r) => r.role !== "UNKNOWN").reduce((s, r) => s + r.games, 0);
  const lastPlayedAt = rows.reduce<Date | null>((m, r) => (r.lastPlayedAt && (!m || r.lastPlayedAt > m) ? r.lastPlayedAt : m), mastery?.lastPlayedAt ?? null);
  const daysSince = lastPlayedAt ? (now.getTime() - lastPlayedAt.getTime()) / 86_400_000 : null;

  // Recent volume: games whose bucket was last played within the windows (bucket granularity).
  const recentRows = rows.filter((r) => r.lastPlayedAt && now.getTime() - r.lastPlayedAt.getTime() <= cfg.recentDays * 86_400_000);
  const recentGames = recentRows.reduce((s, r) => s + r.games, 0);
  const wRecent = recentRows.reduce((s, r) => s + weighted(r), 0);
  const wMedium = rows.filter((r) => r.lastPlayedAt && now.getTime() - r.lastPlayedAt.getTime() <= cfg.mediumDays * 86_400_000).reduce((s, r) => s + weighted(r), 0);

  const masteryGames = mastery ? mastery.points / cfg.masteryPointsPerGame : 0;
  const volume = wGames + masteryGames * 0.5;
  const familiarity = clamp01(Math.log1p(volume) / Math.log1p(cfg.familiaritySaturation));

  // Recency: full credit when played recently, decaying towards a floor (familiarity persists).
  let recency: number;
  if (daysSince === null) recency = cfg.recencyFloor;
  else if (daysSince <= cfg.recentDays) recency = 1;
  else if (daysSince <= cfg.mediumDays) recency = 1 - ((daysSince - cfg.recentDays) / (cfg.mediumDays - cfg.recentDays)) * 0.25;
  else recency = Math.max(cfg.recencyFloor, 0.75 - (daysSince - cfg.mediumDays) / 365);
  const practice = clamp01(Math.log1p(wRecent + wMedium * 0.4) / Math.log1p(20));
  const recencyFactor = clamp01(recency * 0.7 + practice * 0.3);

  // Role fit: how much of their experience on this champion is in the assigned role.
  const roleShare = knownRoleGames > 0 ? roleGames / knownRoleGames : 1;
  const roleFit = knownRoleGames < 5 ? 1 : clamp01(0.6 + 0.4 * Math.min(1, roleShare / cfg.roleShareTarget));

  // Performance relative to the player's own baseline, shrunk towards it.
  const perf = shrinkRate({ wins: wWins, games: wGames }, baseline, cfg.performancePrior);
  const performance = 0.5 + (perf.estimate - baseline);

  const confidence = clamp01(wGames / (wGames + 15)) * 0.7 + (mastery ? 0.15 : 0) + (lastPlayedAt ? 0.15 : 0);
  if (games === 0 && !mastery) {
    return { championId, role, score: 0.5, confidence: 0, tier: "unknown", games: 0, recentGames: 0, patchGames: 0, roleGames: 0, rankedGames: 0, normalGames: 0, roleShare: 1, mastery: null, performance: 0.5, lastPlayedAt: null, notes: ["No linked-account history for this champion"] };
  }

  const raw = familiarity * 0.5 + recencyFactor * 0.25 + roleFit * 0.1 + clamp01(performance) * 0.15;
  // Blend towards neutral when evidence is thin so a handful of games never dominates.
  const score = 0.5 + (raw - 0.5) * (0.4 + 0.6 * confidence);

  let tier: ProficiencyTier;
  if (daysSince !== null && daysSince > cfg.mediumDays && familiarity >= 0.5) tier = "rusty";
  else if (familiarity >= 0.85 && recencyFactor >= 0.8) tier = "core";
  else if (familiarity >= 0.65 && recencyFactor >= 0.6) tier = "strong";
  else if (familiarity >= 0.45) tier = "comfortable";
  else if (games >= 3 || masteryGames >= 5) tier = "moderate";
  else tier = "unknown";
  // Mastery alone (no stored games in a supported queue, e.g. points earned in ARAM) shows
  // familiarity, never a main: such a champion is at most Comfortable.
  const masteryOnly = games === 0;
  if (masteryOnly && (tier === "core" || tier === "strong")) tier = "comfortable";
  // Mastery inflates familiarity; the top tiers also need games actually played in supported
  // queues (queue-weighted), so big mastery with a handful of recent games is not "Very strong".
  const mostlyMastery = !masteryOnly && ((tier === "core" && wGames < MIN_GAMES_FOR_TIER.core) || (tier === "strong" && wGames < MIN_GAMES_FOR_TIER.strong));
  if (tier === "core" && wGames < MIN_GAMES_FOR_TIER.core) tier = wGames >= MIN_GAMES_FOR_TIER.strong ? "strong" : "comfortable";
  if (tier === "strong" && wGames < MIN_GAMES_FOR_TIER.strong) tier = "comfortable";

  const notes: string[] = [];
  if (masteryOnly) notes.push("Mastery only: no games in supported queues this season");
  if (mostlyMastery) notes.push(`Mostly mastery: only ${games} game${games === 1 ? "" : "s"} on record, so not rated higher yet`);
  if (tier === "core") notes.push(`Core comfort: ${games} games, played recently`);
  if (tier === "rusty") notes.push(`Familiar but rusty: not played for ${Math.round(daysSince ?? 0)} days`);
  if (recentGames >= 5) notes.push(`${recentGames} games in the last ${cfg.recentDays} days`);
  if (knownRoleGames >= 5 && roleShare < 0.3) notes.push(`Mostly played outside ${role} (${Math.round(roleShare * 100)}% in role)`);
  if (perf.confidence >= 0.4 && performance >= 0.54) notes.push(`Strong personal results (${Math.round(perf.estimate * 100)}% win rate)`);
  if (perf.confidence >= 0.4 && performance <= 0.46) notes.push(`Below their usual results (${Math.round(perf.estimate * 100)}% win rate)`);
  if (games > 0 && games < 5) notes.push("Very small sample");
  if (normalGames > 0) notes.push(`${normalGames} of ${games} games are Normal games (counted at ${Math.round(QUEUE_WEIGHTS.normal! * 100)}% weight)`);
  if (mastery?.accounts && mastery.accounts > 1) notes.push(`Mastery combined from ${mastery.accounts} accounts`);

  return { championId, role, score: clamp01(score), confidence: clamp01(confidence), tier, games, recentGames, patchGames, roleGames, rankedGames: games - normalGames, normalGames, roleShare, mastery: masteryInfo, performance, lastPlayedAt, notes };
}

/** The label shown wherever a tier appears (profiles, draft explanations, lineup dots). */
export const TIER_LABELS: Record<ProficiencyTier, string> = {
  core: "Very strong",
  strong: "Strong",
  comfortable: "Comfortable",
  moderate: "Limited data",
  rusty: "Rusty",
  unknown: "No data",
};

/** One line per tier explaining what the label means in terms of evidence. */
export const TIER_DESCRIPTIONS: Record<ProficiencyTier, string> = {
  core: "Lots of games on this champion, played in the last month: a main the player can be trusted on.",
  strong: "Regular champion experience with reliable recent data.",
  comfortable: "Enough games or mastery to be familiar; not a main.",
  moderate: "Only a few games or a little mastery; too little to weigh heavily.",
  rusty: "Established experience, but limited recent practice (not played for 3+ months).",
  unknown: "No games or mastery on the linked Riot accounts.",
};

/** Confidence (0..1) as a word for tables and tooltips. */
export function confidenceWord(confidence: number): "high" | "medium" | "low" | "none" {
  if (confidence <= 0) return "none";
  if (confidence >= 0.65) return "high";
  if (confidence >= 0.35) return "medium";
  return "low";
}

/** Lookup signature used by the engine. */
export type ProficiencyLookup = (playerId: string, championId: string, role: Role) => ProficiencyEstimate | null;
