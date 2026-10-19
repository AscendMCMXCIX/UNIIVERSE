/**
 * The name a member shows on the public pages. Chosen by them, separate from the sign-in username
 * (which is half of their login and is not shown publicly unless they type it here).
 */
export const PUBLIC_NAME_MAX = 24;

export type PublicNameResult = { ok: true; name: string } | { ok: false; error: string };

export function parsePublicName(input: unknown): PublicNameResult {
  const name = typeof input === "string" ? input.normalize("NFC").replace(/\s+/g, " ").trim() : "";
  if (name.length < 2) return { ok: false, error: "Choose a public name of at least 2 characters." };
  if (name.length > PUBLIC_NAME_MAX) return { ok: false, error: `Keep the public name to ${PUBLIC_NAME_MAX} characters.` };
  // Letters (any script), digits, spaces and a few separators: no markup, links or control characters.
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u.test(name)) return { ok: false, error: "Use letters, numbers, spaces, dots, dashes or apostrophes." };
  return { ok: true, name };
}
