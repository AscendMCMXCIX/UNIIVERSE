"use client";

import * as React from "react";

/** A touch screen as the primary pointer (CSS `pointer-coarse:`), the posture where targets are 44px. */
export const COARSE_QUERY = "(pointer: coarse)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(COARSE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const coarse = () => window.matchMedia(COARSE_QUERY).matches;
const no = () => false;

/**
 * True once the page is interactive on a touch screen. False on the server and while the page
 * hydrates, so the first render matches the server's HTML; what differs must look the same either
 * way (an element's kind, not its layout).
 */
export function useCoarsePointer(): boolean {
  return React.useSyncExternalStore(subscribe, coarse, no);
}

/**
 * `children` with a mouse or a keyboard, `plain` on a touch screen: for a small control on a card
 * that is itself the one target (the LP's tooltip on a game card, TT.TD12), which on touch would be
 * a target under 44px. `plain` must take the same room, so nothing moves once the page hydrates.
 */
export function NotOnTouch({ plain, children }: { plain: React.ReactNode; children: React.ReactNode }) {
  return <>{useCoarsePointer() ? plain : children}</>;
}
