import type { Candidate, EngineConfig, StatsDescription } from "./types";

export type ConfidenceLevel = "strong" | "moderate" | "close" | "low";

export interface RecommendationConfidence {
  level: ConfidenceLevel;
  label: string;
  reason: string;
  /** Gap between the top two options in win-rate points. */
  gap: number | null;
}

/**
 * Honest confidence: how clearly the top option separates from the runner-up, tempered by how
 * much evidence stands behind the evaluation. Never a fake number; always a word plus a reason.
 */
export function recommendationConfidence(scores: number[], stats: StatsDescription, evidenceConfidence: number): RecommendationConfidence {
  const top = scores[0];
  const second = scores[1];
  if (top === undefined) return { level: "low", label: "Low confidence", reason: "No legal option to compare.", gap: null };
  const gap = second === undefined ? null : top - second;
  const thinEvidence = stats.totalGames === 0 || evidenceConfidence < 0.25;
  if (thinEvidence) {
    return { level: "low", label: "Low confidence", reason: stats.totalGames === 0 ? "No gameplay statistics yet: this rests on curated champion characteristics and your pools." : "Little current-patch evidence behind these champions.", gap };
  }
  if (gap === null) return { level: "moderate", label: "Moderate preference", reason: "Only one legal option in reach.", gap };
  if (gap >= 0.03) return { level: "strong", label: "Strong recommendation", reason: "Clearly ahead of the alternatives on team fit and timing.", gap };
  if (gap >= 0.012) return { level: "moderate", label: "Moderate preference", reason: "Ahead, but a reasonable case exists for the alternative.", gap };
  return { level: "close", label: "Close decision", reason: "The top options are nearly level; player comfort should decide.", gap };
}

/** Part of a candidate's score that comes from measured statistics (champion strength, matchups, pairings). */
export function statisticalPart(c: Pick<Candidate, "evaluation">, config: EngineConfig): number {
  const k = c.evaluation.components;
  const w = config.weights;
  return w.championStrength * k.strength + (w.laneMatchup * k.lane + w.teamMatchup * k.teamMatchup) * 2 * config.philosophy.enemy + w.pairSynergy * k.pairSynergy * 2 * config.philosophy.synergy;
}

/** Below this many games for the recommended champion in its role, a statistical lead is thin. */
export const THIN_CHAMPION_GAMES = 100;

/**
 * A pick's own evidence: when the lead over the runner-up comes mostly from statistics and the
 * recommended champion has few games in its role this period, the label drops one step and the
 * reason says why. A lead built on the player's comfort or on composition is not affected: thin
 * global statistics say nothing about those.
 */
export function withPickEvidence(decision: RecommendationConfidence, primary: Candidate, runnerUp: Candidate | undefined, games: number, championName: string, roleLabel: string, config: EngineConfig): RecommendationConfidence {
  if (!runnerUp || decision.gap === null || decision.gap <= 0) return decision;
  if (decision.level !== "strong" && decision.level !== "moderate") return decision;
  if (games >= THIN_CHAMPION_GAMES) return decision;
  const statisticalLead = statisticalPart(primary, config) - statisticalPart(runnerUp, config);
  if (statisticalLead < decision.gap * 0.5) return decision;
  const thin = `the lead rests mostly on statistics, and ${championName} has only ${Math.round(games)} game${Math.round(games) === 1 ? "" : "s"} in ${roleLabel} this period`;
  return decision.level === "strong"
    ? { ...decision, level: "moderate", label: "Moderate preference", reason: `Ahead, but ${thin}.` }
    : { ...decision, level: "close", label: "Close decision", reason: `Nearly level once evidence is considered: ${thin}.` };
}
