import { TRAIT_KEYS, type ChampionTraits, type TraitKey } from "../champion-model/traits";

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

/** Each champion's traits as a vector in TRAIT_KEYS order (traits objects are immutable). */
const vectors = new WeakMap<ChampionTraits, Float64Array>();
function vectorOf(t: ChampionTraits): Float64Array {
  let v = vectors.get(t);
  if (!v) {
    v = new Float64Array(TRAIT_KEYS.length);
    for (let i = 0; i < TRAIT_KEYS.length; i++) v[i] = t[TRAIT_KEYS[i]!];
    vectors.set(t, v);
  }
  return v;
}

/** Back to a traits object, built as a literal (one object shape) in TRAIT_KEYS order. */
function fromVector(v: Float64Array): ChampionTraits {
  return { engage: v[0]!, counterEngage: v[1]!, frontline: v[2]!, peel: v[3]!, dive: v[4]!, pick: v[5]!, poke: v[6]!, burst: v[7]!, sustainedDps: v[8]!, waveclear: v[9]!, sideLane: v[10]!, scaling: v[11]!, earlyGame: v[12]!, objectiveDamage: v[13]!, siege: v[14]!, mobility: v[15]!, range: v[16]!, reliableCC: v[17]!, physicalDamage: v[18]!, magicDamage: v[19]! };
}

export function teamProfile(members: ChampionTraits[]): TeamProfile {
  const n = TRAIT_KEYS.length;
  const totalsV = new Float64Array(n);
  const maxesV = new Float64Array(n);
  let frontlineCount = 0;
  let engageSources = 0;
  let reliableCCSources = 0;
  let hardCarries = 0;
  for (const t of members) {
    const v = vectorOf(t);
    for (let i = 0; i < n; i++) {
      totalsV[i]! += v[i]!;
      if (v[i]! > maxesV[i]!) maxesV[i] = v[i]!;
    }
    if (t.frontline >= 2) frontlineCount += 1;
    if (t.engage >= 2) engageSources += 1;
    if (t.reliableCC >= 2) reliableCCSources += 1;
    if (t.sustainedDps >= 3 || (t.scaling >= 3 && t.sustainedDps >= 2)) hardCarries += 1;
  }
  const totals = fromVector(totalsV);
  const maxes = fromVector(maxesV);
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
