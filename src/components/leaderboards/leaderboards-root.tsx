"use client";

import * as React from "react";
import { jumpToAnchor } from "@/components/ui/section-index";
import { SECTIONS } from "./sections";

const noopSubscribe = () => () => {};

/**
 * The page's outer element. It says when the page is interactive (data-ready, which browser tests
 * wait for before they click): a statistic or tile chosen while the page is still hydrating can be
 * lost, as Match History's and Team's links could.
 */
export function LeaderboardsRoot({ className, children }: { className: string; children: React.ReactNode }) {
  const interactive = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  return (
    <div className={className} data-testid="leaderboards" data-ready={interactive ? "true" : undefined}>
      {children}
    </div>
  );
}

/** The sections Records & achievements' old address could name with its index (`?view=records#multikills`). */
const RECORDS_SECTIONS: readonly string[] = [SECTIONS.records, SECTIONS.multikills, SECTIONS.milestones];

/**
 * The page's address before it was one page (until 19 Nov 2026 Recent form and Records &
 * achievements were two views, Records at `?view=records`): any `view` leaves the address, which
 * the page's own replaces in the same history entry (Back and Forward step over nothing new), and
 * Records' lands on its section (or on the multikills or milestones its old index named), as the
 * index's jump does: in view under the bars, and focused. The season stays. The server never reads
 * `view`: the page is the same either way, and without this code it simply opens at its top.
 */
export function RetiredViewLanding() {
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const view = url.searchParams.get("view");
    if (view === null) return;
    url.searchParams.delete("view");
    const named = url.hash.slice(1);
    const target = view === "records" ? (RECORDS_SECTIONS.includes(named) ? named : SECTIONS.records) : null;
    if (target) url.hash = target;
    // Next.js copies its own state into the entry (as for SectionIndex's jumps).
    window.history.replaceState(null, "", url);
    if (target) jumpToAnchor(target);
  }, []);
  return null;
}
