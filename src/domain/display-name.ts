/*
  The display name: the visible identity a member chooses (Team, Players, profiles, cards,
  Leaderboards, Matches). It is separate from the username, which stays the sign-in identifier,
  and from Riot IDs. Not unique: two members may show the same name; links and permissions use ids.
*/

export const DISPLAY_NAME_MAX = 32;

/** Trimmed, with runs of spaces collapsed (what is stored and shown). */
export function normaliseDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Why a display name cannot be used, or null. The server checks the same rule. */
export function displayNameProblem(value: string): string | null {
  const v = normaliseDisplayName(value);
  if (v.length < 2) return "At least 2 characters.";
  if ([...v].length > DISPLAY_NAME_MAX) return `${DISPLAY_NAME_MAX} characters at most.`;
  // Control and invisible formatting characters (zero-width, direction overrides) could hide or reorder text.
  if (/[\p{Cc}\p{Cf}]/u.test(v)) return "Use visible characters only.";
  if (!/[\p{L}\p{N}]/u.test(v)) return "Include at least one letter or digit.";
  return null;
}
