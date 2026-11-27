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
 * request: shorter desktop windows show fewer rows). Every state fits from here, a champion of five
 * positions with an opponent's games open included: under WS_SHORT_REM the workspace takes its short
 * form (docs/RESPONSIVE.md, "the short form"). The row budgets' floor (one row a column) stays as the
 * safety net, which no measured state reaches.
 */
export const WS_MIN_HEIGHT_REM = 41;

/*
  The workspace's short form (docs/RESPONSIVE.md, "All Champions' workspace", the short form; globals.css,
  the `ws-short` and `ws-short-host` variants): a workspace window under WS_SHORT_REM of the page's own rem.
  There the totals join the identity bar, the figures take one row of label-and-figure with their subs
  under them, the bands are 8px apart, the detail's controls take the mouse's 32px and the page's foot
  12px, so every state fits down to the workspace's least height. The CSS bands decide the server's HTML
  and the hydration render (each band's bound is 46 of its widest root, so at the default text size the
  page's own check never adds a window the CSS left tall); once hydrated, the page adds the short form
  where its own rem is short and the CSS says tall (a larger browser text size): [data-ws-short].
*/
/** The workspace's short form below this many of the page's own rem (46 × 16 = 736px): docs/RESPONSIVE.md, "the short form". */
export const WS_SHORT_REM = 46;
/** Byte-identical to the first @media of `ws-short` (and of `ws-short-host`) in globals.css (posture.test.ts). */
export const WS_SHORT_QUERY =
  "(pointer: fine) and (min-width: 80rem) and (max-width: 1536px) and (min-height: 656px) and (max-height: 735.98px), (pointer: fine) and (min-width: 1536px) and (max-width: 1600px) and (min-height: 668px) and (max-height: 749.98px), (pointer: fine) and (min-width: 1600px) and (max-width: 1664px) and (min-height: 680px) and (max-height: 762.98px), (pointer: fine) and (min-width: 1664px) and (max-width: 1728px) and (min-height: 691px) and (max-height: 775.98px), (pointer: fine) and (min-width: 1728px) and (max-width: 1792px) and (min-height: 703px) and (max-height: 788.98px), (pointer: fine) and (min-width: 1792px) and (max-width: 1856px) and (min-height: 715px) and (max-height: 802.98px), (pointer: fine) and (min-width: 1856px) and (max-width: 1920px) and (min-height: 727px) and (max-height: 815.98px), (pointer: fine) and (min-width: 1920px) and (max-width: 2240px) and (min-height: 786px) and (max-height: 881.98px), (pointer: fine) and (min-width: 2240px) and (max-width: 2560px) and (min-height: 845px) and (max-height: 947.98px), (pointer: fine) and (min-width: 2560px) and (min-height: 902px) and (max-height: 1011.98px)";

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
  const short = window.matchMedia(WS_SHORT_QUERY);
  query.addEventListener("change", onChange);
  short.addEventListener("change", onChange);
  // The root and the window's height move with a resize (and a zoom, which fires one).
  window.addEventListener("resize", onChange);
  return () => {
    query.removeEventListener("change", onChange);
    short.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
  };
}

const unknownYet = () => null;

/** null on the server and while hydrating (the CSS gate decides the first paint); then true or false. */
export function useWorkspace(): boolean | null {
  return React.useSyncExternalStore<boolean | null>(subscribeWorkspace, workspaceNow, unknownYet);
}

/** Whether the workspace applies now in its short form: the CSS bands, or the page's own rem (a larger text size). */
export function workspaceShortNow(): boolean {
  return workspaceNow() && (window.matchMedia(WS_SHORT_QUERY).matches || window.innerHeight < WS_SHORT_REM * rootPx() - 0.5);
}

/** null on the server and while hydrating (the CSS bands decide the first paint); then true or false. */
export function useWorkspaceShort(): boolean | null {
  return React.useSyncExternalStore<boolean | null>(subscribeWorkspace, workspaceShortNow, unknownYet);
}
