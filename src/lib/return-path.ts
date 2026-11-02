/**
 * Where to go after signing in: a path on this site, or "/" (each account's own start page).
 *
 * Starting with "/" is not enough. Browsers read "\" as "/" and drop tabs and line breaks in an
 * address, so "/\evil.example" or "/<tab>/evil.example" leave the site. The path is resolved
 * against a placeholder origin and kept only when it stays there; anything with a backslash or a
 * control character is refused outright.
 */
export function safeReturnPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return "/";
  const base = "http://uniiverse.invalid";
  try {
    const url = new URL(next, base);
    if (url.origin !== base) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
