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

/*
  All Champions' one-screen workspace (docs/RESPONSIVE.md, "All Champions' workspace"; globals.css,
  the `ws` and `ws-host` variants): a desktop window with a fine pointer, from 80rem wide, and at
  least WS_MIN_HEIGHT_REM of the page's own rem tall. The CSS gate decides the server's HTML and the
  hydration render; once hydrated, the page refines it with the root's actual size (a larger browser
  text size or an emulated one), which a media query cannot read: a window where the query matches
  but the page's own rem is short gets the flow layout (the page scrolls, as it always has).
*/
export const WS_QUERY =
  "(pointer: fine) and (min-width: 80rem) and (max-width: 1536px) and (min-height: 656px), (pointer: fine) and (min-width: 1536px) and (max-width: 1600px) and (min-height: 668px), (pointer: fine) and (min-width: 1600px) and (max-width: 1664px) and (min-height: 680px), (pointer: fine) and (min-width: 1664px) and (max-width: 1728px) and (min-height: 691px), (pointer: fine) and (min-width: 1728px) and (max-width: 1792px) and (min-height: 703px), (pointer: fine) and (min-width: 1792px) and (max-width: 1856px) and (min-height: 715px), (pointer: fine) and (min-width: 1856px) and (max-width: 1920px) and (min-height: 727px), (pointer: fine) and (min-width: 1920px) and (max-width: 2240px) and (min-height: 786px), (pointer: fine) and (min-width: 2240px) and (max-width: 2560px) and (min-height: 845px), (pointer: fine) and (min-width: 2560px) and (min-height: 902px)";
/**
 * The workspace's least height, in the page's own rem (41 × 16 = 656px at a 16px root): a 1366 × 768
 * laptop's browser window (about 657px inside it) keeps the workspace with fewer rows (the owner's
 * request: shorter desktop windows show fewer rows). Every champion of one position fits whole from
 * here, an opponent's games open included; for a champion of several positions with an opponent open
 * the detail keeps one game a column, and in the shortest windows (under about 716px) the page can
 * grow by the few pixels that row lacks, never hiding anything (docs/RESPONSIVE.md, "the floor").
 */
export const WS_MIN_HEIGHT_REM = 41;

/** The page's root size in px (the user's text size, the app's width clamp, any emulated text size). */
export function rootPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/** Whether the workspace applies now: the CSS gate, and the window at least WS_MIN_HEIGHT_REM of the page's own rem tall. */
export function workspaceNow(): boolean {
  return typeof window !== "undefined" && window.matchMedia(WS_QUERY).matches && window.innerHeight >= WS_MIN_HEIGHT_REM * rootPx() - 0.5;
}

function subscribeWorkspace(onChange: () => void) {
  const query = window.matchMedia(WS_QUERY);
  query.addEventListener("change", onChange);
  // The root and the window's height move with a resize (and a zoom, which fires one).
  window.addEventListener("resize", onChange);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
  };
}

const unknownYet = () => null;

/** null on the server and while hydrating (the CSS gate decides the first paint); then true or false. */
export function useWorkspace(): boolean | null {
  return React.useSyncExternalStore<boolean | null>(subscribeWorkspace, workspaceNow, unknownYet);
}
