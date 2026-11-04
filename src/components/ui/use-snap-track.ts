"use client";

import * as React from "react";

/** The card in view in a snap track, kept outside React state so only what shows it re-renders as the track scrolls. */
export interface SnapIndex {
  get: () => number;
  subscribe: (listener: () => void) => () => void;
}

function createSnapIndex(): SnapIndex & { set: (i: number) => void } {
  let index = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => index,
    set: (i) => {
      if (i === index) return;
      index = i;
      for (const l of listeners) l();
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

/**
 * A phone track of cards (Team Overview): which card is in view (updated only when it changes, from the scroll position
 * read once per frame), and moving to a card from the dots or arrows. The track's owner does not
 * re-render while the track scrolls: only the part that shows the position (useSnapIndex) does,
 * so the cards themselves are never drawn again mid-swipe. Wider layouts are a grid, where none
 * of this does anything.
 */
export function useSnapTrack(count: number) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [index] = React.useState(createSnapIndex);
  const frame = React.useRef(0);
  const onScroll = React.useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = ref.current;
      if (!el || el.scrollWidth <= el.clientWidth) return;
      const centre = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      [...el.children].forEach((c, i) => {
        const child = c as HTMLElement;
        const d = Math.abs(child.offsetLeft + child.offsetWidth / 2 - centre);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      index.set(best);
    });
  }, [index]);
  React.useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const go = React.useCallback(
    (i: number) => {
      const el = ref.current;
      const target = el?.children[Math.max(0, Math.min(count - 1, i))] as HTMLElement | undefined;
      if (!el || !target) return;
      el.scrollTo({ left: target.offsetLeft + target.offsetWidth / 2 - el.clientWidth / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    },
    [count],
  );
  return { ref, index: index as SnapIndex, onScroll, go };
}

/** The card in view, for the one component that shows it (the role bar). */
export function useSnapIndex(index: SnapIndex): number {
  return React.useSyncExternalStore(index.subscribe, index.get, () => 0);
}
