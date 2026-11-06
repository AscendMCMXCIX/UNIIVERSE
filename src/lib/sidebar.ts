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

/*
  The sidebar's rows, shared by every entry in it (the pages, the collapse control, Install App,
  the switch between the modes, the account), so they look, move and line up as one system
  (docs/DESIGN_SYSTEM.md → Navigation). Plain strings, so server and client components share them.
*/

/** Text that fades while the sidebar is collapsed to its icon column (the icons never move). */
export const RAIL_FADE = "transition-opacity duration-150 group-data-[collapsed=true]/sidebar:opacity-0 group-data-[collapsed=true]/sidebar:duration-75";

/**
 * A row of the sidebar: the icon 15px in from the row's edge (the row starts 12px in), so its
 * centre is the collapsed rail's centre line (2.25rem) whatever the browser's text size. In rem,
 * like the rail. `group` lets the highlight, icon and label answer the row's hover and focus.
 */
export const RAIL_ROW = "group isolate relative flex min-h-10 w-full items-center gap-3 rounded-lg py-2 pl-[0.9375rem] pr-3 text-left text-sm font-semibold transition-colors duration-150";

/**
 * A row's highlight (the current page, or the pointer over it): the whole row in the open sidebar
 * and the drawer; in the collapsed sidebar a 3rem square on the icon, as far from the rail's right
 * edge as from its left, so the icon column reads as centred instead of a band cut off by the edge.
 */
export const RAIL_HIGHLIGHT = "absolute inset-y-0 left-0 right-0 -z-10 rounded-lg transition-[background-color,box-shadow,right] duration-150 group-data-[collapsed=true]/sidebar:right-[calc(100%-3rem)]";

/** The highlight's two states: one neutral lift for the pointer, a brighter one with a hairline of light on top for the current page. */
export const RAIL_HOVER = "group-hover:bg-fg/4 group-active:bg-fg/7";
export const RAIL_CURRENT = "bg-fg/8 shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--color-fg)_7%,transparent)]";

/** A row's icon: quiet until the row is pointed at; the current page's in the brand blue. */
export const RAIL_ICON = "h-[1.125rem] w-[1.125rem] shrink-0 transition-colors duration-150";
export const RAIL_ICON_IDLE = "text-fg-subtle group-hover:text-fg-muted";

/**
 * A hairline between the sidebar's zones (the brand, the pages, the footer). Open, it spans the
 * rows (14.5rem); collapsed, it shrinks from its left end to the 3rem of the icon column's
 * highlights (3 / 14.5 of it), centred on the rail. A transform, so it costs no layout.
 */
export const RAIL_DIVIDER = "mx-3 h-px shrink-0 origin-left bg-border/70 transition-transform duration-150 group-data-[collapsed=true]/sidebar:scale-x-[0.2069]";
