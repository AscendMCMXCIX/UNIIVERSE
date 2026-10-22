"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useNow } from "@/components/ui/relative-time";
import { CATCH_UP_LIMIT } from "@/domain/refresh";
import type { DataStatus, DataStatusState } from "@/domain/data-status";
import { usePlayerRefresh, type RefreshStep } from "./refresh-store";

/*
  THE refresh control and data status of every page that shows Riot data (domain/data-status.ts),
  in one place under the page's or section's heading (components/ui/section-header.tsx): a quiet
  Refresh, for the player and those who manage Riot accounts, and one ⓘ beside it with the page's
  status: the word (Up to date, Syncing, Partial data, Delayed, Needs attention), each part
  (multikills counted in 21 of 43 games, and why), when the accounts were last checked and last read
  successfully, the newest game, and this visit's Refresh. A dot on the ⓘ marks anything short of Up
  to date, so figures from only some of the games are never presented as complete. No banner, and
  nothing else beside the button.

  Refresh is real (components/ui/refresh-store.ts): Riot is read now, missing multikill counts are
  fetched in batches, the page is read again and the result arrives as a notification; the button
  says "Refreshing…" until then, on whichever tab of the profile is open. It is offered only where it
  can work: a page without the right to refresh, without a Riot account Riot can be asked about, or
  on a server without Riot, shows the ⓘ alone.
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
 * Refresh under a page's or section's heading, and nothing beside it but one ⓘ with the page's
 * status. Without `refresh` (no right to refresh, nothing Riot can be asked about, no Riot on this
 * server), the ⓘ stays on its own; with `info={false}` (a list whose rows already show each
 * account's state), Refresh does.
 */
export function DataRefresh({ status, refresh, info = true, className, testId = "data-refresh" }: { status: DataStatus; refresh?: DataRefreshTarget | null; info?: boolean; className?: string; testId?: string }) {
  const now = useNow();
  const offered = !!refresh && status.state !== "none";
  const { step, last, busy, press } = usePlayerRefresh(offered ? refresh!.playerId : null, refresh?.onNewGames);
  const times = statusTimes(status, now);
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
        <span className="block text-fg-subtle" data-testid={`${testId}-times`} suppressHydrationWarning>
          {times.map((t) => (
            <span key={t.label} className="block">
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
  return (
    <div className={cn("flex w-fit items-center gap-3", className)} data-testid={testId} data-state={status.state}>
      {offered ? (
        <Button size="sm" variant="outline" onClick={press} aria-disabled={busy || undefined} data-testid={`${testId}-button`} data-busy={busy || undefined} data-step={step ?? undefined} className="border-border font-medium text-fg-muted hover:border-border-strong hover:text-fg">
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "motion-safe:animate-spin")} aria-hidden />
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
      ) : null}
      {info ? (
        <span className="relative inline-flex">
          <InfoTip text={details} label={`Data status: ${status.label}`} testId={`${testId}-info`} />
          {flagged ? <span className={cn("pointer-events-none absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-bg", DOT[status.state])} aria-hidden data-testid={`${testId}-flag`} /> : null}
        </span>
      ) : null}
      {/* The steps, said to screen readers as they happen (the result arrives as a notification). */}
      <span className="sr-only" role="status" aria-live="polite">
        {step ? STEP_TEXT[step] : ""}
      </span>
    </div>
  );
}
