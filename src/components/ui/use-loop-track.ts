"use client";

import * as React from "react";

/** A card of the track, kept outside React state so only what shows it re-renders as the track scrolls. */
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
 * Where card `i` stands in the track (its flex `order`) while card `centre` is in the middle: the
 * others around it in lineup order, wrapping, so with five cards two are always ready on either side.
 */
export function loopSlot(i: number, centre: number, count: number): number {
  const mid = Math.floor(count / 2);
  return (((i - centre + mid) % count) + count) % count;
}

/** The shortest way round from card `from` to card `to`: -2 to 2 of five (as far forward as back, forward). */
export function loopDelta(from: number, to: number, count: number): number {
  const d = (((to - from) % count) + count) % count;
  return d > (count - 1) / 2 ? d - count : d;
}

/** After the last scroll event, how long until the track counts as at rest (where `scrollend` is not sent). */
const SETTLE_MS = 140;

/*
  The track's cards keep their place in the document (lineup order: keyboard, screen readers and the
  test ids see one card each, never a copy); only their flex `order` (--loop-order) places them
  around the card in view. Once the track is at rest on another card, the order is moved round so
  that card is in the middle again, and the scroll position is moved by exactly as much as the card
  moved, in the same task: nothing on screen changes, and there is always a card on either side to
  swipe to. Nothing is changed under a finger or while the track is still moving.
*/

/**
 * A phone track of cards that loops (Team Overview): native horizontal scrolling with one snap point
 * a card, so swipes, flicks and the page's vertical scrolling stay the browser's own; `index` is the
 * card in view as the track scrolls (read once per frame, only what shows it re-renders), `rest` the
 * card it came to rest on. `go` brings a card into view the shortest way round (smoothly unless
 * reduced motion is asked for), `step` moves by one from the card in view (or the one being moved
 * to), and `onKeyDown` gives ← → inside the track the same, keyboard focus following to the new card.
 * Where the track does not scroll (wider layouts are a grid) none of this does anything.
 */
export function useLoopTrack(count: number) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [index] = React.useState(createSnapIndex);
  const [rest] = React.useState(createSnapIndex);
  const state = React.useRef({ centre: 0, arranged: false, touching: false, target: null as number | null, frame: 0, timer: 0, width: 0 });

  const go = React.useCallback(
    (i: number) => {
      const el = ref.current;
      if (!el) return;
      const s = state.current;
      const to = ((i % count) + count) % count;
      const list = cards(el);
      const target = list[to];
      if (!target) return;
      if (scrolls(el)) {
        const v = nearest(el);
        // The target must be on the shortest way round from the card in view; where it is not (moved
        // to quickly, before the track came to rest), the cards are placed round the card in view first.
        if (loopSlot(to, s.centre, count) - loopSlot(v, s.centre, count) !== loopDelta(v, to, count)) {
          // Mid-way between two cards, snapping is off until the track is at rest again, so the scroll
          // position can follow the cards exactly (a snap there would pull the track to a card first).
          if (Math.abs(leftFor(el, list[v]!) - el.scrollLeft) > 1) el.dataset.loopFree = "true";
          arrange(el, v, list[v]!, count, s);
        }
        s.target = to;
      }
      el.scrollTo({ left: leftFor(el, target), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    },
    [count],
  );

  const step = React.useCallback(
    (delta: number): number => {
      const el = ref.current;
      const from = state.current.target ?? (el && scrolls(el) ? nearest(el) : index.get());
      const to = (((from + delta) % count) + count) % count;
      go(to);
      return to;
    },
    [count, go, index],
  );

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const s = state.current;
    // The cards round the one in view (the first, unless the track was swiped before the page was
    // interactive), with it in the middle; after a change of width, the same card in the middle.
    const place = () => {
      if (!scrolls(el)) return;
      const c = s.arranged ? s.centre : nearest(el);
      s.arranged = true;
      const card = cards(el)[c];
      if (!card) return;
      arrange(el, c, card, count, s);
      el.scrollLeft = leftFor(el, card);
      index.set(c);
      rest.set(c);
    };
    const settle = () => {
      s.timer = 0;
      if (s.touching || !scrolls(el)) return;
      const i = nearest(el);
      const card = cards(el)[i]!;
      // Not yet at rest on a card (the snap is still bringing one in): wait for the next scroll's end.
      if (Math.abs(leftFor(el, card) - el.scrollLeft) > 1) return;
      delete el.dataset.loopFree;
      s.target = null;
      index.set(i);
      rest.set(i);
      if (i !== s.centre) arrange(el, i, card, count, s);
    };
    const later = () => {
      clearTimeout(s.timer);
      s.timer = window.setTimeout(settle, SETTLE_MS);
    };
    const onScroll = () => {
      if (!s.frame)
        s.frame = requestAnimationFrame(() => {
          s.frame = 0;
          if (scrolls(el)) index.set(nearest(el));
        });
      later();
    };
    const onScrollEnd = () => {
      clearTimeout(s.timer);
      settle();
    };
    // A finger (or a wheel) takes over from a move in progress: snapping comes back for it.
    const onTouchStart = () => {
      s.touching = true;
      s.target = null;
      delete el.dataset.loopFree;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length) return;
      s.touching = false;
      later();
    };
    const onWheel = () => {
      s.target = null;
      delete el.dataset.loopFree;
    };
    s.width = el.clientWidth;
    place();
    const resized = new ResizeObserver(() => {
      if (el.clientWidth === s.width) return;
      s.width = el.clientWidth;
      if (!s.touching) place();
    });
    resized.observe(el);
    const passive = { passive: true } as const;
    el.addEventListener("scroll", onScroll, passive);
    el.addEventListener("scrollend", onScrollEnd);
    el.addEventListener("touchstart", onTouchStart, passive);
    el.addEventListener("touchend", onTouchEnd, passive);
    el.addEventListener("touchcancel", onTouchEnd, passive);
    el.addEventListener("wheel", onWheel, passive);
    return () => {
      resized.disconnect();
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScrollEnd);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(s.frame);
      clearTimeout(s.timer);
    };
  }, [count, index, rest]);

  // ← → inside the track: the card before or after, keyboard focus moving to it (a field, a window
  // opened from a card, or a group with arrow keys of its own keeps its keys).
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = ref.current;
      const from = e.target as HTMLElement;
      if (!el || !scrolls(el) || from.closest("dialog, input, textarea, select, [contenteditable=true], [role=radiogroup], [role=slider], [role=menu], [role=listbox]")) return;
      e.preventDefault();
      const card = cards(el)[step(e.key === "ArrowRight" ? 1 : -1)];
      if (card) focusIn(card);
    },
    [step],
  );

  return { ref, index: index as SnapIndex, rest: rest as SnapIndex, go, step, onKeyDown };
}

/** The card in view, for what shows it (the position dots). */
export function useSnapIndex(index: SnapIndex): number {
  return React.useSyncExternalStore(index.subscribe, index.get, () => 0);
}

const cards = (el: HTMLElement) => [...el.children] as HTMLElement[];
/** A track (it scrolls sideways), not a grid. */
const scrolls = (el: HTMLElement) => el.scrollWidth > el.clientWidth + 1;
/** The scroll position that puts `card` in the middle of the track (its snap position). */
function leftFor(el: HTMLElement, card: HTMLElement): number {
  const c = card.getBoundingClientRect();
  return el.scrollLeft + c.left + c.width / 2 - (el.getBoundingClientRect().left + el.clientLeft + el.clientWidth / 2);
}
/** The card nearest the middle of the track. */
function nearest(el: HTMLElement): number {
  const t = el.getBoundingClientRect();
  const middle = t.left + el.clientLeft + el.clientWidth / 2;
  let best = 0;
  let bestDist = Infinity;
  cards(el).forEach((c, i) => {
    const r = c.getBoundingClientRect();
    const d = Math.abs(r.left + r.width / 2 - middle);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}
/** Places the cards round `centre`, the track's scroll moved by exactly as much as `keep` moved, so what is on screen stays where it is. */
function arrange(el: HTMLElement, centre: number, keep: HTMLElement, count: number, s: { centre: number }) {
  const before = keep.getBoundingClientRect().left;
  cards(el).forEach((c, i) => c.style.setProperty("--loop-order", String(loopSlot(i, centre, count))));
  s.centre = centre;
  const moved = keep.getBoundingClientRect().left - before;
  if (moved) el.scrollLeft += moved;
}
/** Keyboard focus into a card: its first control on the side shown (the whole-card button of a player's card), else the card itself. */
function focusIn(card: HTMLElement) {
  const control = [...card.querySelectorAll<HTMLElement>("button, a[href], [tabindex]")].find((c) => c.tabIndex >= 0 && !c.closest("[inert]") && !(c as HTMLButtonElement).disabled);
  (control ?? card).focus({ preventScroll: true });
}
