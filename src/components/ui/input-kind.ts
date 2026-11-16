/*
  How the reader last used the page: a pointer (a mouse, a pen, a finger) or the keyboard. A window
  opened by a tap or a click takes the focus itself, as the account screen always has; one opened
  from the keyboard gives it to its close button (DetailModal, and the tablet's menu in
  mobile-nav.tsx). Safari draws the focus ring around whatever a window focuses as it opens, and
  after a tap that lit up the close button, the loudest thing in the window; a keyboard user needs
  the ring to see where they are. A window opened by neither (a link to a game, opened as the page
  loads) gives the focus to its close button, as every window did before. A window holds the focus
  it took only until it is pressed or the focus moves on (focusWindow): a press inside it then lets
  the focus go as a page does, so the keys still scroll its body.

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

/**
 * A window takes the focus itself (its <dialog>, drawn without a ring), focusable only while it
 * holds that focus: tabindex -1 until the focus moves on (Tab, a field of the window's own) or a
 * pointer presses inside it. A press then finds nothing focusable around what it lands on, as on a
 * page: the focus is let go, the keys scroll whatever holds the press (the window's body; a focused
 * window that does not scroll itself held them, and nothing moved), and a tap on text never moves
 * the focus off a field onto the window. The press is heard on its way down, before the browser
 * gives the focus to what it lands on. The focus leaving with the page itself (another tab or app in
 * front) is not the focus moving on: the window has it back when the reader returns. Returns the way
 * to let go, for a window that closes first.
 */
export function focusWindow(dialog: HTMLElement): () => void {
  const letGo = () => {
    dialog.removeEventListener("pointerdown", letGo, true);
    dialog.removeEventListener("focusout", onOut);
    dialog.removeAttribute("tabindex");
  };
  const onOut = (e: Event) => {
    if (e.target === dialog && dialog.ownerDocument?.hasFocus?.() !== false) letGo();
  };
  dialog.tabIndex = -1;
  dialog.addEventListener("pointerdown", letGo, true);
  dialog.addEventListener("focusout", onOut);
  dialog.focus({ preventScroll: true });
  return letGo;
}
