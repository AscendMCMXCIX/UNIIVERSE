"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { toolbarButtonClass } from "@/components/ui/filter-bar";
import { InfoTip } from "@/components/ui/info-tip";
import { useNow } from "@/components/ui/relative-time";
import { CATCH_UP_LIMIT } from "@/domain/refresh";
import type { DataStatus, DataStatusState } from "@/domain/data-status";
import { usePlayerRefresh, usePlayerRefreshState, type RefreshStep } from "./refresh-store";

/*
  THE refresh control and data status of every page that shows Riot data (domain/data-status.ts),
  in the same two places on each (components/ui/section-header.tsx): Refresh at the end of the
  section's toolbar, after its filters, for the player and those who manage Riot accounts; and,
  beside the line that says which games are counted, the status in a few quiet words ("Synced 5 min
  ago", or Syncing, Partial data, Delayed, Needs attention) with one ⓘ holding the rest: each part
  (multikills counted in 21 of 43 games, and why), when the accounts were last checked and last read
  successfully, the newest game, and this visit's Refresh. A dot on the ⓘ marks anything short of Up
  to date, so figures from only some of the games are never presented as complete. No banner.

  Refresh is real (components/ui/refresh-store.ts): Riot is read now, missing multikill counts are
  fetched in batches, the page is read again and the result arrives as a notification; the button
  says "Refreshing…" until then, on whichever tab of the profile is open. It is offered only where it
  can work: a page without the right to refresh, without a Riot account Riot can be asked about, or
  on a server without Riot, shows the status alone.
*/

/**
 * Each state's colour, on still dots: a page can read Syncing for hours, and the bubble's text is
 * always in the page for screen readers, so nothing here may move for ever.
 */
const DOT: Record<DataStatusState, string> = {
  current: "bg-good",
  syncing: "bg-accent",
  partial: "bg-warn",
  delayed: "bg-warn",
  attention: "bg-bad",
  none: "bg-fg-subtle",
};

const STEP_TEXT: Record<RefreshStep, string> = {
  games: "Checking Riot for new games, rank and mastery…",
  multikills: `Fetching the multikill counts of up to ${CATCH_UP_LIMIT} older games…`,
  reloading: "Updating the figures…",
};

/**
 * The step in a few words beside the scope line, so a Refresh shows which part is running: asking
 * Riot (a new sync), then reading the page again from what is stored here (no further Riot request).
 */
const STEP_WORDS: Record<RefreshStep, string> = {
  games: "Checking Riot…",
  multikills: "Fetching multikills…",
  reloading: "Updating the page…",
};

export interface DataRefreshTarget {
  playerId: string;
  /** Some of this player's games still lack multikill counts (the ⓘ says Refresh fetches a batch). */
  multikillsPending?: boolean;
  /** Match History on a later page: after new games, the notification offers the way to them. */
  onNewGames?: { label: string; run: () => void };
}

/** When the accounts were last checked and read successfully, and the newest game: only the times there are. */
function statusTimes(status: DataStatus, now: Date): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const checked = status.attemptedAt ?? status.checkedAt;
  if (checked) rows.push({ label: "Last checked", value: timeAgo(checked, now) });
  // A later attempt that failed: when Riot last answered is a different time, said apart.
  if (status.checkedAt && status.attemptedAt && Date.parse(status.attemptedAt) - Date.parse(status.checkedAt) > 60_000) rows.push({ label: "Last successful sync", value: timeAgo(status.checkedAt, now) });
  else if (!status.checkedAt && status.attemptedAt) rows.push({ label: "Last successful sync", value: "not yet" });
  if (status.newestGameAt) rows.push({ label: "Newest game", value: timeAgo(status.newestGameAt, now) });
  return rows;
}

/**
 * How current the section's Riot data is, beside its scope line: "Synced 5 min ago" when it is up to
 * date (or the state in words when it is not: Syncing, Partial data, Delayed, Needs attention, with
 * its dot), the step while this visit's Refresh runs ("Checking Riot…", then "Updating the page…"),
 * and one ⓘ with every detail (each part, when the accounts were last checked and read, the newest
 * game, this visit's Refresh). Quiet text: it informs, the Refresh button acts.
 */
export function DataStatusNote({ status, refresh, className, testId = "data-refresh" }: { status: DataStatus; refresh?: DataRefreshTarget | null; className?: string; testId?: string }) {
  const now = useNow();
  const offered = !!refresh && status.state !== "none";
  const { step, last } = usePlayerRefreshState(offered ? refresh!.playerId : null);
  const times = statusTimes(status, now);
  const synced = status.checkedAt ?? status.attemptedAt;
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
            {p.key === "multikills" && offered && refresh?.multikillsPending ? <span className="block text-fg-muted">Refresh fetches up to {CATCH_UP_LIMIT} of them now.</span> : null}
          </span>
        ))
      ) : (
        <span className="block text-fg-muted">{status.headline}</span>
      )}
      {times.length ? (
        <span className="block text-fg-subtle" data-testid={`${testId}-times`}>
          {/* The server's words stand while the page hydrates (relative-time.tsx). React allows that only for an element's own text, so each line carries it. */}
          {times.map((t) => (
            <span key={t.label} className="block" suppressHydrationWarning>
              {t.label}: {t.value}
            </span>
          ))}
        </span>
      ) : null}
      {step ? (
        <span className="block font-medium text-fg" data-testid={`${testId}-progress`}>
          Refreshing now: {STEP_TEXT[step]}
        </span>
      ) : last ? (
        <span className="block text-fg-muted" data-testid={`${testId}-last`} suppressHydrationWarning>
          Refreshed {timeAgo(new Date(last.at), now)}: {last.text}
        </span>
      ) : null}
    </span>
  );
  const flagged = status.state !== "current" && status.state !== "none";
  // The line's words: the Refresh's step while one runs; else the state when something is short of up to date, else when Riot was last read.
  const words = step ? STEP_WORDS[step] : flagged ? status.label : status.state === "current" && synced ? `Synced ${timeAgo(synced, now)}` : null;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-fg-subtle", className)} data-testid={testId} data-state={status.state}>
      {words ? (
        <span className={cn("truncate", flagged && !step && "text-fg-muted")} suppressHydrationWarning data-testid={`${testId}-words`}>
          {words}
        </span>
      ) : null}
      <span className="relative inline-flex">
        <InfoTip text={details} label={`Data status: ${status.label}`} testId={`${testId}-info`} />
        {flagged ? <span className={cn("pointer-events-none absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-bg", DOT[status.state])} aria-hidden data-testid={`${testId}-flag`} /> : null}
      </span>
    </span>
  );
}

/**
 * The section's Refresh, at the end of its toolbar (after the filters): it reads Riot now (new games,
 * rank and mastery; missing multikill counts in batches), then the page is read again and the result
 * arrives as a notification. Says "Refreshing…" with a turning icon until then and takes no second
 * press meanwhile (a press during the server's cooldown is answered without asking it: refresh-store).
 * Offered to the player and those who manage Riot accounts, where Riot can be asked; null elsewhere.
 */
export function RefreshButton({ status, refresh, className, testId = "data-refresh-button" }: { status: DataStatus; refresh?: DataRefreshTarget | null; className?: string; testId?: string }) {
  const offered = !!refresh && status.state !== "none";
  const { step, busy, press } = usePlayerRefresh(offered ? refresh!.playerId : null, refresh?.onNewGames);
  if (!offered) return null;
  return (
    <>
      <button
        type="button"
        onClick={press}
        aria-disabled={busy || undefined}
        title="Check Riot for new games, rank and mastery now, then update this page"
        className={toolbarButtonClass(false, cn(busy && "cursor-progress text-fg", className))}
        data-testid={testId}
        data-busy={busy || undefined}
        data-step={step ?? undefined}
      >
        <RefreshCw className={cn("h-4 w-4", busy && "motion-safe:animate-spin")} aria-hidden />
        {busy ? "Refreshing…" : "Refresh"}
      </button>
      {/* The steps, said to screen readers as they happen (the result arrives as a notification). */}
      <span className="sr-only" role="status" aria-live="polite">
        {step ? STEP_TEXT[step] : ""}
      </span>
    </>
  );
}
