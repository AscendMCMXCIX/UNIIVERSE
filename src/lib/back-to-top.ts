"use client";

import type * as React from "react";

/** Back to the top of the page: smooth, or at once where the reader asks for reduced motion. */
export function scrollToTop() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "instant" : "smooth" });
}

/**
 * A plain click on a link to the page already shown (the current tab, the current sidebar entry):
 * the page stays as it is, its view and filters with it (the link's own address has no query), and
 * goes back to the top, as a phone's tab bar does (docs/DESIGN_SYSTEM.md, "Back to the top"). A
 * click with a modifier key or another button keeps its meaning: a new tab, a new window. Returns
 * whether it handled the click.
 */
export function stayOnCurrentPage(e: React.MouseEvent<HTMLElement>, isCurrent: boolean): boolean {
  if (!isCurrent || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  e.preventDefault();
  scrollToTop();
  return true;
}
