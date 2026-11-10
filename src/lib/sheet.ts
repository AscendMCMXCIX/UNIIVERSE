/*
  The phone's account screen (components/mobile-nav.tsx, components/install/install-app.tsx,
  components/mode-switch.tsx): full-width rows, 52px tall, an icon, a name and (for a page) a chevron,
  in groups on panels with hairlines between them. At the usual text size the screen holds them all
  at once on phones from 375pt wide (an administrator's scrolls a little in Safari's tab on a 320pt
  one); it scrolls as one region below its header where it must.
*/

/** A group of rows: one panel, hairlines between its rows. */
export const ACCOUNT_GROUP = "overflow-hidden rounded-panel border border-border bg-bg-elevated divide-y divide-border";
/** A row's shape: full width, 52px, an icon then its name, the shared focus ring drawn inside it. */
export const ACCOUNT_ROW =
  "flex min-h-13 w-full items-center gap-3.5 px-4 text-left text-base font-medium transition-colors duration-150 hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";
/** A row for another page or an action. */
export const ACCOUNT_ROW_IDLE = "text-fg";
/** The row of the page being shown. */
export const ACCOUNT_ROW_CURRENT = "bg-accent/10 text-fg";
/** A row's icon. */
export const ACCOUNT_ROW_ICON = "h-5 w-5 shrink-0";
/** A page row's chevron, at its end. */
export const ACCOUNT_ROW_CHEVRON = "ml-auto h-4 w-4 shrink-0 text-fg-subtle";

