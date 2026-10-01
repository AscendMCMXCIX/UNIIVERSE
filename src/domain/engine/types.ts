import type { ChampionProfile } from "../champion-model";
import type { CompositionNeed, Identity, InteractionNote } from "../composition";
import type { Assignment } from "../roster/assignments";
import type { PlayerProfile } from "../roster/types";
import type { DraftState, DraftStep } from "../draft";
import type { Role } from "../roles";
import type { ShrunkRate } from "../stats";

export interface ChampionInfo {
  id: string;
  name: string;
  profile: ChampionProfile;
}

/**
 * Evidence access for the engine. Implementations wrap precomputed, patch-blended statistics.
 * Every method must be cheap (in-memory) and must return a prior with zero confidence when no
 * evidence exists; the engine never fabricates confidence.
 */
export interface StatsProvider {
  /** Fraction of this champion's games played in the given role (0..1) and the sample behind it. */
  roleShare(championId: string, role: Role): { share: number; games: number };
  /** Shrunk win rate of the champion in the role. */
  strength(championId: string, role: Role): ShrunkRate;
  /** Pick and ban rates (0..1) across all games in the period, plus pro presence. */
  presence(championId: string): { pickRate: number; banRate: number; games: number; proPresence: number; proGames: number };
  /** Shrunk win rate of champion (in role) against enemy champion (in enemy role). */
  matchup(championId: string, role: Role, enemyChampionId: string, enemyRole: Role, prior: number): ShrunkRate;
  /** Shrunk win rate of the ally pair. */
  synergy(championAId: string, roleA: Role, championBId: string, roleB: Role, prior: number): ShrunkRate;
  /** Most-played champions in a role (by games), used for blind-pick variance estimates and ban threats. */
  topChampionsInRole(role: Role, limit: number): string[];
  /** Describes the evidence behind this provider (patch, sources, freshness) for the UI. */
  describe(): StatsDescription;
}

export interface StatsDescription {
  patch: string | null;
  sources: Array<"ranked" | "pro" | "demo">;
  totalGames: number;
  isDemo: boolean;
}

export interface EngineInput {
  players: PlayerProfile[];
  draft: DraftState;
  champions: Map<string, ChampionInfo>;
  stats: StatsProvider;
  config?: Partial<EngineConfig>;
}

export interface EngineWeights {
  championStrength: number;
  playerComfort: number;
  laneMatchup: number;
  teamMatchup: number;
  pairSynergy: number;
  structure: number;
  interaction: number;
  proPriority: number;
  flexValue: number;
  /** Cost per player moved to their secondary role, in win-rate units. */
  roleSwapCost: number;
}

export interface EngineConfig {
  /** Conceptual balance between team synergy and strength into the enemy. */
  philosophy: { synergy: number; enemy: number };
  weights: EngineWeights;
  /** Lane severity thresholds in expected lane win-rate delta. */
  severity: { slightlyUnfavourable: number; significantlyUnfavourable: number; nearUnplayable: number };
  /** Multipliers applied to lane deltas beyond each threshold. */
  severityPenalty: { significant: number; unplayable: number };
  shrinkage: { strength: number; matchup: number; synergy: number };
  timing: {
    /** How strongly "value at risk" (likely denied before our next pick) pushes a pick forward. */
    denialWeight: number;
    /** Bonus for holding a counterpick slot when the enemy lane is unrevealed. */
    counterpickHoldWeight: number;
    /** Bonus for blind-safe picks early. */
    blindSafetyWeight: number;
    /** Multiplier on ban rate when estimating ban probability per enemy ban. */
    banRateMultiplier: number;
    /** Multiplier on pick rate when estimating enemy pick probability per enemy pick. */
    pickRateMultiplier: number;
  };
  /** Minimum improvement (win-rate units) before a role swap is recommended. */
  swapThreshold: number;
  search: { maxExhaustive: number; beamWidth: number; topCandidates: number; pairCandidates: number };
  /** Key pair weights (Top/Jungle, Jungle/Mid, ADC/Support get extra attention). */
  keyPairMultiplier: number;
}

export type MatchupSeverity = "favourable" | "even" | "slightly-unfavourable" | "significantly-unfavourable" | "near-unplayable";

export interface LaneEvaluation {
  role: Role;
  championId: string;
  /** Expected lane delta vs the (probability-weighted) enemy in the same role, in win-rate units. */
  expectedDelta: number;
  severity: MatchupSeverity;
  /** Most likely enemy opponent in the role, if any is revealed/likely. */
  likelyOpponent: string | null;
  confidence: number;
}

export interface TeamMember {
  playerId: string;
  role: Role;
  championId: string;
}

export interface TeamEvaluation {
  total: number;
  synergyPart: number;
  enemyPart: number;
  individualPart: number;
  components: {
    strength: number;
    comfort: number;
    lane: number;
    teamMatchup: number;
    pairSynergy: number;
    structure: number;
    interaction: number;
    swapCost: number;
    pro: number;
  };
  lanes: LaneEvaluation[];
  needs: CompositionNeed[];
  identity: Identity | null;
  interactionNotes: InteractionNote[];
  /** Notable ally pairs with evidence-backed synergy. */
  synergyPairs: Array<{ a: string; b: string; delta: number; confidence: number }>;
  confidence: number;
}

export interface Candidate {
  championId: string;
  playerId: string;
  role: Role;
  /** Score of the best completion with this champion locked. */
  fitScore: number;
  /** Score of the best completion if this champion were unavailable. */
  fallbackScore: number;
  evaluation: TeamEvaluation;
  timing: TimingAssessment;
  /** fitScore + timing adjustment: what should actually be locked now. */
  pickNowScore: number;
  isFlex: boolean;
}

export interface TimingAssessment {
  /** Probability the champion is banned or taken before our next pick. */
  denialProbability: number;
  /** Value lost if denied (fitScore − fallbackScore). */
  valueAtRisk: number;
  /** Positive = pick now, negative = better to hold. */
  adjustment: number;
  /** Whether the enemy counterpart in this role is still hidden. */
  enemyRoleHidden: boolean;
  /** Matchup variance of this champion in this role against likely enemies (0 = blind-safe). */
  matchupVariance: number;
  reasons: string[];
}

export interface PickRecommendation {
  kind: "pick";
  championId: string;
  playerId: string;
  role: Role;
  score: number;
  why: string[];
  tradeoff?: string;
  candidate: Candidate;
}

export interface PairRecommendation {
  kind: "pair";
  picks: [PickRecommendation, PickRecommendation];
  score: number;
  why: string[];
}

export interface BanRecommendation {
  kind: "ban";
  championId: string;
  score: number;
  why: string[];
  /** Which of our players/roles this ban protects, if any. */
  protects: Array<{ playerId: string; role: Role }>;
  /** Likely enemy role for the banned champion. */
  likelyRole: Role | null;
}

export interface RoleSwapRecommendation {
  from: Assignment;
  to: Assignment;
  moves: Array<{ playerId: string; displayName: string; from: Role; to: Role }>;
  improvement: number;
  why: string[];
}

export interface HoldAdvice {
  role: Role;
  reason: string;
}

export interface EnemyRoleEstimate {
  championId: string;
  probabilities: Partial<Record<Role, number>>;
  mostLikely: Role;
  isFlex: boolean;
}

export interface RecommendationResult {
  step: DraftStep | null;
  kind: "pick" | "pair" | "ban" | "enemy-turn" | "complete";
  assignment: Assignment;
  roleSwap: RoleSwapRecommendation | null;
  primary: PickRecommendation | PairRecommendation | BanRecommendation | null;
  alternatives: Array<PickRecommendation | PairRecommendation | BanRecommendation>;
  /** Projected best complete team under the chosen assignment. */
  bestFit: Array<TeamMember & { locked: boolean }>;
  bestFitEvaluation: TeamEvaluation | null;
  holds: HoldAdvice[];
  needs: CompositionNeed[];
  enemy: { roles: EnemyRoleEstimate[]; identity: Identity | null };
  stats: StatsDescription;
  /** Overall evidence confidence label for the UI. */
  confidence: "none" | "low" | "medium" | "high";
  computeMs: number;
}
