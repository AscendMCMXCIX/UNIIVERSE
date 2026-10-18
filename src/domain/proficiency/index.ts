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
  /**
   * How much a game on the champion in another role counts towards familiarity in this role
   * (once the role of at least 5 games is known). Knowing Gwen top helps Gwen jungle, but far
   * from fully: 100 top games make Gwen jungle Familiar, never a Main (revision 2).
   */
  offRoleWeight: number;
  /** Most weighted games that other roles can add to a role (revision 2). */
  offRoleCap: number;
  /**
   * Model revision. 2 (default, October 2026) fixed three ways off-role or other-mode play leaked
   * into a role's rating; 1 is kept only to compare old and new results in audits and tests:
   *   - mastery is champion-wide, so it now counts towards a role only in proportion to the
   *     player's games on the champion in that role (version 1 gave every role half of it);
   *   - games in other roles add at most `offRoleCap` games' worth to a role;
   *   - the top tiers need games actually played in the role (version 1 let 25%-weighted games
   *     from other roles meet the minimum, so 100 Gwen top games made Gwen jungle "Very strong");
   *   - recency comes from games in supported queues; mastery's "last played" (which ARAM or any
   *     other mode updates) is used only for a champion with no stored games;
   *   - one or two games read "Few games", not "No data".
   */
  revision: 1 | 2;
}

export const DEFAULT_PROFICIENCY_CONFIG: ProficiencyConfig = {
  familiaritySaturation: 60,
  masteryPointsPerGame: 6000,
  recentDays: 30,
  mediumDays: 90,
  performancePrior: 25,
  roleShareTarget: 0.6,
  recencyFloor: 0.55,
  offRoleWeight: 0.25,
  offRoleCap: 8,
  revision: 2,
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
  const v2 = cfg.revision >= 2;
  const lastGameAt = rows.reduce<Date | null>((m, r) => (r.lastPlayedAt && (!m || r.lastPlayedAt > m) ? r.lastPlayedAt : m), null);
  // Version 2: recency from games in supported queues; mastery's date only without any game.
  const lastPlayedAt = v2 && games > 0 ? lastGameAt : rows.reduce<Date | null>((m, r) => (r.lastPlayedAt && (!m || r.lastPlayedAt > m) ? r.lastPlayedAt : m), mastery?.lastPlayedAt ?? null);
  const daysSince = lastPlayedAt ? (now.getTime() - lastPlayedAt.getTime()) / 86_400_000 : null;

  // Role-specific experience: once positions are known, games in other roles count only partly
  // towards familiarity, practice and the tier minimums (results still use every game).
  const roleKnown = knownRoleGames >= 5;
  const offRole = (r: ChampionHistoryEvidence) => roleKnown && r.role !== "UNKNOWN" && r.role !== role;
  // Weighted games credited to this role: all of its own games, plus games in other roles at the
  // off-role weight. Version 2 caps that other-role credit (knowing the champion's kit helps up to
  // about "Familiar", never to a Main): 100 jungle games no longer outweigh 22 real top games.
  const credit = (list: ChampionHistoryEvidence[]) => {
    const own = list.filter((r) => !offRole(r)).reduce((s, r) => s + weighted(r), 0);
    const other = list.filter(offRole).reduce((s, r) => s + weighted(r), 0) * cfg.offRoleWeight;
    return own + (v2 ? Math.min(cfg.offRoleCap, other) : other);
  };
  const wRoleGames = credit(rows);

  // Recent volume: games whose bucket was last played within the windows (bucket granularity).
  const recentRows = rows.filter((r) => r.lastPlayedAt && now.getTime() - r.lastPlayedAt.getTime() <= cfg.recentDays * 86_400_000);
  const recentGames = recentRows.reduce((s, r) => s + r.games, 0);
  const wRecent = credit(recentRows);
  const wMedium = credit(rows.filter((r) => r.lastPlayedAt && now.getTime() - r.lastPlayedAt.getTime() <= cfg.mediumDays * 86_400_000));

  const masteryGames = mastery ? mastery.points / cfg.masteryPointsPerGame : 0;
  // Mastery is champion-wide. Version 2 credits a role with it in proportion to the games on the
  // champion in that role (never below the off-role weight); version 1 gave every role half.
  const knownShare = knownRoleGames > 0 ? roleGames / knownRoleGames : 1;
  const masteryWeight = v2 ? 0.5 * (roleKnown ? Math.max(cfg.offRoleWeight, knownShare) : 1) : roleKnown && roleGames === 0 ? 0.25 : 0.5;
  const volume = wRoleGames + masteryGames * masteryWeight;
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
  else if (games >= (v2 ? 1 : 3) || masteryGames >= 5) tier = "moderate";
  else tier = "unknown";
  // Mastery alone (no stored games in a supported queue, e.g. points earned in ARAM) shows
  // familiarity, never a main: such a champion is at most Comfortable.
  const masteryOnly = games === 0;
  if (masteryOnly && (tier === "core" || tier === "strong")) tier = "comfortable";
  // Mastery inflates familiarity; the top tiers also need games actually played in supported
  // queues (queue-weighted), so big mastery with a handful of recent games is not a Main.
  const mostlyMastery = !masteryOnly && ((tier === "core" && wGames < MIN_GAMES_FOR_TIER.core) || (tier === "strong" && wGames < MIN_GAMES_FOR_TIER.strong));
  // Version 2: the minimums count games in this role only (games with no recorded position are
  // shared out like the known ones); version 1 also counted other roles at a quarter weight.
  const unknownRoleW = rows.filter((r) => r.role === "UNKNOWN").reduce((s, r) => s + weighted(r), 0);
  const inRoleW = rows.filter((r) => r.role === role).reduce((s, r) => s + weighted(r), 0) + unknownRoleW * (knownRoleGames > 0 ? knownShare : 1);
  const tierGames = v2 ? inRoleW : wRoleGames;
  if (tier === "core" && tierGames < MIN_GAMES_FOR_TIER.core) tier = tierGames >= MIN_GAMES_FOR_TIER.strong ? "strong" : "comfortable";
  if (tier === "strong" && tierGames < MIN_GAMES_FOR_TIER.strong) tier = "comfortable";

  const notes: string[] = [];
  if (masteryOnly) notes.push("Mastery only: no games in supported queues this season");
  if (mostlyMastery) notes.push(`Mostly mastery: only ${games} game${games === 1 ? "" : "s"} on record, so not rated higher yet`);
  if (tier === "core") notes.push(`Played a lot: ${games} games, played recently`);
  if (tier === "rusty") notes.push(`Not played for ${Math.round(daysSince ?? 0)} days`);
  if (recentGames >= 5) notes.push(`${recentGames} games in the last ${cfg.recentDays} days`);
  if (knownRoleGames >= 5 && roleShare < 0.3) notes.push(`Mostly played outside ${role} (${roleGames} of ${knownRoleGames} games in this role), so rated lower here`);
  if (perf.confidence >= 0.4 && performance >= 0.54) notes.push(`Strong personal results (${Math.round(perf.estimate * 100)}% win rate)`);
  if (perf.confidence >= 0.4 && performance <= 0.46) notes.push(`Below their usual results (${Math.round(perf.estimate * 100)}% win rate)`);
  if (games > 0 && games < 5) notes.push("Very small sample");
  if (normalGames > 0) notes.push(`${normalGames} of ${games} games are Normal games (counted at ${Math.round(QUEUE_WEIGHTS.normal! * 100)}% weight)`);
  if (mastery?.accounts && mastery.accounts > 1) notes.push(`Mastery combined from ${mastery.accounts} accounts`);

  return { championId, role, score: clamp01(score), confidence: clamp01(confidence), tier, games, recentGames, patchGames, roleGames, rankedGames: games - normalGames, normalGames, roleShare, mastery: masteryInfo, performance, lastPlayedAt, notes };
}

/**
 * The label shown wherever a tier appears (All Champions, Roles & champion pools, player details,
 * Team Overview cards, draft explanations). The tiers describe OBSERVED EXPERIENCE on the champion
 * in the role (games, recency, games in the role, mastery), never skill and never the player's own
 * preference (that is the pool they choose, shown as "In your pool"). Results are shown next to
 * them, never folded into the word. Before (October 2026, earlier): Main / Comfortable / Familiar /
 * Few games / Out of practice / Not played, which read as skill or as "my main" (a choice).
 */
export const TIER_LABELS: Record<ProficiencyTier, string> = {
  core: "Played a lot",
  strong: "Played regularly",
  comfortable: "Some experience",
  moderate: "Few games",
  rusty: "Not played lately",
  unknown: "No games",
};

/** One line per tier explaining what the label means in terms of evidence. */
export const TIER_DESCRIPTIONS: Record<ProficiencyTier, string> = {
  core: "Played a lot in this role: 15+ games here (more counting mastery), with games in the last month.",
  strong: "Played regularly in this role: 6+ games here (more counting mastery), with recent games.",
  comfortable: "Some experience on the champion (games or mastery), but not regular recent play in this role.",
  moderate: "Only a game or two, or a little mastery: too little to say more.",
  rusty: "Plenty of games on record, but none for 3+ months.",
  unknown: "No games or mastery on the linked Riot accounts.",
};

/** The tier as what a player has done, to follow their name ("Mia has played Gwen a lot"). */
export function tierPhrase(tier: ProficiencyTier, champion: string): string {
  switch (tier) {
    case "core":
      return `has played ${champion} a lot`;
    case "strong":
      return `plays ${champion} regularly`;
    case "comfortable":
      return `has some experience on ${champion}`;
    case "moderate":
      return `has only a few games on ${champion}`;
    case "rusty":
      return `has not played ${champion} lately`;
    default:
      return `has no games on ${champion}`;
  }
}

/** Confidence (0..1) as a word for tables and tooltips. */
export function confidenceWord(confidence: number): "high" | "medium" | "low" | "none" {
  if (confidence <= 0) return "none";
  if (confidence >= 0.65) return "high";
  if (confidence >= 0.35) return "medium";
  return "low";
}

/** Lookup signature used by the engine. */
export type ProficiencyLookup = (playerId: string, championId: string, role: Role) => ProficiencyEstimate | null;
