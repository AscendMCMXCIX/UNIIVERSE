"use client";

import * as React from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { getMatchDetailAction } from "@/server/actions/match-history";
import type { MatchDetailResult } from "@/server/players/match-history";
import type { LpRecord } from "@/domain/lp-attribution";
import type { PortraitChampion } from "@/components/champion-portrait";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { BELOW_CONTROLS_ON_PHONES, CLEAR_OF_CONTROLS } from "@/components/ui/detail-modal";
import { PreviewWindow } from "@/components/ui/preview-window";
import { MatchDetailCacheContext } from "./match-detail-cache";
import { fmtDuration } from "./match-format";
import { LpChange } from "./match-card";
import { keepStepFocus, type GameNav } from "./inline-match";
import { PostGame } from "./post-game";

/**
 * One match in the site's shared detail window (wide, centred over the page; the whole screen on
 * phones), from Team Matches, Matchups and Encounters, and from a link to a game that is not on
 * the Match History page shown (Match History opens its games under their cards). The list behind
 * stays where it was; Escape, the close button or Back return to it, and focus goes back to the
 * game that opened it. The record loads when opened (and is fetched once from Riot if it was not
 * collected yet); the body is the match's breakdown (MatchBreakdown), the same as under a card.
 */
/**
 * `back` is for a match opened from another window (a champion's matchup): that window gives way to
 * this one, and Back returns to it; Close and Escape close both.
 */
export function MatchDetailModal({ playerId, matchId, championsById, onClose, back, encounterLinks = false, nav, lp }: { playerId: string; matchId: string; championsById: Record<string, PortraitChampion>; onClose: () => void; back?: { label: string; onBack: () => void }; /** Opened over Match History itself (a phone): the scoreboard's marks lead to its Encounters (see PostGame). */ encounterLinks?: boolean; /** The list's Previous and Next, and where this game sits in it (a phone's window over Match History). */ nav?: (GameNav & { index: number; total: number }) | null; /** A ranked game's LP change, from the list's card. */ lp?: LpRecord | null }) {
  const cache = React.useContext(MatchDetailCacheContext);
  const [loaded, setLoaded] = React.useState<{ matchId: string; result: MatchDetailResult } | null>(null);
  // The record starts loading as the window opens, but is shown only once the window has finished
  // opening (onSettled): its first frames hold the shell and a light skeleton, and rendering the
  // view never lands in the middle of the motion.
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    void (cache ? cache.load(playerId, matchId) : getMatchDetailAction(playerId, matchId)).then((r) => {
      if (live) React.startTransition(() => setLoaded({ matchId, result: r }));
    });
    return () => {
      live = false;
    };
  }, [cache, playerId, matchId]);
  const champ = React.useCallback((id: string | null): PortraitChampion => (id ? (championsById[id] ?? { id, name: id, portraitUrl: "" }) : { id: "unknown", name: "Unknown", portraitUrl: "" }), [championsById]);
  const result = settled && loaded?.matchId === matchId ? loaded.result : null;
  const view = result?.status === "ok" ? result.view : null;
  // Switching games (Previous, Next) shows the next one from its top, and says which it is.
  const [said, setSaid] = React.useState("");
  const first = React.useRef(matchId);
  React.useEffect(() => {
    if (first.current === matchId) return;
    document.querySelector("[data-testid=match-detail-body]")?.scrollTo({ top: 0 });
  }, [matchId]);
  React.useEffect(() => {
    if (!view || first.current === view.matchId || !nav) return;
    setSaid(`Game ${nav.index + 1} of ${nav.total}: ${view.win ? "Victory" : "Defeat"} on ${champ(view.championId).name}`);
  }, [view, nav, champ]);
  // One line, pinned: the result and the champion, a ranked game's LP, and the close button (the
  // window's own, top right). The game's queue, length, date and patch open the body.
  const header = (
    <div className={cn("flex min-h-13 items-center gap-2 py-2 pl-4 sm:pl-6", back ? BELOW_CONTROLS_ON_PHONES : CLEAR_OF_CONTROLS)}>
      <h2 id="match-detail-title" className="flex min-w-0 items-baseline gap-2 truncate text-lg font-semibold text-fg">
        {view ? (
          <>
            <span className={cn("font-bold", view.win ? "text-blue" : "text-red")} data-testid="match-result">
              {view.win ? "Victory" : "Defeat"}
            </span>
            <span className="truncate">· {champ(view.championId).name}</span>
          </>
        ) : (
          "Match details"
        )}
      </h2>
      {view && lp ? <LpChange lp={lp} focusable /> : null}
    </div>
  );
  const footer = nav ? (
    <div className="flex items-center justify-between gap-2" data-testid="match-detail-nav">
      <button type="button" className={NAV_BUTTON} disabled={!nav.prev} onClick={() => {
          if (!nav.prev) return;
          nav.go(nav.prev);
          keepStepFocus("match-detail-prev", "match-detail-next");
        }} data-testid="match-detail-prev">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Previous
      </button>
      <span className="text-xs tabular-nums text-fg-muted" data-testid="match-detail-position">
        Game {nav.index + 1} of {nav.total}
      </span>
      <button type="button" className={NAV_BUTTON} disabled={!nav.next} onClick={() => {
          if (!nav.next) return;
          nav.go(nav.next);
          keepStepFocus("match-detail-next", "match-detail-prev");
        }} data-testid="match-detail-next">
        Next
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </div>
  ) : undefined;
  return (
    <PreviewWindow
      open
      onClose={onClose}
      size="wide"
      title="Match details"
      compactTitle={view ? `${view.win ? "Victory" : "Defeat"} · ${champ(view.championId).name}` : undefined}
      titleId="match-detail-title"
      header={header}
      headerClassName={view ? (view.win ? "bg-gradient-to-r from-blue/15 via-blue/5 to-transparent" : "bg-gradient-to-r from-red/15 via-red/5 to-transparent") : "bg-surface"}
      testId="match-detail"
      headerExtra={
        back ? (
          <button type="button" onClick={back.onBack} className="inline-flex h-9 max-w-[min(16rem,50vw)] items-center gap-1.5 rounded-md border border-border-strong bg-bg/60 px-2.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11" data-testid="match-detail-back">
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              <span className="sr-only">Back to </span>
              {back.label}
            </span>
          </button>
        ) : undefined
      }
      headerTestId="match-detail-header"
      closeTestId="match-detail-close"
      bodyTestId="match-detail-body"
      footer={footer}
      onSettled={() => setSettled(true)}
    >
      {!result ? (
        <DetailSkeleton />
      ) : (
        <div className="space-y-3 motion-safe:fade-in" key={matchId}>
          {view ? (
            <p className="text-xs tabular-nums text-fg-muted" data-testid="match-detail-meta">
              {[view.queue, fmtDuration(view.durationS), view.role && view.role !== "UNKNOWN" ? (ROLE_LABELS[view.role as Role] ?? view.role) : null, formatDate(new Date(view.playedAt)), view.patch ? `Patch ${view.patch}` : null].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {result.status !== "ok" ? (
            <p className="rounded-panel border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="match-detail-message">
              {result.message}
            </p>
          ) : (
            <PostGame key={view!.matchId} playerId={playerId} view={view!} champ={champ} variant="window" encounterLinks={encounterLinks} />
          )}
        </div>
      )}
    </PreviewWindow>
  );
}

const NAV_BUTTON = "inline-flex h-11 min-w-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40";

function DetailSkeleton() {
  return (
    <div className="space-y-3" role="status">
      <span className="sr-only">Loading the match</span>
      <div className="h-20 animate-pulse rounded-lg bg-surface-2" aria-hidden />
      <div className="grid grid-cols-3 gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-panel bg-surface-2" aria-hidden />
    </div>
  );
}
