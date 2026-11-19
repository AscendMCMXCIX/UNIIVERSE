"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { DetailModal, type ModalSize } from "./detail-modal";
import { lastInput } from "./input-kind";
import { useAddressItem } from "./address-item";
import { isTyping, modalOpen, useWindowPosture } from "./posture";

/*
  Peek: a quick look at one item from a list or a board (a player, a champion, a game from a
  board), without leaving it (docs/DESIGN_SYSTEM.md §7, "Peek").

  - Wider screens: a panel docked at the right edge, over the page with a shadow and no dimming.
    The list stays live: another row switches the panel, ↑/↓ (or J/K) move the selection, and the
    selected row again, ✕, Escape or Back close it. A click outside does not close it, so scrolling,
    selecting text or using the filters never loses it.
  - Touch phones and short windows (posture.ts): the same content as a sheet from the bottom edge.
  - The item is in the page's address (`?player=`): the first open pushes one entry, switching
    replaces it, closing goes Back (address-item.ts), so Back closes it however many rows were seen.
  - The page never scrolls or shifts: the panel is fixed, and only its body scrolls, when its content
    is taller than the window (the one allowed nested scroller, its header in place).
  - Focus: opened by a click or a tap it stays on the row and the panel is announced; opened with
    Enter it moves to the panel's heading; Escape or ✕ puts it back on the row.
  - Motion: a 16px slide and fade in (200ms), a 120ms cross-fade on a switch, 140ms out; instant
    with reduced motion (globals.css).
*/

/** The id `delta` places from `current` in `ids` (no wrapping), or null past either end. */
export function stepId(ids: readonly string[], current: string | null, delta: number): string | null {
  if (current === null) return null;
  const i = ids.indexOf(current);
  if (i < 0) return null;
  return ids[i + delta] ?? null;
}

/** The key that moves a Peek's selection, as a step (-1 up, +1 down), or 0 for any other key. */
export function peekKeyStep(key: string): -1 | 0 | 1 {
  if (key === "ArrowDown" || key === "j" || key === "J") return 1;
  if (key === "ArrowUp" || key === "k" || key === "K") return -1;
  return 0;
}

/** How long the closing motion runs before the panel leaves the page (peek-out). */
const EXIT_MS = 140;

/** The selected row: a raised surface and a 2px accent bar at its left edge. Spread on the row with rowProps. */
export const PEEK_SELECTED_ROW = "relative data-[peek-selected=true]:bg-surface-3 data-[peek-selected=true]:before:absolute data-[peek-selected=true]:before:inset-y-0 data-[peek-selected=true]:before:left-0 data-[peek-selected=true]:before:w-0.5 data-[peek-selected=true]:before:bg-accent";

export interface PeekControl {
  /** The open item, or null. */
  id: string | null;
  /** Opens `id` (from a row: `from` is the row's element, for the focus to return to). */
  open: (id: string, from?: HTMLElement | null) => void;
  close: () => void;
  /** The row pressed: opens it, switches to it, or closes it when it is the one open. */
  toggle: (id: string, from?: HTMLElement | null) => void;
  /** The previous and next item, or null at either end (for ‹ ›). */
  prev: (() => void) | null;
  next: (() => void) | null;
  /** Props for a row's element: its selection state and its press. */
  rowProps: (id: string) => { "data-peek-row": string; "data-peek-selected"?: true; "aria-current"?: "true"; onClick: (e: React.MouseEvent<HTMLElement>) => void };
  /** Whether the open was from the keyboard (the panel's heading then takes the focus). */
  fromKeyboard: boolean;
  /** The query parameter the item lives in (or the parameters, for an item with several: All Champions' `champion`, `crole` and `vs`). */
  param: string | readonly string[];
}

/** The focusable element of a row: the row itself, or the first control in it. */
function rowFocusTarget(id: string): HTMLElement | null {
  const row = document.querySelector<HTMLElement>(`[data-peek-row="${CSS.escape(id)}"]`);
  if (!row) return null;
  if (row.matches("a[href], button, [tabindex]")) return row;
  return row.querySelector<HTMLElement>("a[href], button, [tabindex]:not([tabindex='-1'])") ?? row;
}

/**
 * A Peek's state for a list: the item in the address under `param` (`initial` from the page's
 * search params, for a deep link), the ids in the list's order (for ↑/↓ and ‹ ›), and the keys.
 */
export function usePeek({ param, ids, initial = null, valid: validProp }: { param: string; ids: readonly string[]; initial?: string | null; /** Ids the Peek may show beyond `ids` (a substitute opened from a turned card); ↑/↓ move through `ids` only. */ valid?: (id: string) => boolean }): PeekControl {
  const idsRef = React.useRef(ids);
  React.useLayoutEffect(() => {
    idsRef.current = ids;
  });
  const validRef = React.useRef(validProp);
  React.useLayoutEffect(() => {
    validRef.current = validProp;
  });
  const valid = React.useCallback((id: string) => idsRef.current.includes(id) || !!validRef.current?.(id), []);
  const item = useAddressItem(param, { initial, valid });
  const [fromKeyboard, setFromKeyboard] = React.useState(false);
  const id = item.id;
  const idRef = React.useRef(id);
  React.useLayoutEffect(() => {
    idRef.current = id;
  });

  const focusRow = React.useCallback((rowId: string | null) => {
    if (rowId) rowFocusTarget(rowId)?.focus({ preventScroll: true });
  }, []);
  const close = React.useCallback(() => {
    const was = idRef.current;
    const inside = !!document.activeElement?.closest("[data-peek-panel]");
    item.close();
    if (inside || document.activeElement === document.body) focusRow(was);
  }, [item, focusRow]);
  const open = React.useCallback(
    (to: string) => {
      setFromKeyboard(lastInput() === "keyboard");
      item.open(to);
    },
    [item],
  );
  const toggle = React.useCallback((to: string) => (idRef.current === to ? close() : open(to)), [open, close]);
  const move = React.useCallback(
    (delta: number) => {
      const to = stepId(idsRef.current, idRef.current, delta);
      if (!to) return;
      setFromKeyboard(false);
      item.open(to);
      // The selection follows on the list: the row takes the focus, brought into view only when it is off the screen.
      const row = rowFocusTarget(to);
      if (row && !document.activeElement?.closest("[data-peek-panel]")) {
        row.focus({ preventScroll: true });
        const r = row.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) row.scrollIntoView({ block: "nearest" });
      }
    },
    [item],
  );

  // ↑/↓ (J/K) and Escape while it is open, unless something else has them: a field, a menu, a
  // window above the page, or a control that handled the key itself.
  React.useEffect(() => {
    if (id === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || modalOpen() || isTyping(e.target)) return;
      if (e.key === "Escape") {
        // The panel's, first: heard as it is captured and kept from what has the focus (a turned
        // Team card's own Escape turns it back).
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      const step = peekKeyStep(e.key);
      if (step === 0 || e.shiftKey) return;
      e.preventDefault();
      move(step);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [id, close, move]);

  const index = id === null ? -1 : ids.indexOf(id);
  const prev = index > 0 ? () => move(-1) : null;
  const next = index >= 0 && index < ids.length - 1 ? () => move(1) : null;
  const rowProps = React.useCallback(
    (rowId: string) => {
      const selected = rowId === id;
      return {
        "data-peek-row": rowId,
        ...(selected ? { "data-peek-selected": true as const, "aria-current": "true" as const } : {}),
        onClick: () => toggle(rowId),
      };
    },
    [id, toggle],
  );
  return { id, open, close, toggle, prev, next, rowProps, fromKeyboard, param };
}

/**
 * The Peek itself: the docked panel on wider screens, a sheet on touch phones and short windows.
 * `itemKey` changes with the item (the content cross-fades); `title` names it (its heading, and the
 * announcement); `children` is the item's content, the same in both forms. `actions`: links in the
 * header beside ‹ › (an "Open full profile").
 */
export function Peek({ peek, title, itemKey, children, actions, hero, windowSize = "sheet", windowHeader, windowTitleId, testId = "peek", navTestIds, label }: {
  peek: PeekControl;
  title: string;
  itemKey: string | null;
  children: React.ReactNode;
  actions?: React.ReactNode;
  /** The item's picture and identity, edge to edge at the top of the panel's body. */
  hero?: React.ReactNode;
  /** The window's size where it opens as one (touch phones, short windows): a sheet, or the whole screen for a long item. */
  windowSize?: ModalSize;
  /** The window's own header there (DetailModal's `header`, with an element of id `windowTitleId`), in place of its title bar and the hero. */
  windowHeader?: React.ReactNode;
  windowTitleId?: string;
  testId?: string;
  /** Test ids of ‹ › and ✕ (default `${testId}-prev` and so on). */
  navTestIds?: { prev?: string; next?: string; close?: string };
  /** What the panel holds, for its name ("Player"); the title follows it. */
  label: string;
}) {
  const windowed = useWindowPosture();
  const open = peek.id !== null && itemKey !== null;
  // The last item shown, kept through the closing motion.
  const [shown, setShown] = React.useState<{ key: string; title: string; children: React.ReactNode } | null>(open ? { key: itemKey, title, children } : null);
  const [closing, setClosing] = React.useState(false);
  if (open && (shown?.key !== itemKey || shown.title !== title)) setShown({ key: itemKey, title, children });
  // Opened again during its closing motion (the same row pressed twice quickly): open, not closing.
  if (open && closing) setClosing(false);
  if (!open && shown && !closing) setClosing(true);
  React.useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => {
      setShown(null);
      setClosing(false);
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  // The content: the item's own while open, the last one shown while it closes.
  const body = open ? children : shown?.children;
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const opened = open && !closing;
  const fromKeyboard = peek.fromKeyboard;
  React.useEffect(() => {
    if (opened && fromKeyboard && !windowed) headingRef.current?.focus({ preventScroll: true });
  }, [opened, fromKeyboard, windowed, itemKey]);

  const nav = (
    <div className="flex items-center gap-1">
      {actions}
      <button type="button" onClick={peek.prev ?? undefined} disabled={!peek.prev} aria-label={`Previous ${label.toLowerCase()}`} className={NAV} data-testid={navTestIds?.prev ?? `${testId}-prev`}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" onClick={peek.next ?? undefined} disabled={!peek.next} aria-label={`Next ${label.toLowerCase()}`} className={NAV} data-testid={navTestIds?.next ?? `${testId}-next`}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );

  if (windowed) {
    return (
      <DetailModal open={open} onClose={peek.close} title={shown?.title ?? title} size={windowSize} headerExtra={nav} header={windowHeader} headerClassName={windowHeader ? "overflow-hidden" : undefined} titleId={windowTitleId} testId={testId} closeTestId={navTestIds?.close ?? `${testId}-close`}>
        {shown ? (
          <div key={shown.key}>
            {windowHeader ? null : hero}
            {body}
          </div>
        ) : null}
      </DetailModal>
    );
  }
  if (!shown) return null;
  return (
    <aside
      data-peek-panel
      aria-labelledby={`${testId}-heading`}
      data-closing={closing || undefined}
      className="fixed right-0 top-[var(--bar-top)] isolate bottom-0 z-30 flex w-[clamp(26rem,34vw,36rem)] max-w-full flex-col border-l border-border bg-bg-elevated shadow-2xl shadow-black/50 motion-safe:peek-in data-[closing=true]:peek-out max-md:bottom-[calc(4rem+env(safe-area-inset-bottom))]"
      data-testid={testId}
      data-peek-item={shown.key}
    >
      {/* With a hero (the item's picture and name), the controls sit over its top right corner and the
          heading is read, not shown: the hero shows the name, and the panel keeps its height for the content. */}
      <header className={cn("flex min-h-12 shrink-0 items-center gap-2 px-4", hero ? "pointer-events-none absolute inset-x-0 top-0 z-10 justify-end px-3 *:pointer-events-auto" : "border-b border-border")}>
        <h2 ref={headingRef} tabIndex={-1} id={`${testId}-heading`} className={cn("min-w-0 flex-1 truncate text-base font-semibold outline-none focus-visible:outline-2 focus-visible:outline-accent", hero && "sr-only")}>
          <span className="sr-only">{label}: </span>
          {shown.title}
        </h2>
        {nav}
        <span className={cn("mx-1 h-5 w-px bg-border", hero && "hidden")} aria-hidden />
        <button type="button" onClick={peek.close} aria-label={`Close ${label.toLowerCase()}`} className={NAV} data-testid={navTestIds?.close ?? `${testId}-close`}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>
      {/* The panel's controls are in its header, not over its content: content drawn to clear a window's corner controls (BELOW_CONTROLS) needs only a little room here, and a hero ('--peek-hero-min') only its content's height. */}
      <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain [--modal-clear-top:2.5rem] [--peek-hero-min:0rem]" data-testid={`${testId}-body`}>
        <div key={shown.key} className="motion-safe:swap-in">
          {hero}
          <div className="px-4 py-3">{body}</div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {opened ? `${label} ${shown.title} shown` : ""}
      </p>
    </aside>
  );
}

const NAV = "inline-flex h-9 w-9 items-center justify-center rounded-lg bg-bg/60 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-11";
