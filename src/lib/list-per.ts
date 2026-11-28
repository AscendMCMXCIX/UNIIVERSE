/*
  A server-paged list's last page size (docs/RESPONSIVE.md, "One-screen desktop pages", server-paged
  lists): in the one-screen workspace a list's rows a page come from the row budget (the complete rows
  the window has room for), written to the address as `per`, and kept in a cookie of the list's own so
  the server's first paint of the next visit draws about the right count before the page has measured.
  UI state, like the sidebar's cookie: a number from 1 to 25, nothing about the person.

  One cookie per list, as each list's room differs: the games (Match History), the games grouped by
  session, one player's games (Encounters → a player), the players met (Encounters) and Team Matches.
*/

/** The lists and their cookies. */
export const LIST_PER_COOKIES = {
  games: "uniiverse_per_games",
  sessions: "uniiverse_per_sessions",
  met: "uniiverse_per_met",
  encounters: "uniiverse_per_encounters",
  together: "uniiverse_per_together",
} as const;

export type PagedListName = keyof typeof LIST_PER_COOKIES;

/** The most rows a server-paged list's page holds (Match History's PER_PAGE_MAX). */
export const LIST_PER_MAX = 25;

/** A cookie's page size: a whole number from 1 to LIST_PER_MAX, else null (none, or not one of ours). */
export function readListPer(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,2}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= LIST_PER_MAX ? n : null;
}

/** The cookie's text for a list's page size (a year, the whole site, sent to the site only). */
export function listPerCookie(list: PagedListName, per: number): string {
  const n = Math.max(1, Math.min(LIST_PER_MAX, Math.round(per)));
  return `${LIST_PER_COOKIES[list]}=${n}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Keeps a list's page size for the next visit (the browser only). */
export function rememberListPer(list: PagedListName, per: number) {
  if (typeof document === "undefined") return;
  document.cookie = listPerCookie(list, per);
}

/**
 * Forgets a list's page size (the flow, which never pages by the budget: a browser window that left the
 * workspace), so the server's next first paint is the flow's own again.
 */
export function forgetListPer(list: PagedListName) {
  if (typeof document === "undefined") return;
  document.cookie = `${LIST_PER_COOKIES[list]}=; path=/; max-age=0; samesite=lax`;
}
