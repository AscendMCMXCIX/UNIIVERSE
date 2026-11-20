/**
 * A window's own icon controls on a touch screen (‹ ›, ✕, and the actions beside them): 44px at
 * every text size. They hold no text, so a larger text size gives them nothing to show; in rem they
 * were 88px each at 200%, and ‹ › ✕ with an action no longer fitted a 320px screen ("Previous
 * player" 9px past its left edge, Release 9's report) nor a collapsed header its quarter of the
 * screen. Their icons still grow with the text.
 */
export const WINDOW_CONTROL_TOUCH = "pointer-coarse:h-[44px] pointer-coarse:w-[44px] pointer-coarse:min-w-[44px] pointer-coarse:min-h-[44px]";
