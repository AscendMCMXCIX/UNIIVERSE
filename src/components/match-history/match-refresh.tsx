"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Clock, Info, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { refreshMatchesAction } from "@/server/actions/match-history";
import type { MatchSyncStatus, RefreshOutcome } from "@/server/accounts/refresh";

type State = { phase: "idle" } | { phase: "checking" } | { phase: "done"; outcome: RefreshOutcome };
type Tone = "good" | "muted" | "info" | "bad" | "wait";

/** How long a "new games" or "no new games" note stays before the line returns to its quiet state. */
const NOTE_MS = 8_000;

const seconds = (s: number) => (s < 60 ? `${s} s` : `${Math.ceil(s / 60)} min`);

/**
 * The short note for a finished refresh: what actually happened, never "updated" for a click alone.
 * `detail` is the full sentence for screen readers and the tooltip.
 */
function outcomeNote(o: RefreshOutcome, wait: number): { text: string; detail: string; tone: Tone } {
  switch (o.status) {
    case "updated": {
      const text = `${o.newGames} new game${o.newGames === 1 ? "" : "s"}`;
      return { text, detail: `${text} found.`, tone: "good" };
    }
    case "no-new":
      return { text: "No new games", detail: "No new games found. Riot can take a few minutes to list a game that just ended.", tone: "muted" };
    case "recent":
      return wait > 0
        ? { text: `Checked recently · try again in ${seconds(wait)}`, detail: `Already checked recently; you can refresh again in ${seconds(wait)}.`, tone: "wait" }
        : { text: "Ready to refresh again", detail: "You can refresh again now.", tone: "muted" };
    case "failed":
      return { text: `Couldn't refresh: ${o.message}`, detail: `Couldn't refresh: ${o.message}`, tone: "bad" };
    case "unavailable":
      return { text: o.message, detail: o.message, tone: "info" };
  }
}

const NOTE_ICON: Record<Tone, typeof Check> = { good: Check, muted: Check, info: Info, bad: AlertCircle, wait: Clock };

/**
 * Match History freshness on one line: a Refresh button for the player (or an admin) and
 * "Checked 4m ago · Newest game 2h ago". A refresh checks Riot once, then reloads the list in place:
 * the URL keeps the season, mode, account, role and page. The result shows briefly beside the
 * button; a failure stays until the next try, and a refresh too soon after the last one waits out
 * the server's cooldown with the button disabled. Nothing is checked on a timer.
 */
export function MatchRefresh({ playerId, status, canRefresh, page, onShowNewest }: { playerId: string; status: MatchSyncStatus; canRefresh: boolean; page: number; onShowNewest: () => void }) {
  const router = useRouter();
  const [state, setState] = React.useState<State>({ phase: "idle" });
  const [, startTransition] = React.useTransition();
  // Relative times stay current while the page is open (a clock only; nothing is fetched).
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  // The cooldown the server reported, counted down locally.
  const [waitUntil, setWaitUntil] = React.useState(0);
  const [wait, setWait] = React.useState(0);
  React.useEffect(() => {
    if (!waitUntil) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));
      setWait(left);
      if (left === 0) setWaitUntil(0);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [waitUntil]);
  // Success notes, and the cooldown note once it has run out, fade back to the quiet line.
  const outcome = state.phase === "done" ? state.outcome.status : null;
  React.useEffect(() => {
    const transient = outcome === "no-new" || (outcome === "updated" && page <= 1) || (outcome === "recent" && wait === 0 && !waitUntil);
    if (!transient) return;
    const t = window.setTimeout(() => setState({ phase: "idle" }), outcome === "recent" ? 2_000 : NOTE_MS);
    return () => window.clearTimeout(t);
  }, [outcome, page, wait, waitUntil]);

  const refresh = async () => {
    setState({ phase: "checking" });
    let result: RefreshOutcome;
    try {
      result = await refreshMatchesAction(playerId);
    } catch {
      result = { status: "failed", message: "please try again in a few minutes." };
    }
    setNow(new Date());
    if (result.status === "recent") {
      setWait(result.retryInSeconds);
      setWaitUntil(Date.now() + result.retryInSeconds * 1000);
    }
    setState({ phase: "done", outcome: result });
    // Re-read the list (and the status line) from the server; the filters live in the URL.
    if (result.status === "updated" || result.status === "no-new") startTransition(() => router.refresh());
  };

  if (status.accounts === 0) return null;
  const checking = state.phase === "checking";
  const note = state.phase === "done" ? outcomeNote(state.outcome, wait) : null;
  const fresh = state.phase === "done" && state.outcome.status === "updated";
  const NoteIcon = note ? NOTE_ICON[note.tone] : null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="match-refresh">
      {canRefresh ? (
        <Button size="sm" variant="secondary" onClick={refresh} disabled={checking || wait > 0} aria-describedby="match-refresh-live" data-testid="match-refresh-button" className="font-medium">
          <RefreshCw className={cn("h-3.5 w-3.5", checking && "motion-safe:animate-spin")} aria-hidden />
          {checking ? "Refreshing…" : "Refresh"}
        </Button>
      ) : null}
      <span className="text-xs text-fg-muted tabular-nums" data-testid="match-sync-status" title={status.problem ?? undefined}>
        {status.checkedAt ? `Checked ${timeAgo(status.checkedAt, now)}` : "Not checked yet"}
        {status.newestGameAt ? ` · Newest game ${timeAgo(status.newestGameAt, now)}` : ""}
        {status.problem ? <span className="text-warn"> · Last sync had a problem</span> : null}
      </span>
      <span id="match-refresh-live" role="status" aria-live="polite" className="text-xs empty:hidden" data-testid="match-refresh-result">
        {checking ? (
          <span className="text-fg-muted">Checking Riot for new games…</span>
        ) : note && NoteIcon ? (
          <span
            title={note.detail !== note.text ? note.detail : undefined}
            data-tone={note.tone}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 motion-safe:animate-[fade-in_150ms_ease-out]",
              note.tone === "good" ? "border-good/40 bg-good/10 font-medium text-good" : note.tone === "bad" ? "border-bad/40 bg-bad/10 text-bad" : "border-border bg-surface-2 text-fg-muted",
            )}
          >
            <NoteIcon className="h-3 w-3 shrink-0" aria-hidden />
            <span aria-hidden={note.detail !== note.text || undefined}>{note.text}</span>
            {note.detail !== note.text ? <span className="sr-only">{note.detail}</span> : null}
          </span>
        ) : null}
        {fresh && page > 1 ? (
          <>
            {" "}
            <button
              type="button"
              onClick={() => {
                setState({ phase: "idle" });
                onShowNewest();
              }}
              className="font-medium text-accent hover:underline">
              Show the newest
            </button>
          </>
        ) : null}
      </span>
    </div>
  );
}
