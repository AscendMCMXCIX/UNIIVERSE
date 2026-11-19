/*
  The phone's account screen (components/mobile-nav.tsx, components/install/install-app.tsx,
  components/mode-switch.tsx): full-width rows, 52px tall, an icon, a name and (for a page) a chevron,
  in groups on panels with hairlines between them. At the usual text size the screen holds them all
  at once on phones from 375pt wide (docs/MOBILE.md has the few exceptions measured); it scrolls as
  one region below its header where it must.

  At a larger text size on a narrow phone a row gives its words the room first: they wrap between
  words (never inside one: a word longer than its line ends in an ellipsis), the page's chevron goes
  where the row is narrower than 12rem (150% text on a 320px phone, 175% on 375px) and the icons
  where it is narrower than 10.25rem (175% on 320px, 200% on 375px), so the longest word of any row
  (Admin Mode's "Integrations", 5.69rem; Player Mode's "Resources", 5.06rem) keeps a line of its own
  whole. Each threshold is under the narrowest row at 100% (17.9rem on a 320px phone), so at the
  usual size nothing moves.
*/

/** A group of rows: one panel, hairlines between its rows; the container its rows give way by (`rows`). */
export const ACCOUNT_GROUP = "@container/rows overflow-hidden rounded-panel border border-border bg-bg-elevated divide-y divide-border";
/** A row's shape: full width, at least 52px, an icon then its name, the shared focus ring drawn inside it. */
export const ACCOUNT_ROW =
  "flex min-h-13 w-full items-center gap-3.5 px-4 text-left text-base font-medium transition-colors duration-150 hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";
/** A row for another page or an action. */
export const ACCOUNT_ROW_IDLE = "text-fg";
/** The row of the page being shown. */
export const ACCOUNT_ROW_CURRENT = "bg-accent/10 text-fg";
/** A row's icon: it gives way under 10.25rem of row (above). */
export const ACCOUNT_ROW_ICON = "h-5 w-5 shrink-0 @max-[10.25rem]/rows:hidden";
/** A row's name: it wraps between words, and a word longer than its line ends in an ellipsis. */
export const ACCOUNT_ROW_LABEL = "min-w-0 flex-1 overflow-hidden text-ellipsis";
/** A page row's chevron, at its end: it gives way under 12rem of row (above). */
export const ACCOUNT_ROW_CHEVRON = "ml-auto h-4 w-4 shrink-0 text-fg-subtle @max-[12rem]/rows:hidden";
