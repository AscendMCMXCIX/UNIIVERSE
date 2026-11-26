/**
 * A window's own icon controls on a touch screen (‹ ›, ✕, and the actions beside them): 44px at
 * every text size. They hold no text, so a larger text size gives them nothing to show; in rem they
 * were 88px each at 200%, and ‹ › ✕ with an action no longer fitted a 320px screen ("Previous
 * player" 9px past its left edge, Release 9's report) nor a collapsed header its quarter of the
 * screen. Their icons still grow with the text.
 */
export const WINDOW_CONTROL_TOUCH = "pointer-coarse:h-[44px] pointer-coarse:w-[44px] pointer-coarse:min-w-[44px] pointer-coarse:min-h-[44px]";

/**
 * A labelled close button ("✕ Close"), for a window whose close must be its most prominent action
 * (the owner's request for All Champions' preview, 25 Nov 2026: "a prominent, easily accessible close
 * action"): the same button beside the list (the docked pane) and in the phone's sheet (DetailModal's
 * `closeLabel`), outlined, the word beside the ✕, 36px, and 44px tall on touch screens, where it
 * stays as tall as the ‹ › beside it at every text size and grows only when its word needs more.
 */
export const LABELLED_CLOSE =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border-control bg-bg-elevated px-3 text-sm font-medium text-fg transition-colors duration-150 hover:border-fg-subtle hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-auto pointer-coarse:min-h-[44px]";
