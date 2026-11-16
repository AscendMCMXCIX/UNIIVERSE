/*
  The browser's top layer. Every window is a modal <dialog> (DetailModal, and the tablet's menu in
  mobile-nav.tsx): the browser draws it above the whole page, whatever the page's own stacking, and
  while it is open everything outside it is inert. What must show over a window (an ⓘ's bubble, the
  toasts) is therefore drawn inside the topmost one: no z-index on the page lifts anything above the
  top layer, and a button left outside a window cannot be pressed.

  The windows say when they open, when they come to rest and when they close (noteModalOpened,
  noteModalAtRest, noteModalClosed). The top layer's order is the order in which they opened, which
  the page's own order need not follow, and most windows leave the page while still open (their
  owner stops rendering them), which changes no attribute a MutationObserver could see.

  A window moving (its opening motion, its closing one) has a transform, which makes it the box what
  is fixed inside it is placed in: toasts drawn in it would ride the motion, out of their place on
  the screen. So the toasts go into a window once it is at rest, and leave it as soon as it starts
  to close (it says so as its closing motion starts, while it is still on the page); while a window
  moves in, they stay where they were, under it (`opening`), out of sight and out of reach for that
  moment. An ⓘ's bubble goes into the window its trigger sits in at once, and follows its motion
  (info-tip.tsx). A plain module, used by client components only.
*/

/** When each open window opened: one opened later is drawn above one opened earlier. */
const order = new WeakMap<Element, number>();
/** Windows that have come to rest: done moving in. */
const resting = new WeakSet<Element>();
/** Windows that have said they are closing: no longer counted, though still on the page for a moment. */
const closing = new WeakSet<Element>();
let sequence = 0;
const listeners = new Set<() => void>();

/**
 * The topmost of these open modal dialogs, given the order they opened in (0 for one never noted):
 * the one opened last; of two alike, the later in the page. Null for none.
 */
export function topmostModal<T>(dialogs: readonly T[], orderOf: (dialog: T) => number): T | null {
  let top: T | null = null;
  let latest = -Infinity;
  for (const dialog of dialogs) {
    const n = orderOf(dialog);
    if (n >= latest) {
      latest = n;
      top = dialog;
    }
  }
  return top;
}

/** Where what shows over the windows is drawn, and whether a window still moving in covers it. */
export interface TopLayer {
  /** The topmost open window at rest, or null: the page. */
  host: HTMLDialogElement | null;
  /** A window above `host` is still moving in: `host` is out of sight and out of reach under it. */
  opening: boolean;
}

/**
 * The top layer, of these open windows (in any order): the topmost at rest is the host, and it is
 * covered while the topmost of them all is another, still moving in.
 */
export function layerOf<T>(open: readonly T[], orderOf: (dialog: T) => number, atRest: (dialog: T) => boolean): { host: T | null; opening: boolean } {
  const host = topmostModal(open.filter(atRest), orderOf);
  return { host, opening: topmostModal(open, orderOf) !== host };
}

/** A modal dialog: one shown with showModal(), in the top layer (`:modal`, Safari 15.6 and later). */
function isModal(dialog: HTMLDialogElement): boolean {
  try {
    return dialog.matches(":modal");
  } catch {
    return true;
  }
}

const orderOf = (dialog: Element) => order.get(dialog) ?? 0;
/** At rest: come to rest, or never noted (nothing says it moves). */
const atRest = (dialog: Element) => resting.has(dialog) || !order.has(dialog);

const NONE: TopLayer = { host: null, opening: false };
let current = NONE;

/**
 * The top layer now: the same object until it changes (useSyncExternalStore's snapshot). The open
 * windows are the modal dialogs on the page that have not said they are closing.
 */
export function topLayer(): TopLayer {
  if (typeof document === "undefined") return NONE;
  const open = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).filter((dialog) => !closing.has(dialog) && isModal(dialog));
  const next = layerOf(open, orderOf, atRest);
  if (next.host !== current.host || next.opening !== current.opening) current = next;
  return current;
}

/** No window: the server's answer, and the first render's (what hydrates is drawn in place). */
export function noTopLayer(): TopLayer {
  return NONE;
}

/** The topmost open window at rest, or null while none is. */
export function topModal(): HTMLDialogElement | null {
  return topLayer().host;
}

/** A window has just been shown (showModal): the topmost, moving in until noteModalAtRest. */
export function noteModalOpened(dialog: HTMLDialogElement): void {
  closing.delete(dialog);
  resting.delete(dialog);
  order.set(dialog, ++sequence);
  emit();
}

/** An open window has come to rest: its opening motion is over (at once without one). */
export function noteModalAtRest(dialog: HTMLDialogElement): void {
  if (!order.has(dialog) || resting.has(dialog)) return;
  resting.add(dialog);
  emit();
}

/** A window starts to close, or leaves the page while open: it no longer counts, from now. */
export function noteModalClosed(dialog: HTMLDialogElement): void {
  if (closing.has(dialog) && !order.has(dialog)) return;
  order.delete(dialog);
  resting.delete(dialog);
  closing.add(dialog);
  emit();
}

/** Calls `listener` whenever a window opens, comes to rest or closes (useSyncExternalStore's subscribe). */
export function subscribeModals(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}
