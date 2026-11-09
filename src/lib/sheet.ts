/*
  The phone account sheet's tiles (components/mobile-nav.tsx, components/install/install-app.tsx):
  a page or an action as its icon over its name, three to a row on an upright phone and more on one
  held sideways, each at least 64px tall. The sheet once listed these as full-width 48px rows, one
  under another, which in Admin Mode no longer fitted a small phone (its last rows, Sign out among
  them, sat below the sheet's own scroll) and on a phone held sideways left the sheet a scrolling
  window. As tiles, everything fits one short screen.
*/

/** A tile's shape: icon over a name of up to two lines, finger-sized, with the shared focus ring. */
export const SHEET_TILE =
  "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-panel border px-2 py-2.5 text-center text-xs font-medium leading-tight transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97] motion-reduce:active:scale-100";
/** A tile for another page or an action. */
export const SHEET_TILE_IDLE = "border-border bg-surface/60 text-fg-muted hover:border-border-strong hover:bg-surface-2 hover:text-fg";
/** The tile of the page being shown. */
export const SHEET_TILE_CURRENT = "border-accent/50 bg-accent/10 text-fg";
/** A tile's icon (coloured for the current page). */
export const SHEET_TILE_ICON = "h-5 w-5 shrink-0";
