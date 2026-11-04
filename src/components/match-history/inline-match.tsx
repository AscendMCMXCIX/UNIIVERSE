"use client";

import * as React from "react";
import { ChevronUp } from "lucide-react";
import type { MatchDetailResult } from "@/server/players/match-history";
import type { PortraitChampion } from "@/components/champion-portrait";
import { MatchDetailCacheContext } from "./match-detail-cache";
import { MatchBreakdown } from "./match-breakdown";

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

/** Brings an element to the top of the screen when it sits above it (the list moved while a game was open). */
export function revealIfAbove(el: HTMLElement | null) {
  if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
}

/** Brings a card just opened into view when it sits low on the screen or above it; one in the upper part of the screen stays where it is. */
export function revealOpened(el: HTMLElement | null) {
  if (!el) return;
  const top = el.getBoundingClientRect().top;
  if (top < 0 || top > window.innerHeight * 0.55) el.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
}

/**
 * The breakdown under an open card, with its own loading and error states. Its end has the way
 * back from a long breakdown: "Close this game" closes it (`onClose`: the list brings the card into
 * view and puts the focus back on it).
 */
export function MatchExpansion({ id, label, playerId, matchId, champ, onClose }: { id: string; label: string; playerId: string; matchId: string; champ: (id: string | null) => PortraitChampion; onClose: () => void }) {
  return (
    <div id={id} role="region" aria-label={label} className="rounded-b-panel border border-t-0 border-border bg-bg-elevated p-3 motion-safe:rise-in sm:p-4" data-testid="match-expanded">
      <InlineMatch playerId={playerId} matchId={matchId} champ={champ} />
      <div className="mt-3 flex justify-end border-t border-border/60 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
          data-testid="match-close"
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          Close this game
        </button>
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
  return <MatchBreakdown key={matchId} playerId={playerId} view={result.view} champ={champ} variant="inline" />;
}
