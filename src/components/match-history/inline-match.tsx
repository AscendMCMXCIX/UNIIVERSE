"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MatchDetailResult } from "@/server/players/match-history";
import type { PortraitChampion } from "@/components/champion-portrait";
import { MatchDetailCacheContext } from "./match-detail-cache";
import { PostGame } from "./post-game";
import { screenHeight } from "@/lib/screen";

/*
  A game opened under its card: the one way a list of games opens a game (a player's Match History
  and Team → Matches). The card is a box with one button behind its content (aria-expanded, Enter
  or Space toggles it); this region follows the card with the match's breakdown (MatchBreakdown:
  Scoreboard, Analysis, Timeline, Build), loaded when the game opens and kept by the list's cache,
  then "Close this game" at its end. The page scrolls as one: no window and no inner scrolling, and
  the list, its filters and its place stay as they were. The shared match window (MatchDetailModal)
  is for where a list cannot open a game in place: from inside another window (Matchups,
  Encounters) or from a link to a game that is not on the page shown.
*/

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** What is pinned above the page (the top bar, a profile's or Team's pinned section tabs): the page's scroll padding, which scrollIntoView honours. */
const pinnedAbove = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;

export function revealIfAbove(el: HTMLElement | null) {
  if (el && el.getBoundingClientRect().top < pinnedAbove()) el.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
}

/**
 * After a game closes: its card back on the screen, at once and unseen, when it sits above what is
 * pinned there or below the screen's end (a phone's window was switched to a later game); one on the
 * screen stays where it is.
 */
export function bringBack(el: HTMLElement | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top < pinnedAbove() || r.top > screenHeight() - 48) el.scrollIntoView({ block: "start", behavior: "instant" });
}

/** Brings a card just opened into view when it sits low on the screen or under what is pinned above it; one in the upper part of the screen stays where it is. */
export function revealOpened(el: HTMLElement | null) {
  if (!el) return;
  const top = el.getBoundingClientRect().top;
  if (top < pinnedAbove() || top > screenHeight() * 0.55) el.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
}

/** The open game's way to its neighbours on the page: null at that end. */
export interface GameNav {
  prev: string | null;
  next: string | null;
  go: (matchId: string) => void;
}

const STEP = "inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 pointer-coarse:h-11";

/** Previous, Next and Close, in the open card's header and in the game's sticky footer. */
export function GameSteps({ nav, onClose, where }: { nav: GameNav | null; onClose: () => void; where: "header" | "footer" }) {
  const id = where === "header" ? "game-header" : "game";
  return (
    <span className="relative z-10 flex shrink-0 items-center gap-0.5" data-game-step="">
      <button type="button" className={STEP} disabled={!nav?.prev} onClick={() => nav?.prev && nav.go(nav.prev)} data-testid={`${id}-prev`}>
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Previous<span className={cn(where === "header" && "sr-only")}> game</span>
      </button>
      <button type="button" className={STEP} disabled={!nav?.next} onClick={() => nav?.next && nav.go(nav.next)} data-testid={`${id}-next`}>
        Next<span className={cn(where === "header" && "sr-only")}> game</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button type="button" className={cn(STEP, "text-fg")} onClick={onClose} data-testid={where === "header" ? "game-header-close" : "match-close"}>
        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        Close<span className="sr-only"> this game</span>
      </button>
    </span>
  );
}

/**
 * The post-game view under an open card, with its own loading and error states, and a footer that
 * stays at the bottom of the screen while the game's end is below it: Previous, Next and Close.
 */
export function MatchExpansion({ id, label, playerId, matchId, champ, nav, onClose }: { id: string; label: string; playerId: string; matchId: string; champ: (id: string | null) => PortraitChampion; nav: GameNav | null; onClose: () => void }) {
  return (
    <div id={id} role="region" aria-label={label} className="rounded-b-panel border border-t-0 border-border bg-bg-elevated px-3 pt-3 motion-safe:fade-in sm:px-4 sm:pt-4" data-testid="match-expanded">
      <InlineMatch playerId={playerId} matchId={matchId} champ={champ} />
      <div className="sticky bottom-0 z-10 -mx-3 mt-2 flex justify-end rounded-b-panel border-t border-border/60 bg-bg-elevated/95 px-2 py-1 backdrop-blur sm:-mx-4" data-testid="match-footer">
        <GameSteps nav={nav} onClose={onClose} where="footer" />
      </div>
    </div>
  );
}

/** The breakdown under a card: loaded once opened (or from the press that opened it), kept by the list's cache. */
export function InlineMatch({ playerId, matchId, champ }: { playerId: string; matchId: string; champ: (id: string | null) => PortraitChampion }) {
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
  if (!result)
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading the match" data-testid="match-expanded-loading">
        <div className="h-9 w-72 max-w-full animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none" />
        <div className="h-48 animate-pulse rounded-panel bg-surface-2 motion-reduce:animate-none" />
      </div>
    );
  if (result.status !== "ok")
    return (
      <p className="rounded-panel border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="match-detail-message">
        {result.message}
      </p>
    );
  return <PostGame key={matchId} playerId={playerId} view={result.view} champ={champ} variant="inline" />;
}
