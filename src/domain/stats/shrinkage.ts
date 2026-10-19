/**
 * Sample-size aware estimation.
 *
 * Champion proficiency estimates its win rates with Bayesian shrinkage towards a prior: a
 * Beta(prior·k, (1−prior)·k) prior, where k is the "prior weight" expressed in pseudo-games. 3 games at 67% therefore barely moves the estimate,
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
