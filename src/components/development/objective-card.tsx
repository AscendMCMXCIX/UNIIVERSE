"use client";

import * as React from "react";
import { History, Pencil, RotateCcw, Star, Trash2 } from "lucide-react";
import { categoryLabel } from "@/domain/development/categories";
import { OBJECTIVE_STATUSES, OBJECTIVE_STATUS_LABELS, REVISIT_AFTER_DAYS, type ObjectiveStatus } from "@/domain/development/objectives";
import { executionLabel } from "@/domain/development/reviews";
import { deleteObjectiveAction, setObjectiveStatusAction, setPrimaryObjectiveAction } from "@/server/actions/development";
import type { ObjectiveProgress, ReviewedGame } from "@/server/development/page-data";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { RelativeTime } from "@/components/ui/relative-time";
import { segmentClass } from "@/components/ui/segmented";
import type { JournalLookups } from "@/components/ranked/types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ObjectiveHeading, PlanCallout } from "./before-queue";
import { EvidencePanels } from "./evidence-view";
import { ObjectiveEditorDialog } from "./objective-editor";
import { PlanEditorDialog } from "./plan-editor";
import { useAction } from "./use-action";

/** The player's latest reviews of games played for one objective (self-reported). */
function ReviewHistory({ reviews, lookups }: { reviews: ReviewedGame[]; lookups: Pick<JournalLookups, "championsById"> }) {
  if (reviews.length === 0) return <p className="text-sm text-fg-muted">No reviews for this objective yet.</p>;
  return (
    <ul className="divide-y divide-border" data-testid="objective-reviews">
      {reviews.map((r) => (
        <li key={r.id} className="flex items-start gap-3 py-2">
          <ChampionPortrait champion={lookups.championsById[r.championId] ?? { id: r.championId, name: r.championId, portraitUrl: "" }} size="xs" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-xs text-fg-muted">
              <span className={r.result === "win" ? "text-blue" : "text-red"}>{r.result === "win" ? "Win" : "Loss"}</span> · Session {r.sessionNumber} · {formatDate(r.playedAt)}
              {r.execution !== null ? ` · plan followed: ${executionLabel(r.execution)}` : ""}
            </p>
            {r.learning ? <p className="text-fg">{r.learning}</p> : null}
            {r.adjustment ? <p className="text-fg-muted">Next game: {r.adjustment}</p> : null}
            {!r.learning && !r.adjustment && (r.wentWell || r.wentWrong) ? <p className="text-fg-muted">{[r.wentWell ? `Best: ${categoryLabel(r.wentWell)}` : null, r.wentWrong ? `Hardest: ${categoryLabel(r.wentWrong)}` : null].filter(Boolean).join(" · ")}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * One objective in the library: where it stands (the player moves it; nothing moves on its own),
 * its plan, the evidence (Riot's figures and the player's reviews, kept apart), a suggested next
 * step only when the record supports one, and a reminder to revisit a maintained skill.
 */
export function ObjectiveCard({ progress, reviews, lookups, hasPrimary }: { progress: ObjectiveProgress; reviews: ReviewedGame[] | null; lookups: JournalLookups; hasPrimary: boolean }) {
  const { busy, run } = useAction();
  const { objective: o, evidence, execution, suggestion, revisit } = progress;
  const [editing, setEditing] = React.useState(false);
  const [planning, setPlanning] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [declined, setDeclined] = React.useState(false);
  const championNames = o.championIds.map((id) => lookups.championsById[id]?.name ?? id);
  const move = (status: ObjectiveStatus) => void run(() => setObjectiveStatusAction(o.id, status), { success: `Moved to ${OBJECTIVE_STATUS_LABELS[status]}.` });
  return (
    <article className={cn("rounded-card border bg-surface", o.isPrimary ? "border-accent/50" : "border-border")} data-testid="objective-card" data-status={o.status} data-primary={o.isPrimary || undefined}>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            {o.isPrimary ? (
              <p className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-label text-accent">
                <Star className="h-3.5 w-3.5" aria-hidden /> Current objective
              </p>
            ) : null}
            <ObjectiveHeading objective={o} lookups={lookups} size="md" />
          </div>
          <div className="flex shrink-0 flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit ${o.title}`} data-testid="objective-edit">
              <Pencil className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Edit</span>
            </Button>
            <Button size="sm" variant="ghost" className="text-fg-muted hover:text-bad" onClick={() => setDeleting(true)} aria-label={`Delete ${o.title}`} data-testid="objective-delete">
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <div role="radiogroup" aria-label="Progress" className="grid w-full grid-cols-2 gap-0.5 rounded-lg border border-border bg-bg-elevated p-0.5 sm:grid-cols-4" data-testid="objective-status">
            {OBJECTIVE_STATUSES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={o.status === s} disabled={busy} onClick={() => o.status !== s && move(s)} className={segmentClass(o.status === s, { className: "flex-1 px-1.5" })} data-testid={`objective-status-${s}`}>
                {OBJECTIVE_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <p className="text-xs text-fg-muted">
            Noticed {formatDate(o.identifiedAt)} · {o.sessions} session{o.sessions === 1 ? "" : "s"} · {o.reviews} review{o.reviews === 1 ? "" : "s"}
            {o.lastPractisedAt ? (
              <>
                {" "}
                · last practised <RelativeTime date={o.lastPractisedAt} />
              </>
            ) : (
              " · not practised yet"
            )}
          </p>
        </div>

        {suggestion && !declined ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm" data-testid="objective-suggestion">
            <p className="min-w-0 flex-1 text-fg">
              <span className="font-medium">Ready for {OBJECTIVE_STATUS_LABELS[suggestion.to]}?</span> {suggestion.reason}
            </p>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => move(suggestion.to)} data-testid="objective-suggestion-accept">
              Move to {OBJECTIVE_STATUS_LABELS[suggestion.to]}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeclined(true)}>
              Not yet
            </Button>
          </div>
        ) : null}
        {revisit ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm" data-testid="objective-revisit">
            <p className="min-w-0 flex-1 text-fg">{revisit === "statistic" ? "Its statistic has moved back the other way since you marked it Maintaining. Worth a session or two again?" : `Not practised in a session for ${REVISIT_AFTER_DAYS} days or more. Worth checking it still holds?`}</p>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => move("practising")} data-testid="objective-reopen">
              <RotateCcw className="h-4 w-4" aria-hidden /> Practise it again
            </Button>
          </div>
        ) : null}

        <PlanCallout plan={o.plan} onEdit={() => setPlanning(true)} />
        <EvidencePanels evidence={evidence} execution={execution} championNames={championNames} />

        <div className="flex flex-wrap items-center gap-2">
          {!o.isPrimary ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => setPrimaryObjectiveAction(o.id), { success: `“${o.title}” is your current objective.` })} data-testid="objective-make-primary">
              <Star className="h-4 w-4" aria-hidden /> {o.status === "maintaining" ? "Practise it again now" : "Make it current"}
            </Button>
          ) : null}
          {reviews ? (
            <details className="group w-full">
              <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-sm text-accent hover:underline pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden" data-testid="objective-reviews-toggle">
                <History className="h-4 w-4" aria-hidden /> Recent reviews ({Math.min(reviews.length, 10)})
              </summary>
              <div className="mt-2">
                <ReviewHistory reviews={reviews} lookups={lookups} />
              </div>
            </details>
          ) : null}
        </div>
      </div>
      <ObjectiveEditorDialog open={editing} onClose={() => setEditing(false)} objective={o} lookups={lookups} hasPrimary={hasPrimary} />
      <PlanEditorDialog open={planning} onClose={() => setPlanning(false)} objective={o} />
      <ConfirmDialog
        open={deleting}
        title={`Delete “${o.title}”?`}
        description="It leaves your library. Sessions and reviews played with it stay, under the title they were played with, and its plans stay in your plan history. Your Riot data is not affected."
        confirmLabel="Delete objective"
        busy={busy}
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          if (await run(() => deleteObjectiveAction(o.id), { success: "Objective deleted." })) setDeleting(false);
        }}
      />
    </article>
  );
}

