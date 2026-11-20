"use client";

import * as React from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { isPlainClick } from "@/lib/back-to-top";
import { Peek, usePeek } from "@/components/ui/peek";
import { RowLink } from "@/components/ui/data-list";
import type { PortraitChampion } from "@/components/champion-portrait";
import { MatchDetailCacheContext, createMatchDetailCache } from "@/components/match-history/match-detail-cache";
import { PostGame } from "@/components/match-history/post-game";
import { fmtDuration } from "@/components/match-history/match-format";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { MatchDetailResult } from "@/server/players/match-history";
import { formatDate } from "@/lib/format";

/*
  A record's game over the board (PLAN S6c, UD.L3): a record row opens the game that set it at
  `/leaderboards?match=…` (the season kept), a docked Peek on wider screens and the window on phones
  (S4a's Peek), with "Open in Match History" inside. Closing (✕, Escape, Back) leaves you on the
  board: the first open pushes one entry, ‹ › replace it (address-item.ts).

  The game is read through Match History's own actions (getMatchDetailAction and the rest), which
  establish who is asking first and reapply the profile's checks: teammates' games only with
  view-teammate-stats, and a personal-use profile's never for another member. The board lists team
  members only, and an address naming any other game opens nothing.
*/

export interface RecordGame {
  matchId: string;
  playerId: string;
  /** "Most kills in a game · Gwen": the Peek's title. */
  title: string;
  /** The game in the holder's Match History. */
  historyHref: string;
}

/**
 * Leaderboards' two Peeks (a player, `?player=`, and a record's game, `?match=`) share the board's
 * right edge, so one at a time: opening one first takes the other out of the address (replacing its
 * entry, not adding one) and tells it so, as Back would (its address item follows popstate). So Back
 * then closes the one in view and leaves the board.
 */
export function dropOtherPeek(param: "player" | "match") {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(param)) return;
  url.searchParams.delete(param);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
}

const RecordGameContext = React.createContext<{
  row: (matchId: string) => {
    href: string;
    onClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
    selected: boolean;
  };
} | null>(null);

export function RecordGamePeek({ games, championsById, children }: { games: RecordGame[]; championsById: Record<string, PortraitChampion>; children: React.ReactNode }) {
  const ids = React.useMemo(() => [...new Set(games.map((g) => g.matchId))], [games]);
  const peek = usePeek({ param: "match", ids });
  const cache = React.useMemo(() => createMatchDetailCache(), []);
  const pathname = usePathname();
  const search = useSearchParams();
  const row = React.useCallback(
    (matchId: string) => {
      const q = new URLSearchParams(search?.toString() ?? "");
      q.set("match", matchId);
      return {
        href: `${pathname}?${q.toString()}`,
        onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
          // A click that asks for another tab or window is the browser's.
          if (!isPlainClick(e)) return;
          e.preventDefault();
          dropOtherPeek("player");
          peek.toggle(matchId, e.currentTarget);
        },
        selected: peek.id === matchId,
      };
    },
    [pathname, search, peek],
  );
  const value = React.useMemo(() => ({ row }), [row]);
  // An address naming both (a copied link): the game, the later and narrower one, stays.
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).has("match")) dropOtherPeek("player");
  }, []);
  const game = peek.id ? (games.find((g) => g.matchId === peek.id) ?? null) : null;
  return (
    <RecordGameContext.Provider value={value}>
      {children}
      <MatchDetailCacheContext.Provider value={cache}>
        <Peek peek={peek} label="Record game" title={game?.title ?? "Game"} itemKey={game ? game.matchId : null} windowSize="wide" testId="record-game-peek">
          {game ? <RecordGameBody key={game.matchId} game={game} championsById={championsById} /> : null}
        </Peek>
      </MatchDetailCacheContext.Provider>
    </RecordGameContext.Provider>
  );
}

function RecordGameBody({ game, championsById }: { game: RecordGame; championsById: Record<string, PortraitChampion> }) {
  const cache = React.useContext(MatchDetailCacheContext)!;
  const [result, setResult] = React.useState<MatchDetailResult | null>(null);
  React.useEffect(() => {
    let live = true;
    cache.load(game.playerId, game.matchId).then(
      (r) => live && React.startTransition(() => setResult(r)),
      () =>
        live &&
        setResult({
          status: "unavailable",
          message: "The game could not be loaded just now. Close it and open it again in a moment.",
        }),
    );
    return () => {
      live = false;
    };
  }, [cache, game.playerId, game.matchId]);
  const champ = React.useCallback((id: string | null): PortraitChampion => (id ? (championsById[id] ?? { id, name: id, portraitUrl: "" }) : { id: "unknown", name: "Unknown", portraitUrl: "" }), [championsById]);
  const view = result?.status === "ok" ? result.view : null;
  return (
    <div className="space-y-3" data-testid="record-game-body">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {view ? (
          <p className="text-xs tabular-nums text-fg-muted" data-testid="record-game-meta">
            <span className={view.win ? "font-semibold text-blue" : "font-semibold text-red"}>{view.win ? "Victory" : "Defeat"}</span>
            {" · "}
            {[view.queue, fmtDuration(view.durationS), view.role && view.role !== "UNKNOWN" ? (ROLE_LABELS[view.role as Role] ?? view.role) : null, formatDate(new Date(view.playedAt))].filter(Boolean).join(" · ")}
          </p>
        ) : (
          <span />
        )}
        <Link
          href={game.historyHref}
          prefetch={false}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-fg transition-colors hover:border-border-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
          data-testid="record-game-history"
        >
          <History className="h-3.5 w-3.5" aria-hidden />
          Open in Match History
        </Link>
      </div>
      {!result ? (
        <div className="space-y-2" role="status" data-testid="record-game-loading">
          <span className="sr-only">Loading the game</span>
          <div className="h-48 animate-pulse rounded-panel bg-surface-2 motion-reduce:animate-none" aria-hidden />
        </div>
      ) : view ? (
        <PostGame playerId={game.playerId} view={view} champ={champ} variant="window" />
      ) : (
        <p className="rounded-panel border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="record-game-message">
          {result.status === "ok" ? null : result.message}
        </p>
      )}
    </div>
  );
}

/** A record row's press: the game over the board (a link to the board's address with `?match=`), laid over the row as RowLink is; the plain link without the Peek. */
export function RecordGameLink({ matchId, href, children }: { matchId: string; href: string; children: React.ReactNode }) {
  const ctx = React.useContext(RecordGameContext);
  if (!ctx)
    return (
      <RowLink href={href} prefetch={false} testId="record-open">
        {children}
      </RowLink>
    );
  const r = ctx.row(matchId);
  return (
    <a
      href={r.href}
      onClick={r.onClick}
      aria-current={r.selected ? "true" : undefined}
      className="absolute inset-0 z-[1] rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      data-row-link=""
      data-peek-row={matchId}
      data-selected={r.selected || undefined}
      data-testid="record-open"
    >
      <span className="sr-only">{children}</span>
    </a>
  );
}
