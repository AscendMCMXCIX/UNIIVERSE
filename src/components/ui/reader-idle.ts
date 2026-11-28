"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

/*
  A list that writes its own address (a server-paged list's page size in the one-screen workspace:
  docs/RESPONSIVE.md, "One-screen desktop pages", server-paged lists) must never overtake the reader's
  own navigation: a link followed a moment after the page arrived (Encounters, an order, a filter), whose
  page is still on its way, would otherwise be replaced by the list's write, which starts later and wins.
  So the write waits while the reader is acting: from any press, click or key until READER_IDLE_MS after
  it, and from a navigation they started (a link followed, a filter chosen: noteNavigation) until the
  list's data next arrives, however long the server takes (a cold function, a heavy view), up to
  READER_NAV_MS. Their navigation then either lands (the list's data changes, and its write is worked out
  again from the new page) or does not (nothing came of the press, or the cap passed), and the write goes
  ahead. A press that starts no navigation (a game opened, a tab of it) holds the write for READER_IDLE_MS
  only.

  A Back or a Forward is the reader's too, and no press inside the page shows it: while the page it leads
  to is on its way, the window's address is already that page's (or another view's of this one) and this
  page is still drawn. So the write also waits while the window's address is not the one this page drew
  (`own` aside: the keys the list writes itself). It is cancelled when the page goes, and goes ahead if
  the address comes back: never onto another page's address (the sectioned workspace's rule,
  ui/sectioned-workspace.tsx, addressTarget).
*/

/** How long after the reader's last press, click or key a list's own address write waits. */
export const READER_IDLE_MS = 1500;
/** The longest a navigation the reader started holds a list's own write while its page is on its way (a navigation that never lands). */
export const READER_NAV_MS = 10_000;

let last = -Infinity;
let navAt = -Infinity;
let listening = 0;
const note = () => {
  last = performance.now();
};
const NO_NAVIGATION = { at: -Infinity, arrived: 0 };

/**
 * Notes a navigation the reader started that a list cannot see (another component's own router call, in its own
 * transition: a filter's dropdown, match-filters.tsx). A link followed is noted by its click (followsLink).
 */
export function noteNavigation() {
  navAt = performance.now();
}

/**
 * Whether the reader is acting (pure, for its unit test): they pressed, clicked or typed within the last `ms`, or started a
 * navigation (`nav.at`) since the list's data last arrived (`nav.arrived`) and less than READER_NAV_MS ago: its page is still
 * on its way, however long the server takes.
 */
export function readerBusy(now: number, lastAct: number, nav: { at: number; arrived: number } = NO_NAVIGATION, ms = READER_IDLE_MS): boolean {
  return now - lastAct < ms || (nav.at > nav.arrived && now - nav.at < READER_NAV_MS);
}

/**
 * Whether a click follows a link to another address of this site in this window (pure, for its unit test): the main button
 * with no key held (those open a tab or a window), no other target, no download, and another path or query than `here`'s
 * (a link to a place on the page itself navigates nowhere).
 */
export function followsLink(link: { href: string; target: string; download: boolean } | null, here: string, click: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  if (!link || link.download || (link.target !== "" && link.target !== "_self")) return false;
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  const at = new URL(here);
  const to = new URL(link.href, at);
  return to.origin === at.origin && (to.pathname !== at.pathname || to.search !== at.search);
}

const onClick = (e: MouseEvent) => {
  note();
  const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (a instanceof HTMLAnchorElement && followsLink({ href: a.href, target: a.target, download: a.hasAttribute("download") }, window.location.href, e)) noteNavigation();
};
const LISTENERS: Array<[string, (e: Event) => void]> = [
  ["pointerdown", note],
  ["keydown", note],
  ["click", onClick as (e: Event) => void],
];

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
 * A function telling whether the reader is acting now: READER_IDLE_MS since their last press, click or key, a
 * navigation they started still on its way (since `data`, the list's data as the server drew it, a new object with
 * every server render, last arrived: readerBusy), or, with `own` (the keys the list writes itself), a Back or a
 * Forward on its way (the window's address is not the one this page drew: onDrawnAddress). A list's own address
 * write waits while it is true.
 */
export function useReaderBusy(own: readonly string[] | undefined, data: unknown): () => boolean {
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const drawn = React.useRef({ pathname, search });
  React.useLayoutEffect(() => {
    drawn.current = { pathname, search };
  });
  // When the list's data last arrived (its first paint, then each server render).
  const arrived = React.useRef(0);
  React.useLayoutEffect(() => {
    arrived.current = performance.now();
  }, [data]);
  const keys = own ? own.join(",") : null;
  React.useEffect(() => {
    if (listening++ === 0) for (const [t, f] of LISTENERS) window.addEventListener(t, f, { capture: true, passive: true });
    return () => {
      if (--listening === 0) for (const [t, f] of LISTENERS) window.removeEventListener(t, f, { capture: true });
    };
  }, []);
  return React.useCallback(() => readerBusy(performance.now(), last, { at: navAt, arrived: arrived.current }) || (keys !== null && !onDrawnAddress(drawn.current, window.location, keys ? keys.split(",") : [])), [keys]);
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
