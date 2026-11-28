"use client";

import * as React from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { publicPatchName } from "@/domain/patch";
import { getMatchDetailAction } from "@/server/actions/match-history";
import type { MatchDetailResult } from "@/server/players/match-history";
import type { LpRecord } from "@/domain/lp-attribution";
import type { PortraitChampion } from "@/components/champion-portrait";
import { formatCount, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { BELOW_CONTROLS_ON_PHONES, CLEAR_OF_CONTROLS } from "@/components/ui/detail-modal";
import { PreviewWindow } from "@/components/ui/preview-window";
import { MatchDetailCacheContext } from "./match-detail-cache";
import { fmtDuration } from "./match-format";
import { LpChange } from "./match-card";
import { GameSteps, keepStepFocus, type GameNav } from "./inline-match";
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
export function MatchDetailModal({ playerId, matchId, championsById, onClose, back, encounterLinks = false, nav, lp, workspace = false }: { playerId: string; matchId: string; championsById: Record<string, PortraitChampion>; onClose: () => void; back?: { label: string; onBack: () => void }; /** Opened over Match History itself (a phone, the workspace): the scoreboard's marks lead to its Encounters (see PostGame). */ encounterLinks?: boolean; /** The list's Previous and Next, and where this game sits in it (a phone's window over Match History, the workspace's game window). */ nav?: (GameNav & { index: number; total: number }) | null; /** A ranked game's LP change, from the list's card. */ lp?: LpRecord | null; /**
   * The workspace's game window (docs/RESPONSIVE.md, "One-screen desktop pages", Match History): a desktop
   * window in the one-screen gate opens every game of a list here, over the list, which never moves. The
   * match window's wide width (76rem: the post-game view keeps its two columns) at the workspace window's
   * fixed height (the screen less 1rem above and below), headless: one header line (the result, the
   * champion, the length; the queue, the date and the patch; a ranked game's LP) ending with Previous,
   * where the game stands in the list, Next and Close; the view fills the rest and never scrolls (its
   * pages where it does not fit: PostGame's fitPages).
   */ workspace?: boolean }) {
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
  // Pinned: the result, the champion and the game's length, a ranked game's LP, and the close button
  // (the window's own, top right); under them, in one quiet line, the game's queue, date and patch (in
  // the header since 24 Nov 2026, so a phone's pages keep the whole screen under it; the player's role
  // is the Player page's first line).
  const header = (
    <div className={cn("flex min-h-13 items-center gap-2 py-1.5 pl-4 sm:pl-6", back ? BELOW_CONTROLS_ON_PHONES : CLEAR_OF_CONTROLS)}>
      <div className="min-w-0">
        {/* The result, the champion and the length wrap onto a second line where they do not fit (a long name, large text): none of them is ever cut. */}
        <h2 id="match-detail-title" className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-lg font-semibold leading-6 text-fg">
          {view ? (
            <>
              <span className={cn("font-bold", view.win ? "text-blue" : "text-red")} data-testid="match-result">
                {view.win ? "Victory" : "Defeat"}
              </span>
              <span className="min-w-0 [overflow-wrap:anywhere]" data-testid="match-detail-champion">· {champ(view.championId).name}</span>
              <span className="shrink-0 text-sm font-normal tabular-nums text-fg-muted" data-testid="match-detail-duration">
                {fmtDuration(view.durationS)}
              </span>
            </>
          ) : (
            "Match details"
          )}
        </h2>
        {view ? (
          <p className="text-xs leading-4 tabular-nums text-fg-muted" data-testid="match-detail-meta">
            {[view.queue, formatDate(new Date(view.playedAt)), view.patch ? `Patch ${publicPatchName(view.patch)}` : null].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
      {view && lp ? <LpChange lp={lp} focusable /> : null}
    </div>
  );
  const footer = nav ? (
    // One compact row at every text size: where the row is narrower than 17rem (large text) the two
    // steps keep their arrows and their names for screen readers, so "Game n of m" stays between them
    // and nothing stacks (at 200% on a 390px phone the row was 225px tall, Previous and Next stacked).
    // The buttons keep a finger's 44px whatever the text size; the position wraps within its own room.
    <div className="@container/mdnav w-full min-w-0">
      <div className="flex items-center justify-between gap-x-2 @max-[17rem]/mdnav:gap-x-1" data-testid="match-detail-nav">
        <button type="button" className={NAV_BUTTON} disabled={!nav.prev} onClick={() => {
            if (!nav.prev) return;
            nav.go(nav.prev);
            keepStepFocus("match-detail-prev", "match-detail-next");
          }} data-testid="match-detail-prev">
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
          <span className={NAV_WORD}>Previous</span>
          <span className="sr-only"> game</span>
        </button>
        <span className="min-w-0 flex-1 text-center text-xs tabular-nums text-fg-muted" data-testid="match-detail-position">
          Game {nav.index + 1} of {nav.total}
        </span>
        <button type="button" className={NAV_BUTTON} disabled={!nav.next} onClick={() => {
            if (!nav.next) return;
            nav.go(nav.next);
            keepStepFocus("match-detail-next", "match-detail-prev");
          }} data-testid="match-detail-next">
          <span className={NAV_WORD}>Next</span>
          <span className="sr-only"> game</span>
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
        </button>
        <span className="sr-only" aria-live="polite">
          {said}
        </span>
      </div>
    </div>
  ) : undefined;
  if (workspace) {
    const tone = view ? (view.win ? "bg-gradient-to-r from-blue/15 via-blue/5 to-transparent" : "bg-gradient-to-r from-red/15 via-red/5 to-transparent") : undefined;
    return (
      <PreviewWindow open onClose={onClose} size="workspace" workspaceWidth="game" headless title="Match details" titleId="match-detail-title" testId="match-detail" bodyTestId="match-detail-body" bodyClassName="min-h-0" onSettled={() => setSettled(true)}>
        {/* One line: what the game was, then the steps through the list and Close at its end (wrapping, never cut, at a large text size). */}
        <div className={cn("flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-t-card border-b border-border py-2 pl-5 pr-3", tone)} data-testid="match-detail-header">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id="match-detail-title" tabIndex={-1} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-lg font-semibold leading-6 text-fg outline-none">
              {view ? (
                <>
                  <span className={cn("font-bold", view.win ? "text-blue" : "text-red")} data-testid="match-result">
                    {view.win ? "Victory" : "Defeat"}
                  </span>
                  <span className="min-w-0 [overflow-wrap:anywhere]" data-testid="match-detail-champion">· {champ(view.championId).name}</span>
                  <span className="shrink-0 text-sm font-normal tabular-nums text-fg-muted" data-testid="match-detail-duration">
                    {fmtDuration(view.durationS)}
                  </span>
                </>
              ) : (
                "Match details"
              )}
            </h2>
            {view ? (
              <p className="text-xs leading-4 tabular-nums text-fg-muted" data-testid="match-detail-meta">
                {[view.queue, formatDate(new Date(view.playedAt)), view.patch ? `Patch ${publicPatchName(view.patch)}` : null].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {view && lp ? <LpChange lp={lp} focusable /> : null}
          </div>
          <GameSteps
            nav={nav ?? null}
            onClose={onClose}
            where="window"
            between={
              nav ? (
                <span className="whitespace-nowrap px-1 text-xs tabular-nums text-fg-muted" data-testid="match-detail-position">
                  Game {formatCount(nav.index + 1)} of {formatCount(nav.total)}
                </span>
              ) : null
            }
          />
          <span className="sr-only" aria-live="polite">
            {said}
          </span>
        </div>
        {/* The room the view fills: PostGame measures itself against its parent (fitPages), the fade's box, as tall as the room. */}
        <div className="min-h-0 flex-1 px-5 pb-4 pt-3">
          {!result ? (
            <DetailSkeleton />
          ) : (
            <div className="h-full motion-safe:fade-in" key={matchId}>
              {result.status !== "ok" ? (
                <p className="rounded-panel border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="match-detail-message">
                  {result.message}
                </p>
              ) : (
                <PostGame key={view!.matchId} playerId={playerId} view={view!} champ={champ} variant="window" encounterLinks={encounterLinks} fitPages />
              )}
            </div>
          )}
        </div>
      </PreviewWindow>
    );
  }
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
        <div className="motion-safe:fade-in" key={matchId}>
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

/** Previous and Next under a phone's game: 44px at every text size (a finger's target; in rem they grew to 88px at 200%). */
const NAV_BUTTON = "inline-flex h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent @max-[17rem]/mdnav:px-1";
/** A step's word: shown where the row has room for both words and the position, else for screen readers only. */
const NAV_WORD = "@max-[17rem]/mdnav:sr-only";

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
