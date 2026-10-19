/**
 * What the stored ranked and pro statistics cover (patch, sources, effective games, regions,
 * ladder bands, freshness), as Meta & Trends, Riot Data and System Health describe it.
 */

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
