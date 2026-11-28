/*
  The champion preview is drawn in more than one place (docs/RESPONSIVE.md, "All Champions'
  workspace"): the workspace's or the flow's layout of its opponents, in the pane beside the list, in
  the workspace window or in the sheet. A zoom, a resize, the sidebar or a tablet turned replaces one
  drawing by another, and with it the control the reader had focused: its counterpart in the new one
  takes the focus (the same opponent's row, the same heading or control), never the page's body, so
  a keyboard's or a screen reader's place is kept across the switch.
*/

/** What had the focus in a drawing of the preview: the same control in another drawing is found by it. */
export interface FocusMark {
  el: Element;
  /** The opponent whose row or cell it was in. */
  row: string | null;
  id: string | null;
  /** Its own test id, or its nearest ancestor's (the control it is part of). */
  testId: string | null;
}

export function markFocus(el: Element): FocusMark {
  return { el, row: el.closest<HTMLElement>("[data-opponent-row]")?.dataset.opponentRow ?? null, id: el.id || null, testId: el.closest<HTMLElement>("[data-testid]")?.dataset.testid ?? null };
}

const FOCUSABLE = "button, a[href], input, [tabindex]";
/** The element itself where it takes the focus, else the first control in it. */
const focusable = (el: HTMLElement | null): HTMLElement | null => (el && !el.matches(FOCUSABLE) ? el.querySelector<HTMLElement>(FOCUSABLE) : el);
const drawn = (el: HTMLElement | null | undefined): el is HTMLElement => !!el && el.getClientRects().length > 0;

/**
 * The very control `mark` names in `root`, once it is drawn: the same opponent's row (never another
 * opponent's), else the element with its id, else the first with its test id; null until then.
 */
export function sameControl(root: ParentNode, mark: FocusMark): HTMLElement | null {
  const el = mark.row ? root.querySelector<HTMLElement>(`[data-opponent-row="${CSS.escape(mark.row)}"]`) : mark.id ? document.getElementById(mark.id) : mark.testId ? root.querySelector<HTMLElement>(`[data-testid="${CSS.escape(mark.testId)}"]`) : null;
  const target = focusable(el);
  return drawn(target) ? target : null;
}

/**
 * Focuses the counterpart of `mark` in `root` (the same opponent's row, the element with its id, the
 * first with its test id), else the first of `fallbacks` that is drawn and takes the focus. True once
 * one has it.
 */
export function focusCounterpart(root: ParentNode, mark: FocusMark | null, fallbacks: ReadonlyArray<HTMLElement | null>): boolean {
  const candidates = [
    mark?.row ? root.querySelector<HTMLElement>(`[data-opponent-row="${CSS.escape(mark.row)}"]`) : null,
    mark?.id ? document.getElementById(mark.id) : null,
    mark?.testId ? root.querySelector<HTMLElement>(`[data-testid="${CSS.escape(mark.testId)}"]`) : null,
    ...fallbacks,
  ];
  for (const el of candidates) {
    const target = focusable(el);
    if (!drawn(target)) continue;
    target.focus({ preventScroll: true });
    if (document.activeElement === target) return true;
  }
  return false;
}
