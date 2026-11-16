"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/** A Back or Forward that has not yet changed the page is forgotten after this long (it changed only the query). */
const POP_MEMORY_MS = 1_000;

/*
  Where a page starts (docs/DESIGN_SYSTEM.md, "Navigation contract"): a page opened by a link, or by
  code, starts at its top. Next keeps the scroll position when the new page's start already looks
  visible after the browser clamps it, so a profile opened from a scrolled Players list started
  48px down on a desktop, its card cut. Left alone:
    - Back and Forward: the browser and Next restore the exact place (measured exact on phones,
      tablets and desktops), so nothing here may scroll on those;
    - a link to a #fragment, which lands on its target;
    - a link marked data-keep-scroll: a profile's sections, which land at their own top themselves
      (ProfileTabs), and any view of one page that changes the address but keeps the place;
    - a change of the query alone (a filter, a view, a page of a list): the page decides, as it is
      the same page.
*/
export function ScrollOnNavigate() {
  const pathname = usePathname();
  const skip = React.useRef<"pop" | "keep" | null>(null);
  const seen = React.useRef(pathname);
  React.useEffect(() => {
    let forget = 0;
    const onPop = () => {
      skip.current = "pop";
      window.clearTimeout(forget);
      forget = window.setTimeout(() => {
        if (skip.current === "pop") skip.current = null;
      }, POP_MEMORY_MS);
    };
    // Capture: before Next's link handler starts the navigation.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (link) skip.current = link.hasAttribute("data-keep-scroll") ? "keep" : null;
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onClick, true);
    return () => {
      window.clearTimeout(forget);
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  // Before the new page is painted, so it never shows at the old place first.
  React.useLayoutEffect(() => {
    if (seen.current === pathname) return;
    seen.current = pathname;
    const why = skip.current;
    skip.current = null;
    if (why || window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
