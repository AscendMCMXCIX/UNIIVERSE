import type { Candidate, StatsDescription } from "./types";

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
export function recommendationConfidence(candidates: Candidate[], stats: StatsDescription, evidenceConfidence: number): RecommendationConfidence {
  const top = candidates[0];
  const second = candidates[1];
  if (!top) return { level: "low", label: "Low confidence", reason: "No legal option to compare.", gap: null };
  const gap = second ? top.pickNowScore - second.pickNowScore : null;
  const thinEvidence = stats.totalGames === 0 || evidenceConfidence < 0.25;
  if (thinEvidence) {
    return { level: "low", label: "Low confidence", reason: stats.totalGames === 0 ? "No gameplay statistics yet: this rests on curated champion characteristics and your pools." : "Little current-patch evidence behind these champions.", gap };
  }
  if (gap === null) return { level: "moderate", label: "Moderate preference", reason: "Only one legal option in reach.", gap };
  if (gap >= 0.03) return { level: "strong", label: "Strong recommendation", reason: `Clearly ahead of ${second ? "the alternatives" : "others"} on team fit and timing.`, gap };
  if (gap >= 0.012) return { level: "moderate", label: "Moderate preference", reason: "Ahead, but a reasonable case exists for the alternative.", gap };
  return { level: "close", label: "Close decision", reason: "The top options are nearly level; player comfort should decide.", gap };
}
