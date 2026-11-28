"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { itemIn } from "./address-item";
import { addressTarget, initialSection, sectionFromSearch, sectionHref } from "./sectioned-workspace";

/*
  A page's choice of a few kept in its address, as a sectioned workspace's section is
  (ui/sectioned-workspace.tsx, whose address rules it reuses, addressTarget among them): a paged
  list's filter (Admin Resources' ?section=), a queue's view (Admin Matchup notes' ?view=), the
  section of a page that lays out its own rail (Admin Branding). docs/RESPONSIVE.md, "One-screen
  desktop pages".

  The choice shown follows the address whatever changes it: the reader's choice, Back and Forward,
  and a soft navigation to the page with another query (an Admin Mode link to the page it is on:
  Next keeps the page mounted, so the address, not the mount, decides). A Back that leaves the page
  is the page's own: nothing here runs for it, and nothing is written onto the other page's address.
*/

const here = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

/**
 * The address to put in place of the window's where it names a choice no longer offered (its last
 * row gone: the choice shown fell back to the first), or null where it is right as it stands (pure:
 * for its unit test). Only on the page's own path: another page's address is never this page's to
 * correct (Back is leaving it).
 */
export function offeredHref(at: { pathname: string; rendered: string; href: string; search: string; ids: readonly string[]; param?: string; current: string }): string | null {
  const param = at.param ?? "section";
  if (at.pathname !== at.rendered) return null;
  const named = itemIn(at.search, param);
  if (named === null || named === at.current || at.ids.includes(named) || sectionFromSearch(at.search, at.ids, param) !== at.current) return null;
  return sectionHref(at.href, at.current, at.ids, param);
}

/**
 * One choice of a few kept in the page's address, as a section is (a list's filter, a queue's view:
 * `?section=`, `?view=`): the first of `ids` has no parameter, an unknown or missing value is the
 * first, and each choice the reader makes is an entry of its own, so Back returns to the one before
 * and Forward comes back. The choice follows the address as Next holds it (useSearchParams: the
 * server's request on the first paint, then every push, Back, Forward and soft navigation), read
 * from the window's own address on this page's path only (addressTarget). `initial`: the choice
 * where the address cannot be read (outside Next's router: a unit test's render). `ids` may change
 * (a choice that comes and goes with its rows): a choice no longer offered is the first, and its
 * address is replaced to match.
 */
export function useAddressSection(ids: readonly string[], { initial = null, param = "section" }: { initial?: string | null; param?: string } = {}): [string, (id: string, o?: { replace?: boolean }) => void] {
  const search = useSearchParams();
  const pathname = usePathname() || "/";
  const [chosen, setChosen] = React.useState(() => (search ? sectionFromSearch(search.toString(), ids, param) : initialSection(initial, ids)));
  const current = ids.includes(chosen) ? chosen : (ids[0] ?? "");
  const latest = React.useRef({ ids, current, pathname });
  React.useLayoutEffect(() => {
    latest.current = { ids, current, pathname };
  });
  // The window's address as a choice (null: another page's, or the choice shown).
  const target = React.useCallback(
    (from: string) => {
      const { ids: now, pathname: rendered } = latest.current;
      return addressTarget({ pathname: window.location.pathname, rendered, search: window.location.search, ids: now, param, current: from });
    },
    [param],
  );
  // The address, followed: as the page mounts (a page restored by Back may name a choice the server did not render), and
  // whenever Next's address changes (a soft navigation to this page with another query keeps it mounted). The window's
  // own address is read, not the render's.
  React.useLayoutEffect(() => {
    const to = target(latest.current.current);
    if (to !== null) setChosen(to);
  }, [search, target]);
  // Back and Forward within the page (Next's address follows them too; this one reads the window at once).
  React.useEffect(() => {
    const onPop = () => {
      const to = target(latest.current.current);
      if (to !== null) setChosen(to);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [target]);
  // A choice that is no longer offered (its last row gone) is the first: kept so (decided during render, as React's
  // derived state is), and the address replaced to match (no entry of its own).
  if (chosen !== current) setChosen(current);
  React.useEffect(() => {
    const to = offeredHref({ pathname: window.location.pathname, rendered: latest.current.pathname, href: here(), search: window.location.search, ids: latest.current.ids, param, current });
    if (to !== null) window.history.replaceState(null, "", to);
  }, [current, param]);
  // `replace`: the address the page was opened at, read another way (an old #hash naming a section), not a reader's step.
  const choose = React.useCallback(
    (id: string, o: { replace?: boolean } = {}) => {
      if (id === latest.current.current) return;
      window.history[o.replace ? "replaceState" : "pushState"](null, "", sectionHref(here(), id, latest.current.ids, param));
      latest.current = { ...latest.current, current: id };
      setChosen(id);
    },
    [param],
  );
  return [current, choose];
}
