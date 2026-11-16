/*
  How the reader last used the page: a pointer (a mouse, a pen, a finger) or the keyboard. A window
  opened by a tap or a click takes the focus itself, as the account screen always has; one opened
  from the keyboard gives it to its close button (DetailModal, and the tablet's menu in
  mobile-nav.tsx). Safari draws the focus ring around whatever a window focuses as it opens, and
  after a tap that lit up the close button, the loudest thing in the window; a keyboard user needs
  the ring to see where they are. A window opened by neither (a link to a game, opened as the page
  loads) gives the focus to its close button, as every window did before.

  The root layout inlines INPUT_KIND_SCRIPT at the top of <head>, beside the early-tap script
  (early-taps.ts), so every input counts from the start, even a tap made before the page's code has
  run (released to its button once it runs). It listens on window in the capture phase, before
  anything on the page can stop the event. A plain module, not a client one, so the server layout
  gets the script itself.
*/

export type InputKind = "pointer" | "keyboard";

declare global {
  interface Window {
    /** The kind of the page's last input (INPUT_KIND_SCRIPT). */
    __lastInput?: InputKind;
  }
}

/**
 * Notes each pointer press and each key press on window.__lastInput. A modifier on its own (Shift,
 * Control, Alt, Meta, held for a click) is not the keyboard being used.
 */
export const INPUT_KIND_SCRIPT = `(function(){var w=window,m=["Shift","Control","Alt","Meta"];w.addEventListener("pointerdown",function(){w.__lastInput="pointer"},true);w.addEventListener("keydown",function(e){if(m.indexOf(e.key)<0)w.__lastInput="keyboard"},true)})();`;

/** The kind of the page's last input, or null before any (and on the server). */
export function lastInput(): InputKind | null {
  return typeof window === "undefined" ? null : (window.__lastInput ?? null);
}

/**
 * Whether a window opening now takes the focus itself (opened by a tap or a click) rather than
 * giving it to its close button (opened from the keyboard, or by nothing the reader did).
 */
export function opensFocusingItself(last: InputKind | null): boolean {
  return last === "pointer";
}
