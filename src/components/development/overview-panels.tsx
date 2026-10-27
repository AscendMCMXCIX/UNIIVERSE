"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Shuffle } from "lucide-react";
import { categoryLabel } from "@/domain/development/categories";
import { OBJECTIVE_STATUS_LABELS } from "@/domain/development/objectives";
import { sessionStatusText } from "@/domain/development/sessions";
import { setObjectiveStatusAction, setPrimaryObjectiveAction } from "@/server/actions/development";
import type { ObjectiveView } from "@/server/development/repository";
import type { ObjectiveProgress, OverviewData, SessionDetail } from "@/server/development/page-data";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import type { JournalLookups } from "@/components/ranked/types";
import { cn } from "@/lib/cn";
import { NextSessionChoice } from "./current-session";
import { EvidencePanels, StatusStepper } from "./evidence-view";
import { NewObjectiveButton } from "./library-panels";
import { LpChange, SessionSummaryView } from "./session-summary";
import { useAction } from "./use-action";

/** The primary objective's progress: its step, the evidence for it, and a next step only when the record supports one. */
export function ProgressSummary({ progress, lookups }: { progress: ObjectiveProgress; lookups: Pick<JournalLookups, "championsById"> }) {
  const { busy, run } = useAction();
  const { objective: o, evidence, execution, suggestion, revisit } = progress;
  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-4 sm:p-5" aria-labelledby="progress-title" data-testid="progress-summary">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="progress-title" className="text-base font-semibold text-fg">
          Progress
        </h2>
        <Link href="/overview/development/library" className="text-xs text-accent hover:underline">
          Development →
        </Link>
      </div>
      <StatusStepper status={o.status} />
      {suggestion ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm" data-testid="progress-suggestion">
          <p className="min-w-0 flex-1 text-fg">{suggestion.reason}</p>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void run(() => setObjectiveStatusAction(o.id, suggestion.to), { success: `Moved to ${OBJECTIVE_STATUS_LABELS[suggestion.to]}.` })}>
            Move to {OBJECTIVE_STATUS_LABELS[suggestion.to]}
          </Button>
        </div>
      ) : null}
      {revisit ? <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg">Worth revisiting: {revisit === "statistic" ? "its statistic has moved back." : "not practised for a month or more."}</p> : null}
      <EvidencePanels evidence={evidence} execution={execution} championNames={o.championIds.map((id) => lookups.championsById[id]?.name ?? id)} />
    </section>
  );
}

/**
 * LEARNING PRIORITIES: the other objectives waiting in the library (one tap makes one current), and
 * areas the player's reviews keep naming that no objective covers yet.
 */
export function LearningPriorities({ others, uncovered, lookups, hasPrimary }: { others: ObjectiveView[]; uncovered: OverviewData["uncovered"]; lookups: JournalLookups; hasPrimary: boolean }) {
  const { busy, run } = useAction();
  return (
    <section className="rounded-card border border-border bg-surface p-4 sm:p-5" aria-labelledby="priorities-title" data-testid="learning-priorities">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="priorities-title" className="text-base font-semibold text-fg">
          Learning priorities
        </h2>
        <NewObjectiveButton lookups={lookups} hasPrimary={hasPrimary} label="Add" variant="ghost" />
      </div>
      {others.length === 0 && uncovered.length === 0 ? <p className="mt-2 text-sm text-fg-muted">Nothing else waiting. Add what you notice in your games to your library, one objective at a time.</p> : null}
      {others.length ? (
        <ul className="mt-2 divide-y divide-border">
          {others.map((o) => (
            <li key={o.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{o.title}</span>
                <span className="block text-xs text-fg-muted">
                  {categoryLabel(o.category, o.customCategory)} · {OBJECTIVE_STATUS_LABELS[o.status]}
                </span>
              </span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => setPrimaryObjectiveAction(o.id), { success: `“${o.title}” is your current objective.` })} aria-label={`Make “${o.title}” current`}>
                <Shuffle className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Make current</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {uncovered.length ? (
        <div className="mt-3 rounded-md bg-bg-elevated p-3" data-testid="uncovered-patterns">
          <p className="text-xs text-fg-muted">Your reviews keep naming these as hardest (self-reported, last 30 days):</p>
          <ul className="mt-1.5 space-y-1.5">
            {uncovered.map((u) => (
              <li key={u.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-fg">
                  {categoryLabel(u.key)} <span className="text-fg-muted">· {u.count} reviews</span>
                </span>
                <NewObjectiveButton lookups={lookups} hasPrimary={hasPrimary} seed={{ category: u.key }} label="Add to library" variant="outline" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** The session in progress at a glance: each game as a portrait with its result, the score and LP. */
export function SessionSnapshot({ detail, lookups }: { detail: SessionDetail; lookups: Pick<JournalLookups, "championsById"> }) {
  const s = detail.session;
  return (
    <section className="rounded-card border border-border bg-surface p-4 sm:p-5" aria-labelledby="snapshot-title" data-testid="session-snapshot">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="snapshot-title" className="text-base font-semibold text-fg">
            Session performance
          </h2>
          <p className="text-xs text-fg-muted">
            {s.label} · started <RelativeTime date={s.startedAt} />
          </p>
        </div>
        <div className="flex items-end gap-4 tabular-nums">
          <span className="text-center leading-none">
            <span className="block text-xl font-bold text-blue">{s.wins}</span>
            <span className="text-2xs uppercase tracking-label text-fg-subtle">Wins</span>
          </span>
          <span className="text-center leading-none">
            <span className="block text-xl font-bold text-red">{s.losses}</span>
            <span className="text-2xs uppercase tracking-label text-fg-subtle">Losses</span>
          </span>
          <LpChange lp={detail.lp} />
        </div>
      </div>
      {detail.games.length ? (
        <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Games in this session">
          {detail.games.map((g, i) => (
            <li key={g.id} className={cn("relative rounded-md border-2", g.result === "win" ? "border-blue/60" : "border-red/60")} title={`Game ${i + 1}: ${lookups.championsById[g.championId]?.name ?? g.championId}, ${g.result}`}>
              <ChampionPortrait champion={lookups.championsById[g.championId] ?? { id: g.championId, name: g.championId, portraitUrl: "" }} size="sm" className="border-0" />
              <span className={cn("absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded px-1 text-3xs font-bold leading-tight text-bg", g.result === "win" ? "bg-blue" : "bg-red")}>{g.result === "win" ? "W" : "L"}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-fg-muted">No games yet: they join as your account syncs.</p>
      )}
      <Link href="/overview/development/sessions" className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">
        Open the session <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

/** The latest finished session's summary, and the choice for the next one. */
export function LastSession({ detail, library, lookups }: { detail: SessionDetail; library: ObjectiveView[]; lookups: JournalLookups }) {
  const s = detail.session;
  const objective = library.find((o) => o.id === s.objectiveId) ?? null;
  return (
    <section className="space-y-4 rounded-card border border-border bg-surface p-4 sm:p-5" aria-labelledby="last-session-title" data-testid="last-session">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="last-session-title" className="text-base font-semibold text-fg">
            Last session: {s.label}
          </h2>
          <p className="text-xs text-fg-muted">
            {sessionStatusText(s)}
            {s.completedAt ? (
              <>
                {" "}
                · <RelativeTime date={s.completedAt} />
              </>
            ) : null}
            {s.focus ? ` · ${s.focus}` : ""}
          </p>
        </div>
        <Link href={`/overview/development/sessions/${s.id}`} className="text-xs text-accent hover:underline">
          Full summary →
        </Link>
      </div>
      {s.closingNote ? <p className="border-l-2 border-accent/50 pl-2 text-sm text-fg">{s.closingNote}</p> : null}
      <SessionSummaryView summary={detail.summary} lp={detail.lp} lookups={lookups} />
      <div className="border-t border-border pt-3">
        <NextSessionChoice objective={objective} library={library} lookups={lookups} />
      </div>
    </section>
  );
}

/** A banner when a synced game fits two sessions: the player says where it belongs. */
export function ConfirmationNotice({ confirmations }: { confirmations: OverviewData["confirmations"] }) {
  if (!confirmations.games || !confirmations.sessionId) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg" data-testid="confirmation-notice">
      <Badge tone="warn">Check</Badge>
      {confirmations.games === 1 ? "One game" : `${confirmations.games} games`} could belong to two sessions.
      <Link href={`/overview/development/sessions/${confirmations.sessionId}`} className="text-accent hover:underline">
        Choose where →
      </Link>
    </p>
  );
}
