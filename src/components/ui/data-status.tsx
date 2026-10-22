"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ChevronDown, Clock, Info, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/toast";
import { useNow } from "@/components/ui/relative-time";
import { catchUpFiguresAction, refreshMatchesAction } from "@/server/actions/match-history";
import type { RefreshOutcome } from "@/server/accounts/refresh";
import { REFRESH_TOAST, refreshNote, waitText, type RefreshTone } from "./refresh-note";
import type { DataStatus, DataStatusState } from "@/domain/data-status";

/*
  THE way a page says how up to date its Riot data is (domain/data-status.ts): a word (Up to date,
  Syncing, Partial data, Delayed, Needs attention), the fact behind it, the parts and the times,
  and, for the player or an admin, Refresh. Figures and cards carry no status marks of their own.
  One of two forms per page:
    - DataStatusBar, a line above the page (All Champions, Match History): the word and the fact,
      the rest under Details, Refresh at its end, and the result under the line;
    - DataRefresh, under a section's heading (the profile Overview's Season performance): Refresh
      alone, with the word, the parts and the times one ⓘ away; the progress shows on the button
      and the result arrives as a notification.

  Refresh is the real thing, in two steps:
    1. the player's linked accounts are read from Riot now (new games, rank, mastery: the same
       sync the scheduler runs, refreshPlayerMatches);
    2. while multikill counts are missing, up to 40 of the player's older games are fetched again
       (catchUpPlayerFigures), the step that otherwise runs a few games an hour for the team.
  Then the page re-reads its data in place. What happened is said as it is ("No new games",
  "Checked recently, try again in 1 min", "Not available right now"), never "updated" for a
  click alone, and a cooldown on the server keeps repeated clicks from using the team's Riot quota.
*/

const DOT: Record<DataStatusState, string> = {
  current: "bg-good",
  syncing: "bg-accent motion-safe:animate-pulse",
  partial: "bg-warn",
  delayed: "bg-warn",
  attention: "bg-bad",
  none: "bg-fg-subtle",
};

const NOTE_ICON: Record<RefreshTone, typeof Check> = { good: Check, muted: Check, info: Info, bad: AlertCircle, wait: Clock };
type Phase = { step: "idle" } | { step: "games" } | { step: "multikills" } | { step: "done"; text: string; tone: RefreshTone };

export interface DataStatusRefresh {
  playerId: string;
  /** Some of this player's games still lack multikill counts: Refresh fetches a batch of them too. */
  multikillsPending: boolean;
  /** Match History on a later page: after new games, a way to the newest ones. */
  onNewGames?: { label: string; run: () => void };
}

/** Refresh's two steps, the server's cooldown counted down here, then the page re-read in place. */
function useRefresh(refresh: DataStatusRefresh | null | undefined) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>({ step: "idle" });
  const [newGames, setNewGames] = React.useState(false);
  const [, startTransition] = React.useTransition();
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

  const run = async (): Promise<{ text: string; tone: RefreshTone } | null> => {
    if (!refresh) return null;
    setNewGames(false);
    setPhase({ step: "games" });
    let games: RefreshOutcome;
    try {
      games = await refreshMatchesAction(refresh.playerId);
    } catch {
      games = { status: "failed", message: "please try again in a few minutes." };
    }
    let multikills: Awaited<ReturnType<typeof catchUpFiguresAction>> | null = null;
    if (refresh.multikillsPending && games.status !== "unavailable" && games.status !== "failed") {
      setPhase({ step: "multikills" });
      try {
        multikills = await catchUpFiguresAction(refresh.playerId);
      } catch {
        multikills = { status: "unavailable", message: "" };
      }
    }
    const note = refreshNote(games, multikills);
    if (note.retryInSeconds > 0) setWaitUntil(Date.now() + note.retryInSeconds * 1000);
    setNewGames(games.status === "updated");
    setPhase({ step: "done", text: note.text, tone: note.tone });
    // Re-read the page from the server (filters live in the address, so nothing else changes).
    const changed = games.status === "updated" || games.status === "no-new" || multikills?.status === "fetched" || multikills?.status === "complete";
    if (changed) startTransition(() => router.refresh());
    return note;
  };
  return { phase, setPhase, newGames, wait, run, busy: phase.step === "games" || phase.step === "multikills" };
}

/** When the accounts were last read and when the newest game was played: only the times there are. */
function statusTimes(status: DataStatus, now: Date) {
  // (An account read before the times were kept has none.)
  const checked = status.checkedAt ? `Checked ${timeAgo(status.checkedAt, now)}` : null;
  const newest = status.newestGameAt ? timeAgo(status.newestGameAt, now) : null;
  return { checked, footer: checked ? (newest ? `${checked} · newest game ${newest}` : checked) : newest ? `Newest game ${newest}` : null };
}

export function DataStatusBar({ status, refresh, className, testId = "data-status" }: { status: DataStatus; refresh?: DataStatusRefresh | null; className?: string; testId?: string }) {
  const now = useNow();
  const [open, setOpen] = React.useState(false);
  const { phase, setPhase, newGames, wait, run, busy } = useRefresh(refresh);
  const detailsId = React.useId();
  // A result fades back to the quiet line after a while; a failure stays until the next try.
  const done = phase.step === "done" ? phase : null;
  React.useEffect(() => {
    if (!done || done.tone === "bad" || done.tone === "info") return;
    const t = window.setTimeout(() => setPhase({ step: "idle" }), 10_000);
    return () => window.clearTimeout(t);
  }, [done, setPhase]);

  const progress = phase.step === "games" ? "Checking Riot for new games, rank and mastery…" : phase.step === "multikills" ? "Fetching multikill counts for older games…" : null;
  const { checked, footer } = statusTimes(status, now);
  // Up to date says when; anything else says why (the time is under Details).
  const headline = status.state === "current" ? (checked ?? status.headline) : status.headline;
  const NoteIcon = done ? NOTE_ICON[done.tone] : null;
  const hasDetails = status.parts.length > 0;
  return (
    <section aria-label="Data status" className={cn("rounded-card border border-border bg-surface/60 px-3 py-2 sm:px-4", className)} data-testid={testId} data-state={status.state}>
      {/* Phones: the word and the buttons on one line, the fact on the next at full width; wider:
          all on one line, the fact between them. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex shrink-0 items-center gap-2 font-semibold text-fg" data-testid={`${testId}-label`}>
          <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[status.state])} aria-hidden />
          {status.label}
        </span>
        <span className="order-last min-w-0 basis-full text-fg-muted sm:order-none sm:basis-0 sm:flex-1 sm:truncate" title={headline} data-testid={`${testId}-headline`} suppressHydrationWarning>
          {headline}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {hasDetails ? (
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={detailsId} data-testid={`${testId}-details-toggle`}>
              Details
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
            </Button>
          ) : null}
          {refresh ? (
            <Button size="sm" variant="outline" onClick={() => void run()} disabled={busy || wait > 0} aria-describedby={`${detailsId}-live`} data-testid={`${testId}-refresh`} className="font-medium">
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "motion-safe:animate-spin")} aria-hidden />
              {busy ? "Refreshing…" : wait > 0 ? `Refresh in ${waitText(wait)}` : "Refresh"}
            </Button>
          ) : null}
        </div>
      </div>
      {/* Progress and the result: announced, and shown under the line while they matter. */}
      <p id={`${detailsId}-live`} role="status" aria-live="polite" className="text-xs empty:hidden" data-testid={`${testId}-result`}>
        {progress ? (
          <span className="mt-1.5 inline-flex items-center gap-1.5 text-fg-muted" data-step={phase.step}>
            <span className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden />
            {progress}
          </span>
        ) : done && NoteIcon ? (
          <span className={cn("mt-1.5 inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-full border px-2 py-0.5 motion-safe:animate-[fade-in_150ms_ease-out]", done.tone === "good" ? "border-good/40 bg-good/10 font-medium text-good" : done.tone === "bad" ? "border-bad/40 bg-bad/10 text-bad" : "border-border bg-surface-2 text-fg-muted")} data-tone={done.tone}>
            <NoteIcon className="h-3 w-3 shrink-0" aria-hidden />
            {done.text}
            {newGames && refresh?.onNewGames ? (
              <button type="button" onClick={() => { setPhase({ step: "idle" }); refresh.onNewGames!.run(); }} className="font-medium text-accent hover:underline">
                {refresh.onNewGames.label}
              </button>
            ) : null}
          </span>
        ) : null}
      </p>
      {hasDetails ? (
        <div id={detailsId} hidden={!open} className="mt-2 border-t border-border/70 pt-2" data-testid={`${testId}-details`}>
          <ul className="space-y-1.5 text-xs">
            {status.parts.map((p) => (
              <li key={p.key} className="flex gap-2" data-part={p.key} data-state={p.state}>
                <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", DOT[p.state])} aria-hidden />
                <span className="min-w-0">
                  <span className="font-medium text-fg">{p.label}</span>
                  {p.detail ? <span className="block text-fg-muted">{p.detail}</span> : null}
                  {p.key === "multikills" && refresh?.multikillsPending ? <span className="block text-fg-muted">Refresh fetches up to 40 of them now.</span> : null}
                </span>
              </li>
            ))}
          </ul>
          {footer ? (
            <p className="mt-2 text-xs text-fg-subtle" suppressHydrationWarning>
              {footer}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Refresh under a section's heading, and nothing beside it but one ⓘ: the page's status (the
 * word, each part, when the accounts were read) opens from it, and a dot on it marks anything
 * short of Up to date, so figures from only some of the games are never presented as complete.
 * The button shows the progress ("Refreshing…"); the result arrives as a notification. A click
 * during the server's cooldown says when to try again without asking it. Without the right to
 * refresh (a teammate's profile) or a Riot account to read, the ⓘ stays on its own.
 */
export function DataRefresh({ status, refresh, className, testId = "data-refresh" }: { status: DataStatus; refresh?: DataStatusRefresh | null; className?: string; testId?: string }) {
  const now = useNow();
  const { run, busy, wait } = useRefresh(refresh);
  const { footer } = statusTimes(status, now);
  const click = async () => {
    if (busy) return;
    if (wait > 0) {
      toast.info(`Checked recently · try again in ${waitText(wait)}`);
      return;
    }
    const note = await run();
    if (note) toast[REFRESH_TOAST[note.tone]](note.text);
  };
  // Inside the tooltip's bubble (a span), so spans only.
  const details = (
    <span className="block space-y-1.5">
      <span className="flex items-center gap-1.5 font-semibold">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[status.state])} aria-hidden />
        {status.label}
      </span>
      {status.parts.length ? (
        status.parts.map((p, i) => (
          <span key={`${p.key}-${i}`} className="block" data-part={p.key} data-state={p.state}>
            <span className="block font-medium">{p.label}</span>
            {p.detail ? <span className="block text-fg-muted">{p.detail}</span> : null}
            {p.key === "multikills" && refresh?.multikillsPending ? <span className="block text-fg-muted">Refresh fetches up to 40 of them now.</span> : null}
          </span>
        ))
      ) : (
        <span className="block text-fg-muted">{status.headline}</span>
      )}
      {footer ? (
        <span className="block text-fg-subtle" suppressHydrationWarning>
          {footer}
        </span>
      ) : null}
    </span>
  );
  const flagged = status.state !== "current" && status.state !== "none";
  return (
    <div className={cn("flex w-fit items-center gap-3", className)} data-testid={testId} data-state={status.state}>
      {refresh && status.state !== "none" ? (
        <Button size="sm" variant="outline" onClick={() => void click()} aria-disabled={busy || undefined} data-testid={`${testId}-button`} data-busy={busy || undefined} className="border-border font-medium text-fg-muted hover:border-border-strong hover:text-fg">
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "motion-safe:animate-spin")} aria-hidden />
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
      ) : null}
      <span className="relative inline-flex">
        <InfoTip text={details} label={`Data status: ${status.label}`} testId={`${testId}-info`} />
        {flagged ? <span className={cn("pointer-events-none absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-bg", DOT[status.state])} aria-hidden data-testid={`${testId}-flag`} /> : null}
      </span>
    </div>
  );
}
