/**
 * Ladder tiers and bands.
 *
 * Ranked evidence is sampled from several ladder populations. Every stored match and every
 * aggregate row keeps the band it came from, so volume (Emerald, Diamond) and quality (Master
 * and above) stay separable: the loader weights bands when it blends them, the raw counts stay
 * honest provenance, and the weights can change without re-ingesting anything.
 */
export const COLLECTABLE_TIERS = ["CHALLENGER", "GRANDMASTER", "MASTER", "DIAMOND", "EMERALD"] as const;
export type RiotTier = (typeof COLLECTABLE_TIERS)[number];

/** Apex tiers come from one league list each; the others are paged entry lists per division. */
export const APEX_TIERS: ReadonlySet<RiotTier> = new Set(["CHALLENGER", "GRANDMASTER", "MASTER"]);
export const DIVISIONS = ["I", "II", "III", "IV"] as const;

/** Broad population by default: Emerald volume with rank-aware weighting (see tierWeight). */
export const DEFAULT_TIERS = "CHALLENGER,GRANDMASTER,MASTER,DIAMOND,EMERALD";

/** Matches and aggregates stored before bands were recorded (Master+ ladders only). */
export const LEGACY_BAND = "MASTER+";

/** Display order, highest skill first. */
export const TIER_BAND_ORDER = ["CHALLENGER", "GRANDMASTER", "MASTER", LEGACY_BAND, "DIAMOND", "EMERALD"] as const;

export function parseTiers(spec: string | undefined, fallback = DEFAULT_TIERS): RiotTier[] {
  const raw = (spec?.trim() || fallback).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const out = raw.filter((t): t is RiotTier => (COLLECTABLE_TIERS as readonly string[]).includes(t));
  return out.length ? [...new Set(out)] : parseTiers(undefined, DEFAULT_TIERS);
}

/** Band label stored with a match: the tracked player's tier, or the legacy band when unknown. */
export function tierBandFor(tier: string | null | undefined): string {
  const t = (tier ?? "").toUpperCase();
  return (COLLECTABLE_TIERS as readonly string[]).includes(t) ? t : LEGACY_BAND;
}

/**
 * Evidence weight per band: one game from this population counts as this many games of
 * Challenger-level evidence. Lower bands keep their volume but cannot outvote the quality of the
 * apex ladders game for game; a tiny Challenger sample still cannot outvote thousands of Emerald
 * games because every weight is at most 1. Overridable with RIOT_TIER_WEIGHTS=EMERALD=0.5,…
 */
export const DEFAULT_TIER_WEIGHTS: Record<string, number> = {
  CHALLENGER: 1,
  GRANDMASTER: 1,
  MASTER: 0.9,
  /** Earlier sample: apex ladders only (Master, Grandmaster, Challenger mixed). */
  [LEGACY_BAND]: 1,
  DIAMOND: 0.7,
  EMERALD: 0.5,
};

export function parseTierWeights(spec: string | undefined): Record<string, number> {
  const out = { ...DEFAULT_TIER_WEIGHTS };
  for (const part of (spec ?? "").split(",")) {
    const [k, v] = part.split("=").map((s) => s.trim());
    const n = Number(v);
    if (k && Number.isFinite(n) && n > 0 && n <= 1) out[k.toUpperCase()] = n;
  }
  return out;
}

export function tierWeight(band: string | null | undefined, weights: Record<string, number> = DEFAULT_TIER_WEIGHTS): number {
  return weights[tierBandFor(band)] ?? weights[LEGACY_BAND] ?? 1;
}

/** "EMERALD+" for the configured tiers (the lowest collected tier, plus). */
export function tierPopulationLabel(tiers: readonly string[]): string {
  const order = [...COLLECTABLE_TIERS].reverse(); // lowest first
  const lowest = order.find((t) => tiers.map((x) => x.toUpperCase()).includes(t));
  return lowest ? `${lowest}+` : "MASTER+";
}

/** Human label for a band: "Emerald", "Master+ (before bands were recorded)". */
export function tierBandLabel(band: string): string {
  if (band === LEGACY_BAND) return "Master+ (earlier sample)";
  const b = band.toLowerCase();
  return b.charAt(0).toUpperCase() + b.slice(1);
}
