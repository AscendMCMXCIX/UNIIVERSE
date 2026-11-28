"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { UnfoldHeader, UnfoldRegion } from "@/components/ui/unfold";
import type { MatchDetailResult } from "@/server/players/match-history";
import type { PortraitChampion } from "@/components/champion-portrait";
import { MatchDetailCacheContext } from "./match-detail-cache";
import { PostGame } from "./post-game";
import { pinnedTop, screenHeight, scrollToStart } from "@/lib/screen";

/*
  A game opened under its card: the one way a list of games opens a game (a player's Match History
  and Team → Matches). The card is a box with one button behind its content (aria-expanded, Enter
  or Space toggles it); this region follows the card with the match's breakdown (the post-game view,
  post-game.tsx: the loadout, figures, lane and scoreboard), loaded when the game opens and kept by the list's cache,
  then "Close this game" at its end. The page scrolls as one: no window and no inner scrolling, and
  the list, its filters and its place stay as they were. The shared match window (MatchDetailModal)
  is for where a list cannot open a game in place: from inside another window (Matchups,
  Encounters) or from a link to a game that is not on the page shown.
*/

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How long an opened game is still brought into view as its parts arrive (the timeline, the groups, the ranks). */
const SETTLING_MS = 3000;

/**
 * What is pinned above the page now (the top bar, a profile's or Team's pinned section tabs): the
 * page's scroll padding, and a phone's sliding top bar row while it is in view (pinnedTop). Cards
 * are brought under it by scrollToStart, which keeps them clear of that row as it comes back.
 */
const pinnedAbove = () => pinnedTop();

export function revealIfAbove(el: HTMLElement | null) {
  if (el && el.getBoundingClientRect().top < pinnedAbove()) scrollToStart(el, reduced() ? "auto" : "smooth");
}

/**
 * After a game closes: its card back on the screen, at once and unseen, when it sits above what is
 * pinned there or below the screen's end (a phone's window was switched to a later game); one on the
 * screen stays where it is.
 */
export function bringBack(el: HTMLElement | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top < pinnedAbove() || r.top > screenHeight() - 48) scrollToStart(el);
}

/** Brings a card just opened into view when it sits low on the screen or under what is pinned above it; one in the upper part of the screen stays where it is. */
export function revealOpened(el: HTMLElement | null) {
  if (!el) return;
  const top = el.getBoundingClientRect().top;
  if (top < pinnedAbove() || top > screenHeight() * 0.55) scrollToStart(el, reduced() ? "auto" : "smooth");
}

/**
 * After Previous or Next (or another card pressed while a game is open): the new card held where
 * the old one's header was (`top`, its place on the screen), now and for the next 30 frames while
 * the content above it settles (the game that closed drawing its card again). The hold ends early
 * once the reader scrolls, presses a key or a pointer, or the page is scrolled far by anything but
 * the hold: it used to run on for its 30 frames whatever else moved the page, and pulled a scroll made
 * meanwhile back by 612px (a scroll 400ms after a step, e2e/match-breakdown.spec.ts). Returns the
 * function that ends it.
 */
export function holdInPlace(el: HTMLElement, top: number): () => void {
  let expected = window.scrollY;
  const hold = () => {
    const off = el.getBoundingClientRect().top - top;
    if (Math.abs(off) > 0.5) window.scrollBy({ top: off, behavior: "instant" });
    expected = window.scrollY;
  };
  let frames = 0;
  let raf = 0;
  // Moved by something else, and far (a reader's scroll, not the browser's own scroll anchoring, which keeps what is on screen in place): the reader's choice stands.
  const onScroll = () => {
    if (Math.abs(window.scrollY - expected) > 1 && Math.abs(el.getBoundingClientRect().top - top) > 48) stop();
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("scroll", onScroll);
    for (const t of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(t, stop);
  };
  const tick = () => {
    hold();
    if (++frames < 30) raf = requestAnimationFrame(tick);
    else stop();
  };
  hold();
  raf = requestAnimationFrame(tick);
  window.addEventListener("scroll", onScroll, { passive: true });
  for (const t of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(t, stop, { passive: true, once: true });
  return stop;
}

/** The open game's way to its neighbours on the page: null at that end. */
export interface GameNav {
  prev: string | null;
  next: string | null;
  go: (matchId: string) => void;
}

const STEP = "inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent disabled:hover:text-fg-disabled pointer-coarse:h-11";

/**
 * After Previous or Next the pressed button is in the new game (the old one closed with it): the
 * focus goes to the same button there, or to Close when that end of the page is reached.
 */
export function keepStepFocus(testId: string, close: string) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const scope = document.querySelector("li[data-expanded]") ?? document.querySelector("[data-testid=match-detail]") ?? document;
      const same = scope.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
      (same && !same.disabled ? same : scope.querySelector<HTMLElement>(`[data-testid="${close}"]`))?.focus({ preventScroll: true });
    }),
  );
}

/** The test ids' stem of each set of steps: the open card's header, the game's sticky footer, the workspace's game window. */
const STEP_IDS = { header: "game-header", footer: "game", window: "match-detail" } as const;
/** Each set's Close. */
const CLOSE_IDS = { header: "game-header-close", footer: "match-close", window: "match-detail-close" } as const;

/** Previous, Next and Close, in the open card's header, in the game's sticky footer, and in the workspace's game window (its header's end). */
export function GameSteps({ nav, onClose, where, between }: { nav: GameNav | null; onClose: () => void; where: "header" | "footer" | "window"; /** Between Previous and Next: where the game stands in the list (the window's "Game 5 of 208"). */ between?: React.ReactNode }) {
  const id = STEP_IDS[where];
  const close = CLOSE_IDS[where];
  return (
    <span className="relative z-10 flex shrink-0 items-center gap-0.5" data-game-step="" data-where={where}>
      <button type="button" className={STEP} disabled={!nav?.prev} onClick={() => {
          if (!nav?.prev) return;
          nav.go(nav.prev);
          keepStepFocus(`${id}-prev`, close);
        }} data-testid={`${id}-prev`}>
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Previous<span className={cn(where !== "footer" && "sr-only")}> game</span>
      </button>
      {between}
      <button type="button" className={STEP} disabled={!nav?.next} onClick={() => {
          if (!nav?.next) return;
          nav.go(nav.next);
          keepStepFocus(`${id}-next`, close);
        }} data-testid={`${id}-next`}>
        Next<span className={cn(where !== "footer" && "sr-only")}> game</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button type="button" className={cn(STEP, "text-fg", where === "window" && "border border-border-strong")} onClick={onClose} data-testid={close}>
        {where === "window" ? <X className="h-3.5 w-3.5" aria-hidden /> : <ChevronUp className="h-3.5 w-3.5" aria-hidden />}
        Close<span className="sr-only"> this game</span>
      </button>
    </span>
  );
}

/**
 * The post-game view under an open card, with its own loading and error states, and a footer that
 * stays at the bottom of the screen while the game's end is below it: Previous, Next and Close.
 */
// In a one-screen workspace a list opens its games in the game window (MatchDetailModal's `workspace`): a game a link names is
// drawn under its card only in the server's HTML, before the page knows its posture, and hidden there (ws:hidden), so the
// workspace's first paint is the list alone.
export function MatchExpansion({ id, label, playerId, matchId, champ, nav, onClose, fit = true }: { id: string; label: string; playerId: string; matchId: string; champ: (id: string | null) => PortraitChampion; nav: GameNav | null; onClose: () => void; /** Bring the game into view once drawn: false after Previous or Next, whose card is held where the last one's header was. */ fit?: boolean }) {
  return (
    // The shared Unfold region (components/ui/unfold.tsx): it grows open, and its compact header
    // stays pinned with Close while the game is on screen and its own header has gone up.
    <UnfoldRegion id={id} label={label} header={<UnfoldHeader title={label} onClose={onClose} testId="match-unfold-header" />} className="rounded-b-panel border border-t-0 border-border bg-bg-elevated ws:hidden" testId="match-expanded">
      <div className="px-3 pt-3 sm:px-4 sm:pt-3">
        <InlineMatch playerId={playerId} matchId={matchId} champ={champ} fit={fit} />
        <GameFooter id={id} nav={nav} onClose={onClose} />
      </div>
    </UnfoldRegion>
  );
}

/**
 * The game's footer: Previous, Next and Close at the bottom of the screen while the game's end is
 * below it. Under a card with its own steps (Match History), only where the open game (its card
 * included) is taller than the room under what is pinned above the page: a game that fits the screen (every game on a desktop at 100% text, the
 * owner's brief of 24 Nov 2026) has its steps in its card's header, in view with all of it, and
 * spends no line on a footer. One set at a time: where the open card's own header carries the same
 * three (Match History) and that header is on screen, the footer keeps its place but shows nothing,
 * so the two sets are never seen together (the review of Release 13, finding 10). Team → Matches'
 * cards have no steps of their own, so their footer always shows.
 */
function GameFooter({ id, nav, onClose }: { id: string; nav: GameNav | null; onClose: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const probe = React.useRef<HTMLSpanElement>(null);
  const [headerShown, setHeaderShown] = React.useState(false);
  const [needed, setNeeded] = React.useState(false);
  React.useEffect(() => {
    const footer = ref.current;
    const steps = footer?.closest("li")?.querySelector<HTMLElement>("[data-game-step][data-where=header]");
    if (!steps) return;
    // What is pinned above the page (the bars, the pinned tabs) covers the top of the screen.
    const pinned = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        setHeaderShown(!!entry?.isIntersecting);
      },
      { rootMargin: `-${Math.round(pinned)}px 0px 0px 0px` },
    );
    io.observe(steps);
    return () => io.disconnect();
  }, [id]);
  React.useEffect(() => {
    // The open game's height without the footer (its card, the region above the footer), against the room under the pinned bars.
    const mark = probe.current;
    const region = mark?.closest<HTMLElement>("[data-testid=match-expanded]");
    if (!mark || !region) return;
    const card = region.closest("li")?.querySelector<HTMLElement>("[data-testid=match-card]") ?? null;
    // Without steps of its own in the card (Team → Matches) the footer is the game's one set: always drawn.
    if (!region.closest("li")?.querySelector("[data-game-step][data-where=header]")) {
      setNeeded(true);
      return;
    }
    const measure = () => {
      const pinned = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const top = (card ?? region).getBoundingClientRect().top;
      const end = mark.getBoundingClientRect().top;
      setNeeded(end - top > window.innerHeight - pinned + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(region);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [id]);
  return (
    <>
      {/* Where the game's content ends (the footer's height left out of the measure). */}
      <span ref={probe} className="block h-3" aria-hidden />
      <div
        ref={ref}
        className={cn("sticky bottom-0 z-10 -mx-3 -mt-1 flex justify-end rounded-b-panel border-t px-2 py-1 sm:-mx-4", !needed && "hidden", headerShown ? "invisible border-transparent" : "border-border/60 bg-bg-elevated/95 backdrop-blur")}
        data-testid="match-footer"
        data-hidden={headerShown || !needed || undefined}
        data-needed={needed || undefined}
      >
        <GameSteps nav={nav} onClose={onClose} where="footer" />
      </div>
    </>
  );
}

/** The breakdown under a card: loaded once opened (or from the press that opened it), kept by the list's cache. */
export function InlineMatch({ playerId, matchId, champ, fit = true }: { playerId: string; matchId: string; champ: (id: string | null) => PortraitChampion; fit?: boolean }) {
  const cache = React.useContext(MatchDetailCacheContext);
  const [result, setResult] = React.useState<MatchDetailResult | null>(null);
  React.useEffect(() => {
    let live = true;
    void (cache ? cache.load(playerId, matchId) : Promise.reject(new Error("no cache")))
      .catch((): MatchDetailResult => ({ status: "unavailable", message: "The match could not be loaded just now. Close it and open it again in a moment." }))
      .then((r) => {
        if (live) React.startTransition(() => setResult(r));
      });
    return () => {
      live = false;
    };
  }, [cache, playerId, matchId]);
  // Once the game is drawn: where its card sits in the upper part of the screen (revealOpened left
  // it there) and the game runs past the screen's foot while the whole of it fits the room under
  // the pinned bars (a desktop at 100% text), the page moves up just enough to show all of it.
  // Measured once the region has grown open (UnfoldRegion's data-settled), and again as the game
  // settles in its first seconds (the timeline, the groups and the ranks arriving change its height:
  // at 1280 × 720 it is taller than the room while they load, and fits once they have): one measure
  // while unfold-grow ran saw only part of the region, so with motion on the end of the game stayed
  // 155–237px below the fold (the review of Release 17, finding 2). With reduced motion nothing
  // grows, so the first measure is at once. A reader who scrolls or presses a key first keeps the
  // page where they put it.
  const box = React.useRef<HTMLDivElement>(null);
  const shown = result?.status === "ok";
  React.useLayoutEffect(() => {
    if (!shown || !fit) return;
    const region = box.current?.closest<HTMLElement>("[data-testid=match-expanded]");
    const card = region?.closest("li")?.querySelector<HTMLElement>("[data-testid=match-card]");
    const grown = region?.querySelector<HTMLElement>(":scope > [data-unfold-body]") ?? null;
    if (!region || !card) return;
    const bringIn = () => {
      const pinned = pinnedTop();
      const top = card.getBoundingClientRect().top;
      const bottom = region.getBoundingClientRect().bottom;
      const over = bottom - screenHeight();
      if (top < pinned - 1 || top > screenHeight() * 0.55 || over <= 0.5 || bottom - top > screenHeight() - pinned) return;
      window.scrollBy({ top: Math.min(over, top - pinned), behavior: reduced() ? "instant" : "smooth" });
    };
    const ro = new ResizeObserver(() => {
      if (!grown || grown.hasAttribute("data-settled")) bringIn();
    });
    const mo = new MutationObserver(() => {
      if (grown?.hasAttribute("data-settled")) bringIn();
    });
    let timer = 0;
    const stop = () => {
      ro.disconnect();
      mo.disconnect();
      window.clearTimeout(timer);
      for (const t of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(t, stop);
    };
    if (reduced() || !grown || grown.hasAttribute("data-settled")) bringIn();
    if (grown) mo.observe(grown, { attributes: true, attributeFilter: ["data-settled"] });
    ro.observe(region);
    timer = window.setTimeout(stop, SETTLING_MS);
    for (const t of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(t, stop, { passive: true });
    return stop;
    // Once per game drawn; `fit` is read as it is drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  if (!result)
    return (
      <div className="space-y-2" role="status" data-testid="match-expanded-loading">
        <span className="sr-only">Loading the match</span>
        <div className="h-9 w-72 max-w-full animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none" aria-hidden />
        <div className="h-48 animate-pulse rounded-panel bg-surface-2 motion-reduce:animate-none" aria-hidden />
      </div>
    );
  if (result.status !== "ok")
    return (
      <p className="rounded-panel border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="match-detail-message">
        {result.message}
      </p>
    );
  return (
    <div ref={box}>
      <PostGame key={matchId} playerId={playerId} view={result.view} champ={champ} variant="inline" />
    </div>
  );
}
