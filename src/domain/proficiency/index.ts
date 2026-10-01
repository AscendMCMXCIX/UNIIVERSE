import type { Role } from "../roles";
import { shrinkRate } from "../stats";

/**
 * Player (or opponent) proficiency on a champion.
 *
 * Pool membership answers "can they play it?". Proficiency answers "how strongly should we prefer
 * it?" and is a modifier, never a gate: a configured champion stays legal even with no data.
 *
 * Evidence per champion comes from linked Riot accounts (deduplicated by PUUID upstream):
 * games per patch and queue, wins, last played, and champion mastery. The model blends
 *   - familiarity: long-term volume (log-scaled games + mastery), which never decays to zero,
 *   - recency: games in the last ~30 and ~90 days,
 *   - role fit: share of games in the assigned role,
 *   - performance: the player's own win rate on the champion, shrunk towards their baseline,
 * into a 0–1 score with a confidence and a human tier.
 */
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
}

export interface MasteryEvidence {
  championId: string;
  points: number;
  level: number;
  lastPlayedAt: Date | null;
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
  games: number;
  recentGames: number;
  roleShare: number;
  /** Shrunk win rate relative to the player's baseline (0.5 = baseline). */
  performance: number;
  lastPlayedAt: Date | null;
  notes: string[];
}

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
  const wins = rows.reduce((s, r) => s + r.wins, 0);
  const roleGames = rows.filter((r) => r.role === role).reduce((s, r) => s + r.games, 0);
  const knownRoleGames = rows.filter((r) => r.role !== "UNKNOWN").reduce((s, r) => s + r.games, 0);
  const lastPlayedAt = rows.reduce<Date | null>((m, r) => (r.lastPlayedAt && (!m || r.lastPlayedAt > m) ? r.lastPlayedAt : m), mastery?.lastPlayedAt ?? null);
  const daysSince = lastPlayedAt ? (now.getTime() - lastPlayedAt.getTime()) / 86_400_000 : null;

  // Recent volume: games whose bucket was last played within the windows (bucket granularity).
  const recentGames = rows.filter((r) => r.lastPlayedAt && now.getTime() - r.lastPlayedAt.getTime() <= cfg.recentDays * 86_400_000).reduce((s, r) => s + r.games, 0);
  const mediumGames = rows.filter((r) => r.lastPlayedAt && now.getTime() - r.lastPlayedAt.getTime() <= cfg.mediumDays * 86_400_000).reduce((s, r) => s + r.games, 0);

  const masteryGames = mastery ? mastery.points / cfg.masteryPointsPerGame : 0;
  const volume = games + masteryGames * 0.5;
  const familiarity = clamp01(Math.log1p(volume) / Math.log1p(cfg.familiaritySaturation));

  // Recency: full credit when played recently, decaying towards a floor (familiarity persists).
  let recency: number;
  if (daysSince === null) recency = cfg.recencyFloor;
  else if (daysSince <= cfg.recentDays) recency = 1;
  else if (daysSince <= cfg.mediumDays) recency = 1 - ((daysSince - cfg.recentDays) / (cfg.mediumDays - cfg.recentDays)) * 0.25;
  else recency = Math.max(cfg.recencyFloor, 0.75 - (daysSince - cfg.mediumDays) / 365);
  const practice = clamp01(Math.log1p(recentGames + mediumGames * 0.4) / Math.log1p(20));
  const recencyFactor = clamp01(recency * 0.7 + practice * 0.3 + (recentGames === 0 && mediumGames === 0 ? 0 : 0.0));

  // Role fit: how much of their experience on this champion is in the assigned role.
  const roleShare = knownRoleGames > 0 ? roleGames / knownRoleGames : 1;
  const roleFit = knownRoleGames < 5 ? 1 : clamp01(0.6 + 0.4 * Math.min(1, roleShare / cfg.roleShareTarget));

  // Performance relative to the player's own baseline, shrunk towards it.
  const perf = shrinkRate({ wins, games }, baseline, cfg.performancePrior);
  const performance = 0.5 + (perf.estimate - baseline);

  const confidence = clamp01(games / (games + 15)) * 0.7 + (mastery ? 0.15 : 0) + (lastPlayedAt ? 0.15 : 0);
  if (games === 0 && !mastery) {
    return { championId, role, score: 0.5, confidence: 0, tier: "unknown", games: 0, recentGames: 0, roleShare: 1, performance: 0.5, lastPlayedAt: null, notes: ["No linked-account history for this champion"] };
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

  const notes: string[] = [];
  if (tier === "core") notes.push(`Core comfort: ${games} games, played recently`);
  if (tier === "rusty") notes.push(`Familiar but rusty: not played for ${Math.round(daysSince ?? 0)} days`);
  if (recentGames >= 5) notes.push(`${recentGames} games in the last ${cfg.recentDays} days`);
  if (knownRoleGames >= 5 && roleShare < 0.3) notes.push(`Mostly played outside ${role} (${Math.round(roleShare * 100)}% in role)`);
  if (perf.confidence >= 0.4 && performance >= 0.54) notes.push(`Strong personal results (${Math.round(perf.estimate * 100)}% win rate)`);
  if (perf.confidence >= 0.4 && performance <= 0.46) notes.push(`Below their usual results (${Math.round(perf.estimate * 100)}% win rate)`);
  if (games > 0 && games < 5) notes.push("Very small sample");

  return { championId, role, score: clamp01(score), confidence: clamp01(confidence), tier, games, recentGames, roleShare, performance, lastPlayedAt, notes };
}

export const TIER_LABELS: Record<ProficiencyTier, string> = {
  core: "Core comfort",
  strong: "Strong familiarity",
  comfortable: "Comfortable",
  moderate: "Moderate",
  rusty: "Rusty",
  unknown: "No data",
};

/** Lookup signature used by the engine. */
export type ProficiencyLookup = (playerId: string, championId: string, role: Role) => ProficiencyEstimate | null;
