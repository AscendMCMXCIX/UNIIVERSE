/*
  How the reader last used the page: a pointer (a mouse, a pen, a finger) or the keyboard. A window
  opened by a tap or a click takes the focus itself, as the account screen always has; one opened
  from the keyboard gives it to its close button (DetailModal, and the tablet's menu in
  mobile-nav.tsx). Safari draws the focus ring around whatever a window focuses as it opens, and
  after a tap that lit up the close button, the loudest thing in the window; a keyboard user needs
  the ring to see where they are. A window opened by neither (a link to a game, opened as the page
  loads) gives the focus to its close button, as every window did before. A window holds the focus
  it took only until it is pressed or the focus moves on (focusWindow), and a press inside any window
  on nothing focusable leaves nothing focused, as a press on a page's text does (letGoWhenPressed),
  so the keys still scroll its body.

  The root layout inlines INPUT_KIND_SCRIPT at the top of <head>, beside the early-tap script
  (early-taps.ts), so every input counts from the start, even a tap made before the page's code has
  run (released to its button once it runs). It listens on window in the capture phase, before
  anything on the page can stop the event. A plain module, not a client one, so the server layout
  gets the script itself.

  The script also notes what the mouse last moved over, from the page's first move on. An ⓘ opens
  its bubble as a mouse moves over it (InfoTip), and a move made while the page hydrates is heard by
  nothing else: React replays a pointer's coming in once the ⓘ has hydrated, never its moves, so a
  mouse that moved onto an ⓘ then and rests on it still opens it as the ⓘ hydrates (lastMouseMove).
*/

export type InputKind = "pointer" | "keyboard";

declare global {
  interface Window {
    /** The kind of the page's last input (INPUT_KIND_SCRIPT). */
    __lastInput?: InputKind;
    /** What the mouse last moved over (INPUT_KIND_SCRIPT). */
    __lastMouseMove?: EventTarget | null;
  }
}

/**
 * Notes each pointer press and each key press on window.__lastInput. A modifier on its own (Shift,
 * Control, Alt, Meta, held for a click) is not the keyboard being used. Notes what each move of a
 * mouse lands on on window.__lastMouseMove (a pen's and a finger's moves are not a mouse's).
 */
export const INPUT_KIND_SCRIPT = `(function(){var w=window,m=["Shift","Control","Alt","Meta"];w.addEventListener("pointerdown",function(){w.__lastInput="pointer"},true);w.addEventListener("keydown",function(e){if(m.indexOf(e.key)<0)w.__lastInput="keyboard"},true);w.addEventListener("pointermove",function(e){if(e.pointerType==="mouse")w.__lastMouseMove=e.target},true)})();`;

/** The kind of the page's last input, or null before any (and on the server). */
export function lastInput(): InputKind | null {
  return typeof window === "undefined" ? null : (window.__lastInput ?? null);
}

/** What the mouse last moved over, or null before any move (and on the server). */
export function lastMouseMove(): EventTarget | null {
  return typeof window === "undefined" ? null : (window.__lastMouseMove ?? null);
}

/**
 * Whether a window opening now takes the focus itself (opened by a tap or a click) rather than
 * giving it to its close button (opened from the keyboard, or by nothing the reader did).
 */
export function opensFocusingItself(last: InputKind | null): boolean {
  return last === "pointer";
}

/**
 * A window takes the focus itself (its <dialog>, drawn without a ring), and holds it only until the
 * focus moves on (Tab, a field of the window's own) or a pointer presses inside it: its tabindex -1
 * goes then, heard on the press's way down, before the browser gives the focus to what it lands on.
 * The press itself leaves the focus as on a page through letGoWhenPressed, which every window has:
 * Chromium and WebKit focus a <dialog> with or without a tabindex, so dropping the tabindex alone
 * left the focus on the window, and the keys scrolled nothing. The focus leaving with the page
 * itself (another tab or app in front) is not the focus moving on: the window has it back when the
 * reader returns. Returns the way to let go, for a window that closes first.
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

/**
 * A press inside a window leaves the focus where a press on a page leaves it: on what it lands on
 * when that takes the focus (a field, a link), else on nothing. Chromium and WebKit focus a modal
 * <dialog> itself, with or without a tabindex (the dialog focusing steps make it focusable), when a
 * press inside it lands on nothing focusable: its text, a card, a button in Safari, which does not
 * focus buttons. The keys scroll from the focused element up; a window does not scroll itself (its
 * body inside it does) and the page behind is locked, so Space, Page Down and the arrows then
 * scrolled nothing. So once the press has handed the focus out (the task of its mousedown, which a
 * tap sends too, as it ends), a window holding the focus itself lets it go: nothing has the focus,
 * and the keys scroll what was pressed, as on a page. Returns the way to stop, for a window that
 * closes.
 */
export function letGoWhenPressed(dialog: HTMLElement): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onPress = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (dialog.ownerDocument.activeElement === dialog) dialog.blur();
    });
  };
  dialog.addEventListener("mousedown", onPress, true);
  return () => {
    clearTimeout(timer);
    dialog.removeEventListener("mousedown", onPress, true);
  };
}
