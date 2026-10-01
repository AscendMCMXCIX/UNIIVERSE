/**
 * Sample-size aware estimation.
 *
 * Every rate UNIIVERSE uses (win rate, matchup win rate, synergy win rate) is estimated with
 * Bayesian shrinkage towards a prior: a Beta(prior·k, (1−prior)·k) prior, where k is the
 * "prior weight" expressed in pseudo-games. 3 games at 67% therefore barely moves the estimate,
 * while 1500 games at 54% is believed almost entirely.
 */
export interface RateSample {
  wins: number;
  games: number;
}

export interface ShrunkRate {
  /** Posterior mean. */
  estimate: number;
  /** games / (games + priorWeight): 0 = pure prior, → 1 = pure data. */
  confidence: number;
  /** The raw (unshrunk) rate, or null when there are no games. */
  raw: number | null;
  games: number;
  /** Prior used. */
  prior: number;
  priorWeight: number;
}

export function shrinkRate(sample: RateSample, prior: number, priorWeight: number): ShrunkRate {
  const games = Math.max(0, sample.games);
  const wins = Math.min(Math.max(0, sample.wins), games);
  const k = Math.max(0, priorWeight);
  const estimate = games + k === 0 ? prior : (wins + prior * k) / (games + k);
  return {
    estimate,
    confidence: games + k === 0 ? 0 : games / (games + k),
    raw: games > 0 ? wins / games : null,
    games,
    prior,
    priorWeight: k,
  };
}

/** Wilson score interval for a binomial proportion. Useful for showing uncertainty in the UI. */
export function wilsonInterval(wins: number, games: number, z = 1.96): { low: number; high: number } {
  if (games <= 0) return { low: 0, high: 1 };
  const p = wins / games;
  const denom = 1 + (z * z) / games;
  const centre = p + (z * z) / (2 * games);
  const spread = z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games));
  return { low: Math.max(0, (centre - spread) / denom), high: Math.min(1, (centre + spread) / denom) };
}

export interface PeriodSample extends RateSample {
  /** 0 = current patch, 1 = previous patch, ... */
  patchDistance: number;
  /** Optional discount for evidence before a rework/change point (0..1). */
  discount?: number;
}

export interface BlendOptions {
  /** Weight multiplier applied per patch of distance (e.g. 0.6 → previous patch counts 60%). */
  recencyDecay: number;
  /** Older evidence stops contributing once the current patch holds this many games. */
  currentPatchSaturation: number;
  /** Never look back further than this many patches. */
  maxPatchDistance: number;
}

export const DEFAULT_BLEND: BlendOptions = {
  recencyDecay: 0.55,
  currentPatchSaturation: 400,
  maxPatchDistance: 4,
};

/**
 * Blend evidence across patches into one effective sample.
 *
 * Current-patch evidence is always fully counted. Older patches are decayed by recency and
 * additionally scaled down as the current patch accumulates games, so historical weight
 * automatically shrinks as fresh evidence arrives. Reworked champions can carry a discount on
 * the pre-rework periods.
 */
export function blendPeriods(periods: PeriodSample[], options: BlendOptions = DEFAULT_BLEND): RateSample & { effectiveHistoricalShare: number } {
  const current = periods.filter((p) => p.patchDistance === 0);
  const currentGames = current.reduce((s, p) => s + p.games * (p.discount ?? 1), 0);
  const currentWins = current.reduce((s, p) => s + p.wins * (p.discount ?? 1), 0);
  const saturation = options.currentPatchSaturation <= 0 ? 0 : Math.min(1, currentGames / options.currentPatchSaturation);
  const historicalScale = 1 - saturation;

  let wins = currentWins;
  let games = currentGames;
  let historicalGames = 0;
  for (const p of periods) {
    if (p.patchDistance <= 0 || p.patchDistance > options.maxPatchDistance) continue;
    const w = Math.pow(options.recencyDecay, p.patchDistance) * historicalScale * (p.discount ?? 1);
    wins += p.wins * w;
    games += p.games * w;
    historicalGames += p.games * w;
  }
  return { wins, games, effectiveHistoricalShare: games > 0 ? historicalGames / games : 0 };
}

/** Compare two shrunk estimates and return the difference weighted by the lower confidence. */
export function confidenceWeightedDelta(a: ShrunkRate, b: ShrunkRate): number {
  return (a.estimate - b.estimate) * Math.min(a.confidence, b.confidence);
}

/**
 * Describe confidence for humans. Thresholds are intentionally coarse: the UI should say
 * "low data" rather than show a false-precision number.
 */
export type ConfidenceLabel = "none" | "low" | "medium" | "high";

export function confidenceLabel(confidence: number, games: number): ConfidenceLabel {
  if (games <= 0) return "none";
  if (confidence < 0.3) return "low";
  if (confidence < 0.7) return "medium";
  return "high";
}
