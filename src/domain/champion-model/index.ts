import { ROLES, type Role } from "../roles";
import { CURATED_ROWS, PARTIALLY_CURATED } from "./curated-data";
import { deriveRolePrior, deriveTraits, type StaticChampionInfo } from "./derive";
import { TRAIT_KEYS, type ChampionProfile, type ChampionTraits } from "./traits";

export * from "./traits";
export type { StaticChampionInfo } from "./derive";

function parseRolePrior(spec: string): Partial<Record<Role, number>> {
  const prior: Partial<Record<Role, number>> = {};
  for (const part of spec.split(",")) {
    const [role, weight] = part.split(":");
    if (role && (ROLES as readonly string[]).includes(role)) prior[role as Role] = Number(weight ?? 0);
  }
  return prior;
}

const cache = new Map<string, ChampionProfile>();

/**
 * Returns the characteristics profile for a champion. Curated when available; otherwise derived
 * from static metadata and flagged `derived` so the engine and UI can treat it as low-confidence.
 */
export function getChampionProfile(championId: string, staticInfo?: StaticChampionInfo): ChampionProfile {
  const cached = cache.get(championId);
  if (cached && (cached.curation !== "derived" || !staticInfo)) return cached;

  const row = CURATED_ROWS[championId];
  let profile: ChampionProfile;
  if (row) {
    const [values, roleSpec] = row;
    const traits = Object.fromEntries(TRAIT_KEYS.map((k, i) => [k, values[i] ?? 0])) as ChampionTraits;
    profile = { championId, traits, rolePrior: parseRolePrior(roleSpec), curation: PARTIALLY_CURATED.has(championId) ? "partial" : "curated" };
  } else {
    const info = staticInfo ?? { tags: [], attackRange: 125 };
    profile = { championId, traits: deriveTraits(info), rolePrior: deriveRolePrior(info), curation: "derived" };
  }
  cache.set(championId, profile);
  return profile;
}

export function isCurated(championId: string): boolean {
  return championId in CURATED_ROWS;
}

export function curatedChampionIds(): string[] {
  return Object.keys(CURATED_ROWS);
}
