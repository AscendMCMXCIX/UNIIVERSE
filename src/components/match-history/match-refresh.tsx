"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { refreshMatchesAction } from "@/server/actions/match-history";
import type { MatchSyncStatus, RefreshOutcome } from "@/server/accounts/refresh";

type State = { phase: "idle" } | { phase: "checking" } | { phase: "done"; outcome: RefreshOutcome; at: number };

/** The sentence for a finished refresh: what actually happened, never "updated" for a click alone. */
function outcomeText(o: RefreshOutcome, now: Date): { text: string; tone: "good" | "muted" | "bad" } {
  switch (o.status) {
    case "updated":
      return { text: `${o.newGames} new game${o.newGames === 1 ? "" : "s"} found.`, tone: "good" };
    case "no-new":
      return { text: "No new games found. Riot can take a few minutes to list a game that just ended.", tone: "muted" };
    case "recent":
      return { text: `Already checked ${o.checkedAt ? timeAgo(o.checkedAt, now) : "moments ago"}; you can refresh again in ${o.retryInSeconds < 60 ? `${o.retryInSeconds} s` : `${Math.ceil(o.retryInSeconds / 60)} min`}.`, tone: "muted" };
    case "failed":
      return { text: `Couldn't refresh: ${o.message}`, tone: "bad" };
    case "unavailable":
      return { text: o.message, tone: "muted" };
  }
}

/**
 * Match History freshness: when the linked accounts were last read successfully and when the
 * newest stored game was played, plus "Refresh" for the player (or an admin). A refresh checks
 * Riot now, then reloads the list in place: the URL keeps the season, mode, account, role and page.
 * When new games arrive while an older page is open, a link goes back to the newest.
 */
export function MatchRefresh({ playerId, status, canRefresh, page, onShowNewest }: { playerId: string; status: MatchSyncStatus; canRefresh: boolean; page: number; onShowNewest: () => void }) {
  const router = useRouter();
  const [state, setState] = React.useState<State>({ phase: "idle" });
  const [, startTransition] = React.useTransition();
  // Relative times stay current while the page is open.
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const refresh = async () => {
    setState({ phase: "checking" });
    let outcome: RefreshOutcome;
    try {
      outcome = await refreshMatchesAction(playerId);
    } catch {
      outcome = { status: "failed", message: "please try again in a few minutes." };
    }
    setNow(new Date());
    setState({ phase: "done", outcome, at: Date.now() });
    // Re-read the list (and the status above) from the server; the filters live in the URL.
    if (outcome.status === "updated" || outcome.status === "no-new") startTransition(() => router.refresh());
  };

  if (status.accounts === 0) return null;
  const checking = state.phase === "checking";
  const result = state.phase === "done" ? outcomeText(state.outcome, now) : null;
  const fresh = state.phase === "done" && state.outcome.status === "updated";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted" data-testid="match-refresh">
      <span data-testid="match-sync-status" title={status.problem ?? undefined}>
        {status.checkedAt ? `Checked ${timeAgo(status.checkedAt, now)}` : "Not checked yet"}
        {status.newestGameAt ? ` · newest game ${timeAgo(status.newestGameAt, now)}` : ""}
        {status.problem ? <span className="text-warn"> · last sync had a problem</span> : null}
      </span>
      {canRefresh ? (
        <Button size="sm" variant="ghost" onClick={refresh} disabled={checking} aria-describedby="match-refresh-live" data-testid="match-refresh-button" className="-my-1 text-fg-muted">
          <RefreshCw className={cn("h-3.5 w-3.5", checking && "motion-safe:animate-spin")} aria-hidden />
          {checking ? "Checking…" : "Refresh"}
        </Button>
      ) : null}
      <span id="match-refresh-live" role="status" aria-live="polite" className={cn(result?.tone === "good" && "font-medium text-good", result?.tone === "bad" && "text-bad")} data-testid="match-refresh-result">
        {checking ? "Checking Riot for new games…" : result?.text}
        {fresh && page > 1 ? (
          <>
            {" "}
            <button type="button" onClick={onShowNewest} className="font-medium text-accent hover:underline">
              Show the newest
            </button>
          </>
        ) : null}
      </span>
    </div>
  );
}
