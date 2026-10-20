"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the current page from the server every `intervalMs` while `active` (for example while
 * a Riot account is still catching up on its history), only when the tab is visible, and stops on
 * its own after `maxMs`. A server refresh keeps scroll position and client state, so the page just
 * updates in place: no reload, no spinner.
 */
export function AutoRefresh({ active, intervalMs = 30_000, maxMs = 20 * 60_000 }: { active: boolean; intervalMs?: number; maxMs?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      if (Date.now() - started > maxMs) return window.clearInterval(id);
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, maxMs, router]);
  return null;
}

/**
 * How often a page showing Riot accounts refreshes itself: every 30 seconds while an account is
 * being verified or fetched for the first time (that takes a minute or two), every 2 minutes while
 * it only catches up on older games (that takes hours, and each refresh reads the player's data
 * again), and not at all otherwise.
 */
export function syncRefreshInterval(states: readonly string[]): number | null {
  if (states.some((s) => s === "pending" || s === "verified")) return 30_000;
  if (states.includes("syncing")) return 120_000;
  return null;
}
