import type { Role } from "../roles";

/**
 * Curated champion characteristics.
 *
 * These are weighted (0–3) rather than binary tags:
 *   0 = none / not a feature of the kit
 *   1 = some
 *   2 = strong
 *   3 = defining feature
 *
 * They describe what a kit *does*, independent of how strong it currently is. Measured gameplay
 * statistics (win rates, matchups, synergies) live separately and are never mixed into this file.
 */
export const TRAIT_KEYS = [
  "engage",
  "counterEngage",
  "frontline",
  "peel",
  "dive",
  "pick",
  "poke",
  "burst",
  "sustainedDps",
  "waveclear",
  "sideLane",
  "scaling",
  "earlyGame",
  "objectiveDamage",
  "siege",
  "mobility",
  "range",
  "reliableCC",
  "physicalDamage",
  "magicDamage",
] as const;

export type TraitKey = (typeof TRAIT_KEYS)[number];
export type ChampionTraits = Record<TraitKey, number>;

export const TRAIT_LABELS: Record<TraitKey, string> = {
  engage: "Engage",
  counterEngage: "Counter-engage",
  frontline: "Frontline",
  peel: "Peel",
  dive: "Dive",
  pick: "Pick",
  poke: "Poke",
  burst: "Burst",
  sustainedDps: "Sustained DPS",
  waveclear: "Waveclear",
  sideLane: "Side lane",
  scaling: "Scaling",
  earlyGame: "Early pressure",
  objectiveDamage: "Objective damage",
  siege: "Siege",
  mobility: "Mobility",
  range: "Range",
  reliableCC: "Reliable CC",
  physicalDamage: "Physical damage",
  magicDamage: "Magic damage",
};

export type CurationLevel = "curated" | "partial" | "derived";

export interface ChampionProfile {
  championId: string;
  traits: ChampionTraits;
  /** Curated prior for role usage (weights sum to ~1). Measured role rates override this when available. */
  rolePrior: Partial<Record<Role, number>>;
  curation: CurationLevel;
}

export function emptyTraits(): ChampionTraits {
  return Object.fromEntries(TRAIT_KEYS.map((k) => [k, 0])) as ChampionTraits;
}

export const TRAIT_MAX = 3;
