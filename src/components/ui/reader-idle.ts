"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

/*
  A list that writes its own address (a server-paged list's page size in the one-screen workspace:
  docs/RESPONSIVE.md, "One-screen desktop pages", server-paged lists) must never overtake the reader's
  own navigation: a link followed a moment after the page arrived (Encounters, an order, a filter), whose
  page is still on its way, would otherwise be replaced by the list's write, which starts later and wins.
  So the write waits while the reader is acting: from any press, click or key until READER_IDLE_MS after
  it. Their navigation then either lands (the list's data changes, and its write is worked out again from
  the new page) or does not (nothing came of the press), and the write goes ahead.

  A Back or a Forward is the reader's too, and no press inside the page shows it: while the page it leads
  to is on its way, the window's address is already that page's (or another view's of this one) and this
  page is still drawn. So the write also waits while the window's address is not the one this page drew
  (`own` aside: the keys the list writes itself). It is cancelled when the page goes, and goes ahead if
  the address comes back: never onto another page's address (the sectioned workspace's rule,
  ui/sectioned-workspace.tsx, addressTarget).
*/

/** How long after the reader's last press, click or key a list's own address write waits. */
export const READER_IDLE_MS = 1500;

let last = -Infinity;
let listening = 0;
const note = () => {
  last = performance.now();
};

/** Whether the reader pressed, clicked or typed within the last `ms` (pure, for its unit test). */
export function readerBusy(now: number, lastAct: number, ms = READER_IDLE_MS): boolean {
  return now - lastAct < ms;
}

/**
 * Whether the window's address (`at`) is still the one the page drew (pure, for its unit test): the same path,
 * and the same query but for `own`, the keys the list writes itself (its page size, its page, an open game).
 */
export function onDrawnAddress(drawn: { pathname: string; search: string }, at: { pathname: string; search: string }, own: readonly string[]): boolean {
  if (drawn.pathname !== at.pathname) return false;
  const rest = (search: string) => {
    const q = new URLSearchParams(search);
    for (const k of own) q.delete(k);
    q.sort();
    return q.toString();
  };
  return rest(drawn.search) === rest(at.search);
}

/**
 * A function telling whether the reader is acting now: READER_IDLE_MS since their last press, click or key,
 * or, with `own` (the keys the list writes itself), a Back or a Forward on its way (the window's address
 * is not the one this page drew: onDrawnAddress). A list's own address write waits while it is true.
 */
export function useReaderBusy(own?: readonly string[]): () => boolean {
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const drawn = React.useRef({ pathname, search });
  React.useLayoutEffect(() => {
    drawn.current = { pathname, search };
  });
  const keys = own ? own.join(",") : null;
  React.useEffect(() => {
    if (listening++ === 0) for (const t of ["pointerdown", "click", "keydown"]) window.addEventListener(t, note, { capture: true, passive: true });
    return () => {
      if (--listening === 0) for (const t of ["pointerdown", "click", "keydown"]) window.removeEventListener(t, note, { capture: true });
    };
  }, []);
  return React.useCallback(() => readerBusy(performance.now(), last) || (keys !== null && !onDrawnAddress(drawn.current, window.location, keys ? keys.split(",") : [])), [keys]);
}

/** Runs `write` once the reader is not acting (checking every `step` ms); returns the cancel. */
export function whenReaderIdle(busy: () => boolean, write: () => void, first: number, step = 250): () => void {
  let t = 0;
  const tick = () => {
    if (busy()) t = window.setTimeout(tick, step);
    else write();
  };
  t = window.setTimeout(tick, first);
  return () => window.clearTimeout(t);
}
