import { DUO_ROLES, type Role } from "@/domain/matchup-intel/types";

/** Matchup Intel's page, a sidebar entry of its own (MATCHUP_INTEL, src/lib/nav.ts), at the address it had as Resources' second section, so every link to it still works. */
export const MATCHUP_INTEL_PATH = "/resources/matchups";

/**
 * Matchup Intel's address for a choice of champions, with the parameter names the champion window
 * uses: `champion` (yours) and `vs` (the enemy); either may be left out.
 */
export function matchupHref(champion?: string | null, vs?: string | null): string {
  const q = new URLSearchParams();
  if (champion) q.set("champion", champion);
  if (vs) q.set("vs", vs);
  const query = q.toString();
  return query ? `${MATCHUP_INTEL_PATH}?${query}` : MATCHUP_INTEL_PATH;
}

/** A lineup as the address carries it (docs/MATCHUP_INTEL.md, "Roles"): the role and up to four champions. */
export interface Lineup {
  role: Role;
  you: string | null;
  enemy: string | null;
  /** The bot lane only: your duo partner. */
  ally: string | null;
  /** The bot lane only: the other enemy. */
  enemy2: string | null;
}

/**
 * Matchup Intel's address for a lineup: `?role=adc&champion=&ally=&vs=&vs2=`, each left out when
 * empty; a solo lane carries no `ally` or `vs2`. Top, the default, still carries its role, so a
 * link opens in it whatever lane the device last used.
 */
export function lineupHref(l: Lineup): string {
  const q = new URLSearchParams();
  q.set("role", l.role);
  if (l.you) q.set("champion", l.you);
  if (DUO_ROLES.has(l.role) && l.ally) q.set("ally", l.ally);
  if (l.enemy) q.set("vs", l.enemy);
  if (DUO_ROLES.has(l.role) && l.enemy2) q.set("vs2", l.enemy2);
  return `${MATCHUP_INTEL_PATH}?${q.toString()}`;
}
