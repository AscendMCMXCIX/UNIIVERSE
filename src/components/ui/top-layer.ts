/*
  The browser's top layer. Every window is a modal <dialog> (DetailModal, and the tablet's menu in
  mobile-nav.tsx): the browser draws it above the whole page, whatever the page's own stacking, and
  while it is open everything outside it is inert. What must show over a window (an ⓘ's bubble, the
  toasts) is therefore drawn inside the topmost one: no z-index on the page lifts anything above the
  top layer, and a button left outside a window cannot be pressed.

  The windows say when they open and close (noteModalOpened, noteModalClosed). The top layer's order
  is the order in which they opened, which the page's own order need not follow, and most windows
  leave the page while still open (their owner stops rendering them), which changes no attribute a
  MutationObserver could see. A window says it is closing as it goes, while it is still on the page
  (a layout effect's cleanup), so what was drawn in it is drawn elsewhere before the next frame.
  A plain module, used by client components only.
*/

/** When each open window opened: one opened later is drawn above one opened earlier. */
const opened = new WeakMap<Element, number>();
/** Windows that have said they are closing: no longer counted, though still on the page for a moment. */
const closing = new WeakSet<Element>();
let sequence = 0;
const listeners = new Set<() => void>();

/**
 * The topmost of these open modal dialogs, given the order they opened in (0 for one never noted):
 * the one opened last; of two alike, the later in the page. Null for none.
 */
export function topmostModal<T>(dialogs: readonly T[], order: (dialog: T) => number): T | null {
  let top: T | null = null;
  let latest = -Infinity;
  for (const dialog of dialogs) {
    const n = order(dialog);
    if (n >= latest) {
      latest = n;
      top = dialog;
    }
  }
  return top;
}

/** A modal dialog: one shown with showModal(), in the top layer (`:modal`, Safari 15.6 and later). */
function isModal(dialog: HTMLDialogElement): boolean {
  try {
    return dialog.matches(":modal");
  } catch {
    return true;
  }
}

/** The open window drawn above every other, or null while none is open. */
export function topModal(): HTMLDialogElement | null {
  if (typeof document === "undefined") return null;
  const open = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).filter((dialog) => !closing.has(dialog) && isModal(dialog));
  return topmostModal(open, (dialog) => opened.get(dialog) ?? 0);
}

/** A window has just been shown (showModal): it is now the topmost. */
export function noteModalOpened(dialog: HTMLDialogElement): void {
  closing.delete(dialog);
  opened.set(dialog, ++sequence);
  emit();
}

/** A window is closing, or leaving the page while open: it no longer counts, from now. */
export function noteModalClosed(dialog: HTMLDialogElement): void {
  opened.delete(dialog);
  closing.add(dialog);
  emit();
}

/** Calls `listener` whenever a window opens or closes (useSyncExternalStore's subscribe). */
export function subscribeModals(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}
