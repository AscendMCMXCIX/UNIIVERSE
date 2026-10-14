/** Cookie that remembers the desktop sidebar state ("collapsed" | "expanded"); read by the server for the first render. */
export const SIDEBAR_COOKIE = "uniiverse_sidebar";

/** Cookie listing the sidebar groups a person closed (comma-separated keys); groups are open by default. */
export const NAV_GROUPS_COOKIE = "uniiverse_nav_closed";

export function parseClosedGroups(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z-]{1,24}$/.test(s));
}
