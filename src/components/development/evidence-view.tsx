import { Check, Database, MessageSquareText } from "lucide-react";
import { formatMeasure } from "@/domain/development/evidence";
import { MEASURES } from "@/domain/development/measures";
import { OBJECTIVE_STATUSES, OBJECTIVE_STATUS_HELP, OBJECTIVE_STATUS_LABELS, type ObjectiveStatus } from "@/domain/development/objectives";
import type { ExecutionTrend } from "@/domain/development/reviews";
import { ROLE_LABELS } from "@/domain/roles";
import type { ObjectiveEvidence } from "@/server/development/evidence";
import { cn } from "@/lib/cn";

/** Identified → Practising → Improving → Maintaining, with the current step marked. */
export function StatusStepper({ status, className }: { status: ObjectiveStatus; className?: string }) {
  const at = OBJECTIVE_STATUSES.indexOf(status);
  return (
    <ol className={cn("grid grid-cols-4 gap-1", className)} aria-label={`Progress: ${OBJECTIVE_STATUS_LABELS[status]}`} data-testid="status-stepper" data-status={status}>
      {OBJECTIVE_STATUSES.map((s, i) => (
        <li key={s} className="min-w-0" title={OBJECTIVE_STATUS_HELP[s]} aria-current={i === at ? "step" : undefined}>
          <span className={cn("block h-1.5 rounded-full", i < at ? "bg-accent/60" : i === at ? "bg-accent" : "bg-surface-3")} aria-hidden />
          <span className={cn("mt-1 flex items-center gap-1 truncate text-2xs", i === at ? "font-semibold text-fg" : "text-fg-subtle")}>
            {i < at ? <Check className="h-3 w-3 shrink-0 text-accent" aria-hidden /> : null}
            {OBJECTIVE_STATUS_LABELS[s]}
          </span>
        </li>
      ))}
    </ol>
  );
}

const TREND_TONE = { toward: "text-good", away: "text-warn", similar: "text-fg" } as const;

/**
 * What Riot's figures show for an objective: its statistic before practice and since, in the same
 * role (and champions). Always worded as an observation, with what the statistic cannot show, and
 * "not enough games" rather than a figure drawn from too few.
 */
export function StatisticEvidence({ evidence, championNames }: { evidence: ObjectiveEvidence | null; championNames: string[] }) {
  if (!evidence)
    return (
      <p className="text-sm text-fg-muted" data-testid="evidence-none">
        No statistic is followed for this objective: your reviews are its record.
      </p>
    );
  const def = MEASURES[evidence.measure];
  const scope = [evidence.role ? `as ${ROLE_LABELS[evidence.role]}` : "in every role", championNames.length ? `on ${championNames.join(", ")}` : null].filter(Boolean).join(" ");
  const r = evidence.result;
  return (
    <div className="space-y-1.5" data-testid="evidence-statistic" data-state={r.state} data-trend={r.state === "compared" ? r.trend : undefined}>
      {r.state === "compared" ? (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
          <span>
            <span className="block text-2xs uppercase tracking-label text-fg-subtle">Before</span>
            <span className="text-lg font-semibold tabular-nums text-fg-muted">{formatMeasure(r.measure, r.baseline.mean)}</span>
            <span className="ml-1 text-xs text-fg-subtle">{r.baseline.games} games</span>
          </span>
          <span>
            <span className="block text-2xs uppercase tracking-label text-fg-subtle">While practising</span>
            <span className={cn("text-lg font-semibold tabular-nums", TREND_TONE[r.trend])}>{formatMeasure(r.measure, r.practice.mean)}</span>
            <span className="ml-1 text-xs text-fg-subtle">{r.practice.games} games</span>
          </span>
        </div>
      ) : null}
      {evidence.text ? (
        <>
          <p className="text-sm font-medium text-fg">{evidence.text.headline}</p>
          <p className="text-sm text-fg-muted">{evidence.text.detail}</p>
        </>
      ) : evidence.reference ? (
        <p className="text-sm text-fg-muted">
          Before you start: {formatMeasure(evidence.measure, evidence.reference.mean)} {def.short.toLowerCase()} on average in your last {evidence.reference.games} Solo/Duo games. Practising it in a session starts the comparison.
        </p>
      ) : (
        <p className="text-sm text-fg-muted">No games with this figure yet. It fills in as your Solo/Duo games sync.</p>
      )}
      <p className="text-xs text-fg-subtle">
        {def.label}, {scope}. {evidence.text?.caveat ?? def.cannotShow}
      </p>
    </div>
  );
}

/** The player's own record of following the plan, from their reviews: always labelled self-reported. */
export function ExecutionEvidence({ execution }: { execution: ExecutionTrend }) {
  const { recent, previous } = execution;
  if (recent.rated === 0)
    return (
      <p className="text-sm text-fg-muted" data-testid="evidence-execution" data-rated="0">
        No reviews rate the plan yet. After a game, a review takes under a minute.
      </p>
    );
  return (
    <div className="space-y-1" data-testid="evidence-execution" data-rated={recent.rated}>
      <p className="text-sm text-fg">
        Plan followed in <span className="font-semibold tabular-nums">{recent.followed}</span> of your last <span className="tabular-nums">{recent.rated}</span> reviewed game{recent.rated === 1 ? "" : "s"} (Mostly or Every time).
      </p>
      <div className="flex h-1.5 max-w-xs overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span className="bg-accent" style={{ width: `${Math.round((recent.followed / recent.rated) * 100)}%` }} />
      </div>
      {previous.rated ? (
        <p className="text-xs text-fg-muted">
          The {previous.rated} before those: {previous.followed} of {previous.rated}.
        </p>
      ) : null}
    </div>
  );
}

/** The two kinds of evidence, each named for where it comes from: side by side where there is room, else one above the other. */
export function EvidencePanels({ evidence, execution, championNames }: { evidence: ObjectiveEvidence | null; execution: ExecutionTrend; championNames: string[] }) {
  return (
    <div className="@container/evidence">
      <div className="grid gap-3 @xl/evidence:grid-cols-2">
        <section className="min-w-0 rounded-md border border-border bg-bg-elevated p-3" aria-label="From Riot's game data">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label text-fg-subtle">
            <Database className="h-3.5 w-3.5" aria-hidden /> From Riot&apos;s game data
          </h4>
          <StatisticEvidence evidence={evidence} championNames={championNames} />
        </section>
        <section className="min-w-0 rounded-md border border-border bg-bg-elevated p-3" aria-label="From your reviews (self-reported)">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label text-fg-subtle">
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden /> From your reviews · self-reported
          </h4>
          <ExecutionEvidence execution={execution} />
        </section>
      </div>
    </div>
  );
}
