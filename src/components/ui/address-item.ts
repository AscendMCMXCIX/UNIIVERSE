"use client";

import * as React from "react";

/*
  The one history rule for whatever a page opens over or inside itself (a Peek, an Unfold, a
  window with an address): opening pushes one entry, switching to another item replaces it, and
  closing goes Back when this page pushed that entry (else it replaces the address without the
  item: a deep link, or an item opened before a reload). So Back always closes what is open and
  never walks through the items seen; Forward reopens the last one. Back and Forward are followed
  (popstate): the item the address names is the one open.

  The item lives in the current page's query (`?player=`, `?champion=`, `?match=`), never in another
  page's path, so a link to it renders the page with it open.
*/

/** What a change of the open item does to the session history. */
export type HistoryStep = "push" | "replace" | "back";

/**
 * The step for a change from `from` to `to` (null: nothing open), when `pushed` says whether this
 * page pushed the entry that holds `from`. Opening from nothing pushes; switching replaces; closing
 * goes back to the entry before only when this page added the one it is on.
 */
export function historyStep(from: string | null, to: string | null, pushed: boolean): HistoryStep {
  if (to !== null) return from === null ? "push" : "replace";
  return pushed ? "back" : "replace";
}

/** `href` (path, query and hash) with `param` set to `id`, or removed for null; the other parameters keep their order. */
export function itemHref(href: string, param: string, id: string | null): string {
  const url = new URL(href, "http://x");
  if (id === null) url.searchParams.delete(param);
  else url.searchParams.set(param, id);
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}

/** The item `param` names in a query string ("" counts as none). */
export function itemIn(search: string, param: string): string | null {
  return new URLSearchParams(search).get(param) || null;
}

/** Whether each open address item's entry was pushed by its page (by param), for takeOver. */
const pushedByParam = new Map<string, boolean>();
let takingOver = false;

/**
 * Closes the item under `param` in place (its entry replaced without it, and its hook told, as Back
 * would tell it), for another item to open instead: where that entry was one its page pushed, the
 * next item opened, in this same task, takes the entry over (replaced, and Back closes it) rather
 * than pushing a second one, so Back still leaves the page in one step (Leaderboards' two Peeks:
 * Release 9 review). Returns whether there was an item to close.
 */
export function closeInPlace(param: string): boolean {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(param)) return false;
  const pushed = pushedByParam.get(param) === true;
  url.searchParams.delete(param);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  if (pushed) {
    takingOver = true;
    setTimeout(() => {
      takingOver = false;
    }, 0);
  }
  return true;
}

export interface AddressItem {
  /** The open item, or null. */
  id: string | null;
  /** Opens `id` (a push from nothing, a replace from another item). */
  open: (id: string) => void;
  /** Closes the open item (Back when this page pushed it). */
  close: () => void;
  /** Opens `id`, or closes it when it is the one open (the selected row pressed again). */
  toggle: (id: string) => void;
  /** The query parameter it lives in. */
  param: string;
}

/**
 * The item a page has open, kept in its address under `param` by the history rule above.
 * `initial`: the item the server rendered open (from the page's own search params), so a deep link
 * hydrates with it open. `valid`: an id the page can show; an address naming anything else (a
 * stale link) counts as nothing open.
 */
export function useAddressItem(param: string, { initial = null, valid }: { initial?: string | null; valid?: (id: string) => boolean } = {}): AddressItem {
  const [raw, setRaw] = React.useState<string | null>(initial);
  const id = raw !== null && valid && !valid(raw) ? null : raw;
  // Whether the entry holding the open item is one this page pushed (Back then closes it).
  const pushed = React.useRef(false);
  // Every change of `pushed` is published for closeInPlace.
  const setPushed = React.useCallback(
    (v: boolean) => {
      pushed.current = v;
      pushedByParam.set(param, v);
    },
    [param],
  );
  const current = React.useRef(id);
  React.useLayoutEffect(() => {
    current.current = id;
  });

  const go = React.useCallback(
    (to: string | null) => {
      const from = current.current;
      if (from === to) return;
      const step = historyStep(from, to, pushed.current);
      current.current = to;
      if (step === "back") {
        setPushed(false);
        setRaw(null);
        window.history.back();
        return;
      }
      const href = itemHref(`${window.location.pathname}${window.location.search}${window.location.hash}`, param, to);
      // No state of our own: Next.js copies its own onto the entry and, given a state without its
      // marker, takes the new address into its router (useSearchParams, refreshes keep the item).
      if (step === "push" && takingOver) {
        // The entry another item was closed in place from, which its page had pushed: taken over.
        takingOver = false;
        window.history.replaceState(null, "", href);
        setPushed(true);
      } else if (step === "push") {
        window.history.pushState(null, "", href);
        setPushed(true);
      } else {
        window.history.replaceState(null, "", href);
        if (to === null) setPushed(false);
      }
      setRaw(to);
    },
    [param, setPushed],
  );

  // The address as the page mounts: a page restored by Back (its cached render) may hold an item the
  // server never rendered. Found so, it was not pushed by this page.
  React.useLayoutEffect(() => {
    const at = itemIn(window.location.search, param);
    if (at !== current.current) {
      setPushed(false);
      current.current = at;
      setRaw(at);
    }
  }, [param, setPushed]);

  React.useEffect(() => {
    const onPop = () => {
      const next = itemIn(window.location.search, param);
      // Back from the pushed entry lands on the one before it (nothing open); Forward lands on an
      // entry this page pushed earlier, so Back closes it again.
      setPushed(next !== null);
      current.current = next;
      setRaw(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [param, setPushed]);

  const open = React.useCallback((to: string) => go(to), [go]);
  const close = React.useCallback(() => go(null), [go]);
  const toggle = React.useCallback((to: string) => go(current.current === to ? null : to), [go]);
  return { id, open, close, toggle, param };
}
