"use client";

import * as React from "react";

/** Phones, upright or sideways: below Tailwind's md, the range of the bottom tab bar (docs/MOBILE.md). */
export const PHONE_QUERY = "(max-width: 47.99rem)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True on a phone once the page is interactive, for behaviour that differs there (a game opens as a
 * whole screen of its own instead of under its card). False on the server and while the page
 * hydrates, so the first render matches the server's HTML; layout differences belong in CSS.
 */
export function usePhone(): boolean {
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}
