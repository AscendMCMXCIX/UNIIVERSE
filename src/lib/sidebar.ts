/** Cookie that remembers the desktop sidebar state ("collapsed" | "expanded"); read by the server for the first render. */
export const SIDEBAR_COOKIE = "uniiverse_sidebar";

/**
 * The collapsed desktop sidebar's width: the rail of icons. The sidebar slides by the open width
 * (16rem) less this one (collapsible-sidebar.tsx).
 */
export const SIDEBAR_RAIL = "w-[4.5rem]";

/**
 * A box as wide as the rail, from the sidebar's left edge, that centres what it holds: the logo
 * sits on the rail's centre line, the icons' line, whatever its own size. It is the same box open
 * and collapsed, so the logo never moves while the sidebar opens or collapses.
 */
export const SIDEBAR_RAIL_COLUMN = `flex ${SIDEBAR_RAIL} shrink-0 justify-center`;
