"use client";

import * as React from "react";

/*
  The frame and the posture decide how a preview opens (PLAN S4a, decision 9): any window under
  768px wide, a touch phone or a narrow window with a mouse alike, and any short window (480px tall
  or less, a phone held sideways) get a sheet or a window of their own; every other screen gets the
  docked Peek panel or the inline Unfold, beside or inside the list. Under 768px the page has the
  phone's frame (its top bar and tab bar, mobile-nav.tsx), which a docked panel or an inline game's
  pinned controls would sit under; a window is above it. (Until 20 Nov 2026 a mouse got the docked
  and inline forms from 640px, and between 640 and 767px their ✕, ‹ › and Close were under the bars.)
*/
export const WINDOW_POSTURE_QUERY = "(max-width: 47.99rem), (max-height: 30rem)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WINDOW_POSTURE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True where a preview opens as a sheet or a window of its own, read at the moment (an event handler). */
export function prefersWindow(): boolean {
  return typeof window !== "undefined" && window.matchMedia(WINDOW_POSTURE_QUERY).matches;
}

const no = () => false;

/** prefersWindow() as state: false on the server and while hydrating (the server renders the panel). */
export function useWindowPosture(): boolean {
  return React.useSyncExternalStore(subscribe, prefersWindow, no);
}

/** Whether a key press belongs to something being typed in or chosen (keys a list's shortcuts must leave alone). */
export function isTyping(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  return !!(target as Element).closest("input, textarea, select, [contenteditable=''], [contenteditable=true], [role=listbox], [role=menu], [role=combobox]");
}

/**
 * Whether the focused control keeps Escape for itself: a field being typed in, or an open list. A
 * closed list's button (a Select whose choice was just made) keeps none, so Escape still closes the
 * item it sits in (an open game).
 */
export function keepsEscape(target: EventTarget | null): boolean {
  if (!isTyping(target)) return false;
  return !(target as Element).closest("[role=combobox][aria-expanded=false]");
}

/** Whether a modal window, or a popover (popover.tsx: the Filters), is open above the page (its own Escape and keys come first). */
export function modalOpen(): boolean {
  return !!document.querySelector("dialog[open]:modal, [data-popover]");
}
