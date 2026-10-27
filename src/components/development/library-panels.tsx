"use client";

import * as React from "react";
import { Archive, Plus, Repeat2, ThumbsUp, TriangleAlert } from "lucide-react";
import { categoryLabel, type CategoryKey } from "@/domain/development/categories";
import { planSentence } from "@/domain/development/plans";
import { PATTERN_MIN, PATTERN_WINDOW_DAYS, type ReviewPatterns } from "@/domain/development/reviews";
import { retirePlanAction, reusePlanAction } from "@/server/actions/development";
import type { ObjectiveView, PlanHistoryItem } from "@/server/development/repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import type { JournalLookups } from "@/components/ranked/types";
import { formatDate } from "@/lib/format";
import { ObjectiveEditorDialog, type ObjectiveSeed } from "./objective-editor";
import { useAction } from "./use-action";

/** "New objective", from anywhere in the library, optionally seeded with an area (from a pattern). */
export function NewObjectiveButton({ lookups, hasPrimary, seed, label = "New objective", variant = "primary" }: { lookups: JournalLookups; hasPrimary: boolean; seed?: ObjectiveSeed; label?: string; variant?: "primary" | "outline" | "ghost" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} size={variant === "primary" ? "md" : "sm"} onClick={() => setOpen(true)} data-testid="objective-new">
        <Plus className="h-4 w-4" aria-hidden /> {label}
      </Button>
      <ObjectiveEditorDialog open={open} onClose={() => setOpen(false)} seed={seed} lookups={lookups} hasPrimary={hasPrimary} />
    </>
  );
}

/**
 * Areas the player's own reviews name again and again (the last PATTERN_WINDOW_DAYS days, at least
 * PATTERN_MIN times): the hardest ones can become an objective in a tap. Self-reported, and said so.
 */
export function PatternsPanel({ patterns, covered, lookups, hasPrimary }: { patterns: ReviewPatterns; covered: string[]; lookups: JournalLookups; hasPrimary: boolean }) {
  const line = (key: CategoryKey, count: number) => `${categoryLabel(key)} · ${count} review${count === 1 ? "" : "s"}`;
  return (
    <section className="rounded-card border border-border bg-surface p-4 sm:p-5" aria-labelledby="patterns" data-testid="patterns">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="patterns" className="text-base font-semibold text-fg">
          Patterns in your reviews
        </h2>
        <span className="text-xs text-fg-subtle">
          Last {PATTERN_WINDOW_DAYS} days · {patterns.reviewed} review{patterns.reviewed === 1 ? "" : "s"} · self-reported
        </span>
      </div>
      {patterns.hardest.length === 0 && patterns.best.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">Not enough reviews name the same area yet (an area shows here once {PATTERN_MIN} reviews name it).</p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
              <TriangleAlert className="h-3.5 w-3.5 text-warn" aria-hidden /> Named hardest
            </p>
            {patterns.hardest.length ? (
              <ul className="space-y-1.5">
                {patterns.hardest.map((h) => (
                  <li key={h.key} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="pattern-hardest">
                    <span className="text-fg">{line(h.key, h.count)}</span>
                    {covered.includes(h.key) ? <Badge>In your library</Badge> : <NewObjectiveButton lookups={lookups} hasPrimary={hasPrimary} seed={{ category: h.key }} label="Add to library" variant="outline" />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted">None yet.</p>
            )}
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
              <ThumbsUp className="h-3.5 w-3.5 text-good" aria-hidden /> Named best
            </p>
            {patterns.best.length ? (
              <ul className="space-y-1.5">
                {patterns.best.map((b) => (
                  <li key={b.key} className="text-sm text-fg">
                    {line(b.key, b.count)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted">None yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function PlanRow({ plan, objectives }: { plan: PlanHistoryItem; objectives: ObjectiveView[] }) {
  const { busy, run } = useAction();
  const [target, setTarget] = React.useState(plan.objectiveId && objectives.some((o) => o.id === plan.objectiveId) ? plan.objectiveId : (objectives[0]?.id ?? ""));
  return (
    <li className="space-y-2 py-3" data-testid="plan-history-row">
      <div className="flex flex-wrap items-center gap-2">
        {plan.current ? <Badge tone="accent">Current</Badge> : plan.retiredAt ? <Badge>Earlier version</Badge> : null}
        <span className="text-xs text-fg-muted">
          {plan.objectiveTitle ?? "Objective deleted"} · written {formatDate(plan.createdAt)} · {plan.sessions} session{plan.sessions === 1 ? "" : "s"}
        </span>
      </div>
      <p className="text-sm text-fg">{planSentence(plan)}</p>
      {!plan.current ? (
        <div className="flex flex-wrap items-center gap-2">
          {objectives.length ? (
            <>
              <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Use this plan for" className="w-auto max-w-full sm:max-w-xs">
                {objectives.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="outline" disabled={busy || !target} onClick={() => void run(() => reusePlanAction(plan.id, target), { success: "Plan reused." })} data-testid="plan-reuse">
                <Repeat2 className="h-4 w-4" aria-hidden /> Use it again
              </Button>
            </>
          ) : null}
        </div>
      ) : (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => retirePlanAction(plan.id), { success: "Plan put away. It stays in your history." })} data-testid="plan-retire">
          <Archive className="h-4 w-4" aria-hidden /> Put away
        </Button>
      )}
    </li>
  );
}

/** Every If–Then plan written, newest first: the wording sessions were played with, reusable on any objective. */
export function PlanHistoryPanel({ plans, objectives }: { plans: PlanHistoryItem[]; objectives: ObjectiveView[] }) {
  return (
    <section className="rounded-card border border-border bg-surface p-4 sm:p-5" aria-labelledby="plan-history" data-testid="plan-history">
      <h2 id="plan-history" className="text-base font-semibold text-fg">
        Your If–Then plans
      </h2>
      <p className="mt-0.5 text-sm text-fg-muted">Every wording you have played with. Edited plans keep their earlier versions here, so past sessions always show the plan they used.</p>
      {plans.length === 0 ? <p className="mt-2 text-sm text-fg-muted">No plans yet. Add one to an objective.</p> : <ul className="mt-1 divide-y divide-border">{plans.map((p) => <PlanRow key={p.id} plan={p} objectives={objectives} />)}</ul>}
    </section>
  );
}
