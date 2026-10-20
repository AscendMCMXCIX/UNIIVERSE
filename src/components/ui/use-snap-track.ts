"use client";

import * as React from "react";

/**
 * A phone track of cards (Team Overview, Clash Scout): which card is in view (updated only when it changes, from the scroll position
 * read once per frame), and moving to a card from the dots or arrows. Wider layouts are a grid,
 * where none of this does anything.
 */
export function useSnapTrack(count: number) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
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
      setIndex((cur) => (cur === best ? cur : best));
    });
  }, []);
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
  return { ref, index, onScroll, go };
}
