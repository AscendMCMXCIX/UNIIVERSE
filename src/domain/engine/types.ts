import type { ChampionProfile } from "../champion-model";
import type { CompositionNeed, Identity, InteractionNote } from "../composition";
import type { Assignment } from "../roster/assignments";
import type { PlayerProfile } from "../roster/types";
import type { DraftState, DraftStep } from "../draft";
import type { Role } from "../roles";
import type { ShrunkRate } from "../stats";
import type { ProficiencyLookup } from "../proficiency";
import type { ProSlotProfile } from "../pro";
import type { ExecutionProfile, PowerCurve, ResourceNeed } from "../champion-model/derived";
import type { ThreatEntry } from "../composition/threats";
import type { DraftOverrides } from "./overrides";
import type { RecommendationConfidence } from "./confidence";
import type { WhatIfTrigger } from "./what-if";
import type { PinchWarning } from "./pinch";
import type { EnemyResponse } from "./responses";

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
  /** Professional draft-slot behaviour (B1, R1/R2, R5 …) when pro pick order is known; null otherwise. */
  proSlots?(championId: string): ProSlotProfile | null;
}

export interface StatsDescription {
  patch: string | null;
  sources: Array<"ranked" | "pro" | "demo">;
  /** Effective (patch-blended) ranked/demo games behind rates. */
  totalGames: number;
  isDemo: boolean;
  /** Provenance of the ranked sample, when known: which servers, how many games each, from which ladder. */
  provenance?: StatsProvenance;
}

export interface PatchEvidence {
  patch: string;
  /** 0 = current patch, 1 = previous, 2 = two patches ago. */
  distance: number;
  /** Raw ranked games aggregated for this patch. */
  games: number;
  /** Per-game multiplier the blend applies (1 for the current patch). */
  weight: number;
  label: "full" | "reduced" | "fallback" | "ignored";
}

export interface StatsProvenance {
  /** Riot platform ids that contributed ranked games to the blended patches. */
  regions: string[];
  /** Raw (unblended) ranked games per platform across the blended patches. */
  gamesByRegion: Record<string, number>;
  /** Ladder population label, e.g. "EMERALD+". */
  tierPopulation: string;
  /** Raw ranked games per ladder band across the blended patches (EMERALD, DIAMOND, MASTER, …). */
  tierBands?: Record<string, number>;
  /** Evidence weight per band (one game = this many Challenger-level games). */
  tierWeights?: Record<string, number>;
  /** Raw ranked games per patch in the evidence window, with the weight each patch carries. */
  patches?: PatchEvidence[];
  /** Queue label, e.g. "Ranked Solo/Duo". */
  queue: string;
  /** Newest ranked game folded into the statistics. */
  lastGameAt: Date | null;
  /** Professional games behind pro presence and slot patterns. */
  proGames: number;
}

export interface EngineInput {
  players: PlayerProfile[];
  draft: DraftState;
  champions: Map<string, ChampionInfo>;
  stats: StatsProvider;
  config?: Partial<EngineConfig>;
  /** Optional per-player proficiency evidence from linked Riot accounts. */
  proficiency?: ProficiencyLookup | null;
  /** Coach / strategy overrides for this draft (soft preferences; never relax eligibility). */
  overrides?: DraftOverrides | null;
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
  /** Penalty per unit of execution demand (0..1 per member) at the "balanced" risk preference. */
  execution: number;
  /** Penalty per resource-hungry champion beyond the two a team can realistically feed. */
  resourceOverload: number;
  /** Penalty per coordination-heavy champion beyond two (communication burden). */
  coordination: number;
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
  /** How much to weigh execution risk: reliable teams avoid demanding compositions, ceiling teams accept them. */
  riskPreference: RiskPreference;
}

export type RiskPreference = "reliable" | "balanced" | "ceiling";

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
    /** Execution/coordination/resource realism (always ≤ 0). */
    execution: number;
    /** Coach-override tilt (trait bonuses, strongside/weakside resourcing). */
    overrides: number;
  };
  /** Realism summary for the team: can we actually play this? */
  realism: TeamRealism;
  lanes: LaneEvaluation[];
  needs: CompositionNeed[];
  identity: Identity | null;
  interactionNotes: InteractionNote[];
  /** Notable ally pairs with evidence-backed synergy. */
  synergyPairs: Array<{ a: string; b: string; delta: number; confidence: number }>;
  confidence: number;
}

export interface TeamRealism {
  /** Mean execution demand of the members (0..1). */
  execution: number;
  executionLabel: "low" | "moderate" | "high" | "very high";
  /** Members whose kits depend on teammates following up. */
  coordinationHeavy: string[];
  /** Members that want strongside resources. */
  resourceHungry: string[];
  resourceOverloaded: boolean;
  powerCurve: PowerCurve;
  spikes: string[];
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
  execution: ExecutionProfile;
  resource: ResourceNeed;
  power: PowerCurve;
}

/** Compact view of a legal candidate for comparison UIs ("why not X?"). */
export interface CandidateSummary {
  championId: string;
  playerId: string;
  role: Role;
  rank: number;
  pickNowScore: number;
  fitScore: number;
  isFlex: boolean;
  execution: number;
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
  /** "Why this pick?": the score decomposed into the factors the engine weighed. */
  breakdown: PickBreakdown;
}

export type BreakdownKey = "team-fit" | "enemy-interaction" | "player-proficiency" | "patch-strength" | "pro-priority" | "realism" | "timing";

export interface BreakdownItem {
  key: BreakdownKey;
  /** Contribution to the pick score, in win-rate units (0.01 = 1 point). */
  value: number;
  /** One plain sentence about this factor for this pick. */
  text: string;
}

export interface PickBreakdown {
  /** The projected team with this pick locked; items sum (with role-swap cost and unfilled roles) to the fit score. */
  items: BreakdownItem[];
  /** Linked-account proficiency's own part of the player-proficiency item for this player and champion (0 = no data). */
  proficiencyContribution: number;
  /** Set when linked-account data changed the ranking compared with pool order alone. */
  proficiencyDecisive: string | null;
  /** The proficiency estimate behind the contribution, if any. */
  proficiency: { tier: string; games: number; recentGames: number; patchGames: number; confidence: number } | null;
  evidence: { label: "none" | "low" | "medium" | "high"; games: number; confidence: number };
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
  /** Honest label for how clear the decision is (gap between top options × evidence). */
  decision: RecommendationConfidence | null;
  /** Legal candidates in rank order (top N), for "why not X?" comparisons. */
  candidates: CandidateSummary[];
  /** Plausible enemy reveals that would flip the top choice. */
  whatIf: WhatIfTrigger[];
  /** Champion-level threats between the projected team and the revealed enemy picks. */
  threats: ThreatEntry[];
  /** Pool-pinch warnings ahead of the next enemy ban phase. */
  pinch: PinchWarning[];
  /** Strongest plausible enemy responses to the primary pick. */
  responses: EnemyResponse[];
  /** Enemy roles not yet revealed (probability-weighted). */
  enemyOpenRoles: Role[];
  overrides: { active: DraftOverrides | null; warning: string | null; unconstrainedScore: number | null };
  /** Which lineup players have linked-account proficiency data the engine could use for this draft. */
  playerData: { withData: string[]; withoutData: string[] };
  computeMs: number;
}
