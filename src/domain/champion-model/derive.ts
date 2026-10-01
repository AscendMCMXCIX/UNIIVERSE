import type { Role } from "../roles";
import { emptyTraits, type ChampionTraits } from "./traits";

export interface StaticChampionInfo {
  tags: string[];
  attackRange: number;
  info?: { attack: number; defense: number; magic: number; difficulty: number };
}

/**
 * Derives a rough, low-confidence trait profile from Data Dragon metadata. Used only for champions
 * not yet in the curated table (typically a brand-new release) so they are *available* while
 * clearly being low-information.
 */
export function deriveTraits(info: StaticChampionInfo): ChampionTraits {
  const t = emptyTraits();
  const tags = new Set(info.tags.map((x) => x.toLowerCase()));
  const ranged = info.attackRange >= 300;
  t.range = info.attackRange >= 600 ? 3 : ranged ? 2 : 0;
  const magic = info.info?.magic ?? 5;
  const attack = info.info?.attack ?? 5;
  const defense = info.info?.defense ?? 5;

  if (tags.has("tank")) {
    t.frontline = 3;
    t.engage = 2;
    t.reliableCC = 2;
    t.peel = 1;
  }
  if (tags.has("fighter")) {
    t.frontline = Math.max(t.frontline, 2);
    t.sustainedDps = 2;
    t.sideLane = 2;
    t.dive = 1;
    t.earlyGame = 2;
  }
  if (tags.has("assassin")) {
    t.dive = 3;
    t.burst = 3;
    t.mobility = 2;
    t.pick = 1;
  }
  if (tags.has("mage")) {
    t.burst = 2;
    t.waveclear = 2;
    t.poke = 1;
    t.reliableCC = 1;
  }
  if (tags.has("marksman")) {
    t.sustainedDps = 3;
    t.scaling = 2;
    t.objectiveDamage = 2;
    t.siege = 1;
  }
  if (tags.has("support")) {
    t.peel = 2;
    t.counterEngage = 1;
    t.reliableCC = Math.max(t.reliableCC, 1);
  }
  // Damage type from the info block; most kits are predominantly one or the other.
  if (magic > attack + 2) {
    t.magicDamage = 3;
  } else if (attack > magic + 2) {
    t.physicalDamage = 3;
  } else {
    t.physicalDamage = 2;
    t.magicDamage = 1;
  }
  if (defense >= 7) t.frontline = Math.max(t.frontline, 2);
  t.scaling = Math.max(t.scaling, 1);
  t.waveclear = Math.max(t.waveclear, 1);
  return t;
}

/** Role prior from tags when nothing better exists. */
export function deriveRolePrior(info: StaticChampionInfo): Partial<Record<Role, number>> {
  const tags = new Set(info.tags.map((x) => x.toLowerCase()));
  if (tags.has("marksman")) return { ADC: 0.8, MID: 0.2 };
  if (tags.has("support")) return { SUPPORT: 0.8, MID: 0.2 };
  if (tags.has("tank")) return { TOP: 0.4, SUPPORT: 0.3, JUNGLE: 0.3 };
  if (tags.has("assassin")) return { MID: 0.5, JUNGLE: 0.3, TOP: 0.2 };
  if (tags.has("mage")) return { MID: 0.6, SUPPORT: 0.3, TOP: 0.1 };
  if (tags.has("fighter")) return { TOP: 0.6, JUNGLE: 0.4 };
  return { TOP: 0.2, JUNGLE: 0.2, MID: 0.2, ADC: 0.2, SUPPORT: 0.2 };
}
