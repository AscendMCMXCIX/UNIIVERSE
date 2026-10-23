"use client";

import * as React from "react";

const noopSubscribe = () => () => {};

/**
 * The boards' outer element. It says when the page is interactive (data-ready, which browser tests
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
