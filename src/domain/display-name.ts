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

/*
  Alphabetical order by display name, the same on every server and browser: English collation
  (fixed, so the server's locale never changes it) that ignores case and accents and reads numbers
  as numbers ("Player 2" before "Player 10"). Names equal under those rules fall back to their
  exact spelling, then to a stable key (the profile id), so two members with the same name never
  swap places between page loads.
*/
const loose = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const strict = new Intl.Collator("en", { sensitivity: "variant", numeric: true });

/** A comparator for sort(): A to Z by display name, ties settled by spelling, then by `key`. */
export function byDisplayName<T>(name: (item: T) => string, key: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => {
    const na = normaliseDisplayName(name(a));
    const nb = normaliseDisplayName(name(b));
    const ka = key(a);
    const kb = key(b);
    return loose.compare(na, nb) || strict.compare(na, nb) || (ka < kb ? -1 : ka > kb ? 1 : 0);
  };
}
