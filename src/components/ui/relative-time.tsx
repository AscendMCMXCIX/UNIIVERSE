"use client";

import * as React from "react";
import { formatDateTime, timeAgo } from "@/lib/format";

/*
  "3m ago" that stays right. The server's clock and the browser's rarely agree to the minute (and a
  device's clock can be off by more), so while the page hydrates the server's words are kept (the
  text sits in an element that allows the difference), and straight after the browser's clock takes
  over, then moves on each minute. One timer serves every relative time on the page, and only while
  one is shown.
*/

let now = 0;
let timer: number | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = window.setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => now || (now = Date.now());
const getServerSnapshot = () => 0;

/**
 * The time to measure "ago" from: this render's own clock on the server and while the page hydrates,
 * then the browser's, updated each minute. Text drawn from it needs suppressHydrationWarning on its
 * element (RelativeTime does this).
 */
export function useNow(): Date {
  const t = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return t ? new Date(t) : new Date();
}

/** "3m ago", with the full date and time on hover. */
export function RelativeTime({ date, className }: { date: Date | string | number; className?: string }) {
  const at = date instanceof Date ? date : new Date(date);
  const text = timeAgo(at, useNow());
  return (
    <time dateTime={Number.isNaN(at.getTime()) ? undefined : at.toISOString()} title={formatDateTime(at)} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
