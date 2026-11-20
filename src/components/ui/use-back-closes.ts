"use client";

import * as React from "react";

/** The mark a window's own history entry carries, beside Next.js's own state for the page (kept). */
const KEY = "__uniiverseWindow";

const markOf = (): string | null => ((window.history.state as Record<string, unknown> | null)?.[KEY] as string | undefined) ?? null;

/** A window opened as another closes (the account screen's Install App) takes over the entry it leaves. */
let handedOver = false;

/**
 * Back closes the window and the page stays as it is (docs/MOBILE.md, "Back"). While `open`, the
 * window has a history entry of its own: the same address, with Next.js's state for the page kept
 * and the window's mark beside it. The browser's Back (a phone's system Back, the installed Android
 * app's, a desktop's button) leaves that entry, and `onBack` closes the window; nothing else moves.
 * Android's back gesture asks an open <dialog> to close first (its close request), and the window
 * then takes its entry away as below, so the two end the same.
 *
 * Closed any other way (its close button, Escape, the backdrop, a choice in it), the window takes
 * its entry away again (history.back), so Back afterwards leaves the page as before. A link in the
 * window that leaves the page replaces the entry instead (`replace`, while the window is open, and
 * `leaving()` before it closes), so Back from the page it opens comes back to this page, never to an
 * entry of the window. A window opened as this one closes (`handOver()` first) takes over its entry.
 * Forward onto an entry a window left opens nothing: coming back to a page never opens a window
 * unasked. The entry stays a forward step of the same page, which the top bar's Back passes over
 * (backSteps).
 */
export function useBackCloses(open: boolean, onBack: () => void, { collapse = false }: { collapse?: boolean } = {}): { replace: boolean; leaving: () => void; handOver: () => void } {
  const id = React.useId();
  const latest = React.useRef(onBack);
  React.useLayoutEffect(() => {
    latest.current = onBack;
  });
  // How this window is closing, when it is not by Back or its own controls.
  const ending = React.useRef<"leave" | "hand" | null>(null);
  React.useEffect(() => {
    if (!open) return;
    ending.current = null;
    const state = (window.history.state as Record<string, unknown> | null) ?? {};
    if (handedOver && state[KEY]) window.history.replaceState({ ...state, [KEY]: id }, "");
    else window.history.pushState({ ...state, [KEY]: id }, "");
    handedOver = false;
    // Where the entry was pushed: the page, and how many entries the tab then had (collapse, below).
    const path = window.location.pathname;
    const length = window.history.length;
    let gone = false;
    const onPop = () => {
      if (gone || markOf() === id) return;
      gone = true;
      latest.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (gone) return;
      if (ending.current === "hand") {
        handedOver = true;
        return;
      }
      if (ending.current === "leave") return;
      if (markOf() !== id) {
        // `collapse`: what is open replaced this page's query (a filter chosen in the Filters), so
        // the entry now holds the new address and the one under it the old. Two entries for one
        // change would make Back undo the filter instead of leaving the page (every filter replaces
        // the entry), so they become one: Back to the entry under it, unheard by the router (its
        // state is the new address's already), which then takes the new address and its state.
        if (collapse && window.location.pathname === path && window.history.length === length) {
          const kept = window.history.state;
          const href = window.location.href;
          const swallow = (e: PopStateEvent) => {
            window.removeEventListener("popstate", swallow, true);
            // Heard first (a capture listener on the window runs before the router's), and kept from it.
            e.stopImmediatePropagation();
            window.history.replaceState(kept, "", href);
          };
          window.addEventListener("popstate", swallow, true);
          window.history.back();
        }
        return;
      }
      window.history.back();
    };
  }, [open, id, collapse]);
  const leaving = React.useCallback(() => {
    ending.current = "leave";
  }, []);
  const handOver = React.useCallback(() => {
    ending.current = "hand";
  }, []);
  return { replace: open, leaving, handOver };
}
