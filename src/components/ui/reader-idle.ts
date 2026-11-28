"use client";

import * as React from "react";

/*
  A list that writes its own address (a server-paged list's page size in the one-screen workspace:
  docs/RESPONSIVE.md, "One-screen desktop pages", server-paged lists) must never overtake the reader's
  own navigation: a link followed a moment after the page arrived (Encounters, an order, a filter), whose
  page is still on its way, would otherwise be replaced by the list's write, which starts later and wins.
  So the write waits while the reader is acting: from any press, click or key until READER_IDLE_MS after
  it. Their navigation then either lands (the list's data changes, and its write is worked out again from
  the new page) or does not (nothing came of the press), and the write goes ahead.
*/

/** How long after the reader's last press, click or key a list's own address write waits. */
export const READER_IDLE_MS = 1500;

let last = -Infinity;
let listening = 0;
const note = () => {
  last = performance.now();
};

/** Whether the reader pressed, clicked or typed within the last `ms` (pure, for its unit test). */
export function readerBusy(now: number, lastAct: number, ms = READER_IDLE_MS): boolean {
  return now - lastAct < ms;
}

/**
 * A function telling whether the reader is acting now (READER_IDLE_MS since their last press, click or key):
 * a list's own address write waits while it is true.
 */
export function useReaderBusy(): () => boolean {
  React.useEffect(() => {
    if (listening++ === 0) for (const t of ["pointerdown", "click", "keydown"]) window.addEventListener(t, note, { capture: true, passive: true });
    return () => {
      if (--listening === 0) for (const t of ["pointerdown", "click", "keydown"]) window.removeEventListener(t, note, { capture: true });
    };
  }, []);
  return React.useCallback(() => readerBusy(performance.now(), last), []);
}

/** Runs `write` once the reader is not acting (checking every `step` ms); returns the cancel. */
export function whenReaderIdle(busy: () => boolean, write: () => void, first: number, step = 250): () => void {
  let t = 0;
  const tick = () => {
    if (busy()) t = window.setTimeout(tick, step);
    else write();
  };
  t = window.setTimeout(tick, first);
  return () => window.clearTimeout(t);
}
