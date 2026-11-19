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
