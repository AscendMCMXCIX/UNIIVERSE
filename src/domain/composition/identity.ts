import type { TeamProfile } from "./profile";

export const IDENTITIES = ["Dive", "Front-to-back", "Pick", "Poke / Siege", "Scaling", "Split pressure", "Teamfight engage", "Early skirmish"] as const;
export type Identity = (typeof IDENTITIES)[number];

export interface IdentityResult {
  primary: Identity;
  secondary: Identity | null;
  scores: Record<Identity, number>;
}

/**
 * Classifies what a composition is built to do. Scores are normalised per champion so partial
 * drafts still produce a (lower-confidence) reading.
 */
export function compositionIdentity(profile: TeamProfile): IdentityResult {
  const n = Math.max(1, profile.count);
  const t = profile.totals;
  const raw: Record<Identity, number> = {
    Dive: (t.dive * 1.0 + t.mobility * 0.4 + t.engage * 0.3) / n,
    "Front-to-back": (t.peel * 0.9 + t.frontline * 0.5 + t.sustainedDps * 0.6 + t.counterEngage * 0.3) / n,
    Pick: (t.pick * 1.2 + t.burst * 0.4 + t.reliableCC * 0.2) / n,
    "Poke / Siege": (t.poke * 1.0 + t.siege * 0.8 + t.counterEngage * 0.3 + t.range * 0.2) / n,
    Scaling: (t.scaling * 1.1 - t.earlyGame * 0.3) / n,
    "Split pressure": (profile.maxes.sideLane * 1.6 + t.sideLane * 0.3 + t.waveclear * 0.2) / n,
    "Teamfight engage": (t.engage * 1.0 + t.reliableCC * 0.6 + t.frontline * 0.4) / n,
    "Early skirmish": (t.earlyGame * 1.0 + t.dive * 0.2) / n,
  };
  const ranked = (Object.entries(raw) as Array<[Identity, number]>).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0]![0];
  const second = ranked[1];
  const secondary = second && second[1] >= ranked[0]![1] * 0.8 ? second[0] : null;
  return { primary, secondary, scores: raw };
}
