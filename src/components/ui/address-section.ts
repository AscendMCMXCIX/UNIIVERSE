"use client";

import * as React from "react";
import { itemIn } from "./address-item";
import { initialSection, sectionFromSearch, sectionHref } from "./sectioned-workspace";

/*
  A page's choice of a few kept in its address, as a sectioned workspace's section is
  (ui/sectioned-workspace.tsx, whose address rules it reuses): a paged list's filter (Admin
  Resources' ?section=), a queue's view (Admin Matchup notes' ?view=), the section of a page that
  lays out its own rail (Admin Branding). docs/RESPONSIVE.md, "One-screen desktop pages".
*/

const here = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

/**
 * One choice of a few kept in the page's address, as a section is (a list's filter, a queue's view:
 * `?section=`, `?view=`): the first of `ids` has no parameter, an unknown or missing value is the
 * first, and each choice the reader makes is an entry of its own, so Back returns to the one before
 * and Forward comes back (popstate followed). `initial`: the page's own value, read by the server,
 * so the first paint shows it. `ids` may change (a choice that comes and goes with its rows): a
 * choice no longer offered is the first.
 */
export function useAddressSection(ids: readonly string[], { initial = null, param = "section" }: { initial?: string | null; param?: string } = {}): [string, (id: string) => void] {
  const [chosen, setChosen] = React.useState(() => initialSection(initial, ids));
  const current = ids.includes(chosen) ? chosen : (ids[0] ?? "");
  const latest = React.useRef(ids);
  const now = React.useRef(current);
  React.useLayoutEffect(() => {
    latest.current = ids;
    now.current = current;
  });
  // The address as the page mounts (a page restored by Back may name a choice the server did not render).
  React.useLayoutEffect(() => {
    setChosen(sectionFromSearch(window.location.search, latest.current, param));
  }, [param]);
  // A choice that is no longer offered (its last row gone) is the first: kept so (decided during render, as React's
  // derived state is), and the address replaced to match (no entry of its own).
  if (chosen !== current) setChosen(current);
  React.useEffect(() => {
    const named = itemIn(window.location.search, param);
    if (named === null || named === current || sectionFromSearch(window.location.search, latest.current, param) !== current || latest.current.includes(named)) return;
    window.history.replaceState(null, "", sectionHref(here(), current, latest.current, param));
  }, [current, param]);
  React.useEffect(() => {
    const onPop = () => setChosen(sectionFromSearch(window.location.search, latest.current, param));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [param]);
  const choose = React.useCallback(
    (id: string) => {
      if (id === now.current) return;
      window.history.pushState(null, "", sectionHref(here(), id, latest.current, param));
      now.current = id;
      setChosen(id);
    },
    [param],
  );
  return [current, choose];
}
