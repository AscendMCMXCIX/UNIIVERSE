"use client";

import * as React from "react";

/*
  Pointer and posture decide how a preview opens, not the width alone (PLAN S4a, decision 9): a
  touch phone (a coarse pointer and a side under 768px), any window under 640px wide, and any short
  window (480px tall or less, a phone held sideways) get a sheet or a window of their own; every
  other screen gets the docked Peek panel or the inline Unfold, beside or inside the list.
*/
export const WINDOW_POSTURE_QUERY = "(max-width: 39.99rem), (pointer: coarse) and (max-width: 47.99rem), (max-height: 30rem)";

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

/** Whether a modal window is open above the page (its own Escape and keys come first). */
export function modalOpen(): boolean {
  return !!document.querySelector("dialog[open]:modal");
}
