"use client";

import * as React from "react";

/** Phones, upright or sideways: below Tailwind's md, the range of the bottom tab bar (docs/MOBILE.md). */
export const PHONE_QUERY = "(max-width: 47.99rem)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const noSubscribe = () => () => {};
const no = () => false;

/** True on a phone, read at the moment (in an event handler or an effect): nothing re-renders. */
export function isPhone(): boolean {
  return window.matchMedia(PHONE_QUERY).matches;
}

/**
 * True on a phone once the page is interactive, for behaviour that differs there (a game opens as a
 * whole screen of its own instead of under its card). False on the server and while the page
 * hydrates, so the first render matches the server's HTML; layout differences belong in CSS.
 * `enabled`: false while the answer changes nothing on screen (no game open), so a phone does not
 * render the component (a whole list) a second time once it has hydrated; event handlers read
 * isPhone() instead.
 */
export function usePhone(enabled = true): boolean {
  return React.useSyncExternalStore(enabled ? subscribe : noSubscribe, enabled ? isPhone : no, no);
}
