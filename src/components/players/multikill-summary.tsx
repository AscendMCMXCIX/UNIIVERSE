import * as React from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { MULTIKILL_KINDS, multikillCoverage, type MultikillCounts, type MultikillSummary } from "@/domain/multikills";
import { formatCount } from "@/lib/format";

/*
  Multikills over a set of games, at a glance: the four totals (the rarest kinds the loudest) and
  how many of those games have counts. A total from only some of the games is marked Partial, with
  the reason one tap away; games without counts are never shown as zeros (a dash). Profile
  Overview's Season performance and the champion window use it; the per-champion figures are in
  All Champions.
*/

/** Rarer is louder: the double and triple kill plain, the quadra in violet, the pentakill in gold. */
export const MULTIKILL_TONE: Record<keyof MultikillCounts, string> = {
  double: "text-fg",
  triple: "text-fg",
  quadra: "text-violet",
  penta: "text-gold",
};
export const MULTIKILL_SHORT: Record<keyof MultikillCounts, string> = { double: "Double", triple: "Triple", quadra: "Quadra", penta: "Penta" };

export const MULTIKILL_HELP =
  "Double, triple, quadra and pentakills as Riot recorded them in each game, added up over the same games as the figures beside them. Riot's records of games stored before Team Leaderboards did not keep these counts; those games' records are being fetched again, a few each hour, and the totals grow as they arrive. A game without counts is left out, never counted as zero.";

const n = formatCount;

/**
 * Phones: four small tiles under the title; wider: one line. `aside` sits at the end of the row
 * (Overview links the per-champion figures there).
 */
export function MultikillSummaryRow({ m, aside, className, testId = "multikills" }: { m: MultikillSummary; aside?: React.ReactNode; className?: string; testId?: string }) {
  const id = React.useId();
  const coverage = multikillCoverage(m);
  // No game has counts: every total is unknown, not zero.
  const unknown = m.counted === 0;
  return (
    <section aria-labelledby={id} className={cn("flex flex-wrap items-center gap-x-5 gap-y-2", className)} data-testid={testId} data-coverage={coverage.state}>
      <h3 id={id} className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted">
        Multikills <InfoTip text={MULTIKILL_HELP} label="About multikills" />
      </h3>
      <dl className="grid w-full grid-cols-4 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:items-baseline sm:gap-x-4 sm:gap-y-1" data-testid="multikill-tiles">
        {MULTIKILL_KINDS.map((k) => (
          // The kind comes before its count (a list's order); the count shows first.
          <div key={k.key} className={cn("flex min-w-0 flex-col-reverse items-center rounded-lg border px-1.5 py-1.5 text-center sm:flex-row-reverse sm:items-baseline sm:gap-1 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0", k.key === "penta" && m.penta > 0 ? "border-gold/40 bg-gold/[0.07]" : "border-border bg-bg/40")} data-testid={`multikill-${k.key}`}>
            <dt className="truncate text-2xs font-medium text-fg-muted sm:text-xs">
              {MULTIKILL_SHORT[k.key]}
              <span className="max-sm:sr-only">{k.key === "penta" ? "kills" : " kills"}</span>
            </dt>
            <dd className={cn("text-lg font-bold leading-tight tabular-nums", !unknown && m[k.key] ? MULTIKILL_TONE[k.key] : "text-fg-subtle")}>
              {unknown ? (
                <>
                  <span aria-hidden>—</span>
                  <span className="sr-only">not counted yet</span>
                </>
              ) : (
                n(m[k.key])
              )}
            </dd>
          </div>
        ))}
      </dl>
      {/* The coverage and the aside wrap together, to the end of the row (or of their own line). */}
      <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 sm:ml-auto sm:w-auto sm:justify-end">
        <p className="inline-flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted tabular-nums" data-testid="multikill-coverage">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", coverage.state === "complete" ? "bg-good" : "bg-warn")} aria-hidden />
          {coverage.state !== "complete" ? (
            <span className="font-semibold text-warn" data-testid="multikill-partial">
              {coverage.state === "partial" ? "Partial" : "Not yet"}
            </span>
          ) : null}
          <span data-testid="multikill-sample">{coverage.label}</span>
          {coverage.note ? <InfoTip text={coverage.note} label="Why these totals are not complete" testId="multikill-coverage-note" /> : null}
        </p>
        {aside}
      </div>
    </section>
  );
}
