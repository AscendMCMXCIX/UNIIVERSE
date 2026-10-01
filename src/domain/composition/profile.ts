import { emptyTraits, TRAIT_KEYS, type ChampionTraits, type TraitKey } from "../champion-model/traits";

export interface TeamProfile {
  count: number;
  totals: ChampionTraits;
  maxes: ChampionTraits;
  /** Share of damage that is physical (0 = all magic, 1 = all physical). 0.5 when unknown. */
  physicalShare: number;
  frontlineCount: number;
  engageSources: number;
  reliableCCSources: number;
  hardCarries: number;
  avgRange: number;
  avgMobility: number;
}

export function teamProfile(members: ChampionTraits[]): TeamProfile {
  const totals = emptyTraits();
  const maxes = emptyTraits();
  let frontlineCount = 0;
  let engageSources = 0;
  let reliableCCSources = 0;
  let hardCarries = 0;
  for (const t of members) {
    for (const k of TRAIT_KEYS) {
      totals[k] += t[k];
      if (t[k] > maxes[k]) maxes[k] = t[k];
    }
    if (t.frontline >= 2) frontlineCount += 1;
    if (t.engage >= 2) engageSources += 1;
    if (t.reliableCC >= 2) reliableCCSources += 1;
    if (t.sustainedDps >= 3 || (t.scaling >= 3 && t.sustainedDps >= 2)) hardCarries += 1;
  }
  const dmg = totals.physicalDamage + totals.magicDamage;
  return {
    count: members.length,
    totals,
    maxes,
    physicalShare: dmg === 0 ? 0.5 : totals.physicalDamage / dmg,
    frontlineCount,
    engageSources,
    reliableCCSources,
    hardCarries,
    avgRange: members.length ? totals.range / members.length : 0,
    avgMobility: members.length ? totals.mobility / members.length : 0,
  };
}

export function traitAverage(profile: TeamProfile, key: TraitKey): number {
  return profile.count === 0 ? 0 : profile.totals[key] / profile.count;
}
