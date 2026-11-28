/*
  The one-screen workspace's class strings (ui/workspace.tsx; docs/RESPONSIVE.md, "One-screen desktop
  pages"), in a module without "use client": a server component (the admin layout, an admin page's root,
  Settings' page) reads them as strings. ui/workspace.tsx re-exports them for client components; from a
  "use client" module a server component would get a client reference in place of the string.
*/

/** The classes of every element between the shell's frame and a workspace section: a flex column the section fills, as wide as the frame. */
export const WS_COLUMN = "ws-host:flex ws-host:w-full ws-host:flex-1 ws-host:flex-col";

/** A workspace section's own classes: its parts 12px apart (space-y in the flow, a gap in the workspace's flex column). */
export const WS_SECTION = "@container/ws space-y-3 ws:flex ws:flex-1 ws:flex-col ws:gap-3 ws:space-y-0";
/** A workspace card's surface (the flow's card, unchanged) and its fill of the frame in the workspace. */
export const WS_CARD_SURFACE = "rounded-card border border-border bg-surface panel-depth";
export const WS_CARD_FILL = "ws:flex ws:flex-1 ws:flex-col";
/** A workspace card's footer: drawn in the workspace only, at the card's foot, 44px tall. */
export const WS_FOOT = "mt-auto hidden min-h-11 items-center gap-3 border-t border-border/70 px-3 ws:flex";
